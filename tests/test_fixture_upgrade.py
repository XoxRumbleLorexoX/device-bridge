"""Upgrade safeguards with synthetic state; never runs a privileged command."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('fixture_upgrade', Path(__file__).resolve().parents[1] / 'scripts/upgrade_reviewed_fixture.py')
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)

class FixtureUpgradeTests(unittest.TestCase):
    def test_unexpected_version_prevents_staging(self):
        result = subprocess.CompletedProcess([], 0, '0.1.1-1+debug\ninstall ok installed', '')
        with patch.object(u.os, 'geteuid', return_value=0), patch.object(u, 'protected_directory'), patch.object(u.subprocess, 'run', return_value=result), patch.object(u.tempfile, 'mkdtemp') as stage:
            with self.assertRaises(RuntimeError): u.main()
            stage.assert_not_called()

    def test_changed_installed_files_prevent_staging(self):
        result = subprocess.CompletedProcess([], 0, u.PREVIOUS_VERSION + '\ninstall ok triggers-awaited', '')
        with patch.object(u.os, 'geteuid', return_value=0), patch.object(u, 'protected_directory'), patch.object(u.subprocess, 'run', return_value=result), patch.object(u, 'verify_files', side_effect=RuntimeError('Changed file')) as verify, patch.object(u.tempfile, 'mkdtemp') as stage:
            with self.assertRaises(RuntimeError): u.main()
            verify.assert_called_once_with(u.PREVIOUS_FILES)
            stage.assert_not_called()

    def test_previous_package_retained_and_failed_dry_run_never_upgrades(self):
        for status in ['installed', 'triggers-awaited']:
            result = subprocess.CompletedProcess([], 0, u.PREVIOUS_VERSION + '\ninstall ok ' + status, '')
            with self.subTest(status=status), tempfile.TemporaryDirectory() as temporary:
                with patch.object(u.os, 'geteuid', return_value=0), patch.object(u, 'protected_directory'), patch.object(u.subprocess, 'run', return_value=result), patch.object(u, 'verify_files'), patch.object(u, 'verified_package', side_effect=[b'previous', b'candidate']), patch.object(u.tempfile, 'mkdtemp', return_value=temporary), patch.object(u, 'run', side_effect=subprocess.CalledProcessError(1, 'dry-run')) as command:
                    with self.assertRaises(subprocess.CalledProcessError): u.main()
                    self.assertEqual((Path(temporary)/'previous-fixture.deb').read_bytes(), b'previous')
                    self.assertEqual((Path(temporary)/'fixture.deb').read_bytes(), b'candidate')
                    self.assertEqual(command.call_count, 1)
                    self.assertIn('--no-act', command.call_args.args[0])
