import { randomUUID } from 'node:crypto';
import { validateFixedThresholdSignal } from './nonlinearity.mjs';

const PHASES = new Set(['baseline', 'intervention', 'followup', 'any']);
const EXPECTED_CHANGES = new Set(['outcome_higher_above_threshold', 'outcome_lower_above_threshold', 'no_observed_mean_difference', 'unspecified']);
const DIRECTIONAL_CHANGES = new Set(['outcome_higher_above_threshold', 'outcome_lower_above_threshold']);
const METRIC_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,159}$/u;

function assertMetricId(value, name) {
  if (typeof value !== 'string' || !METRIC_ID.test(value)) throw new TypeError(`${name} is invalid.`);
}

function assertUnit(value, name) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 80) throw new TypeError(`${name} must be 1..80 characters.`);
}

function assertPlan(input) {
  if (!input || typeof input !== 'object') throw new TypeError('threshold hypothesis input is required.');
  if (typeof input.experiment_id !== 'string' || !input.experiment_id) throw new TypeError('experiment_id is required.');
  assertMetricId(input.driver_metric_id, 'driver_metric_id');
  assertMetricId(input.outcome_metric_id, 'outcome_metric_id');
  if (input.driver_metric_id === input.outcome_metric_id) throw new TypeError('driver_metric_id and outcome_metric_id must be different.');
  if (!PHASES.has(input.phase ?? 'intervention')) throw new TypeError('phase must be baseline, intervention, followup or any.');
  if (!Number.isFinite(input.threshold_value)) throw new TypeError('threshold_value must be a finite number.');
  const expectedChange = input.expected_change ?? 'unspecified';
  if (!EXPECTED_CHANGES.has(expectedChange)) throw new TypeError('expected_change is invalid.');
  assertUnit(input.driver_unit, 'driver_unit');
  assertUnit(input.outcome_unit, 'outcome_unit');
  const minimumSamples = input.minimum_samples ?? 6;
  const minimumPerSide = input.minimum_per_side ?? 3;
  if (!Number.isInteger(minimumSamples) || minimumSamples < 6 || minimumSamples > 1000) throw new TypeError('minimum_samples must be an integer between 6 and 1000.');
  if (!Number.isInteger(minimumPerSide) || minimumPerSide < 2 || minimumPerSide > 500) throw new TypeError('minimum_per_side must be an integer between 2 and 500.');
  if (input.minimum_absolute_change !== undefined && input.minimum_absolute_change !== null) {
    if (!Number.isFinite(input.minimum_absolute_change) || input.minimum_absolute_change < 0)
      throw new TypeError('minimum_absolute_change must be null or a non-negative finite number.');
    if (!DIRECTIONAL_CHANGES.has(expectedChange))
      throw new TypeError('minimum_absolute_change is only valid for directional threshold hypotheses.');
  }
  if (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 1000)) throw new TypeError('note must be at most 1000 characters.');
}

export async function registerThresholdHypothesis(store, input, { clock = () => Date.now() } = {}) {
  assertPlan(input);
  return store.transaction(state => {
    if (!state.experiments.some(item => item.id === input.experiment_id)) throw new Error('Referenced experiment does not exist.');
    const registeredAt = new Date(clock()).toISOString();
    const hypothesis = {
      id: randomUUID(),
      experiment_id: input.experiment_id,
      driver_metric_id: input.driver_metric_id,
      outcome_metric_id: input.outcome_metric_id,
      phase: input.phase ?? 'intervention',
      threshold_value: input.threshold_value,
      expected_change: input.expected_change ?? 'unspecified',
      driver_unit: input.driver_unit,
      outcome_unit: input.outcome_unit,
      minimum_samples: input.minimum_samples ?? 6,
      minimum_per_side: input.minimum_per_side ?? 3,
      minimum_absolute_change: input.minimum_absolute_change ?? null,
      note: input.note,
      registered_at: registeredAt,
      registration_measurement_index: state.outcome_measurements.length,
      status: 'registered',
      causal_interpretation: 'not_established',
      authority: 'measurement_plan_only',
    };
    state.threshold_hypotheses.push(hypothesis);
    return structuredClone(hypothesis);
  });
}

export async function listThresholdHypotheses(store, { experiment_id } = {}) {
  const state = await store.read();
  return state.threshold_hypotheses
    .filter(item => !experiment_id || item.experiment_id === experiment_id)
    .map(item => structuredClone(item));
}

export async function validateRegisteredThreshold(store, hypothesisId, { clock = () => Date.now() } = {}) {
  const state = await store.read();
  const hypothesis = state.threshold_hypotheses.find(item => item.id === hypothesisId);
  if (!hypothesis) throw new Error('Threshold hypothesis not found.');
  if (!state.experiments.some(item => item.id === hypothesis.experiment_id)) throw new Error('Referenced experiment no longer exists.');
  const startIndex = hypothesis.registration_measurement_index;
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > state.outcome_measurements.length)
    throw new Error('Threshold registration boundary is invalid for the current store.');

  const heldOutMeasurements = state.outcome_measurements.slice(startIndex);
  const evaluation = validateFixedThresholdSignal({
    measurements: heldOutMeasurements,
    experiment_id: hypothesis.experiment_id,
    driver_metric_id: hypothesis.driver_metric_id,
    outcome_metric_id: hypothesis.outcome_metric_id,
    threshold_value: hypothesis.threshold_value,
    phase: hypothesis.phase,
    minimum_samples: hypothesis.minimum_samples,
    minimum_per_side: hypothesis.minimum_per_side,
    expected_change: hypothesis.expected_change,
    expected_driver_unit: hypothesis.driver_unit,
    expected_outcome_unit: hypothesis.outcome_unit,
    minimum_absolute_change: hypothesis.minimum_absolute_change,
  });

  return {
    hypothesis: {
      id: hypothesis.id,
      experiment_id: hypothesis.experiment_id,
      driver_metric_id: hypothesis.driver_metric_id,
      outcome_metric_id: hypothesis.outcome_metric_id,
      phase: hypothesis.phase,
      threshold_value: hypothesis.threshold_value,
      expected_change: hypothesis.expected_change,
      driver_unit: hypothesis.driver_unit,
      outcome_unit: hypothesis.outcome_unit,
      minimum_samples: hypothesis.minimum_samples,
      minimum_per_side: hypothesis.minimum_per_side,
      minimum_absolute_change: hypothesis.minimum_absolute_change,
      registered_at: hypothesis.registered_at,
      status: hypothesis.status,
    },
    held_out_boundary: {
      registration_measurement_index: startIndex,
      measurements_appended_since_registration: heldOutMeasurements.length,
      discovery_measurements_reused: false,
    },
    evaluation,
    evaluated_at: new Date(clock()).toISOString(),
    read_only: true,
  };
}
