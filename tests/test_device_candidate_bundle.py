import hashlib
from pathlib import Path
import re
import tarfile
import tempfile
import time
import unittest

from scripts.prepare_device_bundle import (
    ROOT,
    _control_version,
    _write_deterministic_archive,
    _write_manifest,
)


class DeviceCandidateBundleTests(unittest.TestCase):
    def _tree(self, base: Path) -> Path:
        root = base / 'device-bridge-build'
        (root / 'executor').mkdir(parents=True)
        (root / 'tools').mkdir()
        (root / 'executor' / 'control').write_text(
            'Package: dev.devicebridge.ui\nVersion: 0.1.1\nArchitecture: iphoneos-arm64\n'
        )
        (root / 'executor' / 'BridgeUI.m').write_text('same-source\n')
        (root / 'tools' / 'review_ui_package.py').write_text('print("review")\n')
        (root / 'package-candidate.sh').write_text('#!/bin/sh\necho package\n')
        (root / 'CANDIDATE_VERSION').write_text('0.1.1\n')
        return root

    def test_archive_is_byte_reproducible_across_mtime_and_parent_changes(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            first = self._tree(base / 'first')
            second = self._tree(base / 'second')
            _write_manifest(first)
            _write_manifest(second)
            now = time.time()
            for index, path in enumerate(second.rglob('*')):
                path.touch(exist_ok=True)
                try:
                    path.chmod(path.stat().st_mode)
                except OSError:
                    pass
                # Archive metadata must not depend on source mtimes.
                if path.is_file():
                    path.touch()
            one = base / 'one.tar.gz'
            two = base / 'two.tar.gz'
            _write_deterministic_archive(first, one)
            _write_deterministic_archive(second, two)
            self.assertEqual(hashlib.sha256(one.read_bytes()).digest(), hashlib.sha256(two.read_bytes()).digest())

            with tarfile.open(one, 'r:gz') as archive:
                members = archive.getmembers()
                self.assertTrue(all(member.mtime == 0 for member in members))
                self.assertTrue(all(member.uid == 0 and member.gid == 0 for member in members))
                self.assertTrue(all(member.isfile() or member.isdir() for member in members))
                self.assertIn('device-bridge-build/SHA256SUMS', {member.name for member in members})

    def test_manifest_hashes_every_source_file_and_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = self._tree(Path(temporary))
            _write_manifest(root)
            entries = {}
            for line in (root / 'SHA256SUMS').read_text().splitlines():
                digest, relative = line.split('  ', 1)
                entries[relative] = digest
            expected = {
                str(path.relative_to(root))
                for path in root.rglob('*')
                if path.is_file() and path.name != 'SHA256SUMS'
            }
            self.assertEqual(set(entries), expected)
            for relative, digest in entries.items():
                self.assertEqual(digest, hashlib.sha256((root / relative).read_bytes()).hexdigest())

            link = root / 'unsafe-link'
            link.symlink_to(root / 'executor' / 'control')
            with self.assertRaisesRegex(SystemExit, 'Symlink rejected'):
                _write_manifest(root)

    def test_candidate_version_and_package_script_are_narrow(self):
        self.assertEqual(_control_version(ROOT / 'device' / 'control'), '0.1.1')
        script = (ROOT / 'scripts' / 'device-candidate-package.sh').read_text()
        self.assertIn('FINALPACKAGE=1', script)
        self.assertRegex(script, r'make -C executor clean package')
        self.assertIn('tools/review_ui_package.py', script)
        self.assertIn('--expected-architecture iphoneos-arm64', script)
        self.assertIn('CANDIDATE_SHA256SUMS', script)

        executable_lines = []
        for line in script.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith('#') or stripped.startswith(('echo ', 'printf ')):
                continue
            executable_lines.append(stripped)
        commands = '\n'.join(executable_lines)
        self.assertIsNone(re.search(r'(^|\s)(dpkg|sbreload|respring|killall|launchctl|ssh|scp)(\s|$)', commands))
        self.assertIsNone(re.search(r'\bmake\b[^\n]*\binstall\b', commands))


if __name__ == '__main__':
    unittest.main()
