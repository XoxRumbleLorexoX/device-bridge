function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finiteConfidence(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function observationMap(state) {
  return new Map((state.observations ?? []).map(item => [item.variable_id, item]));
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
    competing_hypotheses: Array.isArray(item.competing_hypotheses) ? item.competing_hypotheses : [],
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
    ranking_dimensions: item.ranking?.dimensions ?? null,
  }));

  const experiments = (state.experiments ?? []).map(item => ({
    id: item.id,
    status: item.status,
    hypothesis: item.hypothesis,
    intervention: item.intervention,
    metrics: Array.isArray(item.metrics) ? item.metrics : [],
    confidence: finiteConfidence(item.confidence),
    created_at: item.created_at,
    phase_counts: phaseCounts(state.outcome_measurements, item.id),
  }));

  const safeGraph = {
    nodes: (graph.nodes ?? []).map(node => ({
      id: node.id,
      type: node.type ?? 'unknown',
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

export function renderLeverageReport(state, options = {}) {
  const model = buildLeverageReportModel(state, options);
  const data = safeJson(model);
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
      <div class="chips">
        <span>score ${escapeHtml(item.heuristic_score ?? '—')}</span>
        <span>confidence ${escapeHtml(confidencePercent(item.confidence))}</span>
        <span>${escapeHtml(item.action_authority ?? 'user_required')}</span>
      </div>
      ${item.missing_variables.length ? `<div class="missing"><strong>Missing:</strong> ${item.missing_variables.map(escapeHtml).join(', ')}</div>` : ''}
    </article>`).join('') : empty('No opportunities available. Run leverage analysis first.');

  const variableRows = model.variables.length ? model.variables.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong><br><small>${escapeHtml(item.id)}</small></td>
      <td>${escapeHtml(valueText(item.value))}</td>
      <td>${escapeHtml(item.unit)}</td>
      <td>${escapeHtml(confidencePercent(item.confidence))}</td>
      <td>${escapeHtml(valueText(item.controllability))}</td>
    </tr>`).join('') : '<tr><td colspan="5">No variable definitions available.</td></tr>';

  const bottleneckCards = model.bottlenecks.length ? model.bottlenecks.map(item => `
    <article class="card">
      <div class="eyebrow">${escapeHtml(item.domain ?? 'general')} · ${escapeHtml(item.type)} · ${escapeHtml(item.status ?? 'unknown')}</div>
      <h3>${escapeHtml(item.constrained_variables.join(', ') || item.id)}</h3>
      <div class="chips"><span>confidence ${escapeHtml(confidencePercent(item.confidence))}</span><span>${item.competing_hypotheses.length} competing hypotheses</span></div>
      ${item.missing_variables.length ? `<div class="missing"><strong>Need:</strong> ${item.missing_variables.map(escapeHtml).join(', ')}</div>` : ''}
    </article>`).join('') : empty('No bottlenecks currently identified.');

  const experimentRows = model.experiments.length ? model.experiments.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.status ?? 'planned')}</strong><br><small>${escapeHtml(item.id)}</small></td>
      <td>${escapeHtml(item.hypothesis ?? '')}</td>
      <td>${escapeHtml(item.intervention ?? '')}</td>
      <td>${escapeHtml(item.metrics.join(', '))}</td>
      <td>B ${item.phase_counts.baseline} · I ${item.phase_counts.intervention} · F ${item.phase_counts.followup}</td>
    </tr>`).join('') : '<tr><td colspan="5">No experiments planned.</td></tr>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>MobileLAM — Leverage Report</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:dark;--bg:#0b0d12;--panel:#131722;--panel2:#181d29;--text:#f4f7fb;--muted:#98a2b3;--line:#2a3242;--accent:#8da2fb;--good:#75d6a5;--warn:#f6c177;--danger:#ef8a9a}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% -10%,#1f2a48 0,transparent 36%),var(--bg);color:var(--text)}main{max-width:1280px;margin:auto;padding:36px 24px 80px}header{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:28px}h1{font-size:clamp(2rem,5vw,4rem);letter-spacing:-.05em;margin:0}h2{font-size:1.35rem;margin:0 0 16px}h3{margin:8px 0 10px;font-size:1rem}p{color:#c9d1dc;line-height:1.55}.muted,small{color:var(--muted)}.eyebrow{text-transform:uppercase;letter-spacing:.11em;color:var(--muted);font-size:.7rem}.section{margin-top:34px}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.kpi,.card,.graph-wrap,.table-wrap,.notice{background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.01)),var(--panel);border:1px solid var(--line);border-radius:16px}.kpi{padding:16px}.kpi-label{font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.kpi-value{font-size:1.75rem;font-weight:750;margin-top:7px}.kpi-detail{font-size:.75rem;color:var(--muted);margin-top:3px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.card{padding:18px;position:relative}.opportunity{padding-left:54px}.rank{position:absolute;left:17px;top:17px;width:27px;height:27px;border:1px solid var(--line);border-radius:9px;display:grid;place-items:center;color:var(--accent);font-weight:700}.chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.chips span{font-size:.72rem;padding:5px 8px;border-radius:999px;background:var(--panel2);border:1px solid var(--line);color:#cbd4e1}.missing{margin-top:12px;padding:10px;border-left:2px solid var(--warn);background:rgba(246,193,119,.06);font-size:.8rem;color:#d9c7a8}.meter{height:5px;background:#252b38;border-radius:99px;overflow:hidden;margin:13px 0 7px}.meter span{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--good))}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:720px}th,td{text-align:left;padding:13px 14px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}td{font-size:.84rem}.graph-wrap{padding:12px;min-height:400px;overflow:auto}svg{width:100%;min-width:900px;height:520px}.graph-node{cursor:pointer}.graph-node rect{fill:#181e2a;stroke:#3a465c;stroke-width:1}.graph-node text{fill:#e9eef7;font-size:11px}.graph-node.goal rect{stroke:#8da2fb}.graph-node.variable rect{stroke:#75d6a5}.graph-node.bottleneck rect{stroke:#f6c177}.graph-node.opportunity rect{stroke:#ef8a9a}.graph-edge{stroke:#556176;stroke-width:1.2;opacity:.75}.graph-edge.hypothesis{stroke-dasharray:4 4}.graph-label{fill:#8995a7;font-size:9px}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}.toolbar button{background:var(--panel2);border:1px solid var(--line);color:var(--text);padding:7px 10px;border-radius:9px;cursor:pointer}.toolbar button:hover{border-color:var(--accent)}.notice{padding:14px 16px;color:#c8d0dc}.privacy{color:var(--muted);font-size:.8rem}.empty{padding:22px;border:1px dashed var(--line);border-radius:14px;color:var(--muted)}@media(max-width:700px){header{align-items:flex-start;flex-direction:column}main{padding:24px 16px 60px}}
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
<section class="section"><h2>Experiments</h2><div class="table-wrap"><table><thead><tr><th>Status</th><th>Hypothesis</th><th>Intervention</th><th>Metrics</th><th>Measurements</th></tr></thead><tbody>${experimentRows}</tbody></table></div></section>
<section class="section"><h2>Leverage map</h2><div class="toolbar"><button data-filter="all">All</button><button data-filter="goal">Goals</button><button data-filter="variable">Variables</button><button data-filter="bottleneck">Bottlenecks</button><button data-filter="opportunity">Opportunities</button></div><div class="graph-wrap"><svg id="graph" role="img" aria-label="Leverage graph"></svg></div></section>
<section class="section"><div class="notice"><strong>Interpretation boundary.</strong> This report visualizes stored observations, hypotheses, counterfactual estimates and recommendations. It does not turn associations into causal facts, and it does not execute recommendations.</div><p class="privacy">Raw events, raw provider references, provider context and full evidence text are deliberately omitted from this HTML report. The report still contains personal derived data such as goals and recommendations; store/share it accordingly.</p></section>
</main>
<script type="application/json" id="report-data">${data}</script>
<script>
(()=>{const data=JSON.parse(document.getElementById('report-data').textContent);const svg=document.getElementById('graph');const ns='http://www.w3.org/2000/svg';const typeOrder=['goal','variable','bottleneck','opportunity','resource','unknown'];const groups=new Map(typeOrder.map(x=>[x,[]]));for(const n of data.graph.nodes){const t=groups.has(n.type)?n.type:'unknown';groups.get(t).push(n)}const positions=new Map();const width=1080,height=500,pad=55;const activeTypes=typeOrder.filter(t=>groups.get(t).length);const colGap=activeTypes.length>1?(width-pad*2)/(activeTypes.length-1):0;activeTypes.forEach((type,ci)=>{const nodes=groups.get(type);const gap=height/(nodes.length+1);nodes.forEach((node,ri)=>positions.set(node.id,{x:pad+ci*colGap,y:gap*(ri+1),type,node}))});svg.setAttribute('viewBox',`0 0 ${width} ${height}`);const defs=document.createElementNS(ns,'defs');defs.innerHTML='<marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#556176"/></marker>';svg.appendChild(defs);for(const edge of data.graph.edges){const a=positions.get(edge.from),b=positions.get(edge.to);if(!a||!b)continue;const line=document.createElementNS(ns,'line');line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);line.setAttribute('marker-end','url(#arrow)');line.setAttribute('class',`graph-edge ${edge.claim_type||''}`);line.dataset.from=a.type;line.dataset.to=b.type;svg.appendChild(line)}for(const [id,p] of positions){const g=document.createElementNS(ns,'g');g.setAttribute('class',`graph-node ${p.type}`);g.dataset.type=p.type;g.setAttribute('transform',`translate(${p.x-70} ${p.y-21})`);const rect=document.createElementNS(ns,'rect');rect.setAttribute('width','140');rect.setAttribute('height','42');rect.setAttribute('rx','10');g.appendChild(rect);const text=document.createElementNS(ns,'text');text.setAttribute('x','9');text.setAttribute('y','18');const label=String(p.node.label||id);text.textContent=label.length>21?label.slice(0,20)+'…':label;g.appendChild(text);const sub=document.createElementNS(ns,'text');sub.setAttribute('x','9');sub.setAttribute('y','32');sub.setAttribute('class','graph-label');sub.textContent=p.type+(p.node.confidence==null?'':` · ${Math.round(p.node.confidence*100)}%`);g.appendChild(sub);g.addEventListener('click',()=>{g.querySelector('rect').style.fill=g.querySelector('rect').style.fill?'':'#24304a'});svg.appendChild(g)}document.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{const f=btn.dataset.filter;svg.querySelectorAll('.graph-node').forEach(n=>n.style.opacity=f==='all'||n.dataset.type===f?'1':'.16');svg.querySelectorAll('.graph-edge').forEach(e=>e.style.opacity=f==='all'||e.dataset.from===f||e.dataset.to===f?'.75':'.08')}));})();
</script>
</body>
</html>`;
}
