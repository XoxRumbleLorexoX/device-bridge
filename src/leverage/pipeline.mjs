import { createHash } from 'node:crypto';
import { boundedConfidence } from './model.mjs';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SESSION_GAP_MS = 20 * 60 * 1000;

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unknown';
}

function digest(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function deterministicUuid(value) {
  const hash = digest(value).slice(0, 32).split('');
  hash[12] = '4';
  hash[16] = '8';
  const hex = hash.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function appText(event) {
  return `${event.application ?? ''} ${event.object ?? ''} ${event.context?.domain ?? ''}`.toLowerCase();
}

export function classifyEvent(event) {
  const hintedCategory = typeof event.context?.activity_category === 'string' ? event.context.activity_category.trim() : '';
  const hintedSubcategory = typeof event.context?.activity_subcategory === 'string' ? event.context.activity_subcategory.trim() : '';
  if (hintedCategory && hintedSubcategory) {
    return {
      category: hintedCategory,
      subcategory: hintedSubcategory,
      inferred_intent: typeof event.context?.intent === 'string' ? event.context.intent : null,
      confidence: event.confidence,
      basis: 'provider_supplied_activity_hint',
    };
  }

  const action = event.action_type.toLowerCase();
  const text = appText(event);
  if (/commit|code_edit|terminal_command|build|test_run/u.test(action) || /\b(vs ?code|xcode|terminal|github|gitlab|intellij|pycharm)\b/u.test(text))
    return { category: 'Work', subcategory: 'Development', inferred_intent: 'software development', confidence: event.confidence * 0.92, basis: 'deterministic_rule' };
  if (/application_submitted|cv_form|cover_letter/u.test(action))
    return { category: 'Career', subcategory: 'Applications', inferred_intent: 'job application', confidence: event.confidence * 0.95, basis: 'deterministic_rule' };
  if (/recruiter|networking|follow_up/u.test(action))
    return { category: 'Career', subcategory: 'Networking', inferred_intent: 'career networking', confidence: event.confidence * 0.88, basis: 'deterministic_rule' };
  if (/job_search|job_view|vacancy|role_filter/u.test(action) || /linkedin|indeed|glassdoor|jobs?/u.test(text))
    return { category: 'Career', subcategory: 'Job Discovery', inferred_intent: 'job opportunity discovery', confidence: event.confidence * 0.86, basis: 'deterministic_rule' };
  if (/course|tutorial|documentation|study|learning/u.test(action) || (text.includes('youtube') && event.context?.intent === 'learning'))
    return { category: 'Learning', subcategory: 'Study', inferred_intent: 'learning', confidence: event.confidence * 0.82, basis: 'deterministic_rule' };
  if (/meeting|calendar_event/u.test(action))
    return { category: 'Work', subcategory: 'Meetings', inferred_intent: 'meeting', confidence: event.confidence * 0.88, basis: 'deterministic_rule' };
  if (/exercise|workout|run|walk/u.test(action))
    return { category: 'Health', subcategory: 'Activity', inferred_intent: 'physical activity', confidence: event.confidence * 0.9, basis: 'deterministic_rule' };
  if (/form_fill|copy_paste|manual_reconciliation|data_entry|report_generation/u.test(action))
    return { category: 'Personal Admin', subcategory: 'Administration', inferred_intent: 'administration', confidence: event.confidence * 0.84, basis: 'deterministic_rule' };
  if (/media_play|game|entertainment/u.test(action))
    return { category: 'Entertainment', subcategory: 'Media', inferred_intent: 'entertainment', confidence: event.confidence * 0.8, basis: 'deterministic_rule' };
  return { category: 'Personal', subcategory: 'Unclassified', inferred_intent: null, confidence: event.confidence * 0.45, basis: 'low_information_fallback' };
}

export function buildActivities(events) {
  const ordered = [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const activities = [];
  for (const event of ordered) {
    const semantic = classifyEvent(event);
    const start = Date.parse(event.timestamp);
    const end = start + event.duration_ms;
    const previous = activities.at(-1);
    const canJoin = previous && previous.category === semantic.category && previous.subcategory === semantic.subcategory && start - Date.parse(previous.end_time) <= SESSION_GAP_MS;
    if (canJoin) {
      previous.end_time = new Date(Math.max(Date.parse(previous.end_time), end)).toISOString();
      previous.duration_ms += event.duration_ms;
      previous.entities = [...new Set([...previous.entities, event.application, event.object].filter(Boolean))];
      previous.evidence.push({ event_id: event.id, confidence: event.confidence, classification_basis: semantic.basis });
      previous.confidence = boundedConfidence(previous.confidence, semantic.confidence);
      if (!previous.inferred_intent && semantic.inferred_intent) previous.inferred_intent = semantic.inferred_intent;
      continue;
    }
    activities.push({
      id: deterministicUuid(`activity:${event.id}`),
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
      category: semantic.category,
      subcategory: semantic.subcategory,
      entities: [...new Set([event.application, event.object].filter(Boolean))],
      inferred_intent: semantic.inferred_intent,
      confidence: round(semantic.confidence, 4),
      evidence: [{ event_id: event.id, confidence: event.confidence, classification_basis: semantic.basis }],
      duration_ms: event.duration_ms,
    });
  }
  return activities;
}

const repeatableActions = new Set(['form_fill', 'copy_paste', 'manual_reconciliation', 'data_entry', 'report_generation', 'file_transform', 'filter_search', 'navigation_chain', 'cv_form']);

export function detectRepetitions(events) {
  const groups = new Map();
  for (const event of events) {
    const explicit = typeof event.context?.workflow_signature === 'string' && event.context.workflow_signature.trim();
    const fallback = repeatableActions.has(event.action_type) ? `${event.application ?? 'unknown'}:${event.action_type}:${event.object ?? ''}` : null;
    const signature = explicit || fallback;
    if (!signature) continue;
    const key = String(signature);
    const entry = groups.get(key) ?? { signature: key, events: [] };
    entry.events.push(event);
    groups.set(key, entry);
  }
  const repetitions = [];
  for (const group of groups.values()) {
    if (group.events.length < 3) continue;
    const ordered = group.events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const totalMs = ordered.reduce((sum, event) => sum + event.duration_ms, 0);
    const spanDays = Math.max(7, (Date.parse(ordered.at(-1).timestamp) - Date.parse(ordered[0].timestamp)) / DAY + 1);
    const weeklyHours = (totalMs / HOUR) / spanDays * 7;
    const privacyPenalty = ordered.some(event => ['SENSITIVE', 'RESTRICTED'].includes(event.privacy_class)) ? 0.35 : 0;
    repetitions.push({
      id: `workflow_${digest(group.signature).slice(0, 12)}`,
      signature: group.signature,
      executions: ordered.length,
      total_hours: round(totalMs / HOUR, 2),
      average_minutes: round(totalMs / ordered.length / 60000, 1),
      weekly_hours: round(weeklyHours, 2),
      annualized_hours: round(weeklyHours * 52, 1),
      automation_feasibility: round(Math.max(0.1, 0.82 - privacyPenalty), 2),
      confidence: round(boundedConfidence(...ordered.map(event => event.confidence), 0.88), 3),
      evidence: ordered.map(event => event.id),
    });
  }
  return repetitions.sort((a, b) => b.annualized_hours - a.annualized_hours);
}

export function extractVariables(events, activities, repetitions, observedAt = new Date().toISOString()) {
  const definitions = new Map();
  const observations = [];
  const add = ({ id, name, domain, type = 'number', unit, value, controllability, observability, confidence, evidence, source_kind = 'derived' }) => {
    definitions.set(id, { id, name, domain, type, unit, controllability, observability, confidence: round(confidence, 3), source_dependencies: evidence, source_kind });
    observations.push({ id: deterministicUuid(`observation:${id}:${observedAt}`), variable_id: id, timestamp: observedAt, value, confidence: round(confidence, 3), evidence });
  };

  const activityGroups = new Map();
  for (const activity of activities) {
    const id = `time.${slug(activity.category)}.${slug(activity.subcategory)}_hours`;
    const entry = activityGroups.get(id) ?? { total: 0, confidences: [], evidence: [], category: activity.category, subcategory: activity.subcategory };
    entry.total += activity.duration_ms / HOUR;
    entry.confidences.push(activity.confidence);
    entry.evidence.push(activity.id);
    activityGroups.set(id, entry);
  }
  for (const [id, entry] of activityGroups) {
    add({ id, name: `${entry.category} / ${entry.subcategory} time`, domain: slug(entry.category), unit: 'hours', value: round(entry.total, 2), controllability: 0.65, observability: 0.92, confidence: boundedConfidence(...entry.confidences), evidence: entry.evidence });
  }

  const actions = new Map();
  for (const event of events) {
    const id = `actions.${slug(event.action_type)}_count`;
    const entry = actions.get(id) ?? { count: 0, confidences: [], evidence: [], action: event.action_type };
    entry.count += 1;
    entry.confidences.push(event.confidence);
    entry.evidence.push(event.id);
    actions.set(id, entry);
  }
  for (const [id, entry] of actions) {
    add({ id, name: `${entry.action} count`, domain: 'behaviour', unit: 'count', value: entry.count, controllability: 0.72, observability: 0.97, confidence: boundedConfidence(...entry.confidences), evidence: entry.evidence, source_kind: 'directly_observed' });
  }

  let switches = 0;
  let previousApp = null;
  const switchEvidence = [];
  for (const event of [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))) {
    if (event.application && previousApp && event.application !== previousApp) { switches += 1; switchEvidence.push(event.id); }
    if (event.application) previousApp = event.application;
  }
  if (events.length) add({ id: 'behaviour.context_switches', name: 'Application context switches', domain: 'productivity', unit: 'count', value: switches, controllability: 0.7, observability: 0.9, confidence: boundedConfidence(...events.map(event => event.confidence), 0.9), evidence: switchEvidence });

  for (const repeat of repetitions) {
    add({ id: `repetition.${repeat.id}.weekly_hours`, name: `Repeated workflow ${repeat.signature} weekly time`, domain: 'automation', unit: 'hours/week', value: repeat.weekly_hours, controllability: repeat.automation_feasibility, observability: 0.88, confidence: repeat.confidence, evidence: repeat.evidence });
    add({ id: `repetition.${repeat.id}.executions`, name: `Repeated workflow ${repeat.signature} executions`, domain: 'automation', unit: 'count', value: repeat.executions, controllability: 0.8, observability: 0.97, confidence: repeat.confidence, evidence: repeat.evidence, source_kind: 'directly_observed' });
  }
  return { definitions: [...definitions.values()], observations };
}

export function estimateCapacityShift({ hours_per_week, reduction_fraction = 0.75, horizon_weeks = 52 }) {
  if (!Number.isFinite(hours_per_week) || hours_per_week < 0) throw new RangeError('hours_per_week must be non-negative.');
  if (!(reduction_fraction >= 0 && reduction_fraction <= 1)) throw new RangeError('reduction_fraction must be between 0 and 1.');
  if (!Number.isFinite(horizon_weeks) || horizon_weeks <= 0 || horizon_weeks > 520) throw new RangeError('horizon_weeks must be in (0, 520].');
  return {
    baseline_hours: round(hours_per_week * horizon_weeks, 1),
    reclaimed_hours: round(hours_per_week * reduction_fraction * horizon_weeks, 1),
    assumptions: [`Observed weekly rate remains broadly representative for ${horizon_weeks} weeks.`, `${round(reduction_fraction * 100, 0)}% of measured manual time is actually avoidable.`, 'Reclaimed capacity is not automatically assumed to create a better outcome.'],
    confidence_note: 'Capacity arithmetic is deterministic; whether the intervention works is uncertain and must be measured.',
  };
}

function latestValues(observations) {
  const values = new Map();
  for (const observation of observations) values.set(observation.variable_id, observation);
  return values;
}

function opportunity({ key, domain, title, intervention_type, goal_ids = [], variable, current_value, proposed_value, expected_effect, effort, financial_cost, risk, time_to_impact_days, reversibility, confidence, strategic_value, compounding_potential, evidence, observation, hypothesis, assumptions, recommendation, missing_variables = [], secondary_effects = [], alternatives = [] }) {
  const evidence_signature = digest({ key, current_value, evidence, missing_variables }).slice(0, 24);
  return {
    id: deterministicUuid(`opportunity:${key}:${evidence_signature}`),
    opportunity_key: key,
    evidence_signature,
    domain,
    title,
    intervention_type,
    goal_ids,
    lever: { variable, current_value, proposed_value },
    expected_effect,
    effort,
    financial_cost,
    risk,
    time_to_impact_days,
    reversibility,
    confidence: round(confidence, 3),
    strategic_value,
    compounding_potential,
    evidence,
    missing_variables,
    secondary_effects,
    alternatives,
    trace: [
      { stage: 'observation', claim: observation, evidence },
      { stage: 'inference', claim: hypothesis, confidence: round(confidence, 3) },
      { stage: 'hypothesis', claim: hypothesis, assumptions },
      { stage: 'recommendation', claim: recommendation },
    ],
    assumptions,
  };
}

export function discoverLeverage({ goals, observations, repetitions, events }) {
  const activeGoals = goals.filter(goal => goal.provenance === 'explicit' || goal.confirmation_status === 'confirmed');
  const values = latestValues(observations);
  const candidates = [];

  for (const repeat of repetitions) {
    const scenario = estimateCapacityShift({ hours_per_week: repeat.weekly_hours, reduction_fraction: 0.75 });
    const key = `automation:${repeat.id}`;
    candidates.push(opportunity({
      key,
      domain: 'automation',
      title: `Automate repeated workflow: ${repeat.signature}`,
      intervention_type: 'AUTOMATION',
      goal_ids: activeGoals.map(goal => goal.id),
      variable: `repetition.${repeat.id}.weekly_hours`,
      current_value: repeat.weekly_hours,
      proposed_value: round(repeat.weekly_hours * 0.25, 2),
      expected_effect: `Could reclaim approximately ${scenario.reclaimed_hours} hours over 52 weeks if the measured pattern persists and 75% is safely automatable.`,
      effort: 0.35,
      financial_cost: 0.15,
      risk: 0.2,
      time_to_impact_days: 7,
      reversibility: 0.9,
      confidence: boundedConfidence(repeat.confidence, repeat.automation_feasibility),
      strategic_value: 0.72,
      compounding_potential: 0.78,
      evidence: repeat.evidence,
      observation: `${repeat.executions} executions consumed about ${repeat.total_hours} observed hours; normalized rate ${repeat.weekly_hours} h/week.`,
      hypothesis: 'A repeated digital workflow may contain steps that do not require human judgment every time.',
      assumptions: scenario.assumptions,
      recommendation: 'Prototype the lowest-risk deterministic steps, keep human confirmation for consequential actions, and compare measured time before/after.',
      secondary_effects: ['Potentially reduces context switching.', 'Potentially creates capacity for goals the user chooses.'],
      alternatives: ['Batch the workflow instead of automating it.', 'Create a reusable template or shortcut.', 'Leave the workflow manual if quality or privacy costs dominate.'],
    }));
  }

  const careerGoals = activeGoals.filter(goal => goal.domain.toLowerCase() === 'career' || /income|earn|salary|job|career/u.test(goal.description.toLowerCase()));
  if (careerGoals.length) {
    const browsing = values.get('time.career.job_discovery_hours');
    const applications = values.get('actions.application_submitted_count');
    const interviews = values.get('actions.interview_scheduled_count');
    if (browsing && applications && browsing.value >= 2 && applications.value <= 8) {
      const hoursPerApplication = browsing.value / Math.max(1, applications.value);
      const confidence = boundedConfidence(browsing.confidence, applications.confidence, 0.72);
      const missing = interviews ? [] : ['career.application_to_interview_conversion'];
      candidates.push(opportunity({
        key: 'career:application_throughput',
        domain: 'career',
        title: 'Job-search throughput may be constrained by filtering/application friction',
        intervention_type: 'WORKFLOW',
        goal_ids: careerGoals.map(goal => goal.id),
        variable: 'career.qualified_applications_per_browsing_hour',
        current_value: round(applications.value / browsing.value, 2),
        proposed_value: 'experiment: improve qualified submissions per browsing hour',
        expected_effect: interviews ? 'Could test whether a higher qualified-application throughput changes interview volume.' : 'Could convert more observed browsing/admin capacity into qualified applications; interview impact cannot be estimated until conversion is measured.',
        effort: 0.28,
        financial_cost: 0.08,
        risk: 0.18,
        time_to_impact_days: 14,
        reversibility: 0.95,
        confidence,
        strategic_value: 0.88,
        compounding_potential: 0.76,
        evidence: [...browsing.evidence, ...applications.evidence],
        observation: `${browsing.value} job-discovery hours and ${applications.value} submitted applications were observed (about ${round(hoursPerApplication, 1)} browsing hours/application).`,
        hypothesis: 'Filtering or application friction may be limiting application throughput; application quality remains an alternative explanation.',
        assumptions: ['Observed job-discovery time is actually related to the active career goal.', 'Submitted-application events are sufficiently complete.', 'More applications are useful only if qualification/quality is maintained.'],
        recommendation: 'Pre-filter roles using explicit criteria and remove repeated preparation steps, then measure qualified applications/hour and interview conversion.',
        missing_variables: missing,
        secondary_effects: ['Could reduce low-value vacancy browsing.', 'Could make application quality/volume trade-offs easier to measure.'],
        alternatives: ['Application quality may be the dominant constraint.', 'Role targeting may be wrong even if application volume rises.', 'Recruiter outreach could be a different constraint.'],
      }));
    }
    if (!interviews && applications) {
      candidates.push(opportunity({
        key: 'career:value_of_information:interview_conversion',
        domain: 'career',
        title: 'Measure application-to-interview conversion before diagnosing the career bottleneck',
        intervention_type: 'INFORMATION',
        goal_ids: careerGoals.map(goal => goal.id),
        variable: 'career.application_to_interview_conversion',
        current_value: 'unknown',
        proposed_value: 'measure interviews / qualified applications',
        expected_effect: 'Would distinguish an application-volume hypothesis from an application-quality/targeting hypothesis.',
        effort: 0.08,
        financial_cost: 0,
        risk: 0.03,
        time_to_impact_days: 7,
        reversibility: 1,
        confidence: boundedConfidence(applications.confidence, 0.92),
        strategic_value: 0.82,
        compounding_potential: 0.62,
        evidence: applications.evidence,
        observation: `${applications.value} application submissions are observed, but no interview-scheduled variable is available.`,
        hypothesis: 'The missing conversion metric materially limits bottleneck identification.',
        assumptions: ['Interview events are not already available through another unconnected provider.'],
        recommendation: 'Collect interview outcomes for the next application cohort before strongly optimizing volume or application quality.',
        missing_variables: ['career.application_to_interview_conversion'],
      }));
    }
  }

  if (!activeGoals.length && events.length) {
    candidates.push(opportunity({
      key: 'goals:value_of_information:explicit_goal',
      domain: 'goals',
      title: 'Add an explicit goal before ranking behavioural changes strongly',
      intervention_type: 'INFORMATION',
      variable: 'goals.explicit_count',
      current_value: 0,
      proposed_value: 1,
      expected_effect: 'Would let the engine rank observations against user-defined outcomes instead of inventing an objective.',
      effort: 0.04,
      financial_cost: 0,
      risk: 0.01,
      time_to_impact_days: 0,
      reversibility: 1,
      confidence: 0.99,
      strategic_value: 0.95,
      compounding_potential: 0.9,
      evidence: [],
      observation: 'Behavioural events are available but there is no confirmed explicit goal.',
      hypothesis: 'Goal information has higher value than guessing what the user wants optimized.',
      assumptions: [],
      recommendation: 'Create one explicit goal with priority and constraints.',
    }));
  }
  return candidates;
}

function feedbackAdjustment(candidate, feedback) {
  const relevant = feedback.filter(item => item.opportunity_key === candidate.opportunity_key);
  let adjustment = 0;
  for (const item of relevant) {
    if (['accepted', 'completed', 'outcome_improved'].includes(item.status)) adjustment += 0.025;
    if (['dismissed', 'outcome_worsened'].includes(item.status)) adjustment -= 0.04;
    if (item.rating) adjustment += (item.rating - 3) * 0.01;
  }
  return Math.max(-0.15, Math.min(0.12, adjustment));
}

export function rankLeverage(candidates, feedback = []) {
  const suppressed = new Set(feedback.filter(item => item.status === 'dismissed').map(item => `${item.opportunity_key}:${item.evidence_signature}`));
  return candidates.filter(candidate => !suppressed.has(`${candidate.opportunity_key}:${candidate.evidence_signature}`)).map(candidate => {
    const impactSpeed = 1 / (1 + candidate.time_to_impact_days / 30);
    const dimensions = {
      expected_upside: candidate.strategic_value,
      effort: candidate.effort,
      financial_cost: candidate.financial_cost,
      confidence: candidate.confidence,
      reversibility: candidate.reversibility,
      risk: candidate.risk,
      time_to_impact: round(impactSpeed, 3),
      strategic_value: candidate.strategic_value,
      compounding_potential: candidate.compounding_potential,
    };
    const base = 0.22 * dimensions.expected_upside + 0.18 * dimensions.confidence + 0.12 * dimensions.reversibility + 0.16 * dimensions.strategic_value + 0.12 * dimensions.compounding_potential + 0.07 * (1 - dimensions.effort) + 0.04 * (1 - dimensions.financial_cost) + 0.04 * (1 - dimensions.risk) + 0.05 * dimensions.time_to_impact;
    const adjustment = feedbackAdjustment(candidate, feedback);
    return {
      ...candidate,
      ranking: {
        heuristic_score: round(Math.max(0, Math.min(1, base + adjustment)) * 100, 1),
        dimensions,
        feedback_adjustment: round(adjustment, 3),
        explanation: 'Transparent heuristic for ordering only; it is not an estimate of truth or guaranteed value.',
      },
    };
  }).sort((a, b) => b.ranking.heuristic_score - a.ranking.heuristic_score);
}

export function buildCausalGraph(goals, definitions, opportunities, timestamp = new Date().toISOString()) {
  const nodes = [
    ...goals.map(goal => ({ id: `goal:${goal.id}`, type: 'goal', label: goal.description, confidence: goal.provenance === 'explicit' ? 1 : 0.5 })),
    ...definitions.map(variable => ({ id: `variable:${variable.id}`, type: 'variable', label: variable.name, controllability: variable.controllability, confidence: variable.confidence })),
    ...opportunities.map(item => ({ id: `opportunity:${item.id}`, type: 'opportunity', label: item.title, confidence: item.confidence })),
    { id: 'resource:time', type: 'resource', label: 'Available time', confidence: 1 },
  ];
  const edges = [];
  for (const item of opportunities) {
    const variableNode = definitions.find(variable => variable.id === item.lever.variable);
    if (variableNode) edges.push({ from: `variable:${variableNode.id}`, to: `opportunity:${item.id}`, relationship_type: 'CONTRIBUTES_TO', claim_type: 'hypothesis', confidence: item.confidence, evidence: item.evidence, last_updated: timestamp });
    for (const goalId of item.goal_ids) edges.push({ from: `opportunity:${item.id}`, to: `goal:${goalId}`, relationship_type: 'ENABLES', claim_type: 'hypothesis', confidence: item.confidence, evidence: item.evidence, last_updated: timestamp });
    if (item.domain === 'automation') edges.push({ from: `opportunity:${item.id}`, to: 'resource:time', relationship_type: 'PRODUCES', claim_type: 'counterfactual_estimate', confidence: item.confidence, evidence: item.evidence, last_updated: timestamp });
  }
  return { nodes, edges };
}

export function weeklyLeverageReview({ activities, repetitions, opportunities }) {
  const hours = new Map();
  for (const activity of activities) hours.set(activity.category, (hours.get(activity.category) ?? 0) + activity.duration_ms / HOUR);
  const allocation = [...hours.entries()].map(([category, value]) => ({ category, hours: round(value, 1) })).sort((a, b) => b.hours - a.hours);
  const topRepeat = repetitions[0] ?? null;
  const top = opportunities[0] ?? null;
  const lines = ['WEEKLY LEVERAGE REVIEW', '', 'Observed', '--------', ...allocation.map(item => `${item.category}: ${item.hours}h`)];
  if (topRepeat) lines.push('', 'Detected friction', '-----------------', `Repeated workflow: ${topRepeat.signature} (${topRepeat.executions} executions)`, `Observed recurring time: ${topRepeat.weekly_hours}h/week`);
  if (top) lines.push('', 'Potential lever', '---------------', top.title, `Confidence: ${Math.round(top.confidence * 100)}%`, top.expected_effect, 'Why:', top.trace[0].claim, 'Important uncertainty:', top.missing_variables.length ? `Missing ${top.missing_variables.join(', ')}` : top.assumptions[0] ?? 'Outcome effect must be measured.');
  return { allocation, repeated_workflow: topRepeat, top_opportunity: top, text: lines.join('\n') };
}

export function syntheticLeverageFixture() {
  const base = Date.parse('2026-09-14T08:00:00.000Z');
  const events = [];
  const add = (day, hour, fields) => events.push({ timestamp: new Date(base + day * DAY + hour * HOUR).toISOString(), device_id: 'synthetic-device', source: 'synthetic', confidence: 0.94, privacy_class: 'PERSONAL', context: {}, duration_ms: 0, ...fields });
  const browseDurations = [1, 1, 1, 1, 1.3];
  browseDurations.forEach((hours, index) => add(index, 9, { application: 'LinkedIn', action_type: 'job_view', object: `qualified-role-${index + 1}`, context: { domain: 'linkedin.com' }, duration_ms: hours * HOUR }));
  add(2, 16, { application: 'Browser', action_type: 'application_submitted', object: 'role-a', duration_ms: 20 * 60 * 1000 });
  add(5, 16, { application: 'Browser', action_type: 'application_submitted', object: 'role-b', duration_ms: 20 * 60 * 1000 });
  for (let index = 0; index < 12; index++) add(index % 7, 11 + (index % 3), { application: index % 2 ? 'Terminal' : 'VS Code', action_type: index % 2 ? 'terminal_command' : 'code_edit', object: 'software-project', duration_ms: HOUR });
  for (let index = 0; index < 8; index++) add(index % 7, 18, { application: 'Browser', action_type: 'data_entry', object: 'manual-cv-entry', context: { workflow_signature: 'manual CV/application entry', activity_category: 'Personal Admin', activity_subcategory: 'Administration' }, duration_ms: 30 * 60 * 1000 });
  return {
    as_of: '2026-09-21T23:59:00.000Z',
    events,
    goal: { description: 'Increase earning power', domain: 'career', objective_variables: ['income', 'qualified_applications'], priority: 0.9, constraints: ['Maintain application quality'] },
  };
}
