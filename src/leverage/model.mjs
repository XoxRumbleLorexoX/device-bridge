import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const PRIVACY_CLASSES = ['PUBLIC', 'PERSONAL', 'PRIVATE', 'SENSITIVE', 'RESTRICTED'];
const PRIVACY_CLASS = z.enum(PRIVACY_CLASSES);
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u);
const scalarValue = z.union([z.number().finite(), z.boolean(), z.string().max(512)]);

export const EventSchema = z.object({
  id: z.string().uuid().optional(),
  timestamp: z.string().datetime({ offset: true }),
  device_id: z.string().min(1).max(160),
  source: z.string().min(1).max(160),
  application: z.string().max(160).nullable().default(null),
  action_type: identifier,
  object: z.string().max(1024).nullable().default(null),
  context: z.record(z.string(), z.unknown()).default({}),
  duration_ms: z.number().int().min(0).max(7 * 24 * 60 * 60 * 1000).default(0),
  confidence: z.number().min(0).max(1).default(1),
  privacy_class: PRIVACY_CLASS.default('PERSONAL'),
  raw_event_ref: z.string().max(1024).nullable().default(null),
}).strict().superRefine((event, ctx) => {
  const bytes = Buffer.byteLength(JSON.stringify(event.context), 'utf8');
  if (bytes > 16 * 1024) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['context'], message: 'context exceeds 16 KiB' });
});

export const OutcomeMetricSchema = z.object({
  id: identifier,
  name: z.string().min(1).max(200),
  domain: z.string().min(1).max(120),
  unit: z.string().min(1).max(80),
  direction: z.enum(['increase', 'decrease', 'maintain', 'unspecified']).default('unspecified'),
  weight: z.number().min(0).max(1).default(1),
}).strict();

export const GoalSchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().min(1).max(2000),
  domain: z.string().min(1).max(120),
  objective_variables: z.array(identifier).max(64).default([]),
  outcome_metrics: z.array(OutcomeMetricSchema).max(32).default([]),
  target: z.record(z.string(), scalarValue).default({}),
  deadline: z.string().datetime({ offset: true }).optional(),
  priority: z.number().min(0).max(1).default(0.5),
  constraints: z.array(z.string().max(512)).max(32).default([]),
  parent_goal: z.string().uuid().optional(),
  provenance: z.enum(['explicit', 'inferred']).default('explicit'),
  confirmation_status: z.enum(['confirmed', 'unconfirmed']).optional(),
}).strict();

export const FeedbackSchema = z.object({
  opportunity_id: z.string().uuid(),
  status: z.enum(['accepted', 'dismissed', 'completed', 'partially_completed', 'outcome_improved', 'outcome_unchanged', 'outcome_worsened']),
  rating: z.number().int().min(1).max(5).optional(),
  reason: z.string().max(1000).optional(),
}).strict();

export const OutcomeMeasurementSchema = z.object({
  opportunity_id: z.string().uuid().optional(),
  experiment_id: z.string().uuid().optional(),
  metric_id: identifier,
  phase: z.enum(['baseline', 'intervention', 'followup', 'unspecified']).default('unspecified'),
  timestamp: z.string().datetime({ offset: true }).optional(),
  value: scalarValue,
  unit: z.string().min(1).max(80),
  confidence: z.number().min(0).max(1).default(1),
  evidence: z.array(z.string().min(1).max(512)).max(64).default([]),
  note: z.string().max(1000).optional(),
}).strict().superRefine((measurement, ctx) => {
  if (!measurement.opportunity_id && !measurement.experiment_id)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Outcome measurement must reference an opportunity or experiment.' });
});

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
  raw_retention_days: z.number().int().min(1).max(3650).default(90),
}).strict();

export const DEFAULT_PRIVACY_POLICY = PrivacyPolicySchema.parse({});

export function canonicalEvent(input) {
  const parsed = EventSchema.parse(input);
  return { ...parsed, id: parsed.id ?? randomUUID(), timestamp: new Date(parsed.timestamp).toISOString() };
}

export function canonicalGoal(input) {
  const parsed = GoalSchema.parse(input);
  const provenance = parsed.provenance;
  if (provenance === 'inferred' && parsed.confirmation_status === 'confirmed') throw new Error('Inferred goals cannot be confirmed at creation; use the explicit confirmation action.');
  return {
    ...parsed,
    id: parsed.id ?? randomUUID(),
    confirmation_status: provenance === 'explicit' ? 'confirmed' : 'unconfirmed',
    created_at: new Date().toISOString(),
  };
}

export function boundedConfidence(...values) {
  const finite = values.filter(value => Number.isFinite(value)).map(value => Math.max(0, Math.min(1, value)));
  if (!finite.length) return 0;
  return finite.reduce((product, value) => product * value, 1) ** (1 / finite.length);
}
