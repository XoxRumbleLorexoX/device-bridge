#!/usr/bin/env python3
"""Restricted SSH forced-command helper. No shell, network listener, or admin RPC.
Production invocation: absolute/python3 -I absolute/helper.py --state /owner/state
The state directory and helper must be root owned, not writable by the agent.
"""
import argparse
import contextlib
import fcntl
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import platform
import secrets
import signal
import socket
import sqlite3
import stat
import struct
import sys
import time
import uuid

FIXTURE = 'dev.devicebridge.fixture'
LIMIT = 256 * 1024
UI_LIMIT = 20 * 1024 * 1024
SCOPES = {'observe', 'control'}
METHODS = {'capabilities', 'status', 'session_open', 'observe', 'act', 'cancel', 'result'}

class BridgeError(Exception):
    def __init__(self, code, stage, next_step):
        self.code, self.stage, self.next_step = code, stage, next_step
        super().__init__(code)

def fail(code, stage, next_step):
    raise BridgeError(code, stage, next_step)

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()

def number(value):
    return type(value) in (float, int) and math.isfinite(value)

def secure_file(path, uid):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
        fail('PERMISSION_DENIED', 'configuration', 'Use an owner-only regular configuration file.')
    return json.loads(path.read_text())

class UnixUI:
    def __init__(self, path):
        self.path = str(path)

    def call(self, request, deadline):
        remaining = deadline - time.time()
        if remaining <= 0:
            fail('DEADLINE_EXCEEDED', 'executor', 'Refresh observation and create a new request.')
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as conn:
                conn.settimeout(min(remaining, 12))
                conn.connect(self.path)
                payload = json.dumps(request, separators=(',', ':')).encode()
                conn.sendall(struct.pack('!I', len(payload)) + payload)
                def exact(size):
                    data = bytearray()
                    while len(data) < size:
                        part = conn.recv(size - len(data))
                        if not part:
                            raise OSError('closed')
                        data.extend(part)
                    return data
                size = struct.unpack('!I', exact(4))[0]
                if size > UI_LIMIT or size == 0:
                    raise OSError('invalid response')
                result = json.loads(exact(size))
                if not isinstance(result, dict):
                    raise OSError('invalid response')
                if result.get('error'):
                    fail(result['error'] if result['error'] in {'DEVICE_LOCKED', 'STALE_OBSERVATION', 'PERMISSION_DENIED', 'RECOVERY_REQUIRED', 'DEADLINE_EXCEEDED', 'UNSUPPORTED_CAPABILITY'} else 'RECOVERY_REQUIRED', 'executor', 'Stop control and inspect device state locally.')
                return result
        except (OSError, ValueError):
            fail('RECOVERY_REQUIRED', 'executor', 'Check the restricted UI tweak and SpringBoard; SSH status/stop remain available.')

