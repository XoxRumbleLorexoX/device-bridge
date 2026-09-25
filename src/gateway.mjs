import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BridgeError, SSHTransport, loadConfig } from './transport.mjs';
import { EventSchema, FeedbackSchema, GoalSchema, OutcomeMeasurementSchema, PRIVACY_CLASS } from './leverage/model.mjs';
import { LeverageService } from './leverage/service.mjs';

const id = z.string().uuid();
const base = { device_id: id, request_id: id, deadline: z.number().finite() };
const session = { ...base, session_id: id, fence: z.number().int().positive() };
const text = z.string().min(1).max(64).refine(s => !/[\x00-\x1f\x7f]/u.test(s), 'Control characters and implicit submission are forbidden');
const leverageFilter = z.object({ domain: z.string().min(1).max(160).optional(), goal_id: id.optional() }).strict();
const privacyPatch = z.object({
  observation_enabled: z.boolean().optional(),
  allowed_privacy_classes: z.array(PRIVACY_CLASS).min(1).max(5).optional(),
  sensitive_consent: z.boolean().optional(),
  restricted_consent: z.boolean().optional(),
  excluded_applications: z.array(z.string().min(1).max(160)).max(256).optional(),
  excluded_domains: z.array(z.string().min(1).max(253)).max(256).optional(),
  excluded_sources: z.array(z.string().min(1).max(160)).max(128).optional(),
  excluded_periods: z.array(z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) }).strict()).max(128).optional(),
  raw_event_retention_days: z.number().int().min(1).max(3650).optional(),
}).strict();

export const bridgeTools = {
  bridge_devices: { schema: z.object({}).strict(), method: null, readOnly: true, idempotent: true, description: 'List paired device identity and connection mode; status is not a hardware verification.' },
  bridge_capabilities: { schema: z.object(base).strict(), method: 'capabilities', readOnly: true, idempotent: true, description: 'Versioned capability support and verification evidence.' },
  bridge_status: { schema: z.object(base).strict(), method: 'status', readOnly: true, idempotent: true, description: 'Independent helper status; available during a UI component failure.' },
  bridge_session_open: { schema: z.object({ ...base, grant_id: z.string().min(1).max(64) }).strict(), method: 'session_open', description: 'Open a bounded session from an existing owner-issued fixture grant. Does not grant privileges.' },
  bridge_observe: { schema: z.object(session).strict(), method: 'observe', scope: 'observe', readOnly: true, idempotent: true, description: 'Observe the unlocked fixture. Images and UI text will be sent to your agent/model provider.' },
  bridge_element_tap: { schema: z.object({ ...session, observation_id: id, ref: z.string().max(100), expected_text: text.optional() }).strict(), method: 'act', scope: 'control', kind: 'tap_element', description: 'Tap one observation-scoped element; rejects changed app, screen, process or AX tree. Calibration unverified.' },
  bridge_text_insert: { schema: z.object({ ...session, observation_id: id, text, expected_text: text.optional() }).strict(), method: 'act', scope: 'control', kind: 'insert_text', description: 'Insert one Unicode chunk into the fixture; never submit, replace text, use clipboard or automatically retry.' },
  bridge_app_launch: { schema: z.object(session).strict(), method: 'act', scope: 'control', kind: 'launch', description: 'Activate the benign Device Bridge Fixture only, with owner control grant.' },
  bridge_cancel: { schema: z.object({ ...base, session_id: id }).strict(), method: 'cancel', idempotent: true, description: 'Invalidate future session actions. Already dispatched atomic input cannot be recalled.' },
  bridge_request_result: { schema: z.object({ ...base, lookup_id: id }).strict(), method: 'result', readOnly: true, idempotent: true, description: 'Inspect a durable mutation outcome without repeating the mutation.' },
};

