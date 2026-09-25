import { createHash } from 'node:crypto';
import { boundedConfidence } from './model.mjs';
import { makeDomainCandidate } from './domains.mjs';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
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

function eventToken(event) {
  const hinted = typeof event.context?.workflow_step === 'string' ? event.context.workflow_step.trim() : '';
  const application = (event.application || 'unknown').replace(/\s+/gu, ' ').trim();
  return hinted ? `${application}:${event.action_type}:${hinted}` : `${application}:${event.action_type}`;
}

function sequenceContains(longer, shorter) {
  if (shorter.length > longer.length) return false;
  for (let start = 0; start <= longer.length - shorter.length; start += 1) {
    if (shorter.every((value, offset) => value === longer[start + offset])) return true;
  }
  return false;
}

function splitSessions(events, maxGapMs) {
  const ordered = [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const sessions = [];
  let current = [];
  for (const event of ordered) {
    if (current.length) {
      const previous = current.at(-1);
      const previousEnd = Date.parse(previous.timestamp) + previous.duration_ms;
      if (Date.parse(event.timestamp) - previousEnd > maxGapMs) {
        sessions.push(current);
        current = [];
      }
    }
    current.push(event);
  }
  if (current.length) sessions.push(current);
  return sessions;
}

export function detectRepeatedSequences(events, { minExecutions = 3, minLength = 2, maxLength = 4, maxGapMs = 10 * MINUTE } = {}) {
  if (!Number.isInteger(minExecutions) || minExecutions < 2) throw new RangeError('minExecutions must be an integer >= 2.');
  if (!Number.isInteger(minLength) || !Number.isInteger(maxLength) || minLength < 2 || maxLength < minLength || maxLength > 8)
    throw new RangeError('Sequence length bounds must satisfy 2 <= minLength <= maxLength <= 8.');
  if (!Number.isFinite(maxGapMs) || maxGapMs <= 0 || maxGapMs > 60 * MINUTE) throw new RangeError('maxGapMs must be in (0, 60 minutes].');

  const groups = new Map();
  let globalIndex = 0;
  for (const session of splitSessions(events, maxGapMs)) {
    const indexed = session.map(event => ({ event, index: globalIndex++ }));
    for (let length = minLength; length <= Math.min(maxLength, indexed.length); length += 1) {
      for (let start = 0; start <= indexed.length - length; start += 1) {
        const slice = indexed.slice(start, start + length);
        const steps = slice.map(({ event }) => eventToken(event));
        if (new Set(steps).size < 2) continue;
        const key = JSON.stringify(steps);
        const first = slice[0].event;
        const last = slice.at(-1).event;
        const startMs = Date.parse(first.timestamp);
        const endMs = Date.parse(last.timestamp) + last.duration_ms;
        const summedDuration = slice.reduce((sum, { event }) => sum + event.duration_ms, 0);
        const occurrence = {
          start_index: slice[0].index,
          end_index: slice.at(-1).index,
          start_time: first.timestamp,
          end_time: new Date(endMs).toISOString(),
          duration_ms: Math.max(summedDuration, endMs - startMs),
          event_ids: slice.map(({ event }) => event.id),
          confidences: slice.map(({ event }) => event.confidence),
          privacy_classes: slice.map(({ event }) => event.privacy_class),
        };
        const group = groups.get(key) ?? { steps, occurrences: [] };
        group.occurrences.push(occurrence);
        groups.set(key, group);
      }
    }
  }

  const candidates = [];
  for (const group of groups.values()) {
    const occurrences = [...group.occurrences].sort((a, b) => a.start_index - b.start_index);
    const nonOverlapping = [];
    let lastEnd = -1;
    for (const occurrence of occurrences) {
      if (occurrence.start_index <= lastEnd) continue;
      nonOverlapping.push(occurrence);
      lastEnd = occurrence.end_index;
    }
    if (nonOverlapping.length < minExecutions) continue;

    const totalMs = nonOverlapping.reduce((sum, item) => sum + item.duration_ms, 0);
    const firstMs = Date.parse(nonOverlapping[0].start_time);
    const lastMs = Date.parse(nonOverlapping.at(-1).start_time);
    const spanDays = Math.max(7, (lastMs - firstMs) / DAY + 1);
    const weeklyHours = (totalMs / HOUR) / spanDays * 7;
    const allPrivacy = nonOverlapping.flatMap(item => item.privacy_classes);
    const privacyPenalty = allPrivacy.includes('RESTRICTED') ? 0.35 : allPrivacy.includes('SENSITIVE') ? 0.2 : 0;
    const allConfidence = nonOverlapping.flatMap(item => item.confidences);
    const evidence = [...new Set(nonOverlapping.flatMap(item => item.event_ids))];
    const executionConfidence = Math.min(0.95, 0.55 + nonOverlapping.length * 0.08);
    const confidence = boundedConfidence(...allConfidence, executionConfidence);
    const signature = group.steps.join(' → ');
    candidates.push({
      id: `sequence_${digest(group.steps).slice(0, 12)}`,
      kind: 'repeated_sequence',
      signature,
      steps: group.steps,
      length: group.steps.length,
      executions: nonOverlapping.length,
      total_hours: round(totalMs / HOUR, 2),
      average_minutes: round(totalMs / nonOverlapping.length / MINUTE, 1),
      weekly_hours: round(weeklyHours, 2),
      annualized_hours: round(weeklyHours * 52, 1),
      automation_feasibility: round(Math.max(0.1, 0.78 - privacyPenalty), 2),
      confidence: round(confidence, 3),
      evidence,
      occurrences: nonOverlapping.map(({ confidences, privacy_classes, ...item }) => item),
      assumptions: ['The observed sequence represents one workflow rather than coincidental adjacent actions.', 'Future frequency may differ from the observed window.', 'Automation feasibility depends on whether any step requires judgment, consent or sensitive data.'],
    });
  }

  const ordered = candidates.sort((a, b) => b.length - a.length || b.annualized_hours - a.annualized_hours);
  const selected = [];
  for (const candidate of ordered) {
    const redundant = selected.some(longer => longer.executions === candidate.executions && sequenceContains(longer.steps, candidate.steps));
    if (!redundant) selected.push(candidate);
  }
  return selected.sort((a, b) => b.annualized_hours - a.annualized_hours || b.executions - a.executions);
}

function frictionId(type, key) {
  return `friction_${type}_${digest(key).slice(0, 12)}`;
}

export function detectFriction(events, sequences = []) {
  const ordered = [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const frictions = [];

  let rapidSwitches = 0;
  let bouncebacks = 0;
  const switchEvidence = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const gap = Date.parse(current.timestamp) - (Date.parse(previous.timestamp) + previous.duration_ms);
    if (previous.application && current.application && previous.application !== current.application && gap >= 0 && gap <= 5 * MINUTE) {
      rapidSwitches += 1;
      switchEvidence.push(previous.id, current.id);
    }
    if (index >= 2) {
      const twoBack = ordered[index - 2];
      const totalGap = Date.parse(current.timestamp) - (Date.parse(twoBack.timestamp) + twoBack.duration_ms);
      if (twoBack.application && current.application === twoBack.application && previous.application && previous.application !== current.application && totalGap >= 0 && totalGap <= 10 * MINUTE) {
        bouncebacks += 1;
        switchEvidence.push(twoBack.id, previous.id, current.id);
      }
    }
  }
  if (rapidSwitches >= 6 || bouncebacks >= 2) {
    const evidence = [...new Set(switchEvidence)];
    const evidenceEvents = ordered.filter(event => evidence.includes(event.id));
    const severity = Math.min(1, rapidSwitches / 20 * 0.6 + bouncebacks / 5 * 0.4);
    frictions.push({
      id: frictionId('context_switching', `${rapidSwitches}:${bouncebacks}:${evidence.join(':')}`),
      type: 'context_switching',
      domain: 'productivity',
      statement: `${rapidSwitches} rapid cross-application transitions and ${bouncebacks} short app bounce-backs were observed.`,
      severity: round(severity, 3),
      confidence: round(boundedConfidence(...evidenceEvents.map(event => event.confidence), 0.72), 3),
      evidence,
      metrics: { rapid_switches: rapidSwitches, bouncebacks },
      estimated_avoidable_minutes: null,
      alternatives: ['The workflow may legitimately require multiple applications.', 'The application changes may reflect parallel tasks rather than interruption.'],
      assumptions: ['Only transitions within five minutes and A→B→A bounce-backs within ten minutes are counted as friction signals.'],
    });
  }

  const retryGroups = new Map();
  for (const event of ordered) {
    const objectKey = event.object ?? event.context?.target ?? '';
    const key = `${event.application ?? 'unknown'}|${event.action_type}|${objectKey}`;
    const group = retryGroups.get(key) ?? [];
    group.push(event);
    retryGroups.set(key, group);
  }
  for (const [key, group] of retryGroups) {
    if (group.length < 3) continue;
    const clusters = [];
    let current = [];
    for (const event of group) {
      if (current.length && Date.parse(event.timestamp) - Date.parse(current.at(-1).timestamp) > 15 * MINUTE) {
        if (current.length >= 3) clusters.push(current);
        current = [];
      }
      current.push(event);
    }
    if (current.length >= 3) clusters.push(current);
    if (!clusters.length) continue;
    const evidence = [...new Set(clusters.flatMap(cluster => cluster.map(event => event.id)))];
    const eventSet = clusters.flat();
    const repeatedAttempts = clusters.reduce((sum, cluster) => sum + Math.max(0, cluster.length - 1), 0);
    const estimatedAvoidableMs = clusters.reduce((sum, cluster) => sum + cluster.slice(0, -1).reduce((inner, event) => inner + event.duration_ms, 0), 0);
    frictions.push({
      id: frictionId('retry_loop', key),
      type: 'retry_loop',
      domain: 'workflow',
      statement: `${repeatedAttempts} repeated attempts were observed across ${clusters.length} short retry loop${clusters.length === 1 ? '' : 's'}.`,
      severity: round(Math.min(1, 0.35 + repeatedAttempts * 0.08), 3),
      confidence: round(boundedConfidence(...eventSet.map(event => event.confidence), 0.82), 3),
      evidence,
      metrics: { repeated_attempts: repeatedAttempts, loop_count: clusters.length },
      estimated_avoidable_minutes: round(estimatedAvoidableMs / MINUTE, 1),
      alternatives: ['The repeated actions may be intentional validation or iteration rather than failure.', 'The target may have changed even if event metadata is identical.'],
      assumptions: ['Three or more matching actions within fifteen minutes are treated as a retry-loop signal, not proof of failure.'],
    });
  }

  const searchGroups = new Map();
  for (const event of ordered) {
    if (!/search|query|filter_search/u.test(event.action_type)) continue;
    const subject = event.context?.query_hash ?? event.object ?? 'unknown';
    const key = `${event.application ?? 'unknown'}|${subject}`;
    const group = searchGroups.get(key) ?? [];
    group.push(event);
    searchGroups.set(key, group);
  }
  for (const [key, group] of searchGroups) {
    if (group.length < 3) continue;
    const totalMs = group.reduce((sum, event) => sum + event.duration_ms, 0);
    frictions.push({
      id: frictionId('repeated_search', key),
      type: 'repeated_search',
      domain: 'workflow',
      statement: `${group.length} searches for the same recorded subject were observed in ${group[0].application ?? 'one application'}.`,
      severity: round(Math.min(1, 0.3 + group.length * 0.07), 3),
      confidence: round(boundedConfidence(...group.map(event => event.confidence), 0.78), 3),
      evidence: group.map(event => event.id),
      metrics: { executions: group.length },
      estimated_avoidable_minutes: round(Math.max(0, totalMs - (group.at(-1)?.duration_ms ?? 0)) / MINUTE, 1),
      alternatives: ['The underlying information may have changed between searches.', 'Repeated checking may be required for a time-sensitive task.'],
      assumptions: ['Matching provider metadata is treated as the same search subject without exposing raw query text in the friction statement.'],
    });
  }

  for (const sequence of sequences) {
    if (sequence.annualized_hours < 4) continue;
    frictions.push({
      id: frictionId('repeated_sequence', sequence.id),
      type: 'repeated_sequence',
      domain: 'automation',
      statement: `The sequence “${sequence.signature}” repeated ${sequence.executions} times and represents about ${sequence.weekly_hours} observed hours/week.`,
      severity: round(Math.min(1, 0.35 + sequence.annualized_hours / 200), 3),
      confidence: sequence.confidence,
      evidence: sequence.evidence,
      metrics: { executions: sequence.executions, weekly_hours: sequence.weekly_hours, annualized_hours: sequence.annualized_hours },
      estimated_avoidable_minutes: null,
      alternatives: ['The sequence may require judgment at one or more steps.', 'The sequence may be a temporary project-specific pattern.'],
      assumptions: sequence.assumptions,
      sequence_id: sequence.id,
    });
  }

  return frictions.sort((a, b) => b.severity - a.severity || b.confidence - a.confidence);
}

export function extractFrictionVariables(frictions, sequences, observedAt = new Date().toISOString()) {
  const definitions = [];
  const observations = [];
  const add = ({ id, name, unit, value, controllability, observability, confidence, evidence, source_kind = 'derived', domain = 'productivity' }) => {
    definitions.push({ id, name, domain, type: 'number', unit, controllability, observability, confidence: round(confidence, 3), source_dependencies: evidence, source_kind });
    observations.push({ id: deterministicUuid(`observation:${id}:${observedAt}`), variable_id: id, timestamp: observedAt, value, confidence: round(confidence, 3), evidence });
  };

  for (const sequence of sequences) {
    add({ id: `sequence.${sequence.id}.weekly_hours`, name: `Repeated sequence ${sequence.signature} weekly time`, domain: 'automation', unit: 'hours/week', value: sequence.weekly_hours, controllability: sequence.automation_feasibility, observability: 0.86, confidence: sequence.confidence, evidence: sequence.evidence });
    add({ id: `sequence.${sequence.id}.executions`, name: `Repeated sequence ${sequence.signature} executions`, domain: 'automation', unit: 'count', value: sequence.executions, controllability: 0.76, observability: 0.96, confidence: sequence.confidence, evidence: sequence.evidence, source_kind: 'directly_observed' });
  }

  for (const friction of frictions) {
    if (friction.type === 'context_switching') {
      add({ id: 'friction.context_switching.rapid_switches', name: 'Rapid application transitions', unit: 'count', value: friction.metrics.rapid_switches, controllability: 0.62, observability: 0.92, confidence: friction.confidence, evidence: friction.evidence, source_kind: 'directly_observed' });
      add({ id: 'friction.context_switching.bouncebacks', name: 'Short application bounce-backs', unit: 'count', value: friction.metrics.bouncebacks, controllability: 0.62, observability: 0.9, confidence: friction.confidence, evidence: friction.evidence, source_kind: 'directly_observed' });
    } else if (friction.type === 'retry_loop') {
      add({ id: `friction.${friction.id}.repeated_attempts`, name: 'Repeated attempts in short retry loops', domain: 'workflow', unit: 'count', value: friction.metrics.repeated_attempts, controllability: 0.68, observability: 0.88, confidence: friction.confidence, evidence: friction.evidence });
    } else if (friction.type === 'repeated_search') {
      add({ id: `friction.${friction.id}.searches`, name: 'Repeated searches for the same recorded subject', domain: 'workflow', unit: 'count', value: friction.metrics.executions, controllability: 0.7, observability: 0.9, confidence: friction.confidence, evidence: friction.evidence });
    }
  }
  return { definitions, observations };
}

export function discoverFrictionCandidates({ goals, frictions, sequences }) {
  const activeGoalIds = goals.filter(goal => goal.provenance === 'explicit' || goal.confirmation_status === 'confirmed').map(goal => goal.id);
  const candidates = [];

  for (const sequence of sequences) {
    if (sequence.executions < 3 || sequence.annualized_hours < 4) continue;
    const reductionFraction = sequence.automation_feasibility >= 0.65 ? 0.6 : 0.35;
    const reclaimedHours = round(sequence.weekly_hours * reductionFraction * 52, 1);
    candidates.push(makeDomainCandidate({
      module_id: 'friction',
      key: `sequence:${sequence.id}`,
      domain: 'automation',
      title: `Compress repeated sequence: ${sequence.signature}`,
      intervention_type: sequence.automation_feasibility >= 0.65 ? 'AUTOMATION' : 'WORKFLOW',
      goal_ids: activeGoalIds,
      variable: `sequence.${sequence.id}.weekly_hours`,
      current_value: sequence.weekly_hours,
      proposed_value: round(sequence.weekly_hours * (1 - reductionFraction), 2),
      expected_effect: `Could reclaim roughly ${reclaimedHours} hours over 52 weeks if the measured sequence remains recurrent and the removable steps are actually avoidable.`,
      effort: 0.42,
      financial_cost: 0.12,
      risk: sequence.automation_feasibility < 0.65 ? 0.35 : 0.22,
      time_to_impact_days: 7,
      reversibility: 0.9,
      confidence: sequence.confidence,
      strategic_value: Math.min(0.92, 0.5 + sequence.annualized_hours / 250),
      compounding_potential: 0.78,
      evidence: sequence.evidence,
      observation: `The same ${sequence.length}-step sequence was observed ${sequence.executions} times, representing about ${sequence.weekly_hours} hours/week in the measured window.`,
      hypothesis: 'A shortcut, integration, template or bounded automation may remove repeated transitions in this sequence.',
      assumptions: sequence.assumptions,
      recommendation: 'Inspect the sequence step-by-step and test the smallest reversible compression before automating the whole workflow.',
      secondary_effects: ['May reduce navigation and context-switch overhead.', 'May create reusable workflow infrastructure for similar tasks.'],
      alternatives: ['Batch the workflow without automation.', 'Create a template or shortcut.', 'Keep judgment-sensitive steps manual.'],
    }));
  }

  for (const friction of frictions) {
    if (friction.type === 'context_switching' && friction.severity >= 0.35) {
      candidates.push(makeDomainCandidate({
        module_id: 'friction',
        key: `context-switching:${friction.id}`,
        domain: 'productivity',
        title: 'Test whether rapid app switching is creating avoidable friction',
        intervention_type: 'EXPERIMENT',
        goal_ids: activeGoalIds,
        variable: 'friction.context_switching.rapid_switches',
        current_value: friction.metrics.rapid_switches,
        proposed_value: Math.max(0, Math.round(friction.metrics.rapid_switches * 0.75)),
        expected_effect: 'May reduce transition overhead if the observed switches are interruptions rather than necessary cross-app work; no productivity gain is assumed until measured.',
        effort: 0.25,
        financial_cost: 0,
        risk: 0.08,
        time_to_impact_days: 7,
        reversibility: 1,
        confidence: friction.confidence,
        strategic_value: 0.58,
        compounding_potential: 0.52,
        evidence: friction.evidence,
        observation: friction.statement,
        hypothesis: 'Some rapid application transitions may be avoidable context switching.',
        assumptions: friction.assumptions,
        recommendation: 'Run a short batching experiment for one recurring task and compare completion time, interruptions and subjective usefulness with baseline.',
        alternatives: friction.alternatives,
        missing_variables: ['productivity.task_completion_time_or_output'],
      }));
    }

    if (friction.type === 'retry_loop') {
      candidates.push(makeDomainCandidate({
        module_id: 'friction',
        key: `retry-loop:${friction.id}`,
        domain: 'workflow',
        title: 'Investigate a recurring retry loop before automating around it',
        intervention_type: 'WORKFLOW',
        goal_ids: activeGoalIds,
        variable: `friction.${friction.id}.repeated_attempts`,
        current_value: friction.metrics.repeated_attempts,
        proposed_value: 0,
        expected_effect: friction.estimated_avoidable_minutes ? `Could remove up to ${friction.estimated_avoidable_minutes} observed minutes of repeated attempts in the measured window if they share one correctable cause.` : 'Could reduce repeated attempts if the events share one correctable cause.',
        effort: 0.3,
        financial_cost: 0,
        risk: 0.12,
        time_to_impact_days: 3,
        reversibility: 0.95,
        confidence: friction.confidence,
        strategic_value: 0.55,
        compounding_potential: 0.58,
        evidence: friction.evidence,
        observation: friction.statement,
        hypothesis: 'The short retry loop may indicate a recurring workflow failure, missing validation or avoidable manual correction.',
        assumptions: friction.assumptions,
        recommendation: 'Inspect the failure/retry cause and add validation, a template or a workflow guard before considering automation.',
        alternatives: friction.alternatives,
      }));
    }

    if (friction.type === 'repeated_search') {
      candidates.push(makeDomainCandidate({
        module_id: 'friction',
        key: `repeated-search:${friction.id}`,
        domain: 'workflow',
        title: 'Reduce repeated retrieval of the same information',
        intervention_type: 'WORKFLOW',
        goal_ids: activeGoalIds,
        variable: `friction.${friction.id}.searches`,
        current_value: friction.metrics.executions,
        proposed_value: 1,
        expected_effect: friction.estimated_avoidable_minutes ? `Could avoid roughly ${friction.estimated_avoidable_minutes} observed minutes of repeated lookup if the information can be safely saved or surfaced automatically.` : 'Could reduce repeated lookup if the information can be safely saved or surfaced automatically.',
        effort: 0.18,
        financial_cost: 0,
        risk: 0.08,
        time_to_impact_days: 1,
        reversibility: 1,
        confidence: friction.confidence,
        strategic_value: 0.48,
        compounding_potential: 0.5,
        evidence: friction.evidence,
        observation: friction.statement,
        hypothesis: 'A saved view, bookmark, cached reference or scheduled retrieval may remove repeated information-finding steps.',
        assumptions: friction.assumptions,
        recommendation: 'Test a saved or automatically surfaced reference before building a larger automation.',
        alternatives: friction.alternatives,
      }));
    }
  }
  return candidates;
}
