import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LeverageStore } from '../src/leverage/storage.mjs';
import { LeverageService } from '../src/leverage/service.mjs';
import { collectProvider, StaticEventProvider } from '../src/leverage/providers.mjs';
import { estimateCapacityShift, syntheticLeverageFixture } from '../src/leverage/pipeline.mjs';

async function harness() {
  const dir = await mkdtemp(join(tmpdir(), 'device-bridge-leverage-'));
  const fixture = syntheticLeverageFixture();
  const clockMs = Date.parse(fixture.as_of);
  const store = new LeverageStore(join(dir, 'leverage.json'));
  const service = new LeverageService(store, { clock: () => clockMs });
  return { dir, fixture, store, service };
}

async function analyseFixture(service, fixture) {
  await service.ingest(fixture.events, { provider_id: 'synthetic' });
  const goal = await service.createGoal(fixture.goal);
  const result = await service.analyse({ goal_id: goal.id, time_horizon: '8d', as_of: fixture.as_of });
  return { goal, result };
}

test('synthetic earning-power fixture runs end-to-end with traceable opportunities', async () => {
  const { fixture, store, service } = await harness();
  const { goal, result } = await analyseFixture(service, fixture);

  const observed = new Map(result.observations.map(item => [item.variable_id, item.value]));
  assert.equal(observed.get('time.career.job_discovery_hours'), 5.3);
  assert.equal(observed.get('actions.application_submitted_count'), 2);
  assert.equal(observed.get('time.work.development_hours'), 12);
  assert.equal(observed.get('time.personal_admin.administration_hours'), 4);
  assert.equal(result.analysis.baseline.state, 'initial');
  assert.ok(result.outcome_metrics.some(metric => metric.id === 'income' && metric.direction === 'unspecified'));
  assert.ok(result.opportunities.some(item => item.opportunity_key === 'career:application_throughput'));
  assert.ok(result.opportunities.some(item => item.intervention_type === 'AUTOMATION'));
  assert.deepEqual(result.value_of_information, ['career.application_to_interview_conversion']);

  const career = result.opportunities.find(item => item.opportunity_key === 'career:application_throughput');
  assert.match(career.trace[0].claim, /5\.3 job-discovery hours and 2 submitted applications/u);
  assert.match(career.trace[1].claim, /may be suppressing|may be limiting/u);
  assert.ok(career.alternatives.some(value => /quality/u.test(value)));
  assert.equal(typeof career.ranking.dimensions.confidence, 'number');
  assert.match(career.ranking.explanation, /not an estimate of truth/u);
  assert.equal(career.action_authority, 'user_required');
  assert.equal(career.action_state, 'recommendation_only');
  assert.equal(career.opportunity_cost.ranking, 'not_ranked');

  const careerBottleneck = result.bottlenecks.find(item => item.type === 'pipeline_stage');
  assert.ok(careerBottleneck);
  assert.ok(careerBottleneck.competing_hypotheses.some(value => /quality/u.test(value)));
  assert.ok(careerBottleneck.missing_variables.includes('career.application_to_interview_conversion'));
  const manualBottleneck = result.bottlenecks.find(item => item.type === 'repeated_manual_work');
  assert.match(manualBottleneck.statement, /4 observed hours\/week/u);

  const automation = result.opportunities.find(item => item.intervention_type === 'AUTOMATION');
  assert.equal(automation.lever.current_value, 4);
  assert.match(automation.expected_effect, /156 hours/u);
  assert.equal(automation.opportunity_cost.ranking, 'not_ranked');

  const why = await service.why(career.id);
  assert.deepEqual(why.trace.map(step => step.stage), ['observation', 'inference', 'hypothesis', 'recommendation']);
  assert.ok(why.assumptions.length >= 2);
  assert.ok(why.missing_variables.includes('career.application_to_interview_conversion'));
  assert.ok(why.bottlenecks.length >= 1);
  assert.equal(why.measured_outcomes.length, 0);

  assert.ok(result.leverage_map.edges.some(edge => edge.relationship_type === 'ENABLES' && edge.claim_type === 'hypothesis'));
  assert.ok(result.leverage_map.nodes.some(node => node.id === `goal:${goal.id}`));
  assert.ok(result.leverage_map.nodes.some(node => node.type === 'bottleneck'));
  assert.ok(result.insights.some(insight => insight.id === career.id && /Filtering|filtering/u.test(insight.hypothesis)));

  const review = await service.review();
  assert.match(review.text, /WEEKLY LEVERAGE REVIEW/u);
  assert.match(review.text, /Potential lever/u);
  assert.equal(review.repeated_workflow.executions, 8);
  assert.equal(review.repeated_workflow.weekly_hours, 4);

  const mode = await stat(store.path);
  if (process.platform !== 'win32') assert.equal(mode.mode & 0o777, 0o600);
});

