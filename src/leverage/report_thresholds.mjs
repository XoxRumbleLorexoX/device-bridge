import { buildLeverageReportModel as buildBaseReportModel, renderLeverageReport as renderBaseReport } from './report.mjs';
import { evaluateRegisteredThresholdState } from './thresholds.mjs';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function valueText(value) {
  return value === null || value === undefined ? '—' : String(value);
}

function projectThresholdValidation(state, hypothesis, generatedAt) {
  const base = {
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
  };

  try {
    const result = evaluateRegisteredThresholdState(state, hypothesis.id, { clock: () => Date.parse(generatedAt) });
    const evaluation = result.evaluation;
    return {
      ...base,
      validation: {
        status: evaluation.status,
        held_out_measurement_count: result.held_out_boundary.measurements_appended_since_registration,
        boundary_basis: result.held_out_boundary.basis,
        prefix_integrity_verified: result.held_out_boundary.pre_registration_prefix_integrity_verified,
        real_world_observation_novelty_verified: result.held_out_boundary.real_world_observation_novelty_verified,
        evidence_level: evaluation.evidence_level,
        observed_change: evaluation.observed_change,
        direction_consistent: evaluation.direction_consistent ?? null,
        magnitude_requirement_met: evaluation.magnitude_requirement_met ?? null,
        pattern_consistent: evaluation.pattern_consistent ?? null,
        below_count: evaluation.threshold?.below_count ?? null,
        above_count: evaluation.threshold?.above_count ?? null,
        absolute_change: evaluation.threshold?.absolute_change ?? null,
        relative_change: evaluation.threshold?.relative_change ?? null,
        driver_unit: evaluation.driver_unit ?? hypothesis.driver_unit,
        outcome_unit: evaluation.outcome_unit ?? hypothesis.outcome_unit,
        causal_interpretation: evaluation.causal_interpretation ?? 'not_established',
        threshold_reselected: evaluation.threshold_reselected ?? false,
        insufficient_reason_count: Array.isArray(evaluation.reasons) ? evaluation.reasons.length : 0,
      },
    };
  } catch {
    return {
      ...base,
      validation: {
        status: 'boundary_integrity_failed',
        held_out_measurement_count: null,
        boundary_basis: 'store_append_order',
        prefix_integrity_verified: false,
        real_world_observation_novelty_verified: false,
        evidence_level: 'unavailable',
        observed_change: 'unknown',
        direction_consistent: null,
        magnitude_requirement_met: null,
        pattern_consistent: null,
        below_count: null,
        above_count: null,
        absolute_change: null,
        relative_change: null,
        driver_unit: hypothesis.driver_unit,
        outcome_unit: hypothesis.outcome_unit,
        causal_interpretation: 'not_established',
        threshold_reselected: false,
        insufficient_reason_count: null,
      },
    };
  }
}

export function buildLeverageReportModel(state, options = {}) {
  const generatedAt = options.generated_at ?? new Date().toISOString();
  const base = buildBaseReportModel(state, { ...options, generated_at: generatedAt });
  const thresholds = (state.threshold_hypotheses ?? []).map(hypothesis => projectThresholdValidation(state, hypothesis, generatedAt));
  return {
    ...base,
    counts: { ...base.counts, threshold_hypotheses: thresholds.length },
    threshold_hypotheses: thresholds,
    exclusions: {
      ...base.exclusions,
      threshold_integrity_digests_included: false,
      threshold_sample_ids_included: false,
      threshold_raw_measurements_included: false,
      threshold_notes_included: false,
    },
  };
}

function consistencyText(value) {
  if (value === true) return 'consistent';
  if (value === false) return 'not consistent';
  return 'not assessed';
}

function renderThresholdCards(items) {
  if (!items.length) return '<div class="empty">No threshold hypotheses registered.</div>';
  return items.map(item => {
    const validation = item.validation;
    const counts = validation.below_count === null || validation.above_count === null
      ? 'side counts unavailable'
      : `${validation.below_count} below · ${validation.above_count} above`;
    const change = validation.absolute_change === null
      ? 'change unavailable'
      : `observed Δ ${valueText(validation.absolute_change)} ${escapeHtml(validation.outcome_unit)}`;
    const integrity = validation.prefix_integrity_verified ? 'store boundary verified' : 'store boundary not verified';
    return `<article class="card">
      <div class="eyebrow">${escapeHtml(item.phase)} · registered threshold · causality not established</div>
      <h3>${escapeHtml(item.driver_metric_id)} → ${escapeHtml(item.outcome_metric_id)}</h3>
      <p>Threshold ${escapeHtml(valueText(item.threshold_value))} ${escapeHtml(item.driver_unit)} · expected ${escapeHtml(item.expected_change)}</p>
      <div class="chips"><span>${escapeHtml(validation.status)}</span><span>${escapeHtml(validation.evidence_level)}</span><span>${escapeHtml(integrity)}</span></div>
      <p><strong>Held-out store evidence:</strong> ${escapeHtml(valueText(validation.held_out_measurement_count))} appended measurements · ${escapeHtml(counts)} · ${escapeHtml(change)}</p>
      <p><strong>Observed:</strong> ${escapeHtml(validation.observed_change)} · expected pattern ${escapeHtml(consistencyText(validation.pattern_consistent))}</p>
      <small>threshold reselected: ${validation.threshold_reselected ? 'yes' : 'no'} · real-world observation novelty independently verified: no</small>
    </article>`;
  }).join('');
}

export function renderLeverageReport(state, options = {}) {
  const model = buildLeverageReportModel(state, options);
  const baseHtml = renderBaseReport(state, { ...options, generated_at: model.generated_at });
  const marker = '<section class="section"><h2>Leverage map</h2>';
  if (!baseHtml.includes(marker)) throw new Error('Base leverage report integration marker not found.');
  const section = `<section class="section"><h2>Registered threshold validation</h2><div class="notice">Fixed thresholds below are evaluated only against records appended after registration and only after the frozen pre-registration store prefix passes its integrity check. Store provenance does not independently verify when an observation occurred in the real world.</div><div class="grid">${renderThresholdCards(model.threshold_hypotheses)}</div></section>`;
  return baseHtml.replace(marker, `${section}\n${marker}`);
}
