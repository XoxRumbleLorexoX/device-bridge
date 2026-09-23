#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { verifyHostKey } from './pairing.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, SSHTransport } from './transport.mjs';
import { serve, envelope } from './gateway.mjs';
import { readinessReport } from './readiness.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const command = argv.shift();
function option(name, fallback) { const at = argv.indexOf('--' + name); return at < 0 ? fallback : argv[at + 1]; }
function print(value) { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
function version(program, args = ['--version']) {
  const result = spawnSync(program, args, { encoding: 'utf8', timeout: 8000 });
  return result.status === 0 ? (result.stdout || result.stderr).trim().split('\n')[0] : 'unavailable';
}
function doctor() {
  const commands = { node: process.version, codex: version('codex'), python: version('python3'), ssh: version('ssh', ['-V']),
    ios_sdk: version('xcrun', ['--sdk', 'iphoneos', '--show-sdk-path']), go: version('go', ['version']), tailscale: version('tailscale', ['version']) };
  print({ state: 'reduced_capability', host: commands, theos: !!process.env.THEOS && existsSync(resolve(process.env.THEOS, 'makefiles/common.mk')),
    device: 'unverified: use pair with a locally verified host key, then status',
    next_steps: ['Install a supported Xcode/iPhoneOS SDK and Theos for native builds.', 'Read docs/SETUP.md before provisioning the restricted helper.', 'No package installs or configuration changes are performed by doctor.'] });
}
try {
  if (command === 'doctor' || command === 'setup') {
    doctor();
    if (command === 'setup') process.stdout.write('\nSetup guide: ' + resolve(root, 'docs/SETUP.md') + '\nConfig template: ' + resolve(root, 'docs/gateway.example.json') + '\n');
  } else if (command === 'readiness') {
    print(readinessReport());
  } else if (command === 'serve') {
    await serve(option('config', '/etc/device-bridge/gateway.json'));
  } else if (command === 'pair') {
    const host = option('host'); const port = option('port', '22');
    const fingerprint = option('fingerprint'); const output = option('output');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.:-]{0,252}$/.test(host ?? '') || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535 || !fingerprint || !output)
      throw Error('pair requires --host HOST --port PORT --fingerprint SHA256:... --output NEW_KNOWN_HOSTS_PATH');
    const keyType = option('key-type', 'ed25519');
    if (!['ed25519', 'ecdsa'].includes(keyType)) throw Error('Use --key-type ed25519 or ecdsa; no automatic algorithm fallback.');
    const scan = execFileSync('ssh-keyscan', ['-T', '5', '-p', port, '-t', keyType, host], { encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] });
    const verified = verifyHostKey(scan, { host, port, keyType, fingerprint });
    writeFileSync(output, verified.line + '\n', { flag: 'wx', mode: 0o600 });
    const actual = verified.fingerprint;
    print({ status: 'host_key_pinned', fingerprint: actual, next_step: 'Owner must provision distinct restricted SSH and helper credentials, then run status. This is not completed device pairing.' });
  } else if (['status', 'capabilities', 'stop'].includes(command)) {
    const config = loadConfig(option('config', '/etc/device-bridge/gateway.json'));
    const transport = new SSHTransport(config);
    if (command === 'stop' && !option('session')) throw Error('stop requires --session UUID; owner emergency stop is documented in docs/RECOVERY.md');
    const req = envelope(command === 'stop' ? 'cancel' : command, command === 'stop' ? { session_id: option('session') } : {});
    print(await transport.call(req));
  } else if (command === 'connect' && argv[0] === 'codex') {
    const installed = version('codex');
    if (installed === 'unavailable') throw Error('Install Codex CLI before generating its MCP entry.');
    const help = execFileSync('codex', ['mcp', 'add', '--help'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (!help.includes('COMMAND')) throw Error('Installed Codex CLI integration syntax is unverified.');
    const config = option('config', '/etc/device-bridge/gateway.json');
    const entry = `[mcp_servers.device_bridge]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify([resolve(root, 'src/cli.mjs'), 'serve', '--config', config])}\n`;
    // Print-only by design; live configuration changes require an independent owner install.
    process.stdout.write(`# Verified installed client: ${installed}\n# Back up config.toml and add this table if the name is unused.\n` + entry);
  } else if (command === 'revoke' || command === 'uninstall') {
    print({ status: 'owner_action_required', next_step: `Use the independent administrative channel described in ${resolve(root, 'docs/RECOVERY.md')}. The agent credential cannot administer itself.`, command: `owner.py ${command}` });
    process.exitCode = 2;
  } else {
    process.stdout.write('bridge setup | doctor | readiness | pair --host HOST --fingerprint SHA256:... --output PATH [--key-type ed25519|ecdsa] | status | capabilities | serve | connect codex | stop --session UUID | revoke | uninstall\n');
    if (command) process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(JSON.stringify({ status: 'error', code: error.code ?? 'SETUP_REQUIRED', next_step: error.next_step ?? (error.message?.startsWith('Command failed') ? 'Command failed; verify prerequisites and independent owner setup.' : error.message) }) + '\n');
  process.exitCode = 1;
}