export const leverageTools = {
  leverage_event_ingest: {
    local: true,
    schema: z.object({ events: z.array(EventSchema).min(1).max(500), provider_id: z.string().min(1).max(160).optional() }).strict(),
    description: 'Ingest canonical local behavioural events after the user-controlled privacy policy is applied. Does not read the phone by itself.',
    handler: (service, args) => service.ingest(args.events, { provider_id: args.provider_id }),
  },
  leverage_goal_create: {
    local: true,
    schema: z.object({ goal: GoalSchema }).strict(),
    description: 'Create an explicit or clearly marked inferred goal. Inferred goals remain unconfirmed until explicitly confirmed by the user.',
    handler: (service, args) => service.createGoal(args.goal),
  },
  leverage_goal_confirm: {
    local: true,
    schema: z.object({ goal_id: id }).strict(),
    description: 'Explicitly confirm one previously inferred goal. Creation cannot self-confirm an inferred goal.',
    handler: (service, args) => service.confirmGoal(args.goal_id),
  },
  leverage_goals: {
    local: true, readOnly: true, idempotent: true,
    schema: z.object({}).strict(),
    description: 'List structured leverage goals and their provenance.',
    handler: service => service.goals(),
  },
  leverage_find: {
    local: true,
    schema: z.object({ ...leverageFilter.shape, time_horizon: z.string().regex(/^(all|\d{1,4}d)$/u).default('30d'), as_of: z.string().datetime({ offset: true }).optional() }).strict(),
    description: 'Find leverage from locally stored observations. Returns activities, variables, outcome metrics, bottlenecks, ranked opportunities, missing information, proactive insights and a visualisable leverage map.',
    handler: (service, args) => service.analyse(args),
  },
  leverage_opportunities: {
    local: true, readOnly: true, idempotent: true,
    schema: leverageFilter,
    description: 'List the latest evidence-backed leverage opportunities without recomputing them.',
    handler: (service, args) => service.opportunities(args),
  },
  leverage_why: {
    local: true, readOnly: true, idempotent: true,
    schema: z.object({ opportunity_id: id }).strict(),
    description: 'Explain one recommendation as observation → inference → hypothesis → assumptions → recommendation, including bottlenecks, opportunity cost, measured outcomes and ranking dimensions.',
    handler: (service, args) => service.why(args.opportunity_id),
  },
  leverage_feedback: {
    local: true,
    schema: FeedbackSchema,
    description: 'Record accepted/dismissed/completed/user-rating feedback. Measured outcome values are stored separately.',
    handler: (service, args) => service.recordFeedback(args),
  },
  leverage_outcome_record: {
    local: true,
    schema: OutcomeMeasurementSchema,
    description: 'Record a measured outcome against an opportunity or experiment. This is separate from whether the user liked or accepted the recommendation.',
    handler: (service, args) => service.recordOutcome(args),
  },
  leverage_experiment: {
    local: true,
    schema: z.object({ opportunity_id: id, period_days: z.number().int().min(3).max(90).default(14) }).strict(),
    description: 'Create a bounded measurement experiment when causality is uncertain rather than asserting that a recommendation will work.',
    handler: (service, args) => service.createExperiment(args),
  },
  leverage_review: {
    local: true, readOnly: true, idempotent: true,
    schema: z.object({}).strict(),
    description: 'Generate the current weekly leverage review from the latest analysed model.',
    handler: service => service.review(),
  },
  leverage_privacy_status: {
    local: true, readOnly: true, idempotent: true,
    schema: z.object({}).strict(),
    description: 'Show the local observation/retention policy, including app/domain/source/time exclusions and sensitive-data consent.',
    handler: service => service.privacy(),
  },
  leverage_privacy_update: {
    local: true,
    schema: z.object({ patch: privacyPatch }).strict(),
    description: 'Update user-controlled local observation policy. SENSITIVE and RESTRICTED classes require explicit consent flags.',
    handler: (service, args) => service.updatePrivacy(args.patch),
  },
  leverage_history_delete: {
    local: true, destructive: true,
    schema: z.object({ confirm: z.literal('DELETE_LEVERAGE_HISTORY'), retain_goals: z.boolean().default(false) }).strict(),
    description: 'Delete locally stored leverage history. Requires an exact explicit confirmation string; optionally retain goals.',
    handler: (service, args) => service.deleteHistory(args),
  },
};

export const tools = Object.freeze({ ...bridgeTools, ...leverageTools });

export function mcpResult(result) {
  const safe = structuredClone(result);
  const image = result.data?.image ?? result.data?.after?.image;
  if (safe.data?.image) delete safe.data.image.data;
  if (safe.data?.after?.image) delete safe.data.after.image.data;
  const content = [{ type: 'text', text: JSON.stringify(safe) }];
  if (image && image.mimeType === 'image/png' && typeof image.data === 'string' && image.data.length <= 16 * 1024 * 1024)
    content.push({ type: 'image', mimeType: image.mimeType, data: image.data });
  return { content, structuredContent: safe, isError: result.status === 'error' };
}

export function createGateway(config, transport = new SSHTransport(config), { leverageService = new LeverageService() } = {}) {
  const server = new McpServer({ name: 'device-bridge', version: '0.1.0' });
  for (const [name, tool] of Object.entries(tools)) {
    server.registerTool(name, { description: tool.description, inputSchema: tool.schema,
      annotations: { readOnlyHint: tool.readOnly === true, destructiveHint: tool.destructive === true, idempotentHint: tool.idempotent === true, openWorldHint: false } }, async (args, extra) => {
      const started = Date.now();
      try {
        args = tool.schema.parse(args);
        if (tool.local) return mcpResult({ status: 'ok', data: await tool.handler(leverageService, args) });
        if (!tool.method) return mcpResult({ status: 'ok', data: { devices: [{ device_id: config.device_id, state: 'unverified', mode: 'host-assisted SSH', app_scope: config.fixture_app }] } });
        if (args.device_id !== config.device_id) throw new BridgeError('PERMISSION_DENIED', 'identity', 'Select the paired device.');
        if (!(args.deadline > Date.now() / 1000 && args.deadline <= Date.now() / 1000 + 30)) throw new BridgeError('DEADLINE_EXCEEDED', 'gateway', 'Use a deadline within 30 seconds.');
        const envelope = { ...args, method: tool.method, scope: tool.scope };
        if (tool.kind) {
          envelope.action = { kind: tool.kind };
          if (tool.kind === 'tap_element') { envelope.action.ref = args.ref; delete envelope.ref; }
          if (tool.kind === 'insert_text') { envelope.action.text = args.text; delete envelope.text; }
        }
        return mcpResult(await transport.call(envelope, extra.signal));
      } catch (error) {
        const leverageStage = tool.local ? 'leverage' : 'gateway';
        return mcpResult({ status: 'error', device_id: args?.device_id, request_id: args?.request_id,
          elapsed_ms: Date.now() - started, error: error instanceof BridgeError ? { code: error.code, stage: error.stage, next_step: error.next_step } : { code: 'INVALID_ARGUMENT', stage: leverageStage, next_step: error?.message ?? 'Use the typed schema and verify local configuration.' } });
      }
    });
  }
  return server;
}

export async function serve(configPath) {
  const server = createGateway(loadConfig(configPath));
  await server.connect(new StdioServerTransport());
  return server;
}

export function envelope(method, extra = {}) { return { request_id: randomUUID(), deadline: Date.now() / 1000 + 20, method, ...extra }; }
