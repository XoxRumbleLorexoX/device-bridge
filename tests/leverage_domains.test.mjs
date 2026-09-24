import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LeverageStore } from '../src/leverage/storage.mjs';
import { LeverageService } from '../src/leverage/service.mjs';
import { syntheticLeverageFixture } from '../src/leverage/pipeline.mjs';

const creativeDomain = {
  id: 'creative-example',
  async discover(context) {
    const development = context.observations.find(item => item.variable_id === 'time.work.development_hours');
    if (!development) return [];
    return [context.makeCandidate({
      key: 'protect_build_capacity',
      domain: 'creative',
      title: 'Protect one existing build block as an experiment',
      intervention_type: 'EXPERIMENT',
      goal_ids: [],
      variable: development.variable_id,
      current_value: development.value,
      proposed_value: development.value,
      expected_effect: 'Tests whether protecting an existing block reduces fragmentation without assuming more hours are better.',
      effort: 0.1,
      financial_cost: 0,
      risk: 0.05,
      time_to_impact_days: 7,
      reversibility: 1,
      confidence: development.confidence,
      strategic_value: 0.45,
      compounding_potential: 0.4,
      evidence: development.evidence,
      observation: `${development.value} development hours were observed.`,
      hypothesis: 'A protected block may reduce fragmentation, but output impact is unknown.',
      assumptions: ['Observed development time is representative enough to test scheduling, not to infer productivity.'],
      recommendation: 'Try one protected block and compare interruptions and completed tasks with baseline.',
      missing_variables: ['creative.completed_tasks_per_block'],
      alternatives: ['Keep the current schedule.', 'Batch administrative work instead.'],
    })];
  },
};

test('custom life-domain module joins the shared evidence and ranking pipeline without device access', async () => {
  const fixture = syntheticLeverageFixture();
  const dir = await mkdtemp(join(tmpdir(), 'device-bridge-domain-'));
  const service = new LeverageService(new LeverageStore(join(dir, 'store.json')), {
    clock: () => Date.parse(fixture.as_of),
    domainModules: [creativeDomain],
  });
  await service.ingest(fixture.events);
  await service.createGoal(fixture.goal);
  const result = await service.analyse({ time_horizon: '8d', as_of: fixture.as_of });
  assert.deepEqual(result.analysis.domain_modules, ['creative-example']);
  const candidate = result.opportunities.find(item => item.domain_module === 'creative-example');
  assert.ok(candidate);
  assert.equal(candidate.action_authority, 'user_required');
  assert.equal(candidate.action_state, 'recommendation_only');
  assert.equal(candidate.lever.current_value, 12);
  assert.match(candidate.ranking.explanation, /ordering only/u);
  assert.deepEqual(candidate.trace.map(step => step.stage), ['observation', 'inference', 'hypothesis', 'recommendation']);
  assert.ok(result.value_of_information.includes('creative.completed_tasks_per_block'));
});

test('invalid domain module is rejected at service construction', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'device-bridge-domain-bad-'));
  assert.throws(() => new LeverageService(new LeverageStore(join(dir, 'store.json')), { domainModules: [{ id: 'bad' }] }), /discover/u);
});
