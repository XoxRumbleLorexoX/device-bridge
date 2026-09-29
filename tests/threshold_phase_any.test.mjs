import test from 'node:test';
import assert from 'node:assert/strict';
import { detectThresholdSignal } from '../src/leverage/nonlinearity.mjs';

const experimentId = '00000000-0000-4000-8000-000000000202';

function pair(sample, driver, outcome, phase = 'intervention') {
  return [
    { id: `d-${phase}-${sample}`, experiment_id: experimentId, metric_id: 'driver', sample_id: sample, phase, value: driver, unit: 'hours', confidence: 1, evidence: [] },
    { id: `o-${phase}-${sample}`, experiment_id: experimentId, metric_id: 'outcome', sample_id: sample, phase, value: outcome, unit: 'units', confidence: 1, evidence: [] },
  ];
}

test('phase=any excludes unspecified-phase records from threshold discovery', () => {
  const measurements = [];
  for (let index = 1; index <= 8; index += 1) measurements.push(...pair(`u${index}`, index, index < 5 ? 1 : 10, 'unspecified'));
  const result = detectThresholdSignal({
    measurements,
    experiment_id: experimentId,
    driver_metric_id: 'driver',
    outcome_metric_id: 'outcome',
    phase: 'any',
  });
  assert.equal(result.status, 'insufficient_evidence');
  assert.equal(result.relevant_measurement_count, 0);
  assert.equal(result.usable_pair_count, 0);
});

test('total and per-side minimums are independent constraints', () => {
  const measurements = [];
  for (let index = 1; index <= 10; index += 1) measurements.push(...pair(`i${index}`, index, index <= 5 ? 2 : 8));
  const result = detectThresholdSignal({
    measurements,
    experiment_id: experimentId,
    driver_metric_id: 'driver',
    outcome_metric_id: 'outcome',
    minimum_samples: 6,
    minimum_per_side: 4,
  });
  assert.equal(result.status, 'exploratory_threshold_candidate');
  assert.equal(result.threshold.value, 5.5);
  assert.ok(result.threshold.below_count >= 4);
  assert.ok(result.threshold.above_count >= 4);
});

test('all-phase combined analysis warns that phase distributions are pooled after phase-local pairing', () => {
  const measurements = [];
  for (let index = 1; index <= 4; index += 1) measurements.push(...pair(`b${index}`, index, index <= 2 ? 2 : 4, 'baseline'));
  for (let index = 5; index <= 8; index += 1) measurements.push(...pair(`i${index}`, index, index <= 6 ? 8 : 10, 'intervention'));
  const result = detectThresholdSignal({
    measurements,
    experiment_id: experimentId,
    driver_metric_id: 'driver',
    outcome_metric_id: 'outcome',
    phase: 'any',
    minimum_samples: 8,
    minimum_per_side: 3,
  });
  assert.equal(result.status, 'exploratory_threshold_candidate');
  assert.match(result.limitations.join(' '), /pools baseline, intervention and follow-up pairs/u);
});
