#!/usr/bin/env python3
"""Template for independently owner-authorized helper installation and recovery test."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time
import uuid

# Filled by prepare_helper_setup.py. No credentials belong in this payload.
PAYLOAD = {}
INSTALL = Path('/var/jb/usr/libexec/device-bridge')
STATE = Path('/var/root/device-bridge')
CREDENTIALS = Path('/var/root/device-bridge-credentials')
SHARED = Path('/var/db/device-bridge')
PYTHON = '/var/jb/usr/bin/python3'


def payload_files(payload):
    if set(payload) != {'helper.py', 'owner.py', 'LICENSE'}:
        raise RuntimeError('Unexpected helper payload inventory.')
    result = {}
    for name, item in payload.items():
        data = base64.b64decode(item['base64'], validate=True)
        if len(data) > 256 * 1024 or hashlib.sha256(data).hexdigest() != item['sha256']:
            raise RuntimeError('Helper payload hash mismatch.')
        if name.endswith('.py'):
            compile(data, name, 'exec')
        result[name] = data
    return result


def protected_parent(path):
    parent = path.parent.resolve(strict=True)
    for candidate in [parent, *parent.parents]:
        info = candidate.stat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('Target parent is not protected by root ownership.')
    if os.path.lexists(path):
        raise RuntimeError('An installation target already exists; preserve it and inspect. No overwrite is allowed.')


def preflight():
    files = payload_files(PAYLOAD)
    for path in (INSTALL, STATE, CREDENTIALS, SHARED):
        protected_parent(path)
    if not Path(PYTHON).is_file():
        raise RuntimeError('Reviewed device Python path unavailable.')
    return files


def write_new(path, data, mode):
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        os.fchmod(stream.fileno(), mode)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def invoke(script, args, request=None):
    result = subprocess.run([PYTHON, '-I', str(INSTALL / script), *args],
                            input=(json.dumps(request) + '\n') if request is not None else '',
                            text=True, capture_output=True, timeout=40,
                            env={'PATH': '/var/jb/usr/bin:/var/jb/usr/sbin:/usr/bin:/bin', 'HOME': '/var/root', 'LANG': 'C'})
    if result.returncode != 0:
        raise RuntimeError('Installed helper/owner command failed; preserve the new root directories for inspection.')
    return json.loads(result.stdout)


def owner(command, *args):
    return invoke('owner.py', [command, '--state', str(STATE), *args])


def recovery_checks(device_id, credential):
    checks = []
    def request(method, token=credential, **extra):
        return invoke('helper.py', ['--state', str(STATE)], dict(
            version=1, device_id=device_id, principal='operator',
            credential=token, audience='device-bridge/helper/v1', method=method,
            request_id=str(uuid.uuid4()), deadline=time.time() + 25, **extra))
    def require(condition, label):
        if not condition:
            raise RuntimeError('Recovery check failed: ' + label)
        checks.append(label)
    require(request('status', token='')['error']['code'] == 'PERMISSION_DENIED', 'missing_credential_rejected')
    require(request('status')['data']['helper_online'] is True, 'status_without_ui')
    require(request('session_open', grant_id=str(uuid.uuid4()))['error']['code'] == 'APPROVAL_REQUIRED', 'no_grant_no_session')
    owner('stop')
    require(request('status')['data']['state'] == 'recovery_required', 'stop_without_ui')
    require(request('cancel', session_id=str(uuid.uuid4()))['data']['state'] == 'stopped', 'cancel_without_ui')
    owner('revoke', '--principal', 'operator')
    require(request('status')['error']['code'] == 'PERMISSION_DENIED', 'revoked_credential_rejected')
    lease = json.loads((SHARED / 'lease.json').read_text())
    policy = json.loads((STATE / 'policy.json').read_text())
    require(lease == {'enabled': False} and (STATE / 'STOP').is_file() and
            policy['operators']['operator']['revoked'] and not policy['operators']['operator']['grants'],
            'final_state_stopped_revoked_no_grants')
    return checks


def install_and_test():
    if os.geteuid() != 0:
        raise RuntimeError('Independent owner sudo authentication required.')
    os.umask(0o077)
    files = preflight()  # Validate every target before creating anything.
    INSTALL.mkdir(mode=0o755)
    INSTALL.chmod(0o755)
    for name, data in files.items():
        write_new(INSTALL / name, data, 0o644)
    CREDENTIALS.mkdir(mode=0o700)
    credential_path = CREDENTIALS / 'revoked-setup-credential'
    initialized = False
    try:
        result = owner('init', '--credential-output', str(credential_path))
        initialized = True
        credential = credential_path.read_text().strip()
        checks = recovery_checks(result['device_id'], credential)
        report = {'status': 'helper_installed_recovery_checks_passed', 'checks': checks,
                  'control_enabled': False, 'credential_revoked': True,
                  'ssh_runtime_key_installed_by_setup': False, 'ui_installed_by_setup': False,
                  'next_step': 'Provision restricted SSH/runtime pairing through the owner channel before any UI activation.'}
        write_new(CREDENTIALS / 'setup-result.json', (json.dumps(report, indent=2) + '\n').encode(), 0o600)
        return report
    except BaseException:
        if initialized:
            for operation in ('stop', 'revoke'):
                try:
                    owner(operation)
                except (OSError, ValueError, RuntimeError, subprocess.SubprocessError):
                    pass
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--install-and-test', action='store_true')
    args = parser.parse_args()
    try:
        if args.install_and_test:
            result = install_and_test()
        else:
            preflight()
            result = {'status': 'preflight_only', 'changes_made': False}
        print(json.dumps(result, indent=2))
    except (OSError, ValueError, KeyError, TypeError, RuntimeError, subprocess.SubprocessError):
        print('Setup did not complete. Preserve any new helper/state directories and inspect through the owner terminal; no automatic reinstall. Never enable control after a failed recovery check.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
