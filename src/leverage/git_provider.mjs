import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const DAY = 24 * 60 * 60 * 1000;
const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function parseCount(pattern, text) {
  const match = pattern.exec(text);
  return match ? Number(match[1]) : 0;
}

function parseShortstat(line) {
  return {
    files_changed: parseCount(/(\d+) files? changed/u, line),
    insertions: parseCount(/(\d+) insertions?\(\+\)/u, line),
    deletions: parseCount(/(\d+) deletions?\(-\)/u, line),
  };
}

function parseWindow(value, fallbackMs) {
  if (value === undefined || value === null) return new Date(fallbackMs).toISOString();
  if (value instanceof Date && Number.isFinite(value.valueOf())) return value.toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === 'string') {
    const days = /^(\d{1,4})d$/u.exec(value);
    if (days) return new Date(fallbackMs - Number(days[1]) * DAY).toISOString();
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  throw new TypeError('Git provider time bounds must be ISO timestamps, Dates, epoch milliseconds, or an Nd horizon for since.');
}

function validateRepositories(repositories) {
  if (!Array.isArray(repositories) || repositories.length < 1 || repositories.length > 16)
    throw new TypeError('Git metadata provider requires 1 to 16 explicitly configured repositories.');
  const labels = new Set();
  return repositories.map(repository => {
    if (!repository || typeof repository.path !== 'string' || !repository.path.trim()) throw new TypeError('Each Git repository requires an explicit path.');
    if (typeof repository.label !== 'string' || !LABEL.test(repository.label)) throw new TypeError('Each Git repository requires a stable label using letters, digits, dot, underscore or hyphen.');
    if (labels.has(repository.label)) throw new TypeError(`Duplicate Git repository label: ${repository.label}`);
    labels.add(repository.label);
    return { label: repository.label, path: repository.path };
  });
}

export class GitMetadataProvider {
  constructor({ repositories, device_id = 'host', privacy_class = 'PRIVATE', git = 'git', max_commits = 500 } = {}) {
    this.id = 'git-metadata';
    this.repositories = validateRepositories(repositories);
    if (typeof device_id !== 'string' || !device_id.trim()) throw new TypeError('device_id is required.');
    if (!['PERSONAL', 'PRIVATE'].includes(privacy_class)) throw new TypeError('Git metadata provider privacy_class must be PERSONAL or PRIVATE.');
    if (typeof git !== 'string' || !git) throw new TypeError('git executable is required.');
    if (!Number.isInteger(max_commits) || max_commits < 1 || max_commits > 5000) throw new TypeError('max_commits must be an integer between 1 and 5000.');
    this.device_id = device_id;
    this.privacy_class = privacy_class;
    this.git = git;
    this.max_commits = max_commits;
  }

  describe() {
    return {
      id: this.id,
      version: 1,
      collection_mode: 'explicit_local_invocation',
      local_only: true,
      declared_privacy_classes: [this.privacy_class],
      data_exposed: ['repository label', 'commit timestamp', 'aggregate files-changed count', 'aggregate insertion count', 'aggregate deletion count', 'opaque event reference'],
      data_not_collected: ['commit message', 'author name', 'author email', 'file path', 'file contents', 'diff', 'remote URL', 'branch name', 'terminal history'],
      interpretation: 'Git change-volume metadata is behavioral evidence, not a productivity or code-quality score.',
    };
  }

  async collect({ since = '7d', until, now = Date.now(), signal } = {}) {
    const nowMs = now instanceof Date ? now.valueOf() : Number(now);
    if (!Number.isFinite(nowMs)) throw new TypeError('now must be a Date or epoch milliseconds.');
    const sinceIso = parseWindow(since, nowMs);
    const untilIso = until === undefined ? new Date(nowMs).toISOString() : parseWindow(until, nowMs);
    if (Date.parse(untilIso) < Date.parse(sinceIso)) throw new RangeError('Git provider until must not be before since.');

    const events = [];
    for (const repository of this.repositories) {
      if (events.length >= this.max_commits) break;
      const path = await realpath(repository.path);
      const info = await stat(path);
      if (!info.isDirectory()) throw new TypeError(`Configured Git path is not a directory: ${repository.label}`);
      const remaining = this.max_commits - events.length;
      const args = [
        '--no-pager', '-C', path, 'log', '--no-merges',
        `--since=${sinceIso}`, `--until=${untilIso}`, `--max-count=${remaining}`,
        '--format=@@%H%x09%cI', '--shortstat',
      ];
      let stdout;
      try {
        ({ stdout } = await execFile(this.git, args, {
          encoding: 'utf8',
          timeout: 15000,
          maxBuffer: 4 * 1024 * 1024,
          signal,
          env: { ...process.env, GIT_PAGER: 'cat', PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
        }));
      } catch (error) {
        const detail = error?.code === 'ENOENT' ? 'git executable was not found' : 'git metadata collection failed';
        throw new Error(`${detail} for repository ${repository.label}; no repository contents were ingested.`, { cause: error });
      }

      let current = null;
      const flush = () => {
        if (!current) return;
        const ref = digest(`${repository.label}:${current.commit}`).slice(0, 32);
        events.push({
          timestamp: current.timestamp,
          device_id: this.device_id,
          source: this.id,
          application: 'git',
          action_type: 'commit',
          object: repository.label,
          context: {
            repository_label: repository.label,
            files_changed: current.stats.files_changed,
            insertions: current.stats.insertions,
            deletions: current.stats.deletions,
            metric_semantics: 'change_volume_metadata_not_productivity',
          },
          duration_ms: 0,
          confidence: 1,
          privacy_class: this.privacy_class,
          raw_event_ref: `git-event:${ref}`,
        });
        current = null;
      };

      for (const rawLine of String(stdout).split(/\r?\n/u)) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('@@')) {
          flush();
          const separator = line.indexOf('\t', 2);
          if (separator < 0) throw new Error(`git emitted an unexpected metadata record for repository ${repository.label}.`);
          const commit = line.slice(2, separator);
          const timestamp = line.slice(separator + 1);
          if (!/^[0-9a-f]{40,64}$/u.test(commit) || !Number.isFinite(Date.parse(timestamp))) throw new Error(`git emitted invalid commit metadata for repository ${repository.label}.`);
          current = { commit, timestamp: new Date(timestamp).toISOString(), stats: { files_changed: 0, insertions: 0, deletions: 0 } };
        } else if (current && /files? changed|insertions?\(\+\)|deletions?\(-\)/u.test(line)) {
          current.stats = parseShortstat(line);
        }
      }
      flush();
    }
    return events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(0, this.max_commits);
  }
}
