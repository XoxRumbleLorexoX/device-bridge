import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DEFAULT_PRIVACY_POLICY } from './model.mjs';

const COLLECTIONS = ['events', 'activities', 'repetitions', 'sequences', 'frictions', 'variable_definitions', 'observations', 'goals', 'outcome_metrics', 'bottlenecks', 'opportunities', 'experiments', 'outcome_measurements', 'feedback'];

export function defaultLeverageStorePath(env = process.env) {
  return env.DEVICE_BRIDGE_LEVERAGE_STORE || join(homedir(), '.local', 'share', 'device-bridge', 'leverage-store.json');
}

export function emptyLeverageState() {
  return {
    schema_version: 1,
    privacy: structuredClone(DEFAULT_PRIVACY_POLICY),
    events: [],
    activities: [],
    repetitions: [],
    sequences: [],
    frictions: [],
    variable_definitions: [],
    observations: [],
    goals: [],
    outcome_metrics: [],
    bottlenecks: [],
    causal_graph: { nodes: [], edges: [] },
    opportunities: [],
    experiments: [],
    outcome_measurements: [],
    feedback: [],
    analysis_meta: null,
  };
}

function normalizeState(value) {
  if (!value || value.schema_version !== 1) throw new Error('Unsupported or corrupt leverage store schema.');
  for (const key of COLLECTIONS) {
    if (value[key] === undefined) value[key] = [];
    if (!Array.isArray(value[key])) throw new Error(`Corrupt leverage store collection: ${key}`);
  }
  if (!value.privacy || !value.causal_graph) throw new Error('Corrupt leverage store metadata.');
  return value;
}

export class LeverageStore {
  constructor(path = defaultLeverageStorePath()) {
    this.path = path;
    this.queue = Promise.resolve();
  }

  async load() {
    try {
      const raw = await readFile(this.path, 'utf8');
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyLeverageState();
      throw error;
    }
  }

  async save(state) {
    normalizeState(state);
    const directory = dirname(this.path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700).catch(() => {});
    const temp = join(directory, `.${randomUUID()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await chmod(temp, 0o600);
      await rename(temp, this.path);
      await chmod(this.path, 0o600);
    } finally {
      await rm(temp, { force: true }).catch(() => {});
    }
  }

  async read() {
    await this.queue.catch(() => {});
    return this.load();
  }

  transaction(mutator) {
    const operation = this.queue.then(async () => {
      const state = await this.load();
      const result = await mutator(state);
      await this.save(state);
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