class Helper:
    def __init__(self, state, ui=None, uid=0):
        self.state = Path(state)
        self.uid = uid
        info = self.state.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
            fail('PERMISSION_DENIED', 'configuration', 'Use a root-owned 0700 state directory.')
        if uid == 0:
            parent = self.state.resolve().parent
            while str(parent) != '/':
                st = parent.stat()
                if st.st_uid != 0 or st.st_mode & 0o022:
                    fail('PERMISSION_DENIED', 'configuration', 'Protect every state-directory parent from replacement.')
                parent = parent.parent
        self.control_dir = self.state / 'control' if ui is not None else Path('/var/db/device-bridge')
        self.ui = ui or UnixUI('/var/mobile/Library/DeviceBridge/ui.sock')
        self.db = sqlite3.connect(str(self.state / 'journal.sqlite'), timeout=1)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('PRAGMA secure_delete=ON')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, hash TEXT, result TEXT, expires REAL, principal TEXT);
          CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, principal TEXT, grant_id TEXT, expires REAL, fence INTEGER, active INTEGER);
          CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY, session_id TEXT, payload TEXT, expires REAL);
          CREATE TABLE IF NOT EXISTS counter(value INTEGER);
          INSERT INTO counter SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM counter);
        ''')
        self.db.commit()

    def publish_control(self, value):
        # Public lease metadata, no credentials. Parent is root-owned in deployment.
        self.control_dir.mkdir(mode=0o755, exist_ok=True)
        info = self.control_dir.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != self.uid or info.st_mode & 0o022:
            fail('PERMISSION_DENIED', 'lease', 'Owner must provision the protected shared lease directory.')
        path = self.control_dir / 'lease.json'
        temporary = self.control_dir / ('lease.' + secrets.token_hex(8))
        fd = os.open(str(temporary), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        with os.fdopen(fd, 'w') as stream:
            os.fchmod(stream.fileno(), 0o644)
            json.dump(value, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)

    def ui_envelope(self, req, **extra):
        return dict(device_id=req['device_id'], session_id=req['session_id'], fence=req['fence'],
                    scope=req['scope'], request_id=req['request_id'], deadline=req['deadline'], **extra)

    def policy(self):
        return secure_file(self.state / 'policy.json', self.uid)

    def authenticate(self, req):
        policy = self.policy()
        principal = req.get('principal')
        entry = policy.get('operators', {}).get(principal, {}) if isinstance(principal, str) else {}
        token = req.get('credential')
        if not isinstance(token, str) or len(token) > 256 or not entry or not hmac.compare_digest(hashlib.sha256(token.encode()).hexdigest(), entry.get('credential_sha256', '')) or entry.get('revoked', True):
            fail('PERMISSION_DENIED', 'authentication', 'Pair or rotate the device credential through the independent owner channel.')
        if req.get('audience') != 'device-bridge/helper/v1' or req.get('device_id') != policy.get('device_id'):
            fail('PERMISSION_DENIED', 'identity', 'Use the paired device identity and helper audience.')
        if entry.get('expires', 0) <= time.time():
            fail('PERMISSION_DENIED', 'authentication', 'Owner must rotate the expired credential.')
        return policy, entry

    def authorize_session(self, req, entry, control=False):
        row = self.db.execute('SELECT principal,grant_id,expires,fence,active FROM sessions WHERE id=?', (req.get('session_id', ''),)).fetchone()
        grant = entry.get('grants', {}).get(row[1], {}) if row else {}
        now = time.time()
        if not row or row[0] != req['principal'] or not row[4] or min(row[2], grant.get('expires', 0)) <= now or row[3] != req.get('fence'):
            fail('PERMISSION_DENIED', 'session', 'Open a session using a current owner-issued grant.')
        scope = 'control' if control else 'observe'
        if scope not in grant.get('scopes', []) or scope != req.get('scope') or grant.get('app') != FIXTURE:
            fail('APPROVAL_REQUIRED', 'authorization', 'Obtain an independent, fixture-scoped owner grant.')
        return row, grant

    def check_running(self):
        if (self.state / 'STOP').exists() or (isinstance(self.ui, UnixUI) and Path('/var/mobile/Library/DeviceBridge/STOP').exists()):
            fail('RECOVERY_REQUIRED', 'stop', 'Owner must inspect state and explicitly clear the local STOP file.')

    def capabilities(self):
        return {'contract_version': 1, 'backend': 'ios-mcp-restricted', 'capabilities': [
            {'name': name, 'source': implemented, 'status': 'unverified' if implemented else 'unsupported',
             'prerequisites': ['owner pairing', 'root forced-command SSH helper', 'Python 3 + sqlite3', 'restricted UI tweak', 'unlocked fixture app'],
             'limitations': limitations, 'last_verification': None}
            for name, implemented, limitations in [
                ('observation', True, 'Non-atomic capture; fixture only; native PNG where capture API permits.'),
                ('element_tap', True, 'Compact AX text/rect references; integer bounds; no measured calibration yet.'),
                ('text_insert', True, 'Unicode HID, one bounded chunk, no fallback or implicit submission.'),
                ('app_launch', True, 'Benign fixture only.'),
                ('coordinate_gestures', False, 'Disabled until hardware calibration and cancellation validation.'),
                ('files_preferences', False, 'No owner-approved paths or effective preference verification yet.'),
                ('deploy_rollback', False, 'No verified toolchain/device/package rollback evidence.'),
                ('multi_touch', False, 'No validated synchronized backend.'),
                ('streaming', False, 'Deferred.'),
            ]]}

    def observe_ui(self, req):
        data = self.ui.call(self.ui_envelope(req, op='observe'), req['deadline'])
        required = {'epoch', 'app', 'pid', 'locked', 'screen', 'elements', 'consistent', 'captured_at'}
        if not required.issubset(data) or data['app'] != FIXTURE:
            fail('PERMISSION_DENIED', 'observation', 'Open the benign fixture locally or use its explicitly granted launch action.')
        if data['locked'] is not False:
            fail('DEVICE_LOCKED', 'observation', 'Unlock the device locally; unknown lock state also blocks control.')
        if not data['consistent']:
            fail('STALE_OBSERVATION', 'observation', 'Capture again after the foreground and orientation stabilize.')
        if not isinstance(data['elements'], list) or len(data['elements']) > 256:
            fail('RECOVERY_REQUIRED', 'observation', 'Inspect the AX payload on a disposable fixture device.')
        return data

    def save_observation(self, req, data):
        observation_id = str(uuid.uuid4())
        # Persist only state, a tree digest and geometry. No screen text or screenshot.
        stored = dict(self.stable(data), observation_id=observation_id,
                      elements_hash=digest(data['elements']), targets=[])
        response = json.loads(json.dumps(data))
        response['observation_id'] = observation_id
        for index, element in enumerate(response['elements']):
            element['ref'] = f'{observation_id}:{index}'
            stored['targets'].append({key: element.get(key) for key in ('ref', 'rect', 'visible_rect', 'clickable')})
        self.db.execute('DELETE FROM observations WHERE session_id=?', (req['session_id'],))
        self.db.execute('INSERT INTO observations VALUES(?,?,?,?)', (observation_id, req['session_id'], json.dumps(stored), time.time() + 15))
        self.db.commit()
        return response

    @staticmethod
    def stable(data):
        return {key: data.get(key) for key in ('epoch', 'app', 'pid', 'locked', 'screen')}

    def dispatch(self, req, policy, entry):
        method = req['method']
        if method == 'capabilities':
            return self.capabilities()
        if method == 'status':
            return {'state': 'recovery_required' if (self.state / 'STOP').exists() or (isinstance(self.ui, UnixUI) and Path('/var/mobile/Library/DeviceBridge/STOP').exists()) else 'reduced_capability',
                    'helper_online': True, 'ui_socket_present': Path('/var/mobile/Library/DeviceBridge/ui.sock').is_socket(),
                    'runtime': {'system': platform.system(), 'architecture': platform.machine(), 'python': platform.python_version(), 'euid': os.geteuid(),
                                'bootstrap_paths_present': [p for p in ['/var/jb', '/Library/MobileSubstrate', '/var/containers/Bundle/tweaksupport'] if Path(p).exists()]},
                    'device_build': policy.get('device_build', 'unverified'), 'hardware': policy.get('hardware', 'unverified'),
                    'jailbreak': policy.get('jailbreak', 'unverified'), 'lock_state': 'unverified', 'capability_evidence': 'not tested on hardware'}
        if method == 'result':
            row = self.db.execute('SELECT result FROM requests WHERE id=? AND principal=?', (req.get('lookup_id', ''), req['principal'])).fetchone()
            return {'record': json.loads(row[0]) if row and row[0] else {'status': 'OUTCOME_UNKNOWN'}}
        if method == 'cancel':
            changed = self.db.execute('UPDATE sessions SET active=0 WHERE id=? AND principal=? AND active=1', (req.get('session_id', ''), req['principal'])).rowcount
            if changed:
                self.publish_control({'enabled': False})
            self.db.execute('DELETE FROM observations WHERE session_id=?', (req.get('session_id', ''),))
            self.db.commit()
            return {'state': 'stopped', 'held_contacts': 'none: only completed tap transactions are exposed', 'in_flight': 'An already dispatched atomic event cannot be recalled.'}
        self.check_running()
        if method == 'session_open':
            grant = entry.get('grants', {}).get(req.get('grant_id'), {})
            if grant.get('expires', 0) <= time.time() or grant.get('app') != FIXTURE or not set(grant.get('scopes', [])).issubset(SCOPES) or 'observe' not in grant.get('scopes', []):
                fail('APPROVAL_REQUIRED', 'grant', 'Ask the independent owner to issue a short fixture grant; the agent cannot grant access.')
            busy = self.db.execute('SELECT id FROM sessions WHERE active=1 AND expires>?', (time.time(),)).fetchone()
            if busy:
                fail('WRITER_BUSY', 'lease', 'Cancel the previous session or wait for its lease to expire.')
            session = str(uuid.uuid4())
            self.db.execute('UPDATE counter SET value=value+1')
            fence = self.db.execute('SELECT value FROM counter').fetchone()[0]
            expires = min(grant['expires'], time.time() + 300)
            self.db.execute('INSERT INTO sessions VALUES(?,?,?,?,?,1)', (session, req['principal'], req['grant_id'], expires, fence))
            self.db.commit()
            self.publish_control({'enabled': True, 'device_id': req['device_id'], 'session_id': session, 'fence': fence, 'expires': expires, 'scopes': grant['scopes']})
            return {'session_id': session, 'fence': fence, 'expires': expires, 'app': FIXTURE, 'scopes': grant['scopes']}
        self.authorize_session(req, entry, method == 'act')
        if method == 'observe':
            return self.save_observation(req, self.observe_ui(req))
        if method != 'act':
            fail('UNSUPPORTED_CAPABILITY', 'dispatch', 'Use a published typed capability.')
        action = req.get('action')
        if not isinstance(action, dict) or action.get('kind') not in {'launch', 'tap_element', 'insert_text'}:
            fail('UNSUPPORTED_CAPABILITY', 'action', 'Only fixture launch, element tap, and bounded insertion are enabled.')
        kind = action['kind']
        allowed_keys = {'launch': {'kind'}, 'tap_element': {'kind', 'ref'}, 'insert_text': {'kind', 'text'}}[kind]
        if set(action) != allowed_keys:
            fail('INVALID_ARGUMENT', 'action', 'Use the exact typed action schema; no hidden submission or shell arguments.')
        if kind == 'insert_text':
            value = action['text']
            if not isinstance(value, str) or not value or len(value.encode('utf-16-le')) // 2 > 64 or any(ord(c) < 32 or ord(c) == 127 for c in value):
                fail('INVALID_ARGUMENT', 'text', 'Use 1–64 UTF-16 units without control characters; insertion never submits.')
        before = None
        if kind != 'launch':
            row = self.db.execute('SELECT payload FROM observations WHERE id=? AND session_id=? AND expires>?', (req.get('observation_id', ''), req['session_id'], time.time())).fetchone()
            if not row:
                fail('STALE_OBSERVATION', 'precondition', 'Capture a fresh observation in this session.')
            before = json.loads(row[0])
            fresh = self.observe_ui(req)
            if self.stable(before) != self.stable(fresh) or before['elements_hash'] != digest(fresh['elements']):
                fail('STALE_OBSERVATION', 'precondition', 'App, process, orientation, or elements changed; observe again.')
            if kind == 'tap_element':
                matches = [e for e in before['targets'] if e.get('ref') == action.get('ref')]
                if len(matches) != 1 or not matches[0].get('clickable'):
                    fail('INVALID_ARGUMENT', 'selector', 'Choose one clickable element reference from the current observation.')
                rect = matches[0].get('visible_rect') or matches[0].get('rect')
                try:
                    values = [float(x) for x in rect.split(',')] if isinstance(rect, str) else [rect[k] for k in ('x', 'y', 'width', 'height')]
                    x, y, w, h = values
                    sw, sh = fresh['screen']['width'], fresh['screen']['height']
                    valid = all(number(v) for v in values + [sw, sh]) and w > 0 and h > 0 and x >= 0 and y >= 0 and x + w <= sw and y + h <= sh
                except (TypeError, KeyError, ValueError):
                    valid = False
                if not valid:
                    fail('UNSUPPORTED_CAPABILITY', 'coordinates', 'The backend did not provide valid visible bounds.')
                action = {'kind': kind, 'x': x + w / 2, 'y': y + h / 2}
        # Recheck policy after capture: owner revocation/STOP may have arrived during it.
        _, current_entry = self.authenticate(req)
        self.authorize_session(req, current_entry, True)
        self.check_running()
        if req['deadline'] <= time.time():
            fail('DEADLINE_EXCEEDED', 'precondition', 'Create a fresh request after observing again.')
        # Durable uncertainty marker is committed BEFORE sending any UI mutation.
        self.db.execute('INSERT INTO requests VALUES(?,?,NULL,?,?)', (req['request_id'], digest({k: v for k, v in req.items() if k != 'credential'}), req['deadline'], req['principal']))
        self.db.execute('DELETE FROM observations WHERE session_id=?', (req['session_id'],))
        self.db.commit()
        self.recording = req['request_id']
        try:
            executed = self.ui.call(self.ui_envelope(req, op='act', action=action, expected=self.stable(before) if before else None), req['deadline'])
            if executed.get('status') not in {'executed', 'dispatched'}:
                raise OSError('unconfirmed execution')
            after = self.observe_ui(req)
            expected_text = req.get('expected_text')
            verified = kind == 'launch' and after['app'] == FIXTURE
            if isinstance(expected_text, str):
                verified = any(e.get('text') == expected_text for e in after['elements'])
            observation = self.save_observation(req, after)
            return {'status': 'verified' if verified else executed['status'], 'before_observation_id': before.get('observation_id') if before else None,
                    'after': observation, 'evidence': 'Exact AX text postcondition matched.' if verified and expected_text is not None else 'Foreground fixture observed.' if verified else 'Dispatch acknowledged and new observation captured; semantic outcome unverified.'}
        except (BridgeError, OSError, sqlite3.Error, ValueError, TypeError):
            self.publish_control({'enabled': False})
            self.db.execute('UPDATE sessions SET active=0 WHERE id=?', (req['session_id'],))
            self.db.commit()
            fail('OUTCOME_UNKNOWN', 'execution_or_verification', 'Do not repeat the action. Inspect device locally, query this request ID, and open a new grant/session only after resolving uncertainty.')

    def handle(self, req):
        with contextlib.ExitStack() as cleanup:
            return self._handle(req, cleanup)

    def _handle(self, req, cleanup):
        started = time.time()
        self.recording = None
        identity = {'device_id': req.get('device_id'), 'request_id': req.get('request_id')} if isinstance(req, dict) else {}
        lock = None
        try:
            if not isinstance(req, dict):
                fail('INVALID_ARGUMENT', 'validation', 'Send a versioned request object.')
            policy, entry = self.authenticate(req)
            if req.get('version') != 1 or req.get('method') not in METHODS or not isinstance(req.get('request_id'), str) or len(req['request_id']) > 100:
                fail('INVALID_ARGUMENT', 'validation', 'Use the v1 typed envelope and a unique request ID.')
            try:
                uuid.UUID(req['request_id'])
            except ValueError:
                fail('INVALID_ARGUMENT', 'validation', 'Use a UUID request ID.')
            if req.get('expected_text') is not None and (not isinstance(req['expected_text'], str) or len(req['expected_text']) > 256):
                fail('INVALID_ARGUMENT', 'validation', 'Use a bounded text postcondition.')
            if not number(req.get('deadline')) or not time.time() < req['deadline'] <= time.time() + 30:
                fail('DEADLINE_EXCEEDED', 'validation', 'Send a deadline within the next 30 seconds; old mutations are never replayed.')
            # Reject rather than queue. Cancellation can always invalidate future work.
            if req['method'] not in {'cancel', 'status', 'capabilities', 'result'}:
                lock = cleanup.enter_context(open(self.state / 'writer.lock', 'a'))
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    fail('WRITER_BUSY', 'queue', 'Wait for the in-flight bounded operation; no inputs are queued.')
            request_hash = digest({k: v for k, v in req.items() if k != 'credential'})
            old = self.db.execute('SELECT hash,result FROM requests WHERE id=?', (req['request_id'],)).fetchone()
            if old:
                if old[0] != request_hash:
                    fail('REQUEST_CONFLICT', 'deduplication', 'Never reuse a request ID with different arguments.')
                if old[1]:
                    return json.loads(old[1])
                fail('OUTCOME_UNKNOWN', 'deduplication', 'An earlier send has no confirmed outcome. Inspect; do not retry it.')
            self.db.execute('DELETE FROM observations WHERE expires<?', (time.time(),))
            self.db.execute('DELETE FROM sessions WHERE expires<?', (time.time() - 60,))
            # Retain digest records 24h beyond expired deadlines. Expired envelopes always fail.
            self.db.execute('DELETE FROM requests WHERE expires<?', (time.time() - 86400,))
            self.db.commit()
            journal_full = self.db.execute('SELECT count(*) FROM requests').fetchone()[0] >= 4096
            if journal_full and req['method'] in {'session_open', 'act'}:
                fail('RECOVERY_REQUIRED', 'journal', 'Request journal is full; wait for expired records to age out.')
            if req['method'] in {'session_open', 'cancel'} and not journal_full:
                self.db.execute('INSERT INTO requests VALUES(?,?,NULL,?,?)', (req['request_id'], request_hash, req['deadline'], req['principal']))
                self.db.commit()
                self.recording = req['request_id']
            data = self.dispatch(req, policy, entry)
            reply = dict(identity, status='ok', data=data, elapsed_ms=round((time.time() - started) * 1000))
        except BridgeError as error:
            reply = dict(identity, status='error', error={'code': error.code, 'stage': error.stage, 'next_step': error.next_step}, elapsed_ms=round((time.time() - started) * 1000))
        except (ValueError, KeyError, TypeError, sqlite3.Error, OSError):
            reply = dict(identity, status='error', error={'code': 'RECOVERY_REQUIRED', 'stage': 'helper', 'next_step': 'Owner must inspect helper configuration and journal; no raw error data is logged.'})
        # Never store screenshots or screen text in the mutation journal.
        if isinstance(req, dict) and self.recording == req.get('request_id'):
            journal_reply = json.loads(json.dumps(reply))
            if 'data' in journal_reply and isinstance(journal_reply['data'], dict):
                journal_reply['data'].pop('after', None)
            self.db.execute('UPDATE requests SET result=? WHERE id=?', (json.dumps(journal_reply), req['request_id']))
            self.db.commit()
        return reply

    def close(self):
        self.db.close()

def main():
    os.umask(0o077)
    signal.alarm(35)  # Bound idle stdin and failed UI calls; pending journal survives termination.
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', required=True)
    args = parser.parse_args()
    # Forced command must ignore SSH_ORIGINAL_COMMAND and all caller arguments.
    raw = sys.stdin.buffer.readline(LIMIT + 1)
    if len(raw) > LIMIT:
        print(json.dumps({'status': 'error', 'error': {'code': 'INVALID_ARGUMENT', 'stage': 'framing', 'next_step': 'Reduce request size.'}}))
        return
    try:
        request = json.loads(raw)
        helper = Helper(args.state)
        try:
            response = helper.handle(request)
        finally:
            helper.close()
    except (BridgeError, ValueError, OSError, sqlite3.Error):
        response = {'status': 'error', 'error': {'code': 'PERMISSION_DENIED', 'stage': 'startup', 'next_step': 'Owner must verify root-owned helper state and pairing.'}}
    print(json.dumps(response, ensure_ascii=False))

if __name__ == '__main__':
    main()
