import test from 'node:test';
import assert from 'node:assert/strict';
import { leverageTools } from '../src/gateway.mjs';

test('real provider source collection is not an MCP capability', () => {
  const names = Object.keys(leverageTools);
  assert.equal(names.some(name => /git|repo|calendar|ics|filesystem|source_discovery|collect_/u.test(name)), false);
  assert.ok(names.includes('leverage_event_ingest'));
  assert.ok(names.includes('leverage_find'));
});
