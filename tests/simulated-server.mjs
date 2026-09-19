// Test-only transport; production CLI never accepts a simulator backend.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createGateway } from '../src/gateway.mjs';
const state = process.argv[2];
const policy = JSON.parse(readFileSync(state + '/policy.json'));
const config = { device_id: policy.device_id, fixture_app: 'dev.devicebridge.fixture' };
const server = createGateway(config, { async call(request) {
  return await new Promise((resolve, reject) => {
    const process = spawn('python3', [fileURLToPath(new URL('./helper_driver.py', import.meta.url)), state], { stdio: ['pipe', 'pipe', 'inherit'] });
    const chunks = [];
    process.stdout.on('data', x => chunks.push(x));
    process.on('error', reject);
    process.on('close', code => { try { if (code) throw Error('helper failed'); resolve(JSON.parse(Buffer.concat(chunks))); } catch (e) { reject(e); } });
    process.stdin.end(JSON.stringify({ ...request, version: 1, audience: 'device-bridge/helper/v1', principal: 'test', credential: 'a'.repeat(64) }));
  });
} });
await server.connect(new StdioServerTransport());