test('privacy exclusions, time windows and sensitive consent are enforced before persistence', async () => {
  const { fixture, service, store } = await harness();
  await service.updatePrivacy({
    excluded_applications: ['LinkedIn'],
    excluded_domains: ['private.example'],
    excluded_periods: [{ start: '2026-09-21T12:00:00.000Z', end: '2026-09-21T13:00:00.000Z' }],
  });
  const result = await service.ingest(fixture.events);
  assert.equal(result.rejected.filter(item => item.reason === 'application_excluded').length, 5);

  const domainEvent = { ...fixture.events[0], id: undefined, application: 'Browser', timestamp: '2026-09-21T10:00:00.000Z', context: { domain: 'sub.private.example' } };
  assert.equal((await service.ingest([domainEvent])).rejected[0].reason, 'domain_excluded');
  const periodEvent = { ...fixture.events[0], id: undefined, application: 'Browser', timestamp: '2026-09-21T12:30:00.000Z', context: {} };
  assert.equal((await service.ingest([periodEvent])).rejected[0].reason, 'period_excluded');

  await assert.rejects(() => service.updatePrivacy({ allowed_privacy_classes: ['PUBLIC', 'SENSITIVE'] }), /sensitive_consent/u);
  await service.updatePrivacy({ allowed_privacy_classes: ['PUBLIC', 'PERSONAL', 'PRIVATE', 'SENSITIVE'], sensitive_consent: true });
  const sensitive = { ...fixture.events[0], id: undefined, application: 'Notes', privacy_class: 'SENSITIVE', timestamp: '2026-09-21T20:00:00.000Z' };
  assert.equal((await service.ingest([sensitive])).accepted_count, 1);

  await service.updatePrivacy({ observation_enabled: false });
  const paused = await service.ingest([{ ...fixture.events[1], id: undefined, timestamp: '2026-09-21T21:00:00.000Z' }]);
  assert.equal(paused.rejected[0].reason, 'observation_paused');
  const state = await store.read();
  assert.equal(state.events.some(event => event.context?.domain === 'sub.private.example'), false);
  assert.equal(state.events.some(event => event.timestamp === '2026-09-21T12:30:00.000Z'), false);
});

test('confidence propagates from telemetry into inferred leverage confidence', async () => {
  const high = await harness();
  const highAnalysis = (await analyseFixture(high.service, high.fixture)).result;
  const highCandidate = highAnalysis.opportunities.find(item => item.opportunity_key === 'career:application_throughput');

  const low = await harness();
  const lowEvents = low.fixture.events.map(event => ({ ...event, confidence: 0.2 }));
  await low.service.ingest(lowEvents);
  const lowGoal = await low.service.createGoal(low.fixture.goal);
  const lowAnalysis = await low.service.analyse({ goal_id: lowGoal.id, time_horizon: '8d', as_of: low.fixture.as_of });
  const lowCandidate = lowAnalysis.opportunities.find(item => item.opportunity_key === 'career:application_throughput');
  assert.ok(lowCandidate.confidence < highCandidate.confidence);
  assert.ok(lowCandidate.ranking.dimensions.confidence < highCandidate.ranking.dimensions.confidence);
});

