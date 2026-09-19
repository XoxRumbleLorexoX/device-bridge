import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { SSHTransport } from '../src/transport.mjs';

// Test-only process double: production framing/cancellation, no real phone.
const config = { device_id: randomUUID(), principal: 'test', credential: 'a'.repeat(64),
  host: '192.0.2.10', port: 22, user: 'root', identity_file: '/unused/key', known_hosts: '/unused/hosts' };
const mutation = () => ({ method: 'act', request_id: randomUUID(), session_id: randomUUID(),
  deadline: Date.now() / 1000 + 20, action: { kind: 'insert_text', text: 'once' } });
function processDouble(onRequest, onSpawn = () => {}) {
  const requests = []; const children = [];
  const spawnProcess = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', null)); return true; };
    let bytes = '';
    child.stdin = new Writable({ write(chunk, _encoding, callback) { bytes += chunk; callback(); },
      final(callback) {
        const req = JSON.parse(bytes); requests.push(req);
        queueMicrotask(() => onRequest(req, child)); callback();
      } });
    children.push(child); onSpawn(child);
    return child;
  };
  return { spawnProcess, requests, children };
}
function reply(child, req, data = { state: 'stopped' }) {
  child.stdout.write(JSON.stringify({ status: 'ok', device_id: config.device_id, request_id: req.request_id, data }));
  child.emit('close', 0);
}

test('pre-aborted mutation starts no SSH process and sends no input', async () => {
  const controller = new AbortController(); controller.abort();
  const fake = processDouble(() => assert.fail('must not send'));
  await assert.rejects(new SSHTransport(config, fake).call(mutation(), controller.signal), { code: 'CANCELLED' });
  assert.equal(fake.children.length, 0);
});

test('invalid deadlines start no SSH process', async () => {
  const fake = processDouble(() => assert.fail('must not send'));
  const transport = new SSHTransport(config, fake);
  for (const deadline of [NaN, Infinity, 0, Date.now() / 1000 + 60])
    await assert.rejects(transport.call({ ...mutation(), deadline }), { code: 'DEADLINE_EXCEEDED' });
  assert.equal(fake.children.length, 0);
});

test('abort during spawn does not write the mutation and still revokes its session', async () => {
  const controller = new AbortController();
  const fake = processDouble((req, child) => reply(child, req), () => controller.abort());
  await assert.rejects(new SSHTransport(config, fake).call(mutation(), controller.signal), { code: 'OUTCOME_UNKNOWN' });
  assert.deepEqual(fake.requests.map(r => r.method), ['cancel']);
});

test('in-flight abort awaits separate authenticated cancellation and never resends input', async () => {
  const controller = new AbortController();
  let acknowledge; let cancelled;
  const cancellationArrived = new Promise(resolve => { cancelled = resolve; });
  const fake = processDouble((req, child) => {
    if (req.method === 'act') controller.abort();
    else { acknowledge = () => reply(child, req); cancelled(); }
  });
  const req = mutation(); let settled = false;
  const result = new SSHTransport(config, fake).call(req, controller.signal).catch(error => { settled = true; return error; });
  await cancellationArrived;
  assert.equal(settled, false, 'do not detach cancellation work');
  assert.equal(fake.children[0].killed, true);
  acknowledge();
  const error = await result;
  assert.equal(error.code, 'OUTCOME_UNKNOWN');
  assert.match(error.next_step, /cancellation acknowledged/);
  assert.deepEqual(fake.requests.map(r => r.method), ['act', 'cancel']);
  const cancel = fake.requests[1];
  assert.equal(cancel.session_id, req.session_id);
  assert.notEqual(cancel.request_id, req.request_id);
  assert.equal(cancel.audience, 'device-bridge/helper/v1');
  assert.equal(cancel.credential, config.credential);
  assert.ok(cancel.deadline <= Date.now() / 1000 + 6);
  assert.equal(cancel.action, undefined);
});

test('lost acknowledgement and failed cancellation remain explicitly uncertain', async () => {
  const fake = processDouble((_req, child) => child.emit('close', 255));
  const error = await new SSHTransport(config, fake).call(mutation()).catch(e => e);
  assert.equal(error.code, 'OUTCOME_UNKNOWN');
  assert.match(error.next_step, /could not be confirmed/);
  assert.deepEqual(fake.requests.map(r => r.method), ['act', 'cancel']);
});

test('deadline timeout cancels the session without replay', async () => {
  const fake = processDouble((req, child) => { if (req.method === 'cancel') reply(child, req); });
  const error = await new SSHTransport(config, fake).call({ ...mutation(), deadline: Date.now() / 1000 + 0.05 }).catch(e => e);
  assert.equal(error.code, 'OUTCOME_UNKNOWN');
  assert.deepEqual(fake.requests.map(r => r.method), ['act', 'cancel']);
});

test('valid mutation acknowledgement requires no cancellation or retry', async () => {
  const fake = processDouble((req, child) => reply(child, req, { status: 'verified' }));
  const result = await new SSHTransport(config, fake).call(mutation());
  assert.equal(result.data.status, 'verified');
  assert.deepEqual(fake.requests.map(r => r.method), ['act']);
});

test('wrong response identity does not become a successful mutation', async () => {
  const fake = processDouble((req, child) => {
    if (req.method === 'cancel') return reply(child, req);
    child.stdout.write(JSON.stringify({ status: 'ok', device_id: 'wrong', request_id: req.request_id }));
    child.emit('close', 0);
  });
  await assert.rejects(new SSHTransport(config, fake).call(mutation()), { code: 'OUTCOME_UNKNOWN' });
  assert.deepEqual(fake.requests.map(r => r.method), ['act', 'cancel']);
});

test('a read failure does not cancel the writer session', async () => {
  const fake = processDouble((_req, child) => child.emit('close', 255));
  await assert.rejects(new SSHTransport(config, fake).call({ ...mutation(), method: 'observe' }), { code: 'DEVICE_OFFLINE' });
  assert.deepEqual(fake.requests.map(r => r.method), ['observe']);
});
