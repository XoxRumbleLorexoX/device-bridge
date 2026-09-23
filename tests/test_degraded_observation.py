import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
import uuid

spec = importlib.util.spec_from_file_location(
    'bridge_helper', Path(__file__).resolve().parents[1] / 'device/helper.py'
)
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)


class StateOnlyUI:
    """Simulation of the executor's degraded observation mode; not device evidence."""

    def __init__(self):
        self.mutations = 0
        self.data = {
            'epoch': 'springboard-epoch-1',
            'app': 'com.apple.springboard',
            'pid': 42,
            'locked': False,
            'screen': {
                'width': 390,
                'height': 844,
                'scale': 3,
                'native_scale': 3,
                'orientation': 'portrait',
            },
            'elements': [],
            'consistent': True,
            'captured_at': time.time(),
            'atomic': False,
            'observation_mode': 'state_only',
            'ax_status': 'timeout',
            'screenshot_status': 'skipped',
        }

    def call(self, request, deadline):
        if request['op'] == 'observe':
            result = copy.deepcopy(self.data)
            result['captured_at'] = time.time()
            return result
        self.mutations += 1
        if request['action']['kind'] == 'launch':
            self.data['app'] = h.FIXTURE
            self.data['pid'] = 100
        return {'status': 'dispatched'}


class DegradedObservationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.token = 'd' * 64
        self.device = str(uuid.uuid4())
        policy = {
            'device_id': self.device,
            'operators': {
                'owner': {
                    'credential_sha256': hashlib.sha256(self.token.encode()).hexdigest(),
                    'revoked': False,
                    'expires': time.time() + 3600,
                    'grants': {
                        'fixture': {
                            'app': h.FIXTURE,
                            'expires': time.time() + 600,
                            'scopes': ['observe', 'control'],
                        }
                    },
                }
            },
        }
        policy_path = self.root / 'policy.json'
        policy_path.write_text(json.dumps(policy))
        policy_path.chmod(0o600)
        self.ui = StateOnlyUI()
        self.helper = h.Helper(self.root, self.ui, uid=os.getuid())
        self.session = self.helper.handle(self.request('session_open', grant_id='fixture'))['data']

    def tearDown(self):
        self.helper.close()
        self.tmp.cleanup()

    def request(self, method, **extra):
        return dict(
            version=1,
            method=method,
            audience='device-bridge/helper/v1',
            device_id=self.device,
            principal='owner',
            credential=self.token,
            request_id=str(uuid.uuid4()),
            deadline=time.time() + 20,
            **extra,
        )

    def scoped(self, method, **extra):
        return self.request(
            method,
            session_id=self.session['session_id'],
            fence=self.session['fence'],
            scope='control' if method == 'act' else 'observe',
            **extra,
        )

    def test_state_only_launch_can_verify_foreground_fixture(self):
        result = self.helper.handle(self.scoped('act', action={'kind': 'launch'}))
        self.assertEqual(result['status'], 'ok', result)
        self.assertEqual(result['data']['status'], 'verified')
        self.assertEqual(result['data']['after']['observation_mode'], 'state_only')
        self.assertEqual(result['data']['after']['ax_status'], 'timeout')
        self.assertEqual(result['data']['after']['elements'], [])
        self.assertEqual(self.ui.mutations, 1)

    def test_state_only_observation_cannot_authorize_blind_tap(self):
        self.ui.data['app'] = h.FIXTURE
        self.ui.data['pid'] = 100
        observation = self.helper.handle(self.scoped('observe'))['data']
        request = self.scoped(
            'act',
            observation_id=observation['observation_id'],
            action={'kind': 'tap_element', 'ref': observation['observation_id'] + ':0'},
        )
        result = self.helper.handle(request)
        self.assertEqual(result['status'], 'error', result)
        self.assertEqual(result['error']['code'], 'INVALID_ARGUMENT', result)
        self.assertEqual(self.ui.mutations, 0)

    def test_native_source_declares_bounded_state_only_fallback(self):
        source = (Path(__file__).resolve().parents[1] / 'device/BridgeUI.m').read_text()
        self.assertIn('StateOnlyObservation', source)
        self.assertIn('result[@"elements"] = @[];', source)
        self.assertIn('result[@"observation_mode"] = @"state_only";', source)
        self.assertIn('return StateOnlyObservation(before, request, @"timeout");', source)


if __name__ == '__main__':
    unittest.main()
