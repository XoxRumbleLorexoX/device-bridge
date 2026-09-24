import { randomUUID } from 'node:crypto';
import { canonicalEvent, canonicalGoal, FeedbackSchema } from './model.mjs';
import { normalizePrivacyPolicy, privacyDecision, retentionCutoff } from './privacy.mjs';
import { LeverageStore } from './storage.mjs';
import { buildActivities, buildCausalGraph, detectRepetitions, discoverLeverage, extractVariables, rankLeverage, weeklyLeverageReview } from './pipeline.mjs';

function parseHorizon(value) {
  if (value === 'all') return Infinity;
  const match = /^(\d{1,4})d$/u.exec(value ?? '30d');
  if (!match) throw new Error('time_horizon must be all or Nd, for example 7d or 30d.');
  const days = Number(match[1]);
  if (days < 1 || days > 3650) throw new Error('time_horizon days must be between 1 and 3650.');
  return days * 24 * 60 * 60 * 1000;
}

function baselineSummary(events) {
  if (!events.length) return { event_count: 0, coverage_days: 0, state: 'missing', confidence_multiplier: 0.45 };
  const times = events.map(event => Date.parse(event.timestamp));
  const coverageDays = Math.max(1, (Math.max(...times) - Math.min(...times)) / (24 * 60 * 60 * 1000) + 1);
  const state = coverageDays >= 14 ? 'established' : coverageDays >= 7 ? 'initial' : 'thin';
  return { event_count: events.length, coverage_days: Math.round(coverageDays * 10) / 10, state, confidence_multiplier: state === 'established' ? 1 : state === 'initial' ? 0.9 : 0.65 };
}

function filterOpportunity(opportunity, { domain, goal_id }) {
  if (domain && opportunity.domain !== domain) return false;
  if (goal_id && !opportunity.goal_ids.includes(goal_id)) return false;
  return true;
}

export class LeverageService {
  constructor(store = new LeverageStore(), { clock = () => Date.now() } = {}) {
    this.store = store;
    this.clock = clock;
  }

  async privacy() {
    const state = await this.store.read();
    return structuredClone(state.privacy);
  }

  async updatePrivacy(patch) {
    return this.store.transaction(state => {
      state.privacy = normalizePrivacyPolicy({ ...state.privacy, ...patch });
      return structuredClone(state.privacy);
    });
  }

  async deleteHistory({ confirm, retain_goals = false } = {}) {
    if (confirm !== 'DELETE_LEVERAGE_HISTORY') throw new Error('History deletion requires confirm=DELETE_LEVERAGE_HISTORY.');
    return this.store.transaction(state => {
      const counts = Object.fromEntries(['events', 'activities', 'repetitions', 'variable_definitions', 'observations', 'opportunities', 'experiments', 'feedback'].map(key => [key, Array.isArray(state[key]) ? state[key].length : 0]));
      state.events = [];
      state.activities = [];
      state.repetitions = [];
      state.variable_definitions = [];
      state.observations = [];
      state.opportunities = [];
      state.experiments = [];
      state.feedback = [];
      state.causal_graph = { nodes: [], edges: [] };
      state.analysis_meta = null;
      if (!retain_goals) state.goals = [];
      return { deleted: counts, goals_retained: retain_goals };
    });
  }

  async ingest(inputs, { provider_id = 'manual' } = {}) {
    if (!Array.isArray(inputs) || !inputs.length) throw new Error('At least one event is required.');
    if (inputs.length > 500) throw new Error('At most 500 events may be ingested per call.');
    const canonical = inputs.map(input => canonicalEvent({ ...input, source: input.source ?? provider_id }));
    return this.store.transaction(state => {
      state.privacy = normalizePrivacyPolicy(state.privacy);
      const cutoff = retentionCutoff(state.privacy, this.clock());
      state.events = state.events.filter(event => Date.parse(event.timestamp) >= cutoff);
      const existing = new Set(state.events.map(event => event.id));
      const accepted = [];
      const rejected = [];
      for (const event of canonical) {
        if (existing.has(event.id)) { rejected.push({ id: event.id, reason: 'duplicate_event_id' }); continue; }
        const decision = privacyDecision(event, state.privacy);
        if (!decision.allowed) { rejected.push({ id: event.id, reason: decision.reason }); continue; }
        state.events.push(event);
        existing.add(event.id);
        accepted.push(event.id);
      }
      state.events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
      return { accepted_count: accepted.length, rejected_count: rejected.length, accepted, rejected, observation_enabled: state.privacy.observation_enabled };
    });
  }

  async createGoal(input) {
    const goal = canonicalGoal(input);
    return this.store.transaction(state => {
      if (goal.parent_goal && !state.goals.some(existing => existing.id === goal.parent_goal)) throw new Error('parent_goal does not exist.');
      state.goals.push(goal);
      return structuredClone(goal);
    });
  }

  async goals() {
    const state = await this.store.read();
    return structuredClone(state.goals);
  }

