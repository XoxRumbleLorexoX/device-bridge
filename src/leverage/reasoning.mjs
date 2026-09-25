import { createHash } from 'node:crypto';
import { boundedConfidence } from './model.mjs';

function digest(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function idFor(prefix, value) {
  return `${prefix}_${digest(value).slice(0, 16)}`;
}

export function deriveOutcomeMetrics(goals) {
  const metrics = new Map();
  for (const goal of goals) {
    for (const metric of goal.outcome_metrics ?? []) {
      const existing = metrics.get(metric.id);
      if (!existing || goal.priority > existing.goal_priority) {
        metrics.set(metric.id, { ...metric, goal_ids: [goal.id], goal_priority: goal.priority, provenance: 'user_supplied' });
      } else if (!existing.goal_ids.includes(goal.id)) {
        existing.goal_ids.push(goal.id);
      }
    }
    for (const variable of goal.objective_variables ?? []) {
      if (metrics.has(variable)) continue;
      metrics.set(variable, {
        id: variable,
        name: variable.replace(/[._-]+/gu, ' '),
        domain: goal.domain,
        unit: 'unspecified',
        direction: 'unspecified',
        weight: goal.priority,
        goal_ids: [goal.id],
        goal_priority: goal.priority,
        provenance: 'derived_from_goal_objective_variable',
      });
    }
  }
  return [...metrics.values()].map(({ goal_priority, ...metric }) => metric);
}

function latestObservationMap(observations) {
  const map = new Map();
  for (const observation of observations) map.set(observation.variable_id, observation);
  return map;
}

export function detectBottlenecks({ goals, observations, repetitions, frictions = [], sequences = [] }) {
  const values = latestObservationMap(observations);
  const bottlenecks = [];

  for (const repetition of repetitions) {
    if (repetition.weekly_hours <= 0) continue;
    bottlenecks.push({
      id: idFor('bottleneck', `repetition:${repetition.id}`),
      domain: 'automation',
      type: 'repeated_manual_work',
      status: 'observed_constraint',
      statement: `Repeated workflow “${repetition.signature}” consumes about ${repetition.weekly_hours} observed hours/week.`,
      constrained_variables: [`repetition.${repetition.id}.weekly_hours`, 'resource.time'],
      competing_hypotheses: ['The workflow may require human judgment that limits safe automation.', 'The measured week may not represent the longer-term rate.'],
      confidence: repetition.confidence,
      evidence: repetition.evidence,
      missing_variables: [],
    });
  }

  for (const sequence of sequences) {
    if (sequence.weekly_hours <= 0) continue;
    bottlenecks.push({
      id: idFor('bottleneck', `sequence:${sequence.id}`),
      domain: 'automation',
      type: 'repeated_multi_step_work',
      status: 'observed_constraint',
      statement: `The multi-step sequence “${sequence.signature}” repeated ${sequence.executions} times and represents about ${sequence.weekly_hours} observed hours/week.`,
      constrained_variables: [`sequence.${sequence.id}.weekly_hours`, 'resource.time'],
      competing_hypotheses: ['One or more steps may require judgment or consent.', 'The sequence may be temporary rather than a stable workflow.', 'A template or batching change may be more appropriate than automation.'],
      confidence: sequence.confidence,
      evidence: sequence.evidence,
      missing_variables: [],
    });
  }

  for (const friction of frictions) {
    if (friction.type === 'context_switching') {
      bottlenecks.push({
        id: idFor('bottleneck', `friction:${friction.id}`),
        domain: 'productivity',
        type: 'context_switching',
        status: 'suspected_constraint',
        statement: friction.statement,
        constrained_variables: ['friction.context_switching.rapid_switches', 'friction.context_switching.bouncebacks'],
        competing_hypotheses: friction.alternatives,
        confidence: friction.confidence,
        evidence: friction.evidence,
        missing_variables: ['productivity.task_completion_time_or_output'],
      });
    } else if (friction.type === 'retry_loop') {
      bottlenecks.push({
        id: idFor('bottleneck', `friction:${friction.id}`),
        domain: 'workflow',
        type: 'retry_loop',
        status: 'suspected_constraint',
        statement: friction.statement,
        constrained_variables: [`friction.${friction.id}.repeated_attempts`],
        competing_hypotheses: friction.alternatives,
        confidence: friction.confidence,
        evidence: friction.evidence,
        missing_variables: ['workflow.retry_cause'],
      });
    } else if (friction.type === 'repeated_search') {
      bottlenecks.push({
        id: idFor('bottleneck', `friction:${friction.id}`),
        domain: 'workflow',
        type: 'repeated_retrieval',
        status: 'suspected_constraint',
        statement: friction.statement,
        constrained_variables: [`friction.${friction.id}.searches`],
        competing_hypotheses: friction.alternatives,
        confidence: friction.confidence,
        evidence: friction.evidence,
        missing_variables: [],
      });
    }
  }

  const careerGoals = goals.filter(goal => (goal.domain.toLowerCase() === 'career' || /income|earn|salary|job|career/u.test(goal.description.toLowerCase())));
  const browsing = values.get('time.career.job_discovery_hours');
  const applications = values.get('actions.application_submitted_count');
  const interviews = values.get('actions.interview_scheduled_count');
  if (careerGoals.length && browsing && applications && browsing.value >= 2) {
    const lowThroughput = applications.value / Math.max(0.25, browsing.value) < 1;
    bottlenecks.push({
      id: idFor('bottleneck', 'career:discovery_to_application'),
      domain: 'career',
      type: 'pipeline_stage',
      status: lowThroughput ? 'suspected_constraint' : 'monitored_stage',
      statement: `${browsing.value} observed job-discovery hours produced ${applications.value} recorded application submissions in the analysis window.`,
      constrained_variables: ['career.qualified_applications_per_browsing_hour'],
      competing_hypotheses: ['Filtering/application friction limits throughput.', 'Deliberately selective targeting explains the low volume.', 'Application quality, not volume, is the downstream constraint.'],
      confidence: boundedConfidence(browsing.confidence, applications.confidence, lowThroughput ? 0.72 : 0.58),
      evidence: [...browsing.evidence, ...applications.evidence],
      missing_variables: interviews ? [] : ['career.application_to_interview_conversion'],
    });
  }
  return bottlenecks;
}

export function attachOpportunityCosts(opportunities, bottlenecks) {
  return opportunities.map(item => {
    const related = bottlenecks.filter(bottleneck => bottleneck.domain === item.domain || (item.domain === 'automation' && ['repeated_manual_work', 'repeated_multi_step_work'].includes(bottleneck.type)));
    let opportunityCost = null;
    if (item.domain === 'automation' && typeof item.lever.current_value === 'number') {
      opportunityCost = {
        resource: 'time',
        currently_committed: `${item.lever.current_value} hours/week to the measured repeated workflow or sequence`,
        alternatives: ['Project development', 'Learning', 'Applications/networking', 'Rest/personal time'],
        ranking: 'not_ranked',
        note: 'Alternatives are shown as trade-offs only; the engine does not assume which use of reclaimed time is better.',
      };
    } else if (item.domain === 'career') {
      opportunityCost = {
        resource: 'job-search attention',
        currently_committed: 'Observed vacancy discovery/application workflow',
        alternatives: ['Improve application quality', 'Recruiter outreach', 'Portfolio/project work', 'Additional role discovery'],
        ranking: 'not_ranked',
        note: 'The dominant alternative depends on missing conversion evidence and user priorities.',
      };
    } else if (item.domain === 'productivity' || item.domain === 'workflow') {
      opportunityCost = {
        resource: 'attention/time',
        currently_committed: 'Observed transitions, retries or repeated retrieval in the measured workflow',
        alternatives: ['Keep the current workflow if the transitions are necessary', 'Batch related work', 'Use a template/shortcut', 'Collect more evidence before changing anything'],
        ranking: 'not_ranked',
        note: 'Friction signals are not automatically waste; alternatives remain unranked until outcome evidence distinguishes them.',
      };
    }
    return { ...item, bottleneck_ids: related.map(entry => entry.id), opportunity_cost: opportunityCost };
  });
}

export function enrichLeverageMap(graph, bottlenecks, opportunities) {
  const nodes = [...graph.nodes, ...bottlenecks.map(item => ({ id: `bottleneck:${item.id}`, type: 'bottleneck', label: item.statement, confidence: item.confidence, status: item.status }))];
  const edges = [...graph.edges];
  for (const opportunity of opportunities) {
    for (const bottleneckId of opportunity.bottleneck_ids ?? []) {
      const bottleneck = bottlenecks.find(item => item.id === bottleneckId);
      if (!bottleneck) continue;
      edges.push({
        from: `bottleneck:${bottleneck.id}`,
        to: `opportunity:${opportunity.id}`,
        relationship_type: 'ENABLES',
        claim_type: 'hypothesis',
        confidence: Math.min(bottleneck.confidence, opportunity.confidence),
        evidence: [...new Set([...bottleneck.evidence, ...opportunity.evidence])],
        last_updated: graph.edges[0]?.last_updated ?? new Date().toISOString(),
      });
    }
  }
  return { nodes, edges };
}

export function toProactiveInsight(opportunity) {
  const observation = opportunity.trace.find(step => step.stage === 'observation')?.claim ?? 'No observation available.';
  const hypothesis = opportunity.trace.find(step => step.stage === 'hypothesis')?.claim ?? 'No hypothesis available.';
  const recommendation = opportunity.trace.find(step => step.stage === 'recommendation')?.claim ?? 'No recommendation available.';
  return {
    id: opportunity.id,
    title: opportunity.title,
    domain: opportunity.domain,
    observation,
    hypothesis,
    lever: opportunity.lever.variable,
    proposed_change: recommendation,
    estimated_effect: opportunity.expected_effect,
    effort: opportunity.ranking?.dimensions?.effort ?? opportunity.effort,
    confidence: opportunity.confidence,
    evidence: opportunity.evidence,
    important_missing_variables: opportunity.missing_variables,
    next_action: opportunity.intervention_type === 'INFORMATION' ? 'Collect the missing information.' : 'Review this lever and decide whether to try an experiment.',
  };
}
