"""Owner lifecycle tests use isolated non-production paths and synthetic grants."""
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('owner', Path(__file__).resolve().parents[1] / 'device/owner.py')
owner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(owner)

class OwnerLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.state = self.root / 'state'
        self.shared = self.root / 'shared'
        self.credential = self.root / 'test-credential'
        self.uid = os.getuid()
    def tearDown(self):
        self.temp.cleanup()
    def run_owner(self, command, **kwargs):
        return owner.administer(command, self.state, self.shared, required_uid=self.uid, **kwargs)
    def initialize(self):
        return self.run_owner('init', credential_output=self.credential)
    def policy(self):
        return json.loads((self.state / 'policy.json').read_text())
    def assert_lease_stopped(self):
        self.assertEqual(json.loads((self.shared / 'lease.json').read_text()), {'enabled': False})
    def install_session(self):
        with sqlite3.connect(self.state / 'journal.sqlite') as db:
            db.executescript('CREATE TABLE sessions(active INTEGER); INSERT INTO sessions VALUES(1); CREATE TABLE observations(value TEXT); INSERT INTO observations VALUES("test");')
        (self.state / 'journal.sqlite').chmod(0o600)
        owner.atomic(self.shared / 'lease.json', {'enabled': True}, 0o644)

    def test_missing_credential_output_leaves_no_state(self):
        with self.assertRaises(owner.OwnerError): self.run_owner('init')
        self.assertFalse(self.state.exists())
        self.assertFalse(self.shared.exists())

    def test_existing_credential_and_broken_symlink_are_preserved(self):
        self.credential.write_text('keep')
        with self.assertRaises(owner.OwnerError): self.initialize()
        self.assertEqual(self.credential.read_text(), 'keep')
        self.assertFalse(self.state.exists())
        self.credential.unlink()
        self.credential.symlink_to(self.root / 'missing')
        with self.assertRaises(owner.OwnerError): self.initialize()
        self.assertTrue(self.credential.is_symlink())
        self.assertFalse(self.state.exists())

    def test_existing_shared_data_never_gets_overwritten(self):
        self.shared.mkdir()
        (self.shared / 'unrelated').write_text('keep')
        with self.assertRaises(owner.OwnerError): self.initialize()
        self.assertEqual((self.shared / 'unrelated').read_text(), 'keep')
        self.assertFalse(self.state.exists())
        self.assertFalse(self.credential.exists())

    def test_init_ordinary_write_failure_cleans_only_new_files(self):
        unrelated = self.root / 'unrelated'; unrelated.write_text('keep')
        with patch.object(owner, 'atomic', side_effect=OSError('simulated write failure')):
            with self.assertRaises(OSError): self.initialize()
        self.assertFalse(self.state.exists())
        self.assertFalse(self.shared.exists())
        self.assertFalse(self.credential.exists())
        self.assertEqual(unrelated.read_text(), 'keep')
        # The same setup can be retried without deleting a half-created directory.
        self.assertEqual(self.initialize()['status'], 'complete')

    def test_fresh_setup_protects_secrets_and_starts_without_grants(self):
        result = self.initialize()
        secret = self.credential.read_text().strip()
        policy = self.policy()
        self.assertEqual(len(secret), 64)
        self.assertEqual(policy['operators']['operator']['credential_sha256'], hashlib.sha256(secret.encode()).hexdigest())
        self.assertNotIn(secret, json.dumps(policy))
        self.assertNotIn(secret, json.dumps(result))
        self.assertEqual(policy['operators']['operator']['grants'], {})
        self.assertEqual(self.credential.stat().st_mode & 0o077, 0)
        self.assertEqual(self.state.stat().st_mode & 0o077, 0)
        self.assertEqual((self.shared / 'lease.json').stat().st_mode & 0o777, 0o644)
        self.assert_lease_stopped()

    def test_default_grant_read_only_and_expiry_bounded_by_credential(self):
        self.initialize()
        result = self.run_owner('grant')
        entry = self.policy()['operators']['operator']
        grant = entry['grants'][result['grant_id']]
        self.assertEqual(grant['scopes'], ['observe'])
        self.assertLessEqual(grant['expires'], entry['expires'])
        old = (self.state / 'policy.json').read_bytes()
        with self.assertRaises(owner.OwnerError): self.run_owner('grant', minutes=16)
        self.assertEqual((self.state / 'policy.json').read_bytes(), old)

    def test_owner_lock_rejects_concurrent_mutation_without_changing_policy(self):
        self.initialize()
        old = (self.state / 'policy.json').read_bytes()
        with owner.administration_lock(self.state, self.uid):
            with self.assertRaisesRegex(owner.OwnerError, 'Another owner operation'):
                self.run_owner('grant', control=True)
        self.assertEqual((self.state / 'policy.json').read_bytes(), old)
        self.run_owner('revoke')
        with self.assertRaises(owner.OwnerError): self.run_owner('grant')
        self.assertTrue(self.policy()['operators']['operator']['revoked'])

    def test_symlink_policy_and_lock_are_rejected(self):
        self.initialize()
        policy_path = self.state / 'policy.json'
        backup = self.root / 'original-policy'; policy_path.rename(backup)
        policy_path.symlink_to(backup)
        with self.assertRaises(owner.OwnerError): self.run_owner('grant')
        policy_path.unlink(); backup.rename(policy_path)
        lock_path = self.state / 'owner.lock'; lock_path.unlink()
        unrelated = self.root / 'unrelated'; unrelated.write_text('keep')
        lock_path.symlink_to(unrelated)
        with self.assertRaises(OSError): self.run_owner('grant')
        self.assertEqual(unrelated.read_text(), 'keep')

    def test_rotation_preserves_old_output_and_invalidates_sessions(self):
        self.initialize(); self.run_owner('grant', control=True); self.install_session()
        old_secret = self.credential.read_text()
        before = (self.state / 'policy.json').read_bytes()
        with self.assertRaises(owner.OwnerError): self.run_owner('rotate', credential_output=self.credential)
        self.assertEqual((self.state / 'policy.json').read_bytes(), before)
        replacement = self.root / 'replacement'
        self.run_owner('rotate', credential_output=replacement)
        self.assertEqual(self.credential.read_text(), old_secret)
        self.assertNotEqual(replacement.read_text(), old_secret)
        self.assertEqual(self.policy()['operators']['operator']['grants'], {})
        self.assert_lease_stopped()
        with sqlite3.connect(self.state / 'journal.sqlite') as db:
            self.assertEqual(db.execute('SELECT active FROM sessions').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT count(*) FROM observations').fetchone()[0], 0)

    def test_stop_and_resume_never_restore_previous_grants(self):
        self.initialize(); self.run_owner('grant', control=True); self.install_session()
        self.run_owner('stop')
        self.assertTrue((self.state / 'STOP').exists())
        self.assertEqual(self.policy()['operators']['operator']['grants'], {})
        self.assert_lease_stopped()
        self.run_owner('resume')
        self.assertFalse((self.state / 'STOP').exists())
        self.assertEqual(self.policy()['operators']['operator']['grants'], {})
        self.assert_lease_stopped()

    def test_resume_without_stop_still_clears_old_grants_and_sessions(self):
        self.initialize(); self.run_owner('grant', control=True); self.install_session()
        self.run_owner('resume')
        self.assertEqual(self.policy()['operators']['operator']['grants'], {})
        with sqlite3.connect(self.state / 'journal.sqlite') as db:
            self.assertEqual(db.execute('SELECT active FROM sessions').fetchone()[0], 0)
        self.assert_lease_stopped()

    def test_stop_stays_fail_closed_if_journal_is_corrupt(self):
        self.initialize(); self.run_owner('grant', control=True)
        (self.state / 'journal.sqlite').write_bytes(b'corrupt fixture journal')
        (self.state / 'journal.sqlite').chmod(0o600)
        with self.assertRaises(sqlite3.DatabaseError): self.run_owner('stop')
        self.assertTrue((self.state / 'STOP').exists())
        self.assertEqual(self.policy()['operators']['operator']['grants'], {})
        self.assert_lease_stopped()

    def test_symlink_journal_never_modifies_another_database(self):
        self.initialize()
        other = self.root / 'unrelated.sqlite'
        with sqlite3.connect(other) as db:
            db.executescript('CREATE TABLE sessions(active INTEGER); INSERT INTO sessions VALUES(1); CREATE TABLE observations(value TEXT); INSERT INTO observations VALUES("keep");')
        (self.state / 'journal.sqlite').symlink_to(other)
        with self.assertRaises(owner.OwnerError): self.run_owner('stop')
        self.assert_lease_stopped()
        with sqlite3.connect(other) as db:
            self.assertEqual(db.execute('SELECT active FROM sessions').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT value FROM observations').fetchone()[0], 'keep')

    def test_uninstall_revokes_but_preserves_unrelated_files_and_evidence(self):
        self.initialize(); self.run_owner('grant', control=True)
        unrelated = self.state / 'owner-notes'; unrelated.write_text('keep')
        result = self.run_owner('uninstall')
        self.assertEqual(result['status'], 'revoked_and_stopped')
        self.assertTrue(self.policy()['operators']['operator']['revoked'])
        self.assertTrue(self.credential.exists())
        self.assertEqual(unrelated.read_text(), 'keep')
        self.assert_lease_stopped()
