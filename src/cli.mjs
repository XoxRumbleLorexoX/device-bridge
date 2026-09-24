#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyHostKey } from './pairing.mjs';
import { loadConfig, SSHTransport } from './transport.mjs';
import { serve, envelope } from './gateway.mjs';
import { readinessReport } from './readiness.mjs';
import { LeverageService, LeverageStore, defaultLeverageStorePath, syntheticLeverageFixture } from './leverage/index.mjs';

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
    device: 'unverified: use pair with a locally verified host key, then status', leverage_store: defaultLeverageStorePath(),
    next_steps: ['Install a supported Xcode/iPhoneOS SDK and Theos for native builds.', 'Read docs/SETUP.md before provisioning the restricted helper.', 'Run bridge leverage demo for the local Personal Leverage Intelligence synthetic vertical slice.', 'No package installs or configuration changes are performed by doctor.'] });
}
function leverageService() {
  return new LeverageService(new LeverageStore(option('store', defaultLeverageStorePath())));
}
function parseScalar(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const number = Number(value);
  return value !== '' && Number.isFinite(number) ? number : value;
}
async function leverageCommand() {
  const subcommand = argv.shift();
  if (subcommand === 'demo') {
    const fixture = syntheticLeverageFixture();
    const directory = mkdtempSync(join(tmpdir(), 'device-bridge-leverage-demo-'));
    try {
      const service = new LeverageService(new LeverageStore(join(directory, 'store.json')), { clock: () => Date.parse(fixture.as_of) });
      await service.ingest(fixture.events, { provider_id: 'synthetic' });
      const goal = await service.createGoal(fixture.goal);
      // Fixture snapshot is the day after its seven observed calendar days, so an 8d
      // rolling query contains that complete seven-day observation period.
      const analysis = await service.analyse({ goal_id: goal.id, time_horizon: '8d', as_of: fixture.as_of });
      const review = await service.review();
      print({ synthetic: true, persisted: false, goal, analysis: analysis.analysis, outcome_metrics: analysis.outcome_metrics, variables: analysis.observations.map(({ variable_id, value, confidence }) => ({ variable_id, value, confidence })), bottlenecks: analysis.bottlenecks, opportunities: analysis.opportunities, insights: analysis.insights, value_of_information: analysis.value_of_information, weekly_review: review.text });
    } finally { rmSync(directory, { recursive: true, force: true }); }
    return;
  }
  const service = leverageService();
  if (subcommand === 'ingest') {
    const file = option('file');
    if (!file) throw Error('leverage ingest requires --file PATH containing an event array or {"events": [...]}');
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const events = Array.isArray(parsed) ? parsed : parsed.events;
    print(await service.ingest(events, { provider_id: option('provider', 'manual-file') }));
    return;
  }
  if (subcommand === 'goal') {
    const description = option('description'); const domain = option('domain');
    if (!description || !domain) throw Error('leverage goal requires --description TEXT --domain DOMAIN');
    const objectiveVariables = (option('objectives', '') || '').split(',').map(value => value.trim()).filter(Boolean);
    const priority = Number(option('priority', '0.5'));
    print(await service.createGoal({ description, domain, objective_variables: objectiveVariables, priority, constraints: [] }));
    return;
  }
  if (subcommand === 'find') {
    print(await service.analyse({ domain: option('domain'), goal_id: option('goal'), time_horizon: option('horizon', '30d'), as_of: option('as-of') }));
    return;
  }
  if (subcommand === 'review') { print(await service.review()); return; }
  if (subcommand === 'privacy') { print(await service.privacy()); return; }
  if (subcommand === 'feedback') {
    const opportunityId = option('opportunity'); const status = option('status');
    if (!opportunityId || !status) throw Error('leverage feedback requires --opportunity UUID --status STATUS');
    const ratingText = option('rating');
    print(await service.recordFeedback({ opportunity_id: opportunityId, status, rating: ratingText ? Number(ratingText) : undefined, reason: option('reason') }));
    return;
  }
  if (subcommand === 'outcome') {
    const metricId = option('metric'); const unit = option('unit'); const value = option('value');
    const opportunityId = option('opportunity'); const experimentId = option('experiment');
    if (!metricId || !unit || value === undefined || (!opportunityId && !experimentId)) throw Error('leverage outcome requires --metric ID --value VALUE --unit UNIT and --opportunity UUID or --experiment UUID');
    print(await service.recordOutcome({ opportunity_id: opportunityId, experiment_id: experimentId, metric_id: metricId, value: parseScalar(value), unit, confidence: Number(option('confidence', '1')), note: option('note') }));
    return;
  }
  if (subcommand === 'experiment') {
    const opportunityId = option('opportunity');
    if (!opportunityId) throw Error('leverage experiment requires --opportunity UUID');
    print(await service.createExperiment({ opportunity_id: opportunityId, period_days: Number(option('days', '14')) }));
    return;
  }
  if (subcommand === 'delete-history') {
    print(await service.deleteHistory({ confirm: option('confirm'), retain_goals: option('retain-goals', 'false') === 'true' }));
    return;
  }
  process.stdout.write('bridge leverage demo | ingest --file PATH [--provider ID] [--store PATH] | goal --description TEXT --domain DOMAIN [--objectives a,b] [--priority 0..1] | find [--domain DOMAIN] [--goal UUID] [--horizon 30d] [--store PATH] | review | privacy | feedback --opportunity UUID --status STATUS | outcome --metric ID --value VALUE --unit UNIT (--opportunity UUID|--experiment UUID) | experiment --opportunity UUID [--days 14] | delete-history --confirm DELETE_LEVERAGE_HISTORY [--retain-goals true]\n');
  if (subcommand) process.exitCode = 2;
}

try {
  if (command === 'doctor' || command === 'setup') {
    doctor();
    if (command === 'setup') process.stdout.write('\nSetup guide: ' + resolve(root, 'docs/SETUP.md') + '\nConfig template: ' + resolve(root, 'docs/gateway.example.json') + '\n');
  } else if (command === 'readiness') {
    print(readinessReport());
  } else if (command === 'leverage') {
    await leverageCommand();
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
    process.stdout.write(`# Verified installed client: ${installed}\n# Back up config.toml and add this table if the name is unused.\n` + entry);
  } else if (command === 'revoke' || command === 'uninstall') {
    print({ status: 'owner_action_required', next_step: `Use the independent administrative channel described in ${resolve(root, 'docs/RECOVERY.md')}. The agent credential cannot administer itself.`, command: `owner.py ${command}` });
    process.exitCode = 2;
  } else {
    process.stdout.write('bridge setup | doctor | readiness | leverage ... | pair --host HOST --fingerprint SHA256:... --output PATH [--key-type ed25519|ecdsa] | status | capabilities | serve | connect codex | stop --session UUID | revoke | uninstall\n');
    if (command) process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(JSON.stringify({ status: 'error', code: error.code ?? 'SETUP_REQUIRED', next_step: error.next_step ?? (error.message?.startsWith('Command failed') ? 'Command failed; verify prerequisites and independent owner setup.' : error.message) }) + '\n');
  process.exitCode = 1;
}
