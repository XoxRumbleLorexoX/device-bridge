import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeverageReportModel, renderLeverageReport } from '../src/leverage/report.mjs';

function stateWithExperiment() {
  return {
    schema_version: 1,
    privacy: { observation_enabled: true, allowed_privacy_classes: ['PERSONAL'], raw_event_retention_days: 90 },
    events: [], activities: [], repetitions: [], sequences: [], frictions: [],
    variable_definitions: [], observations: [], goals: [], outcome_metrics: [], bottlenecks: [], opportunities: [], feedback: [],
    causal_graph: { nodes: [], edges: [] },
    experiments: [{
      id: 'experiment-a',
      status: 'planned',
      hypothesis: 'Batching may change throughput.',
      intervention: 'Batch application work.',
      metrics: ['career.throughput', 'career.quality'],
      confidence: 0.7,
      created_at: '2026-09-28T10:00:00.000Z',
    }],
    outcome_measurements: [
      { id: 'b1', experiment_id: 'experiment-a', metric_id: 'career.throughput', phase: 'baseline', value: 2, unit: 'count/week', confidence: 1, evidence: ['BASELINE-EVIDENCE-MUST-NOT-LEAK'] },
      { id: 'b2', experiment_id: 'experiment-a', metric_id: 'career.throughput', phase: 'baseline', value: 4, unit: 'count/week', confidence: 0.5, evidence: ['BASELINE-EVIDENCE-MUST-NOT-LEAK'] },
      { id: 'i1', experiment_id: 'experiment-a', metric_id: 'career.throughput', phase: 'intervention', value: 5, unit: 'count/week', confidence: 1, evidence: ['INTERVENTION-EVIDENCE-MUST-NOT-LEAK'] },
      { id: 'i2', experiment_id: 'experiment-a', metric_id: 'career.throughput', phase: 'intervention', value: 7, unit: 'count/week', confidence: 0.5, evidence: ['INTERVENTION-EVIDENCE-MUST-NOT-LEAK'] },
      { id: 'q1', experiment_id: 'experiment-a', metric_id: 'career.quality', phase: 'baseline', value: 'high', unit: 'category', confidence: 1, evidence: ['QUALITY-EVIDENCE-MUST-NOT-LEAK'] },
    ],
    analysis_meta: null,
  };
}

test('report model includes sanitized descriptive experiment comparisons', () => {
  const model = buildLeverageReportModel(stateWithExperiment(), { generated_at: '2026-09-28T12:00:00.000Z' });
  const experiment = model.experiments[0];
  assert.equal(experiment.evaluations.length, 2);

  const throughput = experiment.evaluations.find(item => item.metric_id === 'career.throughput');
  assert.equal(throughput.assessment, 'direction_observed');
  assert.equal(throughput.observed_direction, 'increase');
  assert.equal(throughput.evidence_level, 'two_measurements_each_phase');
  assert.equal(throughput.baseline_mean, 2.6667);
  assert.equal(throughput.intervention_mean, 5.6667);
  assert.equal(throughput.absolute_change, 3);
  assert.equal(throughput.causal_interpretation, 'not_established');

  const quality = experiment.evaluations.find(item => item.metric_id === 'career.quality');
  assert.equal(quality.evidence_level, 'insufficient');
  assert.equal(quality.observed_direction, 'unknown');
  assert.ok(quality.insufficient_reason_count > 0);

  const serialized = JSON.stringify(model);
  assert.doesNotMatch(serialized, /BASELINE-EVIDENCE-MUST-NOT-LEAK/u);
  assert.doesNotMatch(serialized, /INTERVENTION-EVIDENCE-MUST-NOT-LEAK/u);
  assert.doesNotMatch(serialized, /QUALITY-EVIDENCE-MUST-NOT-LEAK/u);
  assert.doesNotMatch(serialized, /measurement_ids/u);
});

test('HTML displays observed experiment direction with an explicit causal caveat', () => {
  const html = renderLeverageReport(stateWithExperiment(), { generated_at: '2026-09-28T12:00:00.000Z' });
  assert.match(html, /Experiments &amp; observed change/u);
  assert.match(html, /career\.throughput/u);
  assert.match(html, /2\.6667 → 5\.6667 count\/week/u);
  assert.match(html, /observed increase · two_measurements_each_phase · causality not established/u);
  assert.match(html, /career\.quality/u);
  assert.match(html, /insufficient comparable baseline\/intervention evidence/u);
  assert.doesNotMatch(html, /BASELINE-EVIDENCE-MUST-NOT-LEAK/u);
  assert.doesNotMatch(html, /INTERVENTION-EVIDENCE-MUST-NOT-LEAK/u);
});
