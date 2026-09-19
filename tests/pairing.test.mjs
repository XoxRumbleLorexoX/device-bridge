import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyHostKey } from '../src/pairing.mjs';

// Synthetic wire payloads test parsing/pinning, not SSH signature validation.
function scanned(algorithm, host = 'test-device') {
  const length = Buffer.alloc(4); length.writeUInt32BE(Buffer.byteLength(algorithm));
  const blob = Buffer.concat([length, Buffer.from(algorithm), Buffer.alloc(32, 7)]);
  return { scan: `${host} ${algorithm} ${blob.toString('base64')}\n`,
    fingerprint: 'SHA256:' + createHash('sha256').update(blob).digest('base64').replace(/=+$/, '') };
}
test('default ED25519 and explicitly selected ECDSA pin only matching fingerprints', () => {
  for (const [keyType, algorithm] of [['ed25519', 'ssh-ed25519'], ['ecdsa', 'ecdsa-sha2-nistp256']]) {
    const { scan, fingerprint } = scanned(algorithm);
    assert.equal(verifyHostKey(scan, { host: 'test-device', keyType, fingerprint }).algorithm, algorithm);
    assert.throws(() => verifyHostKey(scan, { host: 'test-device', keyType, fingerprint: 'SHA256:wrong' }));
  }
});
test('algorithm choice never falls back and mismatched wire labels fail', () => {
  const { scan, fingerprint } = scanned('ecdsa-sha2-nistp256');
  assert.throws(() => verifyHostKey(scan, { host: 'test-device', fingerprint }));
  assert.throws(() => verifyHostKey(scan.replace('ecdsa-sha2-nistp256', 'ssh-ed25519'), { host: 'test-device', fingerprint }));
});
test('ambiguous keys and unexpected endpoints are rejected', () => {
  const { scan, fingerprint } = scanned('ssh-ed25519');
  assert.throws(() => verifyHostKey(scan + scan, { host: 'test-device', fingerprint }));
  assert.throws(() => verifyHostKey(scan, { host: 'different-device', fingerprint }));
  assert.throws(() => verifyHostKey(scan, { host: 'test-device', port: 2222, fingerprint }));
});
test('nondefault port and comments are handled without broad host trust', () => {
  const { scan, fingerprint } = scanned('ssh-ed25519', '[test-device]:2222');
  assert.equal(verifyHostKey('# banner\n' + scan, { host: 'test-device', port: 2222, fingerprint }).line, scan.trim());
});
test('malformed or truncated key bytes are rejected', () => {
  for (const key of ['@@@@', 'AAAA', '/////w==']) {
    assert.throws(() => verifyHostKey(`test-device ssh-ed25519 ${key}`, { host: 'test-device', fingerprint: 'SHA256:x' }));
  }
});
