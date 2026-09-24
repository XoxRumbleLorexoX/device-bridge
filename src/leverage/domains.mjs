import { createHash } from 'node:crypto';

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

export function assertDomainModule(module) {
  if (!module || typeof module.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(module.id))
    throw new TypeError('Domain module must expose a stable id.');
  if (typeof module.discover !== 'function') throw new TypeError(`Domain module ${module.id} must expose async discover(context).`);
  return module;
}

export function makeDomainCandidate({
  module_id,
  key,
  domain,
  title,
  intervention_type = 'RECOMMENDATION',
  goal_ids = [],
  variable,
  current_value,
  proposed_value,
  expected_effect,
  effort = 0.5,
  financial_cost = 0.5,
  risk = 0.5,
  time_to_impact_days = 30,
  reversibility = 0.5,
  confidence = 0.5,
  strategic_value = 0.5,
  compounding_potential = 0.5,
  evidence = [],
  observation,
  hypothesis,
  assumptions = [],
  recommendation,
  missing_variables = [],
  secondary_effects = [],
  alternatives = [],
}) {
  const opportunityKey = `domain:${module_id}:${key}`;
  const evidenceSignature = digest({ opportunityKey, current_value, evidence, missing_variables }).slice(0, 24);
  return {
    id: deterministicUuid(`opportunity:${opportunityKey}:${evidenceSignature}`),
    opportunity_key: opportunityKey,
    evidence_signature: evidenceSignature,
    domain,
    domain_module: module_id,
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
    confidence,
    strategic_value,
    compounding_potential,
    evidence,
    missing_variables,
    secondary_effects,
    alternatives,
    trace: [
      { stage: 'observation', claim: observation, evidence },
      { stage: 'inference', claim: hypothesis, confidence },
      { stage: 'hypothesis', claim: hypothesis, assumptions },
      { stage: 'recommendation', claim: recommendation },
    ],
    assumptions,
  };
}

export async function discoverDomainCandidates(modules, context) {
  const candidates = [];
  for (const candidateModule of modules ?? []) {
    const module = assertDomainModule(candidateModule);
    const result = await module.discover(Object.freeze({ ...context, makeCandidate: input => makeDomainCandidate({ module_id: module.id, ...input }) }));
    if (!Array.isArray(result)) throw new TypeError(`Domain module ${module.id} must return an array of leverage candidates.`);
    for (const candidate of result) {
      if (!candidate || candidate.domain_module !== module.id || !candidate.opportunity_key || !candidate.trace)
        throw new TypeError(`Domain module ${module.id} returned a candidate that was not created with makeCandidate().`);
      candidates.push(candidate);
    }
  }
  return candidates;
}
