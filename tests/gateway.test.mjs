import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createGateway, mcpResult, tools } from '../src/gateway.mjs';
import { sshArgs, Config, BridgeError } from '../src/transport.mjs';

const config = { device_id: '00000000-0000-4000-8000-000000000001', fixture_app: 'dev.devicebridge.fixture', host: '192.0.2.10', port: 22, user: 'root', identity_file: '/etc/device-bridge/key', known_hosts: '/etc/device-bridge/known_hosts' };
function args() { return { device_id: config.device_id, request_id: randomUUID(), deadline: Date.now() / 1000 + 20 }; }
async function linked(transport, callback) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createGateway(config, transport);
  const client = new Client({ name: 'bridge-tests', version: '1' });
  await server.connect(serverSide);
  await client.connect(clientSide);
  try { await callback(client); } finally { await client.close(); await server.close(); }
}

test('SDK negotiation and stable tool list expose no broad device powers', async () => {
  await linked({ call() { throw Error('unexpected'); } }, async client => {
    const list = await client.listTools();
    assert.deepEqual(list.tools.map(t => t.name).sort(), Object.keys(tools).sort());
    assert.equal(list.tools.length, Object.keys(tools).length);
    assert.ok(!list.tools.some(t => /shell|file|package|url|approve/.test(t.name)));
    const result = await client.callTool({ name: 'bridge_devices', arguments: {} });
    assert.equal(result.structuredContent.data.devices[0].state, 'unverified');
  });
});

test('device identity and deadlines fail before transport', async () => {
  let calls = 0;
  await linked({ call() { calls++; } }, async client => {
    const wrong = await client.callTool({ name: 'bridge_status', arguments: { ...args(), device_id: randomUUID() } });
    assert.equal(wrong.structuredContent.error.code, 'PERMISSION_DENIED');
    const stale = await client.callTool({ name: 'bridge_status', arguments: { ...args(), deadline: 1 } });
    assert.equal(stale.structuredContent.error.code, 'DEADLINE_EXCEEDED');
  });
  assert.equal(calls, 0);
});

test('typed insertion carries identity, fence, scope and never appends newline', async () => {
  const recorded = [];
  await linked({ async call(req) { recorded.push(req); return { status: 'ok', data: { status: 'dispatched' } }; } }, async client => {
    const input = { ...args(), session_id: randomUUID(), fence: 7, observation_id: randomUUID(), text: 'Čć 日本語 👩🏽‍💻' };
    await client.callTool({ name: 'bridge_text_insert', arguments: input });
    assert.deepEqual(recorded[0].action, { kind: 'insert_text', text: input.text });
    assert.equal(recorded[0].scope, 'control');
    assert.equal(recorded[0].fence, 7);
    assert.equal(recorded[0].request_id, input.request_id);
    const invalid = await client.callTool({ name: 'bridge_text_insert', arguments: { ...input, text: 'submit\n' } });
    assert.equal(invalid.isError, true);
    assert.equal(recorded.length, 1);
  });
});

test('MCP images are image content and removed from structured/text content', () => {
  const result = mcpResult({ status: 'ok', data: { after: { observation_id: 'x', image: { mimeType: 'image/png', data: 'aW1hZ2U=' } } } });
  assert.equal(result.content[1].type, 'image');
  assert.ok(!result.content[0].text.includes('aW1hZ2U='));
  assert.ok(!result.structuredContent.data.after.image.data);
  assert.equal(result.structuredContent.data.after.image.mimeType, 'image/png');
});

test('transport uncertainty is preserved and never retried', async () => {
  let calls = 0;
  await linked({ async call() { calls++; throw new BridgeError('OUTCOME_UNKNOWN', 'transport', 'Inspect; do not repeat.'); } }, async client => {
    const result = await client.callTool({ name: 'bridge_app_launch', arguments: { ...args(), session_id: randomUUID(), fence: 1 } });
    assert.equal(result.structuredContent.error.code, 'OUTCOME_UNKNOWN');
  });
  assert.equal(calls, 1);
});

test('SSH disables ambient config, forwarding, agent access, shell interpolation and TOFU', () => {
  const args = sshArgs(config);
  assert.ok(args.includes('StrictHostKeyChecking=yes'));
  assert.ok(args.includes('IdentityAgent=none'));
  assert.ok(args.includes('ClearAllForwardings=yes'));
  assert.deepEqual(args.slice(0, 2), ['-F', '/dev/null']);
  assert.equal(args.at(-1), 'bridge-v1');
  assert.equal(args.includes('-A'), false);
  assert.equal(args.some(x => x.includes('StrictHostKeyChecking=no')), false);
  assert.equal(Config.safeParse({ ...config, host: '-oProxyCommand=evil' }).success, false);
});
