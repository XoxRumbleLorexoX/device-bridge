import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExperimentMeasurements } from '../src/leverage/experiments.mjs';

const experiment = { id: 'threshold-experiment' };
const metric_id = 'metric/a+b:c';

function m(id, phase, value) {
  return { id, experiment_id: experiment.id, metric_id, phase, value, unit: 'points', confidence: 1, evidence: [] };
}

test('a change exactly equal to the meaningful-change threshold is treated as reaching it', () => {
  const result = evaluateExperimentMeasurements({
    experiment,
    metric_id,
    direction: 'increase',
    minimum_meaningful_change: 2,
    measurements: [m('b1', 'baseline', 10), m('i1', 'intervention', 12)],
  });
  assert.equal(result.observed_direction, 'increase');
  assert.equal(result.assessment, 'improved');
});

test('zero delta remains within tolerance when the tolerance itself is zero', () => {
  const result = evaluateExperimentMeasurements({
    experiment,
    metric_id,
    direction: 'increase',
    minimum_meaningful_change: 0,
    measurements: [m('b1', 'baseline', 10), m('i1', 'intervention', 10)],
  });
  assert.equal(result.observed_direction, 'within_tolerance');
  assert.equal(result.assessment, 'unchanged');
});
