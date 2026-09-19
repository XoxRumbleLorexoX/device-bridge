import { createHash } from 'node:crypto';

// A scan supplies an untrusted key, never identity verification by itself.
export function verifyHostKey(scan, { host, port = '22', keyType = 'ed25519', fingerprint }) {
  if (!['ed25519', 'ecdsa'].includes(keyType)) throw Error('Unsupported host key algorithm.');
  const lines = scan.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (lines.length !== 1) throw Error('Expected exactly one host key; no key accepted.');
  const fields = lines[0].split(/\s+/);
  const endpoint = Number(port) === 22 ? host : `[${host}]:${Number(port)}`;
  if (fields.length !== 3 || fields[0] !== endpoint) throw Error('Unexpected host key endpoint or fields.');
  const algorithm = fields[1];
  if (keyType === 'ed25519' ? algorithm !== 'ssh-ed25519' : !/^ecdsa-sha2-nistp(256|384|521)$/.test(algorithm))
    throw Error('Host key algorithm differs from the explicit selection.');
  const encoded = fields[2];
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw Error('Malformed public host key.');
  const blob = Buffer.from(encoded, 'base64');
  if (blob.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '') || blob.length < 4)
    throw Error('Malformed public host key.');
  const length = blob.readUInt32BE(0);
  if (length !== Buffer.byteLength(algorithm) || blob.length <= 4 + length || blob.subarray(4, 4 + length).toString() !== algorithm)
    throw Error('Public key blob does not match advertised algorithm.');
  const actual = 'SHA256:' + createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
  if (actual !== fingerprint) throw Error('Host key does not match owner-verified fingerprint. No key accepted.');
  return { line: `${endpoint} ${algorithm} ${encoded}`, fingerprint: actual, algorithm };
}
