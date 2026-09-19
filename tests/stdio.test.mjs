import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('SIMULATED stdio SDK -> gateway -> real policy helper: session, Unicode, verify, cancel, revoke', async () => {
  const state = mkdtempSync(join(tmpdir(), 'bridge-sim-'));
  const device_id = randomUUID();
  const policy = { device_id, operators: { test: { credential_sha256: createHash('sha256').update('a'.repeat(64)).digest('hex'), revoked: false, expires: Date.now() / 1000 + 600,
    grants: { fixture: { app: 'dev.devicebridge.fixture', scopes: ['observe', 'control'], expires: Date.now() / 1000 + 300 } } } } };
  const save = () => writeFileSync(join(state, 'policy.json'), JSON.stringify(policy), { mode: 0o600 });
  save();
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./simulated-server.mjs', import.meta.url)), state] });
  const client = new Client({ name: 'fixture-smoke', version: '1' });
  const call = async (name, extra = {}) => {
    const result = await client.callTool({ name, arguments: { device_id, request_id: randomUUID(), deadline: Date.now() / 1000 + 20, ...extra } });
    return result;
  };
  try {
    await client.connect(transport);
    const opened = await call('bridge_session_open', { grant_id: 'fixture' });
    assert.equal(opened.isError, false);
    const { session_id, fence } = opened.structuredContent.data;
    const session = { session_id, fence };
    const launch = await call('bridge_app_launch', session);
    assert.equal(launch.structuredContent.data.status, 'verified');
    const before = (await call('bridge_observe', session)).structuredContent.data;
    const tapped = await call('bridge_element_tap', { ...session, observation_id: before.observation_id, ref: before.elements[0].ref });
    assert.equal(tapped.structuredContent.data.status, 'dispatched');
    const fresh = (await call('bridge_observe', session)).structuredContent.data;
    const text = 'Ž 中文 👩🏽‍💻';
    const inserted = await call('bridge_text_insert', { ...session, observation_id: fresh.observation_id, text, expected_text: text });
    assert.equal(inserted.structuredContent.data.status, 'verified');
    assert.equal(inserted.content[1].type, 'image');
    assert.equal((await call('bridge_cancel', { session_id })).structuredContent.data.state, 'stopped');
    assert.equal((await call('bridge_observe', session)).structuredContent.error.code, 'PERMISSION_DENIED');
    policy.operators.test.revoked = true; save();
    assert.equal((await call('bridge_status')).structuredContent.error.code, 'PERMISSION_DENIED');
  } finally { await client.close(); await transport.close(); rmSync(state, { recursive: true, force: true }); }
});
