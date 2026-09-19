#!/usr/bin/env python3
"""Independent root administrator CLI. Never exposed through MCP or forced SSH.

Functions accept an explicit required_uid/shared path for isolated host tests only.
The CLI always requires root and uses the fixed device shared-lease directory.
"""
import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import stat
import time
import uuid


class OwnerError(Exception):
    pass


def check_directory(path, uid, private=False):
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & (0o077 if private else 0o022):
        raise OwnerError('Expected a protected owner-controlled directory, not a symlink.')


def check_parent(path, uid):
    if not path.is_absolute():
        raise OwnerError('Use an absolute installation/state/credential path.')
    check_directory(path.parent, uid)
    if uid == 0:
        # Deployment requires protected ancestors as well. /var and /etc may
        # resolve to Apple's /private paths; inspect their actual parents.
        parent = path.parent.resolve()
        while parent != parent.parent:
            check_directory(parent, 0)
            parent = parent.parent


def check_new_file(path, uid):
    if path is None:
        raise OwnerError('Supply a new secure --credential-output path; credentials are never printed.')
    check_parent(path, uid)
    if os.path.lexists(path):
        raise OwnerError('Credential output already exists; it will not be overwritten.')


def read_policy(state, uid):
    path = state / 'policy.json'
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
        raise OwnerError('Policy must be an owner-only regular file.')
    try:
        policy = json.loads(path.read_text())
        if policy.get('version') != 1 or not isinstance(policy.get('operators'), dict):
            raise ValueError()
        uuid.UUID(policy['device_id'])
    except (ValueError, TypeError, KeyError):
        raise OwnerError('Policy is invalid; preserve it and recover through the owner channel.') from None
    return policy


