import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('leverage demo executes the complete synthetic vertical slice without persistence', () => {
  const result = spawnSync(process.execPath, ['src/cli.mjs', 'leverage', 'demo'], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.synthetic, true);
  assert.equal(output.persisted, false);
  const values = new Map(output.variables.map(item => [item.variable_id, item.value]));
  assert.equal(values.get('time.career.job_discovery_hours'), 5.3);
  assert.equal(values.get('actions.application_submitted_count'), 2);
  assert.ok(output.bottlenecks.some(item => item.type === 'pipeline_stage'));
  assert.ok(output.opportunities.some(item => item.opportunity_key === 'career:application_throughput'));
  assert.ok(output.insights.some(item => item.domain === 'career'));
  assert.ok(output.value_of_information.includes('career.application_to_interview_conversion'));
  assert.match(output.weekly_review, /WEEKLY LEVERAGE REVIEW/u);
});
