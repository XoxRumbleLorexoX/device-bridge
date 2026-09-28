function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function comparableMeasurements(measurements, phase, metricId) {
  return measurements.filter(item =>
    item.metric_id === metricId &&
    item.phase === phase &&
    typeof item.value === 'number' &&
    Number.isFinite(item.value) &&
    typeof item.confidence === 'number' &&
    Number.isFinite(item.confidence) &&
    item.confidence > 0
  );
}

function summarize(items) {
  if (!items.length) return null;
  const weight = items.reduce((sum, item) => sum + item.confidence, 0);
  if (!(weight > 0)) return null;
  const weightedMean = items.reduce((sum, item) => sum + item.value * item.confidence, 0) / weight;
  const arithmeticMean = items.reduce((sum, item) => sum + item.value, 0) / items.length;
  const variance = items.length > 1
    ? items.reduce((sum, item) => sum + (item.value - arithmeticMean) ** 2, 0) / (items.length - 1)
    : null;
  return {
    count: items.length,
    confidence_weighted_mean: round(weightedMean),
    arithmetic_mean: round(arithmeticMean),
    sample_standard_deviation: variance === null ? null : round(Math.sqrt(variance)),
    mean_measurement_confidence: round(weight / items.length),
    evidence: [...new Set(items.flatMap(item => item.evidence ?? []))],
    measurement_ids: items.map(item => item.id),
  };
}

function observedDirection(delta, tolerance) {
  if (delta > 0 && delta >= tolerance) return 'increase';
  if (delta < 0 && -delta >= tolerance) return 'decrease';
  return 'within_tolerance';
}

function alignedAssessment(direction, observed) {
  if (direction === 'unspecified') return observed === 'within_tolerance' ? 'no_detected_change' : 'direction_observed';
  if (direction === 'maintain') return observed === 'within_tolerance' ? 'unchanged' : 'worsened';
  if (observed === 'within_tolerance') return 'unchanged';
  if (direction === observed) return 'improved';
  return 'worsened';
}

function evidenceLevel(baselineCount, interventionCount) {
  if (!baselineCount || !interventionCount) return 'insufficient';
  const minimum = Math.min(baselineCount, interventionCount);
  if (minimum === 1) return 'single_measurement_each_phase';
  if (minimum === 2) return 'two_measurements_each_phase';
  return 'three_or_more_measurements_each_phase';
}

export function evaluateExperimentMeasurements({
  experiment,
  measurements,
  metric_id,
  direction = 'unspecified',
  minimum_meaningful_change = 0,
  evaluated_at = new Date().toISOString(),
} = {}) {
  if (!experiment?.id) throw new TypeError('experiment is required.');
  if (typeof metric_id !== 'string' || !metric_id) throw new TypeError('metric_id is required.');
  if (!['increase', 'decrease', 'maintain', 'unspecified'].includes(direction)) throw new TypeError('direction must be increase, decrease, maintain or unspecified.');
  if (!Number.isFinite(minimum_meaningful_change) || minimum_meaningful_change < 0) throw new TypeError('minimum_meaningful_change must be a non-negative number.');
  if (!Array.isArray(measurements)) throw new TypeError('measurements must be an array.');

  const linked = measurements.filter(item => item.experiment_id === experiment.id && item.metric_id === metric_id);
  const baselineItems = comparableMeasurements(linked, 'baseline', metric_id);
  const interventionItems = comparableMeasurements(linked, 'intervention', metric_id);
  const comparable = [...baselineItems, ...interventionItems];
  const units = [...new Set(comparable.map(item => item.unit))];
  const baseline = summarize(baselineItems);
  const intervention = summarize(interventionItems);
  const ignored = linked.filter(item =>
    !['baseline', 'intervention'].includes(item.phase) ||
    typeof item.value !== 'number' ||
    !Number.isFinite(item.value) ||
    !(typeof item.confidence === 'number' && Number.isFinite(item.confidence) && item.confidence > 0)
  );
  const limitations = [
    'This is a before/after descriptive comparison, not a randomized causal estimate.',
    'Confounding, regression to the mean, seasonality and unrelated changes may explain some or all of the observed difference.',
    'Measurement confidence is used only as a transparent weighting input; it is not a probability that the conclusion is true.',
  ];

  if (units.length > 1 || !baseline || !intervention) {
    const reasons = [];
    if (units.length > 1) reasons.push('Comparable baseline/intervention measurements use inconsistent units.');
    if (!baseline) reasons.push('At least one positive-confidence numeric baseline measurement is required.');
    if (!intervention) reasons.push('At least one positive-confidence numeric intervention measurement is required.');
    if (ignored.length) reasons.push(`${ignored.length} linked measurement(s) were ignored because their phase, value or confidence was unsuitable for this comparison.`);
    return {
      experiment_id: experiment.id,
      metric_id,
      unit: units.length === 1 ? units[0] : null,
      target_direction: direction,
      minimum_meaningful_change,
      assessment: 'insufficient_evidence',
      observed_direction: 'unknown',
      evidence_level: 'insufficient',
      baseline,
      intervention,
      absolute_change: null,
      relative_change: null,
      causal_interpretation: 'not_established',
      evaluated_at,
      reasons,
      limitations,
    };
  }

  const delta = intervention.confidence_weighted_mean - baseline.confidence_weighted_mean;
  const relative = baseline.confidence_weighted_mean === 0 ? null : delta / Math.abs(baseline.confidence_weighted_mean);
  const observed = observedDirection(delta, minimum_meaningful_change);
  const assessment = alignedAssessment(direction, observed);
  if (minimum_meaningful_change === 0)
    limitations.push('No non-zero meaningful-change tolerance was supplied; “unchanged” therefore means no observed numeric difference, not statistical equivalence.');
  if (baseline.count < 3 || intervention.count < 3)
    limitations.push('Fewer than three positive-confidence numeric measurements exist in at least one phase; treat the direction as preliminary.');
  if (ignored.length)
    limitations.push(`${ignored.length} linked measurement(s) were ignored because their phase, value or confidence was unsuitable for this comparison.`);

  return {
    experiment_id: experiment.id,
    metric_id,
    unit: units[0],
    target_direction: direction,
    minimum_meaningful_change,
    assessment,
    observed_direction: observed,
    evidence_level: evidenceLevel(baseline.count, intervention.count),
    baseline,
    intervention,
    absolute_change: round(delta),
    relative_change: relative === null ? null : round(relative),
    causal_interpretation: 'not_established',
    evaluated_at,
    reasons: [],
    limitations,
  };
}