def sync_directory(directory):
    fd = os.open(str(directory), os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic(path, value, mode=0o600):
    temporary = path.with_name(path.name + '.' + secrets.token_hex(8))
    try:
        fd = os.open(str(temporary), os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        with os.fdopen(fd, 'w') as stream:
            os.fchmod(stream.fileno(), mode)
            json.dump(value, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


@contextlib.contextmanager
def administration_lock(state, uid):
    fd = os.open(str(state / 'owner.lock'), os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
            raise OwnerError('Administrative lock must be an owner-only regular file.')
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise OwnerError('Another owner operation is in progress; retry after it finishes.') from None
        yield
    finally:
        os.close(fd)


def create_credential(path):
    credential = secrets.token_hex(32)
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(credential + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        sync_directory(path.parent)
    except BaseException:
        path.unlink(missing_ok=True)  # Only the new file created by this operation.
        raise
    return {'credential_sha256': hashlib.sha256(credential.encode()).hexdigest(),
            'expires': time.time() + 86400, 'revoked': False, 'grants': {}}


def initialize(state, shared, principal, credential_output, required_uid=0):
    # Validate all caller-controlled locations before creating state or credentials.
    check_new_file(credential_output, required_uid)
    check_parent(state, required_uid)
    check_parent(shared, required_uid)
    if state == shared or state in shared.parents or shared in state.parents:
        raise OwnerError('Private state and public lease directories must be separate.')
    if os.path.lexists(state) or os.path.lexists(shared):
        raise OwnerError('State or shared lease directory already exists. Preserve it and inspect before reinitializing.')
    created_state = False
    created_shared = False
    created_credential = False
    committed = False
    try:
        state.mkdir(mode=0o700)
        created_state = True
        with administration_lock(state, required_uid):
            shared.mkdir(mode=0o755)
            created_shared = True
            os.chmod(shared, 0o755)
            policy = {'version': 1, 'device_id': str(uuid.uuid4()), 'operators': {}}
            policy['operators'][principal] = create_credential(credential_output)
            created_credential = True
            atomic(shared / 'lease.json', {'enabled': False}, 0o644)
            atomic(state / 'policy.json', policy)
            committed = True
        return {'device_id': policy['device_id'], 'operation': 'init', 'status': 'complete'}
    finally:
        if not committed:
            # Best-effort cleanup after ordinary errors, not a crash transaction.
            # Never recursively delete a directory or remove pre-existing data.
            if created_credential:
                credential_output.unlink(missing_ok=True)
            if created_shared:
                (shared / 'lease.json').unlink(missing_ok=True)
                try:
                    shared.rmdir()
                except OSError:
                    pass
            if created_state:
                for name in ['policy.json', 'owner.lock']:
                    (state / name).unlink(missing_ok=True)
                try:
                    state.rmdir()
                except OSError:
                    pass


def invalidate_sessions(state, uid):
    journal = state / 'journal.sqlite'
    if os.path.lexists(journal):
        info = journal.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
            raise OwnerError('Journal must be an owner-only regular file. Control remains disabled.')
        with sqlite3.connect(str(journal), timeout=1) as db:
            db.execute('UPDATE sessions SET active=0')
            db.execute('DELETE FROM observations')


def administer(command, state, shared, principal='operator', credential_output=None,
               minutes=5, control=False, required_uid=0):
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', principal):
        raise OwnerError('Principal must contain 1–64 letters, digits, underscores or hyphens.')
    if command == 'init':
        return initialize(state, shared, principal, credential_output, required_uid)
    check_parent(state, required_uid)
    check_directory(state, required_uid, private=True)
    check_parent(shared, required_uid)
    check_directory(shared, required_uid)
    with administration_lock(state, required_uid):
        # Read after acquiring the lock: concurrent administrators cannot restore
        # a stale credential/grant snapshot over a revocation.
        policy = read_policy(state, required_uid)
        result = {'device_id': policy['device_id'], 'operation': command, 'status': 'complete'}
        if command in ['grant', 'revoke', 'rotate'] and principal not in policy['operators']:
            raise OwnerError('Principal is not paired; no policy changed.')
        if command == 'grant':
            if not 1 <= minutes <= 15:
                raise OwnerError('Fixture grants must last 1–15 minutes.')
            entry = policy['operators'][principal]
            if entry['revoked'] or entry['expires'] <= time.time():
                raise OwnerError('Rotate this credential first.')
            entry['grants'] = {key: value for key, value in entry['grants'].items() if value['expires'] > time.time()}
            if len(entry['grants']) >= 32:
                raise OwnerError('Too many live grants; stop or let previous grants expire.')
            grant_id = str(uuid.uuid4())
            entry['grants'][grant_id] = {'app': 'dev.devicebridge.fixture',
                'scopes': ['observe', 'control'] if control else ['observe'],
                'expires': min(entry['expires'], time.time() + minutes * 60)}
            result['grant_id'] = grant_id
        elif command in ['stop', 'uninstall', 'resume', 'rotate', 'revoke']:
            # Disable native input before any policy/session change. Errors after
            # this point are fail-closed; never auto-restore an enabled lease.
            if command == 'rotate':
                check_new_file(credential_output, required_uid)
            atomic(shared / 'lease.json', {'enabled': False}, 0o644)
            if command in ['stop', 'uninstall', 'resume']:
                for entry in policy['operators'].values():
                    entry['grants'] = {}
                    if command == 'uninstall':
                        entry['revoked'] = True
            elif command == 'revoke':
                policy['operators'][principal]['revoked'] = True
                policy['operators'][principal]['grants'] = {}
            elif command == 'rotate':
                policy['operators'][principal] = create_credential(credential_output)
            if command in ['stop', 'uninstall']:
                fd = os.open(str(state / 'STOP'), os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
                os.close(fd)
                sync_directory(state)
            atomic(state / 'policy.json', policy)
            invalidate_sessions(state, required_uid)
            if command == 'resume':
                # Only remove root STOP after prior grants/sessions are invalid.
                (state / 'STOP').unlink(missing_ok=True)
                sync_directory(state)
            if command == 'uninstall':
                result['status'] = 'revoked_and_stopped'
            return result
        else:
            raise OwnerError('Unsupported owner operation.')
        atomic(state / 'policy.json', policy)
        return result


def main():
    if os.geteuid() != 0 or 'SSH_ORIGINAL_COMMAND' in os.environ:
        raise SystemExit('Independent root administrator required; forced-command sessions cannot administer policy.')
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['init', 'grant', 'revoke', 'rotate', 'stop', 'resume', 'uninstall'])
    parser.add_argument('--state', required=True, type=Path)
    parser.add_argument('--principal', default='operator')
    parser.add_argument('--credential-output', type=Path)
    parser.add_argument('--minutes', type=int, default=5)
    parser.add_argument('--control', action='store_true')
    args = parser.parse_args()
    try:
        result = administer(args.command, args.state, Path('/var/db/device-bridge'),
            args.principal, args.credential_output, args.minutes, args.control)
    except OwnerError as error:
        raise SystemExit(str(error)) from None
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error):
        # Do not print paths, SQLite text, credentials or partial policy. A failure
        # during rotation may leave its new credential file for owner inspection.
        raise SystemExit('Owner operation did not complete. Preserve existing files; check protected paths, principal, credential output, and concurrent owner operations. After a partial stop/rotation, do not re-enable the lease without review.') from None
    result['next_step'] = ('Remove the exact forced-command authorized_keys entry and reviewed bridge package using docs/RECOVERY.md; unrelated files are preserved.'
        if args.command == 'uninstall' else 'Policy updated. Credentials and approvals remain outside MCP.')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
