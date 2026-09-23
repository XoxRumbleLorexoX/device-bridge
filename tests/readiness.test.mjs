import test from 'node:test';
import assert from 'node:assert/strict';
import { gates, readinessReport } from '../src/readiness.mjs';

test('readiness is fail-closed while hardware gate B is open', () => {
  const report = readinessReport();
  assert.equal(report.complete, false);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.next_gate, 'B');
  assert.equal(gates.B.state, 'hardware_required');
  assert.notEqual(gates.C.state, 'verified');
  assert.match(report.next_action, /package-candidate\.sh/);
  assert.match(report.invariant, /package or simulated success never upgrades a hardware gate/);
});

test('readiness exposes every acceptance gate exactly once', () => {
  assert.deepEqual(readinessReport().gates.map(({ gate }) => gate), ['A', 'B', 'C', 'D', 'E']);
});
