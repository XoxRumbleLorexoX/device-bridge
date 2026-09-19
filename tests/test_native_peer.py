"""Compile/test the exact portable peer guard; not an iOS build or hardware test."""
from pathlib import Path
import subprocess
import tempfile
import unittest

class NativePeerTests(unittest.TestCase):
    def test_disconnected_and_half_closed_helper_is_rejected(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as directory:
            binary = str(Path(directory) / 'peer-test')
            subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-I', str(root / 'device'), str(root / 'tests/peer_test.c'), '-o', binary], check=True, capture_output=True)
            subprocess.run([binary], check=True, timeout=5, capture_output=True)
