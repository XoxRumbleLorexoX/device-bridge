import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const PRIVACY_CLASSES = Object.freeze(['PUBLIC', 'PERSONAL', 'PRIVATE', 'SENSITIVE', 'RESTRICTED']);
export const PRIVACY_CLASS = z.enum(PRIVACY_CLASSES);
const identifier = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/u);
const boundedText = z.string().min(1).max(512);

function jsonObjectWithinLimit(value) {
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8') <= 16 * 1024; } catch { return false; }
}

export const EventSchema = z.object({
  id: z.string().uuid().optional(),
  timestamp: z.string().datetime({ offset: true }),
  device_id: identifier,
  source: identifier,
  application: z.string().max(160).optional(),
  action_type: identifier,
  object: z.string().max(512).optional(),
  context: z.record(z.string().max(100), z.unknown()).default({}).refine(jsonObjectWithinLimit, 'Event context must be JSON-serializable and <=16 KiB.'),
  duration_ms: z.number().int().nonnegative().max(7 * 24 * 60 * 60 * 1000).default(0),
  confidence: z.number().min(0).max(1).default(1),
  privacy_class: PRIVACY_CLASS.default('PERSONAL'),
  raw_event_ref: z.string().max(512).optional(),
}).strict();

export const GoalSchema = z.object({
  id: z.string().uuid().optional(),
  description: boundedText,
  domain: identifier,
  objective_variables: z.array(identifier).max(32).default([]),
  target: z.unknown().optional(),
  deadline: z.string().datetime({ offset: true }).optional(),
  priority: z.number().min(0).max(1).default(0.5),
  constraints: z.array(z.string().max(512)).max(32).default([]),
  parent_goal: z.string().uuid().optional(),
  provenance: z.enum(['explicit', 'inferred']).default('explicit'),
  confirmation_status: z.enum(['confirmed', 'unconfirmed']).default('confirmed'),
}).strict().superRefine((goal, ctx) => {
  if (goal.provenance === 'inferred' && goal.confirmation_status !== 'unconfirmed') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Inferred goals must remain unconfirmed until the user explicitly confirms them.' });
  }
});

export const FeedbackSchema = z.object({
  opportunity_id: z.string().uuid(),
  status: z.enum(['accepted', 'dismissed', 'completed', 'partially_completed', 'outcome_improved', 'outcome_unchanged', 'outcome_worsened']),
  rating: z.number().int().min(1).max(5).optional(),
  reason: z.string().max(1000).optional(),
}).strict();

export const PrivacyPolicySchema = z.object({
  observation_enabled: z.boolean().default(true),
  allowed_privacy_classes: z.array(PRIVACY_CLASS).min(1).max(PRIVACY_CLASSES.length).default(['PUBLIC', 'PERSONAL', 'PRIVATE']),
  sensitive_consent: z.boolean().default(false),
  restricted_consent: z.boolean().default(false),
  excluded_applications: z.array(z.string().min(1).max(160)).max(256).default([]),
  excluded_domains: z.array(z.string().min(1).max(253)).max(256).default([]),
  excluded_sources: z.array(z.string().min(1).max(160)).max(128).default([]),
  excluded_periods: z.array(z.object({
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
  }).strict()).max(128).default([]),
  raw_event_retention_days: z.number().int().min(1).max(3650).default(90),
}).strict().superRefine((policy, ctx) => {
  if (policy.allowed_privacy_classes.includes('SENSITIVE') && !policy.sensitive_consent)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SENSITIVE observation requires sensitive_consent=true.' });
  if (policy.allowed_privacy_classes.includes('RESTRICTED') && !policy.restricted_consent)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'RESTRICTED observation requires restricted_consent=true.' });
  for (const period of policy.excluded_periods) {
    if (Date.parse(period.end) <= Date.parse(period.start))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Excluded period end must be after start.' });
  }
});

export const DEFAULT_PRIVACY_POLICY = Object.freeze(PrivacyPolicySchema.parse({}));

export function canonicalEvent(input) {
  const parsed = EventSchema.parse(input);
  return { ...parsed, id: parsed.id ?? randomUUID(), timestamp: new Date(parsed.timestamp).toISOString() };
}

export function canonicalGoal(input) {
  const parsed = GoalSchema.parse(input);
  return { ...parsed, id: parsed.id ?? randomUUID(), created_at: new Date().toISOString() };
}

export function boundedConfidence(...values) {
  const finite = values.filter(value => Number.isFinite(value));
  if (!finite.length) return 0;
  return Math.max(0, Math.min(1, finite.reduce((sum, value) => sum + value, 0) / finite.length));
}