  async analyse({ domain, goal_id, time_horizon = '30d', as_of } = {}) {
    const horizon = parseHorizon(time_horizon);
    const asOfMs = as_of ? Date.parse(as_of) : this.clock();
    if (!Number.isFinite(asOfMs)) throw new Error('as_of must be an ISO timestamp.');
    return this.store.transaction(state => {
      const goalIds = new Set(state.goals.map(goal => goal.id));
      if (goal_id && !goalIds.has(goal_id)) throw new Error('goal_id does not exist.');
      const cutoff = horizon === Infinity ? -Infinity : asOfMs - horizon;
      const events = state.events.filter(event => {
        const timestamp = Date.parse(event.timestamp);
        return timestamp <= asOfMs && timestamp >= cutoff;
      });
      const baseline = baselineSummary(events);
      const activities = buildActivities(events);
      const repetitions = detectRepetitions(events);
      const variableModel = extractVariables(events, activities, repetitions, new Date(asOfMs).toISOString());
      let candidates = discoverLeverage({ goals: state.goals, observations: variableModel.observations, repetitions, events });
      candidates = candidates.map(candidate => ({ ...candidate, confidence: Math.round(candidate.confidence * baseline.confidence_multiplier * 1000) / 1000 }));
      const opportunities = rankLeverage(candidates, state.feedback);
      const graph = buildCausalGraph(state.goals, variableModel.definitions, opportunities, new Date(asOfMs).toISOString());
      state.activities = activities;
      state.repetitions = repetitions;
      state.variable_definitions = variableModel.definitions;
      state.observations = variableModel.observations;
      state.opportunities = opportunities;
      state.causal_graph = graph;
      state.analysis_meta = { as_of: new Date(asOfMs).toISOString(), time_horizon, baseline, event_count: events.length };
      const selected = opportunities.filter(item => filterOpportunity(item, { domain, goal_id }));
      return {
        analysis: structuredClone(state.analysis_meta),
        goals: structuredClone(state.goals.filter(goal => !goal_id || goal.id === goal_id)),
        activities: structuredClone(activities),
        variables: structuredClone(variableModel.definitions),
        observations: structuredClone(variableModel.observations),
        opportunities: structuredClone(selected),
        leverage_map: structuredClone(graph),
        value_of_information: [...new Set(selected.flatMap(item => item.missing_variables))],
      };
    });
  }

  async opportunities({ domain, goal_id } = {}) {
    const state = await this.store.read();
    return state.opportunities.filter(item => filterOpportunity(item, { domain, goal_id })).map(item => structuredClone(item));
  }

  async why(opportunityId) {
    const state = await this.store.read();
    const item = state.opportunities.find(opportunity => opportunity.id === opportunityId);
    if (!item) throw new Error('Opportunity not found; run leverage analysis first.');
    return {
      opportunity_id: item.id,
      title: item.title,
      trace: structuredClone(item.trace),
      evidence: structuredClone(item.evidence),
      assumptions: structuredClone(item.assumptions),
      missing_variables: structuredClone(item.missing_variables),
      ranking: structuredClone(item.ranking),
    };
  }

  async recordFeedback(input) {
    const parsed = FeedbackSchema.parse(input);
    return this.store.transaction(state => {
      const opportunity = state.opportunities.find(item => item.id === parsed.opportunity_id);
      if (!opportunity) throw new Error('Opportunity not found; feedback must reference a generated opportunity.');
      const feedback = { id: randomUUID(), timestamp: new Date(this.clock()).toISOString(), ...parsed, opportunity_key: opportunity.opportunity_key, evidence_signature: opportunity.evidence_signature };
      state.feedback.push(feedback);
      return structuredClone(feedback);
    });
  }

  async createExperiment({ opportunity_id, period_days = 14 } = {}) {
    if (!Number.isInteger(period_days) || period_days < 3 || period_days > 90) throw new Error('period_days must be an integer between 3 and 90.');
    return this.store.transaction(state => {
      const opportunity = state.opportunities.find(item => item.id === opportunity_id);
      if (!opportunity) throw new Error('Opportunity not found; run leverage analysis first.');
      const metrics = [...new Set([opportunity.lever.variable, ...opportunity.missing_variables])];
      const hypothesis = opportunity.trace.find(step => step.stage === 'hypothesis')?.claim ?? opportunity.title;
      const experiment = {
        id: randomUUID(),
        opportunity_id,
        hypothesis,
        intervention: opportunity.trace.find(step => step.stage === 'recommendation')?.claim ?? opportunity.title,
        baseline_period: `Use the current ${state.analysis_meta?.time_horizon ?? 'analysis'} as baseline.`,
        experiment_period: `${period_days} days`,
        metrics,
        result: null,
        confidence: opportunity.confidence,
        status: 'planned',
        created_at: new Date(this.clock()).toISOString(),
        assumptions: opportunity.assumptions,
      };
      state.experiments.push(experiment);
      return structuredClone(experiment);
    });
  }

  async review() {
    const state = await this.store.read();
    if (!state.analysis_meta) throw new Error('Run leverage analysis before requesting a review.');
    return weeklyLeverageReview({ activities: state.activities, repetitions: state.repetitions ?? [], opportunities: state.opportunities });
  }
}
