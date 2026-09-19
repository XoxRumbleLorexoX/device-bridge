import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { z } from 'zod';

export class BridgeError extends Error {
  constructor(code, stage, next_step) { super(code); Object.assign(this, { code, stage, next_step }); }
}
export const Config = z.object({
  version: z.literal(1), device_id: z.string().uuid(), principal: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  operator_uid: z.number().int().nonnegative(), host: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.:-]{0,252}$/),
  port: z.number().int().min(1).max(65535), user: z.string().regex(/^[a-z_][a-z0-9_-]{0,31}$/),
  known_hosts: z.string(), identity_file: z.string(), credential_file: z.string(),
  fixture_app: z.literal('dev.devicebridge.fixture'),
}).strict();

export function protectedPath(path, { uid = 0, privateFile = true, workspace = resolve(import.meta.dirname ?? new URL('..', import.meta.url).pathname, '..') } = {}) {
  if (!isAbsolute(path)) throw new BridgeError('PERMISSION_DENIED', 'configuration', 'Use absolute owner-controlled paths.');
  const real = realpathSync(path);
  const info = lstatSync(path);
  if (real === workspace || real.startsWith(workspace + sep) || info.isSymbolicLink() || !info.isFile() || info.uid !== uid || (info.mode & (privateFile ? 0o077 : 0o022)))
    throw new BridgeError('PERMISSION_DENIED', 'configuration', 'Use an owner-controlled regular file outside the editable workspace.');
  // Every parent must be protected from replacement by the agent account.
  let parent = resolve(real, '..');
  while (parent !== '/') {
    const st = lstatSync(parent);
    if (st.uid !== 0 || (st.mode & 0o022)) throw new BridgeError('PERMISSION_DENIED', 'configuration', 'Use a root-owned configuration directory with protected parents.');
    parent = resolve(parent, '..');
  }
  return path;
}

export function loadConfig(path) {
  protectedPath(path, { privateFile: false });
  const config = Config.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (config.operator_uid !== process.getuid()) throw new BridgeError('PERMISSION_DENIED', 'operator', 'Run the gateway under the paired operator OS account.');
  protectedPath(config.known_hosts, { privateFile: false });
  // Runtime credentials are readable by the dedicated gateway account, never agent-editable policy.
  for (const p of [config.identity_file, config.credential_file]) protectedPath(p, { uid: config.operator_uid });
  const credential = readFileSync(config.credential_file, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(credential)) throw new BridgeError('PERMISSION_DENIED', 'credential', 'Owner must provision a 32-byte random device credential.');
  return { ...config, credential };
}

export function sshArgs(config) {
  return ['-F', '/dev/null', '-T', '-p', String(config.port), '-i', config.identity_file,
    '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none',
    '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${config.known_hosts}`,
    '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'ConnectTimeout=5',
    '-o', 'ServerAliveInterval=3', '-o', 'ServerAliveCountMax=1',
    '-o', 'ClearAllForwardings=yes', '-o', 'PermitLocalCommand=no',
    '-o', 'ControlMaster=no', '-o', 'ControlPath=none', '-o', 'ProxyCommand=none',
    `${config.user}@${config.host}`, 'bridge-v1'];
}

export class SSHTransport {
  constructor(config, { spawnProcess = spawn } = {}) {
    this.config = config;
    this.spawnProcess = spawnProcess;
  }

  async call(envelope, signal) {
    // An already cancelled request must not start a process or send any bytes.
    if (signal?.aborted) throw new BridgeError('CANCELLED', 'gateway', 'No request was sent.');
    const now = Date.now() / 1000;
    if (!Number.isFinite(envelope.deadline) || envelope.deadline <= now || envelope.deadline > now + 30)
      throw new BridgeError('DEADLINE_EXCEEDED', 'gateway', 'Use a fresh deadline within 30 seconds. No request was sent.');
    try {
      return await this.exchange(envelope, signal);
    } catch (error) {
      if (envelope.method !== 'act' || !envelope.session_id) throw error;
      // Never replay an uncertain mutation. Cancel its session over a separate
      // authenticated connection and await that bounded result before returning.
      // This does not recall an atomic event that has already been dispatched.
      const cancellation = {
        method: 'cancel', session_id: envelope.session_id,
        request_id: randomUUID(), deadline: Date.now() / 1000 + 6,
      };
      let stopped = false;
      try {
        const result = await this.exchange(cancellation);
        stopped = result.status === 'ok' && result.data?.state === 'stopped';
      } catch { /* The original action remains uncertain; there is no retry. */ }
      throw new BridgeError('OUTCOME_UNKNOWN', 'transport', stopped
        ? 'Session cancellation acknowledged. The action may already have executed; inspect its request ID and device state before any new action.'
        : 'Session cancellation could not be confirmed. Use independent owner stop or wait for lease expiry. Do not repeat the action; inspect its request ID after reconnecting.');
    }
  }

  async exchange(envelope, signal) {
    const config = this.config;
    const request = { ...envelope, version: 1, audience: 'device-bridge/helper/v1',
      principal: config.principal, device_id: config.device_id, credential: config.credential };
    return new Promise((resolveResult, reject) => {
      const chunks = []; let bytes = 0; let done = false; let child; let timer;
      const mutation = envelope.method === 'act';
      const uncertain = () => new BridgeError(mutation ? 'OUTCOME_UNKNOWN' : 'DEVICE_OFFLINE', 'transport', mutation
        ? 'Do not resend. Inspect state and query this request ID after reconnecting.'
        : 'Check SSH reachability, host-key pin, forced-command key, and helper runtime.');
      const finish = (error, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (error) { child?.kill('SIGKILL'); reject(error); } else resolveResult(value);
      };
      const abort = () => finish(uncertain());
      if (signal?.aborted) return finish(new BridgeError('CANCELLED', 'gateway', 'No request was sent.'));
      try {
        child = this.spawnProcess('/usr/bin/ssh', sshArgs(config), { stdio: ['pipe', 'pipe', 'pipe'] });
      } catch { return finish(uncertain()); }
      timer = setTimeout(abort, Math.max(1, request.deadline * 1000 - Date.now()));
      child.on('error', () => finish(uncertain()));
      child.stderr.resume(); // Never forward remote banners, content, or credentials.
      child.stdout.on('data', chunk => {
        if (done) return;
        bytes += chunk.length;
        if (bytes > 21 * 1024 * 1024) finish(uncertain()); else chunks.push(chunk);
      });
      child.on('close', code => {
        if (done) return;
        if (code !== 0) return finish(uncertain());
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (result.device_id !== config.device_id || result.request_id !== envelope.request_id || !['ok', 'error'].includes(result.status)) throw Error();
          finish(null, result);
        } catch { finish(uncertain()); }
      });
      child.stdin.on('error', () => finish(uncertain()));
      signal?.addEventListener('abort', abort, { once: true });
      // Close the registration race without writing after cancellation.
      if (signal?.aborted) return abort();
      child.stdin.end(JSON.stringify(request) + '\n');
    });
  }
}
