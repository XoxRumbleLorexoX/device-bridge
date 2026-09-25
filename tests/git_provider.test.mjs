import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { GitMetadataProvider } from '../src/leverage/git_provider.mjs';
import { collectProvider } from '../src/leverage/providers.mjs';
import { LeverageService } from '../src/leverage/service.mjs';
import { LeverageStore } from '../src/leverage/storage.mjs';

const execFile = promisify(execFileCallback);

async function git(repository, args, env = {}) {
  return execFile('git', ['-C', repository, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

async function repositoryFixture() {
  const root = await mkdtemp(join(tmpdir(), 'device-bridge-git-provider-'));
  const repository = join(root, 'repo');
  await mkdir(repository);
  await execFile('git', ['init', '-q', repository]);
  await git(repository, ['config', 'user.name', 'Secret Author']);
  await git(repository, ['config', 'user.email', 'secret-author@example.invalid']);

  await writeFile(join(repository, 'private-client-name.txt'), 'alpha\n');
  await git(repository, ['add', '.']);
  await git(repository, ['commit', '-q', '-m', 'SECRET customer migration details'], { GIT_AUTHOR_DATE: '2026-09-20T10:00:00Z', GIT_COMMITTER_DATE: '2026-09-20T10:00:00Z' });

  await writeFile(join(repository, 'private-client-name.txt'), 'alpha\nbeta\ngamma\n');
  await writeFile(join(repository, 'another-sensitive-filename.txt'), 'one\ntwo\n');
  await git(repository, ['add', '.']);
  await git(repository, ['commit', '-q', '-m', 'SECRET unreleased feature codename'], { GIT_AUTHOR_DATE: '2026-09-22T11:30:00Z', GIT_COMMITTER_DATE: '2026-09-22T11:30:00Z' });
  return { root, repository };
}

const forbiddenValues = ['SECRET', 'Secret Author', 'secret-author@example.invalid', 'private-client-name.txt', 'another-sensitive-filename.txt', 'customer migration', 'unreleased feature'];

function assertNoSensitiveFixtureText(serialized) {
  for (const forbidden of forbiddenValues) assert.equal(serialized.includes(forbidden), false, `provider leaked ${forbidden}`);
}

test('Git metadata provider collects bounded aggregate commit metadata without source-sensitive fields', async () => {
  const { repository } = await repositoryFixture();
  const provider = new GitMetadataProvider({ repositories: [{ label: 'work-project', path: repository }] });
  const events = await collectProvider(provider, { since: '10d', now: Date.parse('2026-09-25T12:00:00Z') });
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => event.action_type), ['commit', 'commit']);
  assert.ok(events.every(event => event.object === 'work-project'));
  assert.ok(events.every(event => event.privacy_class === 'PRIVATE'));
  assert.ok(events.every(event => event.context.metric_semantics === 'change_volume_metadata_not_productivity'));
  assert.ok(events.some(event => event.context.files_changed === 2));
  assert.ok(events.some(event => event.context.insertions >= 4));

  const serialized = JSON.stringify(events);
  assertNoSensitiveFixtureText(serialized);
  assert.ok(events.every(event => /^git-event:[0-9a-f]{32}$/u.test(event.raw_event_ref)));
  const { stdout } = await git(repository, ['rev-parse', 'HEAD']);
  assert.equal(serialized.includes(stdout.trim()), false);
});

test('provider manifest declares collection scope and data it refuses to collect', async () => {
  const { repository } = await repositoryFixture();
  const provider = new GitMetadataProvider({ repositories: [{ label: 'project', path: repository }] });
  const manifest = provider.describe();
  assert.equal(manifest.collection_mode, 'explicit_local_invocation');
  assert.equal(manifest.local_only, true);
  assert.ok(manifest.data_exposed.includes('aggregate insertion count'));
  assert.ok(manifest.data_not_collected.includes('commit message'));
  assert.ok(manifest.data_not_collected.includes('file contents'));
  assert.match(manifest.interpretation, /not a productivity/u);
});

test('configured repository set is explicit, bounded and fail-closed', async () => {
  await assert.rejects(async () => new GitMetadataProvider({ repositories: [] }), /1 to 16/u);
  await assert.rejects(async () => new GitMetadataProvider({ repositories: [{ label: 'bad label', path: '/tmp' }] }), /stable label/u);
  const provider = new GitMetadataProvider({ repositories: [{ label: 'missing', path: join(tmpdir(), 'definitely-missing-device-bridge-repo') }] });
  await assert.rejects(() => provider.collect({ now: Date.parse('2026-09-25T12:00:00Z') }), /ENOENT|no such file|realpath/iu);
});

test('Git events enter the normal privacy/store pipeline only after explicit collection', async () => {
  const { root, repository } = await repositoryFixture();
  const provider = new GitMetadataProvider({ repositories: [{ label: 'project', path: repository }] });
  const events = await collectProvider(provider, { since: '10d', now: Date.parse('2026-09-25T12:00:00Z') });
  const store = new LeverageStore(join(root, 'leverage-store.json'));
  const service = new LeverageService(store, { clock: () => Date.parse('2026-09-25T12:00:00Z') });
  const before = await store.read();
  assert.equal(before.events.length, 0);
  const result = await service.ingest(events, { provider_id: provider.id });
  assert.equal(result.accepted_count, 2);
  const state = await store.read();
  assert.equal(state.events.length, 2);
  assert.ok(state.events.every(event => event.source === 'git-metadata'));
});

test('collect-git CLI is explicit, persists only minimized events and does not print commit details', async () => {
  const { root, repository } = await repositoryFixture();
  const storePath = join(root, 'cli-leverage.json');
  const { stdout, stderr } = await execFile(process.execPath, [
    join(process.cwd(), 'src', 'cli.mjs'), 'leverage', 'collect-git',
    '--repo', repository, '--label', 'cli-project', '--since', '10d', '--store', storePath,
  ], { encoding: 'utf8', timeout: 15000 });
  assert.equal(stderr, '');
  const result = JSON.parse(stdout);
  assert.equal(result.provider.collection_mode, 'explicit_local_invocation');
  assert.equal(result.collected_count, 2);
  assert.equal(result.ingestion.accepted_count, 2);
  assertNoSensitiveFixtureText(stdout);

  const state = await new LeverageStore(storePath).read();
  assert.equal(state.events.length, 2);
  assertNoSensitiveFixtureText(JSON.stringify(state.events));
});
