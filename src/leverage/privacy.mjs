import { DEFAULT_PRIVACY_POLICY, PrivacyPolicySchema } from './model.mjs';

export function normalizePrivacyPolicy(input = {}) {
  return PrivacyPolicySchema.parse({ ...DEFAULT_PRIVACY_POLICY, ...input });
}

function eventDomain(event) {
  const explicit = typeof event.context?.domain === 'string' ? event.context.domain : null;
  if (explicit) return explicit.toLowerCase();
  if (typeof event.context?.url === 'string') {
    try { return new URL(event.context.url).hostname.toLowerCase(); } catch { return null; }
  }
  return null;
}

function matchesDomain(hostname, excluded) {
  return hostname === excluded || hostname.endsWith(`.${excluded}`);
}

export function privacyDecision(event, policyInput = DEFAULT_PRIVACY_POLICY) {
  const policy = normalizePrivacyPolicy(policyInput);
  if (!policy.observation_enabled) return { allowed: false, reason: 'observation_paused' };
  if (!policy.allowed_privacy_classes.includes(event.privacy_class)) return { allowed: false, reason: 'privacy_class_not_allowed' };
  const app = (event.application ?? '').toLowerCase();
  if (policy.excluded_applications.some(value => value.toLowerCase() === app)) return { allowed: false, reason: 'application_excluded' };
  if (policy.excluded_sources.some(value => value.toLowerCase() === event.source.toLowerCase())) return { allowed: false, reason: 'source_excluded' };
  const domain = eventDomain(event);
  if (domain && policy.excluded_domains.some(value => matchesDomain(domain, value.toLowerCase()))) return { allowed: false, reason: 'domain_excluded' };
  const at = Date.parse(event.timestamp);
  if (policy.excluded_periods.some(period => at >= Date.parse(period.start) && at < Date.parse(period.end))) return { allowed: false, reason: 'period_excluded' };
  return { allowed: true, reason: 'allowed' };
}

export function retentionCutoff(policyInput, now = Date.now()) {
  const policy = normalizePrivacyPolicy(policyInput);
  return now - policy.raw_event_retention_days * 24 * 60 * 60 * 1000;
}
