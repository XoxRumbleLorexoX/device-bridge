"""Owner installer preflight tests; never invokes dpkg, uicache, or root actions."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('fixture_installer', Path(__file__).resolve().parents[1] / 'scripts/install_reviewed_fixture.py')
i = importlib.util.module_from_spec(spec)
spec.loader.exec_module(i)


class FixtureInstallerTests(unittest.TestCase):
    def test_nonroot_stops_before_any_command(self):
        with patch.object(i.os, 'geteuid', return_value=501), patch.object(i.subprocess, 'run') as command:
            with self.assertRaises(RuntimeError): i.main()
            command.assert_not_called()

    def test_existing_destination_stops_before_any_command(self):
        with patch.object(i.os, 'geteuid', return_value=0), patch.object(i, 'protected_directory'), patch.object(i.os.path, 'lexists', return_value=True), patch.object(i.subprocess, 'run') as command:
            with self.assertRaises(RuntimeError): i.main()
            command.assert_not_called()

    def test_modified_package_and_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            p = Path(temporary) / 'package.deb'
            p.write_bytes(b'x' * 13192)
            with self.assertRaises(RuntimeError): i.verified_package(p)
            link = Path(temporary) / 'link.deb'
            link.symlink_to(p)
            with self.assertRaises(OSError): i.verified_package(link)

    def test_failed_dry_run_never_installs(self):
        with tempfile.TemporaryDirectory() as temporary:
            query = subprocess.CompletedProcess([], 1, '', '')
            with patch.object(i.os, 'geteuid', return_value=0), patch.object(i, 'protected_directory'), patch.object(i.os.path, 'lexists', return_value=False), patch.object(i, 'verified_package', return_value=b'synthetic package'), patch.object(i.tempfile, 'mkdtemp', return_value=temporary), patch.object(i.subprocess, 'run', return_value=query), patch.object(i, 'run', side_effect=subprocess.CalledProcessError(1, 'dry-run')) as command:
                with self.assertRaises(subprocess.CalledProcessError): i.main()
                self.assertEqual(command.call_count, 1)
                self.assertIn('--no-act', command.call_args.args[0])
                self.assertNotIn('install_started', (Path(temporary) / 'outcome.json').read_text())
