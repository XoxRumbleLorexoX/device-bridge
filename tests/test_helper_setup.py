"""Owner setup preflight and recovery checks, isolated from deployment paths."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from test_helper import h
from test_owner import owner

spec = importlib.util.spec_from_file_location('helper_setup', Path(__file__).resolve().parents[1] / 'scripts/owner_helper_setup.py')
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)

class NoUI:
    def call(self, *args):
        raise AssertionError('Setup recovery checks must never contact UI')

class HelperSetupTests(unittest.TestCase):
    def test_nonroot_cannot_install(self):
        with patch.object(s.os, 'geteuid', return_value=501), patch.object(s, 'preflight') as preflight:
            with self.assertRaises(RuntimeError): s.install_and_test()
            preflight.assert_not_called()

    def test_payload_rejects_extra_files_and_hash_mismatch(self):
        data = b'# valid source\n'
        item = {'base64': base64.b64encode(data).decode(), 'sha256': hashlib.sha256(data).hexdigest()}
        payload = {n: dict(item) for n in ['helper.py', 'owner.py', 'LICENSE']}
        self.assertEqual(len(s.payload_files(payload)), 3)
        with self.assertRaises(RuntimeError): s.payload_files(dict(payload, extra=item))
        payload['owner.py']['sha256'] = '0' * 64
        with self.assertRaises(RuntimeError): s.payload_files(payload)

    def test_all_preflight_finishes_before_target_creation(self):
        with tempfile.TemporaryDirectory() as temporary:
            install = Path(temporary) / 'install'
            with patch.object(s.os, 'geteuid', return_value=0), patch.object(s, 'INSTALL', install), patch.object(s, 'preflight', side_effect=RuntimeError('existing state')):
                with self.assertRaises(RuntimeError): s.install_and_test()
                self.assertFalse(install.exists())

    def test_real_policy_recovery_checks_end_revoked_stopped_without_ui(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            state, shared, credential = root/'state', root/'shared', root/'credential'
            uid = os.getuid()
            initialized = owner.administer('init', state, shared, credential_output=credential, required_uid=uid)
            def invoke(script, args, request=None):
                self.assertEqual(script, 'helper.py')
                helper = h.Helper(state, ui=NoUI(), uid=uid)
                helper.control_dir = shared
                try: return helper.handle(request)
                finally: helper.close()
            def owner_command(command, *args):
                return owner.administer(command, state, shared, required_uid=uid)
            with patch.object(s, 'STATE', state), patch.object(s, 'SHARED', shared), patch.object(s, 'invoke', side_effect=invoke), patch.object(s, 'owner', side_effect=owner_command):
                checks = s.recovery_checks(initialized['device_id'], credential.read_text().strip())
            self.assertEqual(len(checks), 7)
            policy = json.loads((state/'policy.json').read_text())
            self.assertTrue(policy['operators']['operator']['revoked'])
            self.assertEqual(policy['operators']['operator']['grants'], {})
            self.assertEqual(json.loads((shared/'lease.json').read_text()), {'enabled': False})