test('dismissed evidence-equivalent opportunity stays suppressed until evidence changes', async () => {
  const { fixture, service } = await harness();
  await service.ingest(fixture.events);
  const goal = await service.createGoal(fixture.goal);
  let result = await service.analyse({ goal_id: goal.id, time_horizon: '7d', as_of: fixture.as_of });
  const target = result.opportunities.find(item => item.opportunity_key === 'career:application_throughput');
  await service.recordFeedback({ opportunity_id: target.id, status: 'dismissed', rating: 2, reason: 'Need better evidence first.' });
  result = await service.analyse({ goal_id: goal.id, time_horizon: '7d', as_of: fixture.as_of });
  assert.equal(result.opportunities.some(item => item.opportunity_key === target.opportunity_key), false);

  await service.ingest([{ timestamp: '2026-09-21T22:00:00.000Z', device_id: 'synthetic-device', source: 'synthetic', application: 'Browser', action_type: 'application_submitted', object: 'role-c', context: {}, duration_ms: 15 * 60 * 1000, confidence: 0.94, privacy_class: 'PERSONAL' }]);
  result = await service.analyse({ goal_id: goal.id, time_horizon: '7d', as_of: '2026-09-21T23:59:30.000Z' });
  assert.equal(result.opportunities.some(item => item.opportunity_key === target.opportunity_key), true);
});

test('experiment, measured outcome and recommendation feedback remain distinct records', async () => {
  const { fixture, service, store } = await harness();
  const { result } = await analyseFixture(service, fixture);
  const target = result.opportunities.find(item => item.opportunity_key === 'career:application_throughput');
  const experiment = await service.createExperiment({ opportunity_id: target.id, period_days: 14 });
  assert.equal(experiment.status, 'planned');
  assert.equal(experiment.action_authority, 'user_required');
  assert.match(experiment.hypothesis, /may/u);
  assert.ok(experiment.metrics.includes('career.application_to_interview_conversion'));

  const measurement = await service.recordOutcome({ opportunity_id: target.id, experiment_id: experiment.id, metric_id: 'qualified_applications_per_week', value: 6, unit: 'count/week', confidence: 0.9, evidence: ['experiment-week-1'] });
  assert.equal(measurement.value, 6);
  await service.recordFeedback({ opportunity_id: target.id, status: 'completed', rating: 4 });
  const state = await store.read();
  assert.equal(state.outcome_measurements.length, 1);
  assert.equal(state.feedback.length, 1);
  const why = await service.why(target.id);
  assert.equal(why.measured_outcomes[0].metric_id, 'qualified_applications_per_week');

  await assert.rejects(() => service.deleteHistory({ confirm: 'yes' }), /DELETE_LEVERAGE_HISTORY/u);
  const deleted = await service.deleteHistory({ confirm: 'DELETE_LEVERAGE_HISTORY', retain_goals: true });
  assert.equal(deleted.goals_retained, true);
  assert.equal((await service.goals()).length, 1);
  assert.deepEqual(await service.opportunities(), []);
  assert.equal((await store.read()).outcome_measurements.length, 0);
});

test('counterfactual capacity arithmetic exposes assumptions instead of claiming outcome gain', () => {
  const scenario = estimateCapacityShift({ hours_per_week: 2.1, reduction_fraction: 0.75, horizon_weeks: 52 });
  assert.equal(scenario.reclaimed_hours, 81.9);
  assert.ok(scenario.assumptions.some(value => /not automatically|actually avoidable/u.test(value)));
  assert.match(scenario.confidence_note, /must be measured/u);
});

test('provider interface validates and canonicalizes collected events', async () => {
  const fixture = syntheticLeverageFixture();
  const provider = new StaticEventProvider('fixture-provider', [{ ...fixture.events[0], source: undefined, id: undefined }]);
  const events = await collectProvider(provider);
  assert.equal(events[0].source, 'fixture-provider');
  assert.match(events[0].id, /^[0-9a-f-]{36}$/u);
  await assert.rejects(() => collectProvider({ id: 'broken' }), /collect/u);
});
