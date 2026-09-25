import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectFriction, detectRepeatedSequences, discoverFrictionCandidates, extractFrictionVariables } from '../src/leverage/friction.mjs';
import { LeverageStore, emptyLeverageState } from '../src/leverage/storage.mjs';
import { LeverageService } from '../src/leverage/service.mjs';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const base = Date.parse('2026-09-01T09:00:00.000Z');

function event(index, offsetMs, { app, action, object, duration = 2 * MINUTE, confidence = 0.9, privacy = 'PERSONAL', context = {} }) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    timestamp: new Date(base + offsetMs).toISOString(),
    device_id: 'fixture-device',
    source: 'fixture',
    application: app,
    action_type: action,
    object,
    context,
    duration_ms: duration,
    confidence,
    privacy_class: privacy,
  };
}

function repeatedSequenceEvents({ privacy = 'PERSONAL' } = {}) {
  const events = [];
  let id = 1;
  for (let occurrence = 0; occurrence < 4; occurrence += 1) {
    const start = occurrence * 24 * HOUR;
    events.push(event(id++, start, { app: 'Browser', action: 'filter_search', object: `role-${occurrence}`, privacy, context: { workflow_step: 'filter roles' } }));
    events.push(event(id++, start + 3 * MINUTE, { app: 'PDF', action: 'document_open', object: `cv-${occurrence}`, privacy, context: { workflow_step: 'check CV' } }));
    events.push(event(id++, start + 6 * MINUTE, { app: 'Browser', action: 'form_fill', object: `application-${occurrence}`, privacy, context: { workflow_step: 'prepare application' } }));
  }
  return events;
}

test('multi-step workflow mining finds repeated non-overlapping sequence and suppresses redundant subsequences', () => {
  const sequences = detectRepeatedSequences(repeatedSequenceEvents());
  const threeStep = sequences.find(item => item.length === 3);
  assert.ok(threeStep);
  assert.equal(threeStep.executions, 4);
  assert.equal(threeStep.steps.length, 3);
  assert.match(threeStep.signature, /Browser:filter_search:filter roles/u);
  assert.match(threeStep.signature, /PDF:document_open:check CV/u);
  assert.match(threeStep.signature, /Browser:form_fill:prepare application/u);
  assert.ok(threeStep.annualized_hours > 10);
  assert.equal(sequences.some(item => item.length === 2 && item.executions === 4 && item.steps.every(step => threeStep.steps.includes(step))), false);
});

test('sequence mining never bridges session gaps and lowers feasibility for restricted data', () => {
  const events = repeatedSequenceEvents({ privacy: 'RESTRICTED' });
  const restricted = detectRepeatedSequences(events).find(item => item.length === 3);
  assert.ok(restricted);
  assert.ok(restricted.automation_feasibility < 0.6);

  const broken = [...events];
  broken[1] = { ...broken[1], timestamp: new Date(base + 45 * MINUTE).toISOString() };
  broken[2] = { ...broken[2], timestamp: new Date(base + 48 * MINUTE).toISOString() };
  const sequences = detectRepeatedSequences(broken);
  assert.ok(!sequences.some(item => item.length === 3 && item.executions === 4));
});

test('friction signals detect app bounce-backs, retry loops and repeated searches without claiming failure', () => {
  const events = [];
  let id = 100;
  for (let i = 0; i < 3; i += 1) {
    const start = i * 30 * MINUTE;
    events.push(event(id++, start, { app: 'Editor', action: 'code_edit', object: 'task' }));
    events.push(event(id++, start + 2 * MINUTE, { app: 'Browser', action: 'lookup', object: 'docs' }));
    events.push(event(id++, start + 4 * MINUTE, { app: 'Editor', action: 'code_edit', object: 'task' }));
  }
  for (let i = 0; i < 4; i += 1) events.push(event(id++, 3 * HOUR + i * 3 * MINUTE, { app: 'Portal', action: 'submit_form', object: 'same-record', duration: MINUTE }));
  for (let i = 0; i < 3; i += 1) events.push(event(id++, 6 * HOUR + i * HOUR, { app: 'Browser', action: 'search', object: 'secret raw query text', duration: 2 * MINUTE, context: { query_hash: 'sha256:opaque' } }));

  const frictions = detectFriction(events);
  const switching = frictions.find(item => item.type === 'context_switching');
  assert.ok(switching);
  assert.ok(switching.metrics.bouncebacks >= 2);
  assert.ok(switching.alternatives.some(value => /legitimately/u.test(value)));

  const retry = frictions.find(item => item.type === 'retry_loop' && item.statement.includes('repeated attempts'));
  assert.ok(retry);
  assert.ok(retry.metrics.repeated_attempts >= 3);
  assert.match(retry.assumptions[0], /signal, not proof/u);

  const search = frictions.find(item => item.type === 'repeated_search');
  assert.ok(search);
  assert.equal(search.statement.includes('secret raw query text'), false);
  assert.match(search.assumptions[0], /without exposing raw query text/u);
});

