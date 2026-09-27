import test from 'node:test';
import assert from 'node:assert/strict';
import { leverageTools } from '../src/gateway.mjs';

test('Git repository collection is not an MCP capability', () => {
  const names = Object.keys(leverageTools);
  assert.equal(names.some(name => /git|repo|filesystem|source_discovery/u.test(name)), false);
  assert.ok(names.includes('leverage_event_ingest'));
  assert.ok(names.includes('leverage_find'));
});
