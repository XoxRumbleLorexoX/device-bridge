import test from 'node:test';
import assert from 'node:assert/strict';
import { detectThresholdSignal } from '../src/leverage/nonlinearity.mjs';
import { OutcomeMeasurementSchema } from '../src/leverage/model.mjs';

const experimentId = '00000000-0000-4000-8000-000000000101';

function measurement({ id, sample, metric, value, unit, confidence = 1, phase = 'intervention', evidence = [] }) {
  return {
    id,
    experiment_id: experimentId,
    metric_id: metric,
    sample_id: sample,
    phase,
    value,
    unit,
    confidence,
    evidence,
  };
}

function cleanStepMeasurements() {
  const rows = [];
  for (let index = 1; index <= 10; index += 1) {
    const sample = `sample-${index}`;
    rows.push(measurement({ id: `driver-${index}`, sample, metric: 'focus.hours', value: index, unit: 'hours', evidence: ['DRIVER-EVIDENCE-MUST-NOT-LEAK'] }));
    rows.push(measurement({ id: `outcome-${index}`, sample, metric: 'output.units', value: index <= 5 ? 10 : 20, unit: 'units/week', evidence: ['OUTCOME-EVIDENCE-MUST-NOT-LEAK'] }));
  }
  return rows;
}

test('outcome measurement sample_id is optional and backwards compatible', () => {
  const oldShape = OutcomeMeasurementSchema.parse({
    experiment_id: experimentId,
    metric_id: 'output.units',
    value: 4,
    unit: 'units/week',
  });
  assert.equal(oldShape.sample_id, undefined);

  const paired = OutcomeMeasurementSchema.parse({
    experiment_id: experimentId,
    metric_id: 'output.units',
    sample_id: 'week-1',
    value: 4,
    unit: 'units/week',
  });
  assert.equal(paired.sample_id, 'week-1');
});

test('detects the strongest exploratory split in explicitly paired numeric samples', () => {
  const result = detectThresholdSignal({
    measurements: cleanStepMeasurements(),
    experiment_id: experimentId,
    driver_metric_id: 'focus.hours',
    outcome_metric_id: 'output.units',
  });

  assert.equal(result.status, 'exploratory_threshold_candidate');
  assert.equal(result.usable_pair_count, 10);
  assert.equal(result.threshold.value, 5.5);
  assert.equal(result.threshold.below_count, 5);
  assert.equal(result.threshold.above_count, 5);
  assert.equal(result.threshold.below_outcome_mean, 10);
  assert.equal(result.threshold.above_outcome_mean, 20);
  assert.equal(result.threshold.below_outcome_median, 10);
  assert.equal(result.threshold.above_outcome_median, 20);
  assert.equal(result.threshold.absolute_change, 10);
  assert.equal(result.threshold.relative_change, 1);
  assert.equal(result.threshold.standardized_mean_difference, null);
  assert.equal(result.observed_change, 'outcome_higher_above_threshold');
  assert.equal(result.causal_interpretation, 'not_established');
  assert.equal(result.validation_required, true);
  assert.match(result.limitations.join(' '), /selected on the same samples/u);
  assert.match(result.recommended_next_step, /new paired samples/u);
  assert.doesNotMatch(JSON.stringify(result), /EVIDENCE-MUST-NOT-LEAK/u);
});

test('missing sample IDs fail to create inferred temporal pairs', () => {
  const measurements = cleanStepMeasurements().map(item => ({ ...item, sample_id: undefined }));
  const result = detectThresholdSignal({
    measurements,
    experiment_id: experimentId,
    driver_metric_id: 'focus.hours',
    outcome_metric_id: 'output.units',
  });
  assert.equal(result.status, 'insufficient_evidence');
  assert.equal(result.usable_pair_count, 0);
  assert.equal(result.excluded_ineligible_measurement_count, 20);
  assert.match(result.reasons[0], /8 usable paired samples/u);
});

test('duplicate measurements for one sample are treated as ambiguous rather than averaged silently', () => {
  const measurements = cleanStepMeasurements();
  measurements.push(measurement({ id: 'driver-duplicate', sample: 'sample-1', metric: 'focus.hours', value: 1.1, unit: 'hours' }));
  const result = detectThresholdSignal({
    measurements,
    experiment_id: experimentId,
    driver_metric_id: 'focus.hours',
    outcome_metric_id: 'output.units',
  });
  assert.equal(result.status, 'exploratory_threshold_candidate');
  assert.equal(result.excluded_ambiguous_sample_count, 1);
  assert.equal(result.usable_pair_count, 9);
});

test('inconsistent units fail closed', () => {
  const measurements = cleanStepMeasurements();
  const changed = measurements.map(item => item.id === 'driver-10' ? { ...item, unit: 'minutes' } : item);
  const result = detectThresholdSignal({
    measurements: changed,
    experiment_id: experimentId,
    driver_metric_id: 'focus.hours',
    outcome_metric_id: 'output.units',
  });
  assert.equal(result.status, 'insufficient_evidence');
  assert.match(result.reasons.join(' '), /consistent driver unit/u);
});

test('zero-confidence and nonnumeric measurements are excluded from pairing evidence', () => {
  const measurements = cleanStepMeasurements().map(item => {
    if (item.id === 'driver-1') return { ...item, confidence: 0 };
    if (item.id === 'outcome-2') return { ...item, value: 'unknown' };
    return item;
  });
  const result = detectThresholdSignal({
    measurements,
    experiment_id: experimentId,
    driver_metric_id: 'focus.hours',
    outcome_metric_id: 'output.units',
    minimum_samples: 8,
    minimum_per_side: 2,
  });
  assert.equal(result.usable_pair_count, 8);
  assert.equal(result.excluded_ineligible_measurement_count, 2);
  assert.ok(result.excluded_unpaired_sample_count >= 2);
});

test('phase scoping prevents accidental mixing of baseline and intervention samples', () => {
  const intervention = cleanStepMeasurements();
  const baseline = cleanStepMeasurements().map(item => ({ ...item, id: `baseline-${item.id}`, sample_id: `baseline-${item.sample_id}`, phase: 'baseline' }));
  const result = detectThresholdSignal({
    measurements: [...intervention, ...baseline],
    experiment_id: experimentId,
    driver_metric_id: 'focus.hours',
    outcome_metric_id: 'output.units',
    phase: 'intervention',
  });
  assert.equal(result.usable_pair_count, 10);
  assert.equal(result.relevant_measurement_count, 20);
});