test('friction variables and candidates expose evidence and do not assert guaranteed gains', () => {
  const events = repeatedSequenceEvents();
  const sequences = detectRepeatedSequences(events);
  const frictions = detectFriction(events, sequences);
  const model = extractFrictionVariables(frictions, sequences, '2026-09-08T00:00:00.000Z');
  const sequence = sequences.find(item => item.length === 3);
  assert.ok(model.observations.some(item => item.variable_id === `sequence.${sequence.id}.weekly_hours`));
  const candidates = discoverFrictionCandidates({ goals: [{ id: 'goal-1', provenance: 'explicit', confirmation_status: 'confirmed' }], frictions, sequences });
  const candidate = candidates.find(item => item.opportunity_key === `domain:friction:sequence:${sequence.id}`);
  assert.ok(candidate);
  assert.match(candidate.expected_effect, /if the measured sequence remains recurrent/u);
  assert.match(candidate.trace.find(step => step.stage === 'hypothesis').claim, /may remove/u);
  assert.ok(candidate.assumptions.length >= 2);
});

test('service persists sequences/frictions and routes them through ranking and human authority', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'device-bridge-friction-service-'));
  const clock = Date.parse('2026-09-08T00:00:00.000Z');
  const store = new LeverageStore(join(directory, 'store.json'));
  const service = new LeverageService(store, { clock: () => clock });
  await service.ingest(repeatedSequenceEvents());
  const goal = await service.createGoal({ description: 'Reduce repetitive work', domain: 'productivity', objective_variables: ['free_time'], priority: 0.8 });
  const result = await service.analyse({ goal_id: goal.id, time_horizon: '8d', as_of: '2026-09-08T00:00:00.000Z' });
  assert.ok(result.sequences.some(item => item.length === 3));
  assert.ok(result.frictions.some(item => item.type === 'repeated_sequence'));
  assert.ok(result.bottlenecks.some(item => item.type === 'repeated_multi_step_work'));
  const candidate = result.opportunities.find(item => item.domain_module === 'friction' && item.intervention_type === 'AUTOMATION');
  assert.ok(candidate);
  assert.equal(candidate.action_authority, 'user_required');
  assert.equal(candidate.action_state, 'recommendation_only');
  assert.equal(candidate.opportunity_cost.ranking, 'not_ranked');
  const why = await service.why(candidate.id);
  assert.deepEqual(why.trace.map(step => step.stage), ['observation', 'inference', 'hypothesis', 'recommendation']);

  const state = await store.read();
  assert.ok(state.sequences.length > 0);
  assert.ok(state.frictions.length > 0);
});

test('schema-v1 stores created before friction collections are backfilled without discarding existing state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'device-bridge-friction-migrate-'));
  const path = join(directory, 'store.json');
  const state = emptyLeverageState();
  state.events.push(event(999, 0, { app: 'Editor', action: 'code_edit', object: 'keep-me' }));
  delete state.sequences;
  delete state.frictions;
  await writeFile(path, JSON.stringify(state));
  const loaded = await new LeverageStore(path).load();
  assert.deepEqual(loaded.sequences, []);
  assert.deepEqual(loaded.frictions, []);
  assert.equal(loaded.events[0].object, 'keep-me');
});
