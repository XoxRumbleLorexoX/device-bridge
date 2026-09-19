import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BridgeError, SSHTransport, loadConfig } from './transport.mjs';

const id = z.string().uuid();
const base = { device_id: id, request_id: id, deadline: z.number().finite() };
const session = { ...base, session_id: id, fence: z.number().int().positive() };
const text = z.string().min(1).max(64).refine(s => !/[\x00-\x1f\x7f]/u.test(s), 'Control characters and implicit submission are forbidden');
export const tools = {
  bridge_devices: { schema: z.object({}).strict(), method: null, description: 'List paired device identity and connection mode; status is not a hardware verification.' },
  bridge_capabilities: { schema: z.object(base).strict(), method: 'capabilities', description: 'Versioned capability support and verification evidence.' },
  bridge_status: { schema: z.object(base).strict(), method: 'status', description: 'Independent helper status; available during a UI component failure.' },
  bridge_session_open: { schema: z.object({ ...base, grant_id: z.string().min(1).max(64) }).strict(), method: 'session_open', description: 'Open a bounded session from an existing owner-issued fixture grant. Does not grant privileges.' },
  bridge_observe: { schema: z.object(session).strict(), method: 'observe', scope: 'observe', description: 'Observe the unlocked fixture. Images and UI text will be sent to your agent/model provider.' },
  bridge_element_tap: { schema: z.object({ ...session, observation_id: id, ref: z.string().max(100), expected_text: text.optional() }).strict(), method: 'act', scope: 'control', kind: 'tap_element', description: 'Tap one observation-scoped element; rejects changed app, screen, process or AX tree. Calibration unverified.' },
  bridge_text_insert: { schema: z.object({ ...session, observation_id: id, text, expected_text: text.optional() }).strict(), method: 'act', scope: 'control', kind: 'insert_text', description: 'Insert one Unicode chunk into the fixture; never submit, replace text, use clipboard or automatically retry.' },
  bridge_app_launch: { schema: z.object(session).strict(), method: 'act', scope: 'control', kind: 'launch', description: 'Activate the benign Device Bridge Fixture only, with owner control grant.' },
  bridge_cancel: { schema: z.object({ ...base, session_id: id }).strict(), method: 'cancel', description: 'Invalidate future session actions. Already dispatched atomic input cannot be recalled.' },
  bridge_request_result: { schema: z.object({ ...base, lookup_id: id }).strict(), method: 'result', description: 'Inspect a durable mutation outcome without repeating the mutation.' },
};

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

export function createGateway(config, transport = new SSHTransport(config)) {
  const server = new McpServer({ name: 'device-bridge', version: '0.1.0' });
  for (const [name, tool] of Object.entries(tools)) {
    server.registerTool(name, { description: tool.description, inputSchema: tool.schema,
      annotations: { readOnlyHint: ['bridge_devices', 'bridge_capabilities', 'bridge_status', 'bridge_observe', 'bridge_request_result'].includes(name), destructiveHint: false, idempotentHint: ['bridge_devices', 'bridge_capabilities', 'bridge_status', 'bridge_observe', 'bridge_request_result', 'bridge_cancel'].includes(name), openWorldHint: false } }, async (args, extra) => {
      const started = Date.now();
      try {
        args = tool.schema.parse(args);
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
        return mcpResult({ status: 'error', device_id: args.device_id, request_id: args.request_id,
          elapsed_ms: Date.now() - started, error: error instanceof BridgeError ? { code: error.code, stage: error.stage, next_step: error.next_step } : { code: 'INVALID_ARGUMENT', stage: 'gateway', next_step: 'Use the typed schema and verify owner configuration.' } });
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
