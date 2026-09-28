import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeverageReportModel, renderLeverageReport } from '../src/leverage/report.mjs';

function fixtureState() {
  return {
    schema_version: 1,
    privacy: {
      observation_enabled: true,
      allowed_privacy_classes: ['PUBLIC', 'PERSONAL', 'PRIVATE'],
      raw_event_retention_days: 90,
    },
    events: [{
      id: 'event-secret',
      timestamp: '2026-09-28T09:00:00.000Z',
      device_id: 'host',
      source: 'test-provider',
      application: 'Secret App',
      action_type: 'secret_action',
      object: 'RAW-OBJECT-MUST-NOT-LEAK',
      context: { password_like_secret: 'RAW-CONTEXT-MUST-NOT-LEAK' },
      raw_event_ref: 'RAW-REF-MUST-NOT-LEAK',
      confidence: 1,
      privacy_class: 'PRIVATE',
      duration_ms: 1,
    }],
    activities: [],
    repetitions: [],
    sequences: [],
    frictions: [],
    variable_definitions: [{ id: 'career.throughput', name: 'Career throughput', unit: 'count/week', controllability: 0.8, observability: 1, confidence: 0.9 }],
    observations: [{ variable_id: 'career.throughput', value: 4, unit: 'count/week', confidence: 0.85, evidence: ['EVIDENCE-TEXT-MUST-NOT-LEAK'] }],
    goals: [{ id: 'goal-1', description: '<script>alert("goal")</script> Increase earning power', domain: 'career', priority: 0.9, provenance: 'explicit', confirmation_status: 'confirmed' }],
    outcome_metrics: [],
    bottlenecks: [{
      id: 'bottleneck-1',
      type: 'pipeline_stage',
      domain: 'career',
      status: 'suspected_constraint',
      confidence: 0.7,
      constrained_variables: ['career.throughput'],
      competing_hypotheses: ['Raw hypothesis text is intentionally summarized as a count'],
      missing_variables: ['career.conversion'],
      evidence: ['BOTTLENECK-EVIDENCE-MUST-NOT-LEAK'],
    }],
    opportunities: [{
      id: 'opportunity-1',
      title: 'Reduce application friction',
      domain: 'career',
      intervention_type: 'WORKFLOW',
      confidence: 0.75,
      expected_effect: 'Test whether qualified application throughput changes.',
      missing_variables: ['career.conversion'],
      assumptions: ['assumption-secret-not-rendered'],
      alternatives: ['alternative-secret-not-rendered'],
      action_authority: 'user_required',
      action_state: 'recommendation_only',
      ranking: { heuristic_score: 81.2, dimensions: { confidence: 0.75 } },
      evidence: ['OPPORTUNITY-EVIDENCE-MUST-NOT-LEAK'],
    }],
    causal_graph: {
      nodes: [
        { id: 'goal:goal-1', type: 'goal', label: '<b>Increase earning power</b>', confidence: 1 },
        { id: 'variable:career.throughput', type: 'variable', label: 'Career throughput', confidence: 0.85 },
        { id: 'opportunity:opportunity-1', type: 'opportunity', label: 'Reduce application friction', confidence: 0.75 },
      ],
      edges: [{
        from: 'variable:career.throughput',
        to: 'opportunity:opportunity-1',
        relationship_type: 'CONTRIBUTES_TO',
        claim_type: 'hypothesis',
        confidence: 0.75,
        evidence: ['GRAPH-EVIDENCE-MUST-NOT-LEAK'],
      }],
    },
    experiments: [{
      id: 'experiment-1',
      status: 'planned',
      hypothesis: 'Throughput may improve after batching.',
      intervention: 'Batch application work.',
      metrics: ['career.throughput'],
      confidence: 0.7,
      created_at: '2026-09-28T10:00:00.000Z',
    }],
    outcome_measurements: [
      { id: 'm1', experiment_id: 'experiment-1', metric_id: 'career.throughput', phase: 'baseline', value: 2, unit: 'count/week', confidence: 1, evidence: ['measurement-secret'] },
      { id: 'm2', experiment_id: 'experiment-1', metric_id: 'career.throughput', phase: 'intervention', value: 4, unit: 'count/week', confidence: 1, evidence: ['measurement-secret'] },
      { id: 'm3', experiment_id: 'experiment-1', metric_id: 'career.throughput', phase: 'followup', value: 3, unit: 'count/week', confidence: 1, evidence: ['measurement-secret'] },
    ],
    feedback: [],
    analysis_meta: {
      as_of: '2026-09-28T11:00:00.000Z',
      time_horizon: '30d',
      baseline: { state: 'initial', coverage_days: 8 },
      event_count: 1,
      repetition_count: 0,
      sequence_count: 0,
      friction_count: 1,
    },
  };
}

const forbidden = [
  'RAW-OBJECT-MUST-NOT-LEAK',
  'RAW-CONTEXT-MUST-NOT-LEAK',
  'RAW-REF-MUST-NOT-LEAK',
  'EVIDENCE-TEXT-MUST-NOT-LEAK',
  'BOTTLENECK-EVIDENCE-MUST-NOT-LEAK',
  'OPPORTUNITY-EVIDENCE-MUST-NOT-LEAK',
  'GRAPH-EVIDENCE-MUST-NOT-LEAK',
  'assumption-secret-not-rendered',
  'alternative-secret-not-rendered',
  'measurement-secret',
];

test('report model contains derived state but excludes raw telemetry and full evidence text', () => {
  const model = buildLeverageReportModel(fixtureState(), { generated_at: '2026-09-28T12:00:00.000Z' });
  const serialized = JSON.stringify(model);
  assert.equal(model.exclusions.raw_events_included, false);
  assert.equal(model.exclusions.raw_event_refs_included, false);
  assert.equal(model.exclusions.provider_context_included, false);
  assert.equal(model.exclusions.full_evidence_text_included, false);
  assert.equal(model.counts.goals, 1);
  assert.equal(model.counts.opportunities, 1);
  assert.deepEqual(model.experiments[0].phase_counts, { baseline: 1, intervention: 1, followup: 1, unspecified: 0 });
  for (const secret of forbidden) assert.equal(serialized.includes(secret), false, `report model leaked ${secret}`);
});

test('standalone HTML escapes derived text and contains no script or external network dependency', () => {
  const html = renderLeverageReport(fixtureState(), { generated_at: '2026-09-28T12:00:00.000Z' });
  assert.match(html, /<!doctype html>/u);
  assert.match(html, /&lt;script&gt;alert\(&quot;goal&quot;\)&lt;\/script&gt; Increase earning power/u);
  assert.doesNotMatch(html, /<script(?:\s|>)/iu);
  assert.doesNotMatch(html, /https?:\/\//iu);
  assert.doesNotMatch(html, /RAW-CONTEXT-MUST-NOT-LEAK/u);
  assert.doesNotMatch(html, /GRAPH-EVIDENCE-MUST-NOT-LEAK/u);
  assert.match(html, /Leverage map/u);
  assert.match(html, /CONTRIBUTES_TO/u);
  assert.match(html, /B 1 · I 1 · F 1/u);
});

test('report rendering is useful even before analysis has been run', () => {
  const state = fixtureState();
  state.analysis_meta = null;
  state.opportunities = [];
  state.bottlenecks = [];
  state.causal_graph = { nodes: [], edges: [] };
  const html = renderLeverageReport(state, { generated_at: '2026-09-28T12:00:00.000Z' });
  assert.match(html, /No analysis snapshot yet/u);
  assert.match(html, /No opportunities available/u);
  assert.match(html, /No leverage graph is available/u);
});
