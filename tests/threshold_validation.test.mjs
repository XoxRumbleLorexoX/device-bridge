import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LeverageStore } from '../src/leverage/storage.mjs';
import { LeverageService } from '../src/leverage/service.mjs';
import { validateFixedThresholdSignal } from '../src/leverage/nonlinearity.mjs';
import { registerThresholdHypothesis, listThresholdHypotheses, validateRegisteredThreshold } from '../src/leverage/thresholds.mjs';
import { leverageTools } from '../src/gateway.mjs';

const experimentId = '00000000-0000-4000-8000-000000000301';

function measurement(id, sample, metric, value, unit = metric === 'driver' ? 'hours' : 'units', phase = 'intervention') {
  return { id, experiment_id: experimentId, metric_id: metric, sample_id: sample, phase, value, unit, confidence: 1, evidence: [] };
}

function stepPairs(prefix, lowOutcome = 10, highOutcome = 20) {
  const rows = [];
  for (let index = 1; index <= 10; index += 1) {
    rows.push(measurement(`${prefix}-d-${index}`, `${prefix}-${index}`, 'driver', index));
    rows.push(measurement(`${prefix}-o-${index}`, `${prefix}-${index}`, 'outcome', index <= 5 ? lowOutcome : highOutcome));
  }
  return rows;
}

async function seededStore() {
  const directory = await mkdtemp(join(tmpdir(), 'device-bridge-threshold-validation-'));
  const store = new LeverageStore(join(directory, 'store.json'));
  await store.transaction(state => {
    state.experiments.push({ id: experimentId, opportunity_id: '00000000-0000-4000-8000-000000000302', status: 'planned' });
    state.outcome_measurements.push(...stepPairs('discovery', 100, 1));
  });
  return store;
}

const registrationInput = {
  experiment_id: experimentId,
  driver_metric_id: 'driver',
  outcome_metric_id: 'outcome',
  phase: 'intervention',
  threshold_value: 5.5,
  expected_change: 'outcome_higher_above_threshold',
  driver_unit: 'hours',
  outcome_unit: 'units',
  minimum_samples: 8,
  minimum_per_side: 3,
  minimum_absolute_change: 5,
};

test('registered threshold freezes the current measurement append boundary', async () => {
  const store = await seededStore();
  const hypothesis = await registerThresholdHypothesis(store, registrationInput, { clock: () => Date.parse('2026-09-29T08:00:00.000Z') });
  assert.equal(hypothesis.registration_measurement_index, 20);
  assert.equal(hypothesis.registration_prefix_digest, undefined, 'internal integrity digest must not be exposed');
  assert.equal(hypothesis.status, 'registered');
  assert.equal(hypothesis.causal_interpretation, 'not_established');
  const internal = (await store.read()).threshold_hypotheses.find(item => item.id === hypothesis.id);
  assert.match(internal.registration_prefix_digest, /^[0-9a-f]{64}$/u);

  const immediate = await validateRegisteredThreshold(store, hypothesis.id, { clock: () => Date.parse('2026-09-29T08:01:00.000Z') });
  assert.equal(immediate.held_out_boundary.basis, 'store_append_order');
  assert.equal(immediate.held_out_boundary.measurements_appended_since_registration, 0);
  assert.equal(immediate.held_out_boundary.pre_registration_store_measurements_reused, false);
  assert.equal(immediate.held_out_boundary.pre_registration_prefix_integrity_verified, true);
  assert.equal(immediate.held_out_boundary.real_world_observation_novelty_verified, false);
  assert.equal(immediate.evaluation.status, 'insufficient_evidence');
});

