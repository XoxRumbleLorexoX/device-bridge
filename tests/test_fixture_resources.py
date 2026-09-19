"""Check that iPhone icon declarations resolve to opaque PNG resources."""
from pathlib import Path
import plistlib
import struct
import unittest


class FixtureResourcesTests(unittest.TestCase):
    def test_declared_iphone_icon_sizes_are_present_and_packaged(self):
        root = Path(__file__).resolve().parents[1] / 'fixture'
        info = plistlib.loads((root / 'Info.plist').read_bytes())
        names = info['CFBundleIcons']['CFBundlePrimaryIcon']['CFBundleIconFiles']
        makefile = (root / 'Makefile').read_text()
        for name in names:
            for suffix, size in [('', 60), ('@2x', 120), ('@3x', 180)]:
                relative = 'Resources/' + name + suffix + '.png'
                blob = (root / relative).read_bytes()
                self.assertEqual(blob[:8], b'\x89PNG\r\n\x1a\n')
                self.assertEqual(struct.unpack('>II', blob[16:24]), (size, size))
                self.assertEqual(blob[25], 2, 'Icon must be opaque RGB')
                self.assertIn(relative, makefile)
        self.assertIn('Version: ' + info['CFBundleShortVersionString'], (root / 'control').read_text())
