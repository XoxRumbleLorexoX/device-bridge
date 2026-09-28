import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExperimentMeasurements } from '../src/leverage/experiments.mjs';
import { OutcomeMeasurementSchema } from '../src/leverage/model.mjs';
import { leverageTools } from '../src/gateway.mjs';

const experiment = Object.freeze({ id: 'experiment-1' });

function measurement({ id, phase, value, unit = 'count/week', confidence = 1, evidence = [] }) {
  return { id, experiment_id: experiment.id, metric_id: 'throughput', phase, value, unit, confidence, evidence };
}

test('phase is backward-compatible but explicit baseline/intervention phases are available', () => {
  const unspecified = OutcomeMeasurementSchema.parse({
    experiment_id: '00000000-0000-4000-8000-000000000001',
    metric_id: 'throughput',
    value: 5,
    unit: 'count/week',
  });
  assert.equal(unspecified.phase, 'unspecified');

  const baseline = OutcomeMeasurementSchema.parse({
    experiment_id: '00000000-0000-4000-8000-000000000001',
    metric_id: 'throughput',
    phase: 'baseline',
    value: 5,
    unit: 'count/week',
  });
  assert.equal(baseline.phase, 'baseline');
});

test('confidence-weighted increase is reported as improved without claiming causality', () => {
  const measurements = [
    measurement({ id: 'b1', phase: 'baseline', value: 10, confidence: 1, evidence: ['baseline-a'] }),
    measurement({ id: 'b2', phase: 'baseline', value: 20, confidence: 0.5, evidence: ['baseline-b'] }),
    measurement({ id: 'i1', phase: 'intervention', value: 20, confidence: 1, evidence: ['intervention-a'] }),
    measurement({ id: 'i2', phase: 'intervention', value: 22, confidence: 0.5, evidence: ['intervention-b'] }),
  ];
  const snapshot = structuredClone(measurements);
  const result = evaluateExperimentMeasurements({ experiment, measurements, metric_id: 'throughput', direction: 'increase', minimum_meaningful_change: 1, evaluated_at: '2026-09-28T12:00:00.000Z' });

  assert.equal(result.assessment, 'improved');
  assert.equal(result.observed_direction, 'increase');
  assert.equal(result.causal_interpretation, 'not_established');
  assert.equal(result.evidence_level, 'two_measurements_each_phase');
  assert.equal(result.baseline.confidence_weighted_mean, 13.3333);
  assert.equal(result.intervention.confidence_weighted_mean, 20.6667);
  assert.equal(result.absolute_change, 7.3334);
  assert.deepEqual(measurements, snapshot, 'evaluation must not mutate measurement input');
});

test('meaningful-change tolerance prevents tiny movements from being called improvement', () => {
  const result = evaluateExperimentMeasurements({
    experiment,
    metric_id: 'throughput',
    direction: 'increase',
    minimum_meaningful_change: 2,
    measurements: [
      measurement({ id: 'b1', phase: 'baseline', value: 100 }),
      measurement({ id: 'i1', phase: 'intervention', value: 101 }),
    ],
  });
  assert.equal(result.assessment, 'unchanged');
  assert.equal(result.observed_direction, 'within_tolerance');
});

test('maintain target treats movement outside tolerance as worsened', () => {
  const result = evaluateExperimentMeasurements({
    experiment,
    metric_id: 'throughput',
    direction: 'maintain',
    minimum_meaningful_change: 1,
    measurements: [
      measurement({ id: 'b1', phase: 'baseline', value: 10 }),
      measurement({ id: 'i1', phase: 'intervention', value: 13 }),
    ],
  });
  assert.equal(result.assessment, 'worsened');
  assert.equal(result.observed_direction, 'increase');
});

test('inconsistent comparable units fail closed', () => {
  const result = evaluateExperimentMeasurements({
    experiment,
    metric_id: 'throughput',
    measurements: [
      measurement({ id: 'b1', phase: 'baseline', value: 10, unit: 'minutes' }),
      measurement({ id: 'i1', phase: 'intervention', value: 9, unit: 'hours' }),
    ],
  });
  assert.equal(result.assessment, 'insufficient_evidence');
  assert.equal(result.unit, null);
  assert.match(result.reasons.join(' '), /inconsistent units/u);
});

test('zero-confidence values do not become evidence through an arithmetic fallback', () => {
  const result = evaluateExperimentMeasurements({
    experiment,
    metric_id: 'throughput',
    measurements: [
      measurement({ id: 'b0', phase: 'baseline', value: 10, confidence: 0 }),
      measurement({ id: 'i1', phase: 'intervention', value: 20, confidence: 1 }),
    ],
  });
  assert.equal(result.assessment, 'insufficient_evidence');
  assert.equal(result.baseline, null);
  assert.match(result.reasons.join(' '), /positive-confidence numeric baseline/u);
});

test('follow-up measurements are ignored rather than contaminating baseline/intervention unit checks', () => {
  const result = evaluateExperimentMeasurements({
    experiment,
    metric_id: 'throughput',
    direction: 'decrease',
    measurements: [
      measurement({ id: 'b1', phase: 'baseline', value: 10, unit: 'minutes' }),
      measurement({ id: 'i1', phase: 'intervention', value: 8, unit: 'minutes' }),
      measurement({ id: 'f1', phase: 'followup', value: 0.5, unit: 'ratio' }),
    ],
  });
  assert.equal(result.assessment, 'improved');
  assert.equal(result.unit, 'minutes');
  assert.match(result.limitations.join(' '), /1 linked measurement\(s\) were ignored/u);
});

test('unspecified target reports observed direction without inventing success semantics', () => {
  const result = evaluateExperimentMeasurements({
    experiment,
    metric_id: 'throughput',
    direction: 'unspecified',
    measurements: [
      measurement({ id: 'b1', phase: 'baseline', value: 5 }),
      measurement({ id: 'i1', phase: 'intervention', value: 7 }),
    ],
  });
  assert.equal(result.assessment, 'direction_observed');
  assert.equal(result.observed_direction, 'increase');
});

test('MCP experiment evaluation is explicitly read-only and local', () => {
  const tool = leverageTools.leverage_experiment_evaluate;
  assert.equal(tool.local, true);
  assert.equal(tool.readOnly, true);
  assert.equal(tool.idempotent, true);
  assert.match(tool.description, /does not establish causality/u);
});