test('held-out validation ignores opposite pre-registration store data and keeps the registered split fixed', async () => {
  const store = await seededStore();
  const hypothesis = await registerThresholdHypothesis(store, registrationInput, { clock: () => Date.parse('2026-09-29T08:00:00.000Z') });
  await store.transaction(state => { state.outcome_measurements.push(...stepPairs('holdout', 10, 20)); });

  const result = await validateRegisteredThreshold(store, hypothesis.id, { clock: () => Date.parse('2026-09-29T09:00:00.000Z') });
  assert.equal(result.held_out_boundary.measurements_appended_since_registration, 20);
  assert.equal(result.held_out_boundary.pre_registration_store_measurements_reused, false);
  assert.equal(result.held_out_boundary.pre_registration_prefix_integrity_verified, true);
  assert.equal(result.held_out_boundary.real_world_observation_novelty_verified, false);
  assert.equal(result.evaluation.status, 'fixed_threshold_evaluation');
  assert.equal(result.evaluation.threshold.value, 5.5);
  assert.equal(result.evaluation.threshold.absolute_change, 10);
  assert.equal(result.evaluation.direction_consistent, true);
  assert.equal(result.evaluation.magnitude_requirement_met, true);
  assert.equal(result.evaluation.pattern_consistent, true);
  assert.equal(result.evaluation.threshold_reselected, false);
  assert.equal(result.evaluation.causal_interpretation, 'not_established');
});

test('validation fails if the pre-registration store prefix changes', async () => {
  const store = await seededStore();
  const hypothesis = await registerThresholdHypothesis(store, registrationInput);
  await store.transaction(state => {
    state.outcome_measurements[0] = { ...state.outcome_measurements[0], value: 999 };
    state.outcome_measurements.push(...stepPairs('later', 10, 20));
  });
  await assert.rejects(validateRegisteredThreshold(store, hypothesis.id), /prefix changed/u);
});

test('held-out direction mismatch is reported without rewriting the hypothesis', async () => {
  const store = await seededStore();
  const hypothesis = await registerThresholdHypothesis(store, registrationInput);
  await store.transaction(state => { state.outcome_measurements.push(...stepPairs('holdout-opposite', 20, 10)); });
  const before = await store.read();
  const result = await validateRegisteredThreshold(store, hypothesis.id);
  const after = await store.read();
  assert.equal(result.evaluation.observed_change, 'outcome_lower_above_threshold');
  assert.equal(result.evaluation.direction_consistent, false);
  assert.equal(result.evaluation.pattern_consistent, false);
  assert.deepEqual(after, before, 'validation must be read-only');
});

test('unit drift fails closed against the pre-registered units', async () => {
  const store = await seededStore();
  const hypothesis = await registerThresholdHypothesis(store, registrationInput);
  const heldout = stepPairs('holdout-units', 10, 20).map(item => item.metric_id === 'driver' ? { ...item, unit: 'minutes' } : item);
  await store.transaction(state => { state.outcome_measurements.push(...heldout); });
  const result = await validateRegisteredThreshold(store, hypothesis.id);
  assert.equal(result.evaluation.status, 'insufficient_evidence');
  assert.match(result.evaluation.reasons.join(' '), /does not match pre-registered unit/u);
});

test('fixed-threshold pure evaluation never searches for a better threshold', () => {
  const measurements = stepPairs('pure', 2, 9);
  const result = validateFixedThresholdSignal({
    measurements,
    experiment_id: experimentId,
    driver_metric_id: 'driver',
    outcome_metric_id: 'outcome',
    threshold_value: 4.5,
    expected_change: 'outcome_higher_above_threshold',
    expected_driver_unit: 'hours',
    expected_outcome_unit: 'units',
    minimum_samples: 8,
    minimum_per_side: 3,
  });
  assert.equal(result.status, 'fixed_threshold_evaluation');
  assert.equal(result.threshold.value, 4.5);
  assert.equal(result.threshold_reselected, false);
});

