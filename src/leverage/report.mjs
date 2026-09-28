import { evaluateExperimentMeasurements } from './experiments.mjs';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finiteConfidence(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function phaseCounts(measurements, experimentId) {
  const counts = { baseline: 0, intervention: 0, followup: 0, unspecified: 0 };
  for (const item of measurements ?? []) {
    if (item.experiment_id !== experimentId) continue;
    const phase = Object.hasOwn(counts, item.phase) ? item.phase : 'unspecified';
    counts[phase] += 1;
  }
  return counts;
}

function observationMap(state) {
  return new Map((state.observations ?? []).map(item => [item.variable_id, item]));
}

function reportExperimentEvaluation(experiment, metricId, measurements, generatedAt) {
  const evaluation = evaluateExperimentMeasurements({
    experiment,
    measurements: measurements ?? [],
    metric_id: metricId,
    direction: 'unspecified',
    minimum_meaningful_change: 0,
    evaluated_at: generatedAt,
  });
  return {
    metric_id: metricId,
    unit: evaluation.unit,
    assessment: evaluation.assessment,
    observed_direction: evaluation.observed_direction,
    evidence_level: evaluation.evidence_level,
    baseline_mean: evaluation.baseline?.confidence_weighted_mean ?? null,
    baseline_count: evaluation.baseline?.count ?? 0,
    intervention_mean: evaluation.intervention?.confidence_weighted_mean ?? null,
    intervention_count: evaluation.intervention?.count ?? 0,
    absolute_change: evaluation.absolute_change,
    relative_change: evaluation.relative_change,
    causal_interpretation: evaluation.causal_interpretation,
    insufficient_reason_count: evaluation.reasons?.length ?? 0,
  };
}

export function buildLeverageReportModel(state, { generated_at = new Date().toISOString() } = {}) {
  if (!state || typeof state !== 'object') throw new TypeError('leverage state is required.');
  const observations = observationMap(state);
  const analysis = state.analysis_meta ?? null;
  const graph = state.causal_graph ?? { nodes: [], edges: [] };

  const goals = (state.goals ?? []).map(goal => ({
    id: goal.id,
    description: goal.description,
    domain: goal.domain,
    priority: round(goal.priority),
    provenance: goal.provenance,
    confirmation_status: goal.confirmation_status,
  }));

  const variables = (state.variable_definitions ?? []).map(variable => {
    const observation = observations.get(variable.id);
    return {
      id: variable.id,
      name: variable.name ?? variable.id,
      unit: variable.unit ?? observation?.unit ?? 'unspecified',
      value: observation?.value ?? null,
      confidence: finiteConfidence(observation?.confidence ?? variable.confidence),
      controllability: variable.controllability ?? null,
      observability: variable.observability ?? null,
    };
  });

  const bottlenecks = (state.bottlenecks ?? []).map(item => ({
    id: item.id,
    type: item.type ?? 'unspecified',
    domain: item.domain ?? null,
    status: item.status ?? null,
    confidence: finiteConfidence(item.confidence),
    constrained_variables: Array.isArray(item.constrained_variables) ? item.constrained_variables : [],
    competing_hypotheses_count: Array.isArray(item.competing_hypotheses) ? item.competing_hypotheses.length : 0,
    missing_variables: Array.isArray(item.missing_variables) ? item.missing_variables : [],
  }));

  const opportunities = (state.opportunities ?? []).map(item => ({
    id: item.id,
    title: item.title,
    domain: item.domain,
    intervention_type: item.intervention_type,
    confidence: finiteConfidence(item.confidence),
    heuristic_score: Number.isFinite(item.ranking?.heuristic_score) ? item.ranking.heuristic_score : null,
    expected_effect: item.expected_effect,
    missing_variables: Array.isArray(item.missing_variables) ? item.missing_variables : [],
    assumptions_count: Array.isArray(item.assumptions) ? item.assumptions.length : 0,
    alternatives_count: Array.isArray(item.alternatives) ? item.alternatives.length : 0,
    action_authority: item.action_authority,
    action_state: item.action_state,
  }));

  const experiments = (state.experiments ?? []).map(item => {
    const metrics = Array.isArray(item.metrics) ? item.metrics : [];
    return {
      id: item.id,
      status: item.status,
      hypothesis: item.hypothesis,
      intervention: item.intervention,
      metrics,
      confidence: finiteConfidence(item.confidence),
      created_at: item.created_at,
      phase_counts: phaseCounts(state.outcome_measurements, item.id),
      evaluations: metrics.map(metricId => reportExperimentEvaluation(item, metricId, state.outcome_measurements, generated_at)),
    };
  });

  const allowedTypes = new Set(['goal', 'variable', 'bottleneck', 'opportunity', 'resource']);
  const safeGraph = {
    nodes: (graph.nodes ?? []).map(node => ({
      id: node.id,
      type: allowedTypes.has(node.type) ? node.type : 'unknown',
      label: node.label ?? node.id,
      confidence: finiteConfidence(node.confidence),
    })),
    edges: (graph.edges ?? []).map(edge => ({
      from: edge.from,
      to: edge.to,
      relationship_type: edge.relationship_type ?? 'RELATED_TO',
      claim_type: edge.claim_type ?? 'unspecified',
      confidence: finiteConfidence(edge.confidence),
    })),
  };

  return {
    generated_at,
    analysis: analysis ? {
      as_of: analysis.as_of,
      time_horizon: analysis.time_horizon,
      baseline_state: analysis.baseline?.state ?? null,
      baseline_coverage_days: analysis.baseline?.coverage_days ?? null,
      event_count: analysis.event_count ?? (state.events ?? []).length,
      repetition_count: analysis.repetition_count ?? (state.repetitions ?? []).length,
      sequence_count: analysis.sequence_count ?? (state.sequences ?? []).length,
      friction_count: analysis.friction_count ?? (state.frictions ?? []).length,
    } : null,
    counts: {
      goals: goals.length,
      variables: variables.length,
      bottlenecks: bottlenecks.length,
      opportunities: opportunities.length,
      experiments: experiments.length,
      measured_outcomes: (state.outcome_measurements ?? []).length,
    },
    privacy: {
      observation_enabled: state.privacy?.observation_enabled ?? null,
      allowed_privacy_classes: state.privacy?.allowed_privacy_classes ?? [],
      raw_event_retention_days: state.privacy?.raw_event_retention_days ?? null,
    },
    goals,
    variables,
    bottlenecks,
    opportunities,
    experiments,
    graph: safeGraph,
    exclusions: {
      raw_events_included: false,
      raw_event_refs_included: false,
      provider_context_included: false,
      full_evidence_text_included: false,
    },
  };
}

function confidencePercent(value) {
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;
}

function valueText(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function kpi(label, value, detail = '') {
  return `<article class="kpi"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-detail">${escapeHtml(detail)}</div></article>`;
}

function empty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function truncate(value, length = 28) {
  const text = String(value ?? '');
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

function renderGraph(graph) {
  if (!graph.nodes.length) return empty('No leverage graph is available. Run leverage analysis first.');
  const order = ['goal', 'variable', 'bottleneck', 'opportunity', 'resource', 'unknown'];
  const grouped = new Map(order.map(type => [type, []]));
  for (const node of graph.nodes) grouped.get(grouped.has(node.type) ? node.type : 'unknown').push(node);
  const activeTypes = order.filter(type => grouped.get(type).length);
  const width = 1120;
  const height = Math.max(420, Math.max(...activeTypes.map(type => grouped.get(type).length), 1) * 92);
  const padX = 90;
  const columnGap = activeTypes.length > 1 ? (width - padX * 2) / (activeTypes.length - 1) : 0;
  const positions = new Map();

  activeTypes.forEach((type, column) => {
    const nodes = grouped.get(type);
    const gap = height / (nodes.length + 1);
    nodes.forEach((node, row) => positions.set(node.id, {
      x: padX + column * columnGap,
      y: gap * (row + 1),
      type,
      node,
    }));
  });

  const edges = graph.edges.map(edge => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return '';
    const dash = edge.claim_type === 'hypothesis' ? ' stroke-dasharray="5 5"' : '';
    return `<g><line class="graph-edge" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" marker-end="url(#arrow)"${dash}/><text class="edge-label" x="${round((from.x + to.x) / 2)}" y="${round((from.y + to.y) / 2 - 5)}">${escapeHtml(truncate(edge.relationship_type, 18))}</text></g>`;
  }).join('');

  const nodes = [...positions.values()].map(({ x, y, type, node }) => {
    const label = truncate(node.label, 31);
    const confidence = confidencePercent(node.confidence);
    return `<g class="graph-node ${escapeHtml(type)}" transform="translate(${round(x - 78)} ${round(y - 25)})"><rect width="156" height="50" rx="11"/><text class="node-label" x="10" y="20">${escapeHtml(label)}</text><text class="node-sub" x="10" y="37">${escapeHtml(type)} · ${escapeHtml(confidence)}</text></g>`;
  }).join('');

  return `<div class="graph-wrap"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Leverage graph"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#556176"/></marker></defs>${edges}${nodes}</svg></div>`;
}

function renderExperimentEvidence(item) {
  if (!item.evaluations.length) return '<span class="muted">No experiment metrics.</span>';
  return item.evaluations.map(result => {
    if (result.evidence_level === 'insufficient') return `<div class="evaluation"><strong>${escapeHtml(result.metric_id)}</strong><br><span>insufficient comparable baseline/intervention evidence</span><br><small>causality not established</small></div>`;
    const unit = result.unit ? ` ${escapeHtml(result.unit)}` : '';
    return `<div class="evaluation"><strong>${escapeHtml(result.metric_id)}</strong><br><span>${escapeHtml(valueText(result.baseline_mean))} → ${escapeHtml(valueText(result.intervention_mean))}${unit}</span><br><small>observed ${escapeHtml(result.observed_direction)} · ${escapeHtml(result.evidence_level)} · causality not established</small></div>`;
  }).join('');
}

export function renderLeverageReport(state, options = {}) {
  const model = buildLeverageReportModel(state, options);
  const analysis = model.analysis;
  const generated = escapeHtml(model.generated_at);

  const goalCards = model.goals.length ? model.goals.map(goal => `
    <article class="card">
      <div class="eyebrow">${escapeHtml(goal.domain)} · ${escapeHtml(goal.provenance)} · ${escapeHtml(goal.confirmation_status ?? 'unknown')}</div>
      <h3>${escapeHtml(goal.description)}</h3>
      <div class="meter"><span style="width:${Math.round((goal.priority ?? 0) * 100)}%"></span></div>
      <small>Priority ${escapeHtml(goal.priority ?? '—')}</small>
    </article>`).join('') : empty('No goals stored.');

  const opportunityCards = model.opportunities.length ? model.opportunities.map((item, index) => `
    <article class="card opportunity">
      <div class="rank">${index + 1}</div>
      <div class="eyebrow">${escapeHtml(item.domain)} · ${escapeHtml(item.intervention_type ?? 'UNSPECIFIED')}</div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.expected_effect ?? '')}</p>
      <div class="chips"><span>score ${escapeHtml(item.heuristic_score ?? '—')}</span><span>confidence ${escapeHtml(confidencePercent(item.confidence))}</span><span>${escapeHtml(item.action_authority ?? 'user_required')}</span></div>
      ${item.missing_variables.length ? `<div class="missing"><strong>Missing:</strong> ${item.missing_variables.map(escapeHtml).join(', ')}</div>` : ''}
    </article>`).join('') : empty('No opportunities available. Run leverage analysis first.');

  const bottleneckCards = model.bottlenecks.length ? model.bottlenecks.map(item => `
    <article class="card">
      <div class="eyebrow">${escapeHtml(item.domain ?? 'general')} · ${escapeHtml(item.type)} · ${escapeHtml(item.status ?? 'unknown')}</div>
      <h3>${escapeHtml(item.constrained_variables.join(', ') || item.id)}</h3>
      <div class="chips"><span>confidence ${escapeHtml(confidencePercent(item.confidence))}</span><span>${item.competing_hypotheses_count} competing hypotheses</span></div>
      ${item.missing_variables.length ? `<div class="missing"><strong>Need:</strong> ${item.missing_variables.map(escapeHtml).join(', ')}</div>` : ''}
    </article>`).join('') : empty('No bottlenecks currently identified.');

  const variableRows = model.variables.length ? model.variables.map(item => `
    <tr><td><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.id)}</small></td><td>${escapeHtml(valueText(item.value))}</td><td>${escapeHtml(item.unit)}</td><td>${escapeHtml(confidencePercent(item.confidence))}</td><td>${escapeHtml(valueText(item.controllability))}</td></tr>`).join('') : '<tr><td colspan="5">No variable definitions available.</td></tr>';

  const experimentRows = model.experiments.length ? model.experiments.map(item => `
    <tr><td><strong>${escapeHtml(item.status ?? 'planned')}</strong><br><small>${escapeHtml(item.id)}</small></td><td>${escapeHtml(item.hypothesis ?? '')}</td><td>${escapeHtml(item.intervention ?? '')}</td><td>B ${item.phase_counts.baseline} · I ${item.phase_counts.intervention} · F ${item.phase_counts.followup}</td><td>${renderExperimentEvidence(item)}</td></tr>`).join('') : '<tr><td colspan="5">No experiments planned.</td></tr>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>MobileLAM — Leverage Report</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:dark;--bg:#0b0d12;--panel:#131722;--panel2:#181d29;--text:#f4f7fb;--muted:#98a2b3;--line:#2a3242;--accent:#8da2fb;--good:#75d6a5;--warn:#f6c177;--danger:#ef8a9a}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% -10%,#1f2a48 0,transparent 36%),var(--bg);color:var(--text)}main{max-width:1280px;margin:auto;padding:36px 24px 80px}header{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:28px}h1{font-size:clamp(2rem,5vw,4rem);letter-spacing:-.05em;margin:0}h2{font-size:1.35rem;margin:0 0 16px}h3{margin:8px 0 10px;font-size:1rem}p{color:#c9d1dc;line-height:1.55}.muted,small{color:var(--muted)}.eyebrow{text-transform:uppercase;letter-spacing:.11em;color:var(--muted);font-size:.7rem}.section{margin-top:34px}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.kpi,.card,.graph-wrap,.table-wrap,.notice{background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.01)),var(--panel);border:1px solid var(--line);border-radius:16px}.kpi{padding:16px}.kpi-label{font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.kpi-value{font-size:1.75rem;font-weight:750;margin-top:7px}.kpi-detail{font-size:.75rem;color:var(--muted);margin-top:3px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.card{padding:18px;position:relative}.opportunity{padding-left:54px}.rank{position:absolute;left:17px;top:17px;width:27px;height:27px;border:1px solid var(--line);border-radius:9px;display:grid;place-items:center;color:var(--accent);font-weight:700}.chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.chips span{font-size:.72rem;padding:5px 8px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);color:#cbd4e1}.missing{margin-top:12px;padding:10px;border-left:2px solid var(--warn);background:rgba(246,193,119,.06);font-size:.8rem;color:#d9c7a8}.meter{height:5px;background:#252b38;border-radius:99px;overflow:hidden;margin:13px 0 7px}.meter span{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--good))}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:720px}th,td{text-align:left;padding:13px 14px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}td{font-size:.84rem}.evaluation+.evaluation{margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}.graph-wrap{padding:12px;min-height:380px;overflow:auto}.graph-wrap svg{width:100%;min-width:900px;height:auto;display:block}.graph-node rect{fill:#181e2a;stroke:#3a465c}.graph-node.goal rect{stroke:#8da2fb}.graph-node.variable rect{stroke:#75d6a5}.graph-node.bottleneck rect{stroke:#f6c177}.graph-node.opportunity rect{stroke:#ef8a9a}.graph-edge{stroke:#556176;stroke-width:1.2;opacity:.75}.node-label{fill:#e9eef7;font-size:10px}.node-sub,.edge-label{fill:#8995a7;font-size:8px}.notice{padding:14px 16px;color:#c8d0dc}.privacy{color:var(--muted);font-size:.8rem}.empty{padding:22px;border:1px dashed var(--line);border-radius:14px;color:var(--muted)}@media(max-width:700px){header{align-items:flex-start;flex-direction:column}main{padding:24px 16px 60px}}
</style>
</head>
<body>
<main>
<header><div><div class="eyebrow">Local · privacy-minimized · derived state</div><h1>Leverage Report</h1></div><div class="muted">Generated ${generated}<br>${analysis ? `Analysis ${escapeHtml(analysis.as_of ?? 'unknown')} · ${escapeHtml(analysis.time_horizon ?? '')}` : 'No analysis snapshot yet'}</div></header>
<section class="kpis">
${kpi('Events analysed', analysis?.event_count ?? 0, analysis?.baseline_state ?? 'no baseline')}
${kpi('Goals', model.counts.goals, `${model.counts.variables} variables`)}
${kpi('Bottlenecks', model.counts.bottlenecks, `${analysis?.friction_count ?? 0} friction signals`)}
${kpi('Opportunities', model.counts.opportunities, `${model.counts.experiments} experiments`)}
${kpi('Measured outcomes', model.counts.measured_outcomes, model.privacy.observation_enabled === false ? 'observation paused' : 'observation enabled')}
</section>
<section class="section"><h2>Goals</h2><div class="grid">${goalCards}</div></section>
<section class="section"><h2>Leverage opportunities</h2><div class="grid">${opportunityCards}</div></section>
<section class="section"><h2>Bottlenecks & uncertainty</h2><div class="grid">${bottleneckCards}</div></section>
<section class="section"><h2>Variables</h2><div class="table-wrap"><table><thead><tr><th>Variable</th><th>Value</th><th>Unit</th><th>Confidence</th><th>Controllability</th></tr></thead><tbody>${variableRows}</tbody></table></div></section>
<section class="section"><h2>Experiments & observed change</h2><div class="table-wrap"><table><thead><tr><th>Status</th><th>Hypothesis</th><th>Intervention</th><th>Measurements</th><th>Observed evidence</th></tr></thead><tbody>${experimentRows}</tbody></table></div><p class="privacy">Report experiment summaries are direction-only descriptive comparisons with zero configured meaningful-change tolerance. Use explicit experiment evaluation when you want a target direction/tolerance judgment.</p></section>
<section class="section"><h2>Leverage map</h2>${renderGraph(model.graph)}</section>
<section class="section"><div class="notice"><strong>Interpretation boundary.</strong> This report visualizes stored observations, hypotheses, counterfactual estimates and recommendations. It does not turn associations or before/after experiment changes into causal facts, and it does not execute recommendations.</div><p class="privacy">Raw events, raw provider references, provider context and full evidence text are deliberately omitted from this HTML report. The report still contains personal derived data such as goals and recommendations; store/share it accordingly.</p></section>
</main>
</body>
</html>`;
}
