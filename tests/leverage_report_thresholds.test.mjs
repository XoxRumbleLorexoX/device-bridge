import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LeverageStore, registerThresholdHypothesis, buildLeverageReportModel, renderLeverageReport } from '../src/leverage/index.mjs';

const experimentId = '00000000-0000-4000-8000-000000000401';

function pair(prefix, index, outcome, evidence = []) {
  const sample = `${prefix}-SECRET-SAMPLE-${index}`;
  return [
    { id: `${prefix}-driver-${index}`, experiment_id: experimentId, metric_id: 'focus.hours', sample_id: sample, phase: 'intervention', value: index, unit: 'hours', confidence: 1, evidence },
    { id: `${prefix}-outcome-${index}`, experiment_id: experimentId, metric_id: 'output.units', sample_id: sample, phase: 'intervention', value: outcome, unit: 'units/week', confidence: 1, evidence },
  ];
}

async function reportState({ tamperPrefix = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'device-bridge-threshold-report-'));
  const store = new LeverageStore(join(directory, 'store.json'));
  await store.transaction(state => {
    state.experiments.push({ id: experimentId, opportunity_id: '00000000-0000-4000-8000-000000000402', status: 'planned', metrics: [] });
    for (let index = 1; index <= 8; index += 1) state.outcome_measurements.push(...pair('DISCOVERY', index, index <= 4 ? 50 : 1, ['DISCOVERY-EVIDENCE-SECRET']));
  });
  await registerThresholdHypothesis(store, {
    experiment_id: experimentId,
    driver_metric_id: 'focus.hours',
    outcome_metric_id: 'output.units',
    phase: 'intervention',
    threshold_value: 4.5,
    expected_change: 'outcome_higher_above_threshold',
    driver_unit: 'hours',
    outcome_unit: 'units/week',
    minimum_samples: 8,
    minimum_per_side: 3,
    minimum_absolute_change: 5,
    note: 'THRESHOLD-NOTE-SECRET',
  }, { clock: () => Date.parse('2026-09-29T08:00:00.000Z') });
  await store.transaction(state => {
    if (tamperPrefix) state.outcome_measurements[0] = { ...state.outcome_measurements[0], value: 999 };
    for (let index = 1; index <= 8; index += 1) state.outcome_measurements.push(...pair('HOLDOUT', index, index <= 4 ? 10 : 20, ['HOLDOUT-EVIDENCE-SECRET']));
  });
  return store.read();
}

test('public leverage report model includes aggregate threshold validation without sensitive threshold internals', async () => {
  const state = await reportState();
  const model = buildLeverageReportModel(state, { generated_at: '2026-09-29T09:00:00.000Z' });
  assert.equal(model.counts.threshold_hypotheses, 1);
  assert.equal(model.threshold_hypotheses.length, 1);
  const item = model.threshold_hypotheses[0];
  assert.equal(item.threshold_value, 4.5);
  assert.equal(item.validation.status, 'fixed_threshold_evaluation');
  assert.equal(item.validation.prefix_integrity_verified, true);
  assert.equal(item.validation.real_world_observation_novelty_verified, false);
  assert.equal(item.validation.observed_change, 'outcome_higher_above_threshold');
  assert.equal(item.validation.pattern_consistent, true);
  assert.equal(item.validation.absolute_change, 10);
  assert.equal(item.validation.threshold_reselected, false);
  assert.equal(model.exclusions.threshold_integrity_digests_included, false);
  assert.equal(model.exclusions.threshold_sample_ids_included, false);
  assert.equal(model.exclusions.threshold_raw_measurements_included, false);
  assert.equal(model.exclusions.threshold_notes_included, false);

  const serialized = JSON.stringify(model);
  for (const forbidden of ['registration_prefix_digest', 'SECRET-SAMPLE', 'DISCOVERY-EVIDENCE-SECRET', 'HOLDOUT-EVIDENCE-SECRET', 'THRESHOLD-NOTE-SECRET'])
    assert.doesNotMatch(serialized, new RegExp(forbidden, 'u'));
});

test('HTML renders fixed threshold evidence and explicit provenance caveats', async () => {
  const state = await reportState();
  const html = renderLeverageReport(state, { generated_at: '2026-09-29T09:00:00.000Z' });
  assert.match(html, /Registered threshold validation/u);
  assert.match(html, /focus\.hours → output\.units/u);
  assert.match(html, /Threshold 4\.5 hours/u);
  assert.match(html, /observed Δ 10 units\/week/u);
  assert.match(html, /expected pattern consistent/u);
  assert.match(html, /real-world observation novelty independently verified: no/u);
  assert.doesNotMatch(html, /registration_prefix_digest/u);
  assert.doesNotMatch(html, /SECRET-SAMPLE/u);
  assert.doesNotMatch(html, /THRESHOLD-NOTE-SECRET/u);
  assert.doesNotMatch(html, /HOLDOUT-EVIDENCE-SECRET/u);
});

test('report degrades to a sanitized boundary-integrity state instead of leaking validation errors', async () => {
  const state = await reportState({ tamperPrefix: true });
  const model = buildLeverageReportModel(state, { generated_at: '2026-09-29T09:00:00.000Z' });
  const item = model.threshold_hypotheses[0];
  assert.equal(item.validation.status, 'boundary_integrity_failed');
  assert.equal(item.validation.prefix_integrity_verified, false);
  assert.equal(item.validation.absolute_change, null);
  const html = renderLeverageReport(state, { generated_at: '2026-09-29T09:00:00.000Z' });
  assert.match(html, /boundary_integrity_failed/u);
  assert.doesNotMatch(html, /prefix changed/u);
  assert.doesNotMatch(html, /999/u);
});

test('report handles stores with no registered thresholds', () => {
  const state = {
    schema_version: 1,
    privacy: { observation_enabled: true, allowed_privacy_classes: ['PERSONAL'], raw_event_retention_days: 90 },
    events: [], activities: [], repetitions: [], sequences: [], frictions: [], variable_definitions: [], observations: [], goals: [], outcome_metrics: [], bottlenecks: [], opportunities: [], experiments: [], outcome_measurements: [], threshold_hypotheses: [], feedback: [], causal_graph: { nodes: [], edges: [] }, analysis_meta: null,
  };
  const html = renderLeverageReport(state, { generated_at: '2026-09-29T09:00:00.000Z' });
  assert.match(html, /No threshold hypotheses registered/u);
});
