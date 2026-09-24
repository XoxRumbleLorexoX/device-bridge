import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createGateway } from '../src/gateway.mjs';
import { LeverageStore } from '../src/leverage/storage.mjs';
import { LeverageService } from '../src/leverage/service.mjs';
import { syntheticLeverageFixture } from '../src/leverage/pipeline.mjs';

const config = { device_id: '00000000-0000-4000-8000-000000000001', fixture_app: 'dev.devicebridge.fixture', host: '192.0.2.10', port: 22, user: 'root', identity_file: '/etc/device-bridge/key', known_hosts: '/etc/device-bridge/known_hosts' };

async function withClient(callback) {
  const fixture = syntheticLeverageFixture();
  const dir = await mkdtemp(join(tmpdir(), 'device-bridge-leverage-mcp-'));
  const service = new LeverageService(new LeverageStore(join(dir, 'store.json')), { clock: () => Date.parse(fixture.as_of) });
  let sshCalls = 0;
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createGateway(config, { call() { sshCalls += 1; throw Error('leverage tools must not invoke device transport'); } }, { leverageService: service });
  const client = new Client({ name: 'leverage-mcp-test', version: '1' });
  await server.connect(serverSide);
  await client.connect(clientSide);
  try { await callback({ client, fixture, service, sshCalls: () => sshCalls }); } finally { await client.close(); await server.close(); }
}

test('MCP leverage vertical slice remains local and traceable', async () => {
  await withClient(async ({ client, fixture, sshCalls }) => {
    const ingest = await client.callTool({ name: 'leverage_event_ingest', arguments: { events: fixture.events, provider_id: 'synthetic' } });
    assert.equal(ingest.structuredContent.data.accepted_count, fixture.events.length);
    const goalResult = await client.callTool({ name: 'leverage_goal_create', arguments: { goal: fixture.goal } });
    const goalId = goalResult.structuredContent.data.id;
    const analysis = await client.callTool({ name: 'leverage_find', arguments: { goal_id: goalId, time_horizon: '8d', as_of: fixture.as_of } });
    assert.equal(analysis.isError, false);
    assert.ok(analysis.structuredContent.data.bottlenecks.some(item => item.type === 'pipeline_stage'));
    const candidate = analysis.structuredContent.data.opportunities.find(item => item.opportunity_key === 'career:application_throughput');
    assert.ok(candidate);
    assert.equal(candidate.action_authority, 'user_required');
    const outcome = await client.callTool({ name: 'leverage_outcome_record', arguments: { opportunity_id: candidate.id, metric_id: 'qualified_applications_per_week', value: 6, unit: 'count/week', confidence: 0.9, evidence: ['mcp-test'] } });
    assert.equal(outcome.structuredContent.data.value, 6);
    const why = await client.callTool({ name: 'leverage_why', arguments: { opportunity_id: candidate.id } });
    assert.deepEqual(why.structuredContent.data.trace.map(step => step.stage), ['observation', 'inference', 'hypothesis', 'recommendation']);
    assert.equal(why.structuredContent.data.measured_outcomes[0].metric_id, 'qualified_applications_per_week');
    assert.equal(sshCalls(), 0);
  });
});

test('privacy status is read-only and restricted collection requires explicit consent', async () => {
  await withClient(async ({ client, fixture, sshCalls }) => {
    const status = await client.callTool({ name: 'leverage_privacy_status', arguments: {} });
    assert.equal(status.structuredContent.data.restricted_consent, false);
    const rejected = await client.callTool({ name: 'leverage_privacy_update', arguments: { patch: { allowed_privacy_classes: ['PUBLIC', 'RESTRICTED'] } } });
    assert.equal(rejected.isError, true);
    assert.match(rejected.structuredContent.error.next_step, /restricted_consent/u);
    const accepted = await client.callTool({ name: 'leverage_privacy_update', arguments: { patch: { allowed_privacy_classes: ['PUBLIC', 'PERSONAL', 'RESTRICTED'], restricted_consent: true } } });
    assert.equal(accepted.isError, false);
    const event = { ...fixture.events[0], id: undefined, timestamp: '2026-09-21T22:30:00.000Z', privacy_class: 'RESTRICTED' };
    const ingest = await client.callTool({ name: 'leverage_event_ingest', arguments: { events: [event] } });
    assert.equal(ingest.structuredContent.data.accepted_count, 1);
    assert.equal(sshCalls(), 0);
  });
});