test('minimum absolute change is rejected for non-directional hypotheses', async () => {
  const store = await seededStore();
  await assert.rejects(
    registerThresholdHypothesis(store, {
      ...registrationInput,
      expected_change: 'no_observed_mean_difference',
      minimum_absolute_change: 1,
    }),
    /only valid for directional threshold hypotheses/u,
  );
  assert.throws(() => validateFixedThresholdSignal({
    measurements: stepPairs('nondirectional', 10, 10),
    experiment_id: experimentId,
    driver_metric_id: 'driver',
    outcome_metric_id: 'outcome',
    threshold_value: 5.5,
    expected_change: 'no_observed_mean_difference',
    expected_driver_unit: 'hours',
    expected_outcome_unit: 'units',
    minimum_absolute_change: 1,
  }), /only valid for directional expected_change values/u);
});

test('no-difference expectation is descriptive exact equality, not an equivalence test', () => {
  const result = validateFixedThresholdSignal({
    measurements: stepPairs('same', 10, 10),
    experiment_id: experimentId,
    driver_metric_id: 'driver',
    outcome_metric_id: 'outcome',
    threshold_value: 5.5,
    expected_change: 'no_observed_mean_difference',
    expected_driver_unit: 'hours',
    expected_outcome_unit: 'units',
    minimum_samples: 8,
    minimum_per_side: 3,
  });
  assert.equal(result.observed_change, 'no_observed_mean_difference');
  assert.equal(result.direction_consistent, true);
  assert.equal(result.magnitude_requirement_met, null);
  assert.equal(result.pattern_consistent, true);
  assert.equal(result.causal_interpretation, 'not_established');
});

test('schema-v1 stores backfill threshold_hypotheses without a schema migration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'device-bridge-threshold-backfill-'));
  const path = join(directory, 'store.json');
  const legacy = {
    schema_version: 1,
    privacy: { observation_enabled: true, allowed_privacy_classes: ['PUBLIC', 'PERSONAL', 'PRIVATE'], sensitive_consent: false, restricted_consent: false, excluded_applications: [], excluded_domains: [], excluded_sources: [], excluded_periods: [], raw_event_retention_days: 90 },
    events: [], activities: [], repetitions: [], sequences: [], frictions: [], variable_definitions: [], observations: [], goals: [], outcome_metrics: [], bottlenecks: [], causal_graph: { nodes: [], edges: [] }, opportunities: [], experiments: [], outcome_measurements: [], feedback: [], analysis_meta: null,
  };
  await writeFile(path, JSON.stringify(legacy));
  const state = await new LeverageStore(path).read();
  assert.deepEqual(state.threshold_hypotheses, []);
});

test('history deletion removes registered threshold hypotheses', async () => {
  const store = await seededStore();
  await registerThresholdHypothesis(store, registrationInput);
  const service = new LeverageService(store);
  const deleted = await service.deleteHistory({ confirm: 'DELETE_LEVERAGE_HISTORY', retain_goals: true });
  assert.equal(deleted.deleted.threshold_hypotheses, 1);
  const state = await store.read();
  assert.deepEqual(state.threshold_hypotheses, []);
});

test('MCP registration is local and validation/listing remain read-only', () => {
  const register = leverageTools.leverage_threshold_register;
  const list = leverageTools.leverage_threshold_hypotheses;
  const validate = leverageTools.leverage_threshold_validate;
  assert.equal(register.local, true);
  assert.notEqual(register.readOnly, true);
  assert.equal(list.local, true);
  assert.equal(list.readOnly, true);
  assert.equal(list.idempotent, true);
  assert.equal(validate.local, true);
  assert.equal(validate.readOnly, true);
  assert.equal(validate.idempotent, true);
  assert.match(validate.description, /only outcome measurements appended after registration/u);
});

test('registered hypotheses can be listed by experiment without exposing measurement evidence or integrity digests', async () => {
  const store = await seededStore();
  const hypothesis = await registerThresholdHypothesis(store, registrationInput);
  const listed = await listThresholdHypotheses(store, { experiment_id: experimentId });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, hypothesis.id);
  const serialized = JSON.stringify(listed);
  assert.doesNotMatch(serialized, /discovery-d-/u);
  assert.doesNotMatch(serialized, /registration_prefix_digest/u);
});
