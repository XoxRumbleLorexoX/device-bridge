function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sampleSd(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function weightedMean(pairs) {
  if (!pairs.length) return null;
  const totalWeight = pairs.reduce((sum, pair) => sum + pair.weight, 0);
  if (!(totalWeight > 0)) return null;
  return pairs.reduce((sum, pair) => sum + pair.outcome * pair.weight, 0) / totalWeight;
}

function pooledStandardizedDifference(below, above, difference) {
  if (below.length < 2 || above.length < 2) return null;
  const belowSd = sampleSd(below.map(pair => pair.outcome));
  const aboveSd = sampleSd(above.map(pair => pair.outcome));
  if (belowSd === null || aboveSd === null) return null;
  const denominatorDf = below.length + above.length - 2;
  if (denominatorDf <= 0) return null;
  const pooledVariance = (((below.length - 1) * belowSd ** 2) + ((above.length - 1) * aboveSd ** 2)) / denominatorDf;
  if (!(pooledVariance > 0)) return null;
  return difference / Math.sqrt(pooledVariance);
}

function evidenceLevel(total, below, above) {
  const minimumSide = Math.min(below, above);
  if (total >= 24 && minimumSide >= 8) return 'richer_exploratory_sample';
  if (total >= 14 && minimumSide >= 5) return 'moderate_exploratory_sample';
  return 'thin_exploratory_sample';
}

function insufficient(base, reasons) {
  return {
    ...base,
    status: 'insufficient_evidence',
    threshold: null,
    observed_change: 'unknown',
    evidence_level: 'insufficient',
    reasons,
    causal_interpretation: 'not_established',
    validation_required: true,
    limitations: [
      'A threshold signal requires explicitly paired positive-confidence numeric driver/outcome measurements.',
      'No temporal matching or sample pairing is inferred automatically.',
    ],
  };
}

function measurementEligible(item, experimentId, metricId, phase) {
  if (item.experiment_id !== experimentId || item.metric_id !== metricId) return false;
  if (phase !== 'any' && item.phase !== phase) return false;
  return typeof item.sample_id === 'string' && item.sample_id.length > 0 &&
    typeof item.value === 'number' && Number.isFinite(item.value) &&
    typeof item.confidence === 'number' && Number.isFinite(item.confidence) && item.confidence > 0;
}

function pairedSamples(measurements, { experimentId, driverMetricId, outcomeMetricId, phase }) {
  const groups = new Map();
  const relevant = measurements.filter(item =>
    item.experiment_id === experimentId &&
    (item.metric_id === driverMetricId || item.metric_id === outcomeMetricId) &&
    (phase === 'any' || item.phase === phase)
  );
  let ineligible = 0;
  for (const item of relevant) {
    if (!measurementEligible(item, experimentId, item.metric_id, phase)) {
      ineligible += 1;
      continue;
    }
    if (!groups.has(item.sample_id)) groups.set(item.sample_id, { driver: [], outcome: [] });
    const bucket = groups.get(item.sample_id);
    if (item.metric_id === driverMetricId) bucket.driver.push(item);
    if (item.metric_id === outcomeMetricId) bucket.outcome.push(item);
  }

  const pairs = [];
  let unpaired = 0;
  let ambiguous = 0;
  for (const group of groups.values()) {
    if (group.driver.length !== 1 || group.outcome.length !== 1) {
      if (group.driver.length > 1 || group.outcome.length > 1) ambiguous += 1;
      else unpaired += 1;
      continue;
    }
    const driver = group.driver[0];
    const outcome = group.outcome[0];
    pairs.push({
      driver: driver.value,
      outcome: outcome.value,
      driver_unit: driver.unit,
      outcome_unit: outcome.unit,
      weight: Math.sqrt(driver.confidence * outcome.confidence),
    });
  }
  return { pairs, relevant_count: relevant.length, ineligible_count: ineligible, unpaired_count: unpaired, ambiguous_count: ambiguous };
}

export function detectThresholdSignal({
  measurements,
  experiment_id,
  driver_metric_id,
  outcome_metric_id,
  phase = 'intervention',
  minimum_samples = 8,
  minimum_per_side = 3,
} = {}) {
  if (!Array.isArray(measurements)) throw new TypeError('measurements must be an array.');
  if (typeof experiment_id !== 'string' || !experiment_id) throw new TypeError('experiment_id is required.');
  if (typeof driver_metric_id !== 'string' || !driver_metric_id) throw new TypeError('driver_metric_id is required.');
  if (typeof outcome_metric_id !== 'string' || !outcome_metric_id) throw new TypeError('outcome_metric_id is required.');
  if (driver_metric_id === outcome_metric_id) throw new TypeError('driver_metric_id and outcome_metric_id must be different.');
  if (!['baseline', 'intervention', 'followup', 'any'].includes(phase)) throw new TypeError('phase must be baseline, intervention, followup or any.');
  if (!Number.isInteger(minimum_samples) || minimum_samples < 6 || minimum_samples > 1000) throw new TypeError('minimum_samples must be an integer between 6 and 1000.');
  if (!Number.isInteger(minimum_per_side) || minimum_per_side < 2 || minimum_per_side > 500) throw new TypeError('minimum_per_side must be an integer between 2 and 500.');
  if (minimum_per_side * 2 > minimum_samples) throw new TypeError('minimum_samples must be at least twice minimum_per_side.');

  const pairing = pairedSamples(measurements, {
    experimentId: experiment_id,
    driverMetricId: driver_metric_id,
    outcomeMetricId: outcome_metric_id,
    phase,
  });
  const base = {
    experiment_id,
    driver_metric_id,
    outcome_metric_id,
    phase,
    minimum_samples,
    minimum_per_side,
    relevant_measurement_count: pairing.relevant_count,
    usable_pair_count: pairing.pairs.length,
    excluded_ineligible_measurement_count: pairing.ineligible_count,
    excluded_unpaired_sample_count: pairing.unpaired_count,
    excluded_ambiguous_sample_count: pairing.ambiguous_count,
  };

  if (pairing.pairs.length < minimum_samples) {
    return insufficient(base, [`${minimum_samples} usable paired samples are required; ${pairing.pairs.length} are available.`]);
  }

  const driverUnits = [...new Set(pairing.pairs.map(pair => pair.driver_unit))];
  const outcomeUnits = [...new Set(pairing.pairs.map(pair => pair.outcome_unit))];
  if (driverUnits.length !== 1 || outcomeUnits.length !== 1) {
    return insufficient(base, ['Paired samples must use one consistent driver unit and one consistent outcome unit.']);
  }

  const sorted = [...pairing.pairs].sort((a, b) => a.driver - b.driver);
  const distinctDrivers = [...new Set(sorted.map(pair => pair.driver))];
  if (distinctDrivers.length < 2) return insufficient(base, ['At least two distinct driver values are required.']);

  const candidates = [];
  for (let index = 0; index < distinctDrivers.length - 1; index += 1) {
    const left = distinctDrivers[index];
    const right = distinctDrivers[index + 1];
    const threshold = left + (right - left) / 2;
    const below = sorted.filter(pair => pair.driver < threshold);
    const above = sorted.filter(pair => pair.driver >= threshold);
    if (below.length < minimum_per_side || above.length < minimum_per_side) continue;
    const belowMean = weightedMean(below);
    const aboveMean = weightedMean(above);
    if (belowMean === null || aboveMean === null) continue;
    const difference = aboveMean - belowMean;
    const standardized = pooledStandardizedDifference(below, above, difference);
    candidates.push({
      value: threshold,
      below_count: below.length,
      above_count: above.length,
      below_outcome_mean: belowMean,
      above_outcome_mean: aboveMean,
      below_outcome_median: median(below.map(pair => pair.outcome)),
      above_outcome_median: median(above.map(pair => pair.outcome)),
      absolute_change: difference,
      relative_change: belowMean === 0 ? null : difference / Math.abs(belowMean),
      standardized_mean_difference: standardized,
      balance: Math.min(below.length, above.length),
    });
  }

  if (!candidates.length) return insufficient(base, [`No driver split leaves at least ${minimum_per_side} usable samples on both sides.`]);

  candidates.sort((a, b) => {
    const separation = Math.abs(b.absolute_change) - Math.abs(a.absolute_change);
    if (separation !== 0) return separation;
    if (b.balance !== a.balance) return b.balance - a.balance;
    return a.value - b.value;
  });
  const best = candidates[0];
  const observedChange = best.absolute_change > 0 ? 'outcome_higher_above_threshold' : best.absolute_change < 0 ? 'outcome_lower_above_threshold' : 'no_observed_mean_difference';

  return {
    ...base,
    status: 'exploratory_threshold_candidate',
    driver_unit: driverUnits[0],
    outcome_unit: outcomeUnits[0],
    driver_distinct_value_count: distinctDrivers.length,
    eligible_threshold_count: candidates.length,
    threshold: {
      value: round(best.value),
      below_count: best.below_count,
      above_count: best.above_count,
      below_outcome_mean: round(best.below_outcome_mean),
      above_outcome_mean: round(best.above_outcome_mean),
      below_outcome_median: round(best.below_outcome_median),
      above_outcome_median: round(best.above_outcome_median),
      absolute_change: round(best.absolute_change),
      relative_change: best.relative_change === null ? null : round(best.relative_change),
      standardized_mean_difference: best.standardized_mean_difference === null ? null : round(best.standardized_mean_difference),
    },
    observed_change: observedChange,
    evidence_level: evidenceLevel(pairing.pairs.length, best.below_count, best.above_count),
    selection_method: 'Largest absolute confidence-weighted outcome-mean separation across eligible midpoint splits; ties prefer the more balanced split.',
    causal_interpretation: 'not_established',
    validation_required: true,
    reasons: [],
    limitations: [
      'This is an exploratory change-point signal, not proof that a real discontinuity or causal threshold exists.',
      'The threshold was selected on the same samples used to measure separation, so the observed effect is selection-biased upward unless confirmed on new data.',
      'Confounding variables, time trends, interventions, regression to the mean and outliers can create apparent threshold structure.',
      'Measurement confidence only weights descriptive means; it is not a probability that this threshold is correct.',
      'No p-value, causal effect or out-of-sample performance is claimed.',
    ],
    recommended_next_step: 'Pre-register this candidate split, collect new paired samples on both sides without changing the threshold, and compare the held-out outcome separation.',
  };
}
