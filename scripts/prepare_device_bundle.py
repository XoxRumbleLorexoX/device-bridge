#!/usr/bin/env python3
"""Create a new source-only archive for an owner-operated device compile check."""
import argparse
import hashlib
from pathlib import Path
import shutil
import tarfile
import tempfile

from prepare_executor import ROOT, prepare


def bundle(output):
    with tempfile.TemporaryDirectory(prefix='bridge-source-') as temporary:
        root = Path(temporary) / 'device-bridge-build'
        root.mkdir()
        prepare(root / 'executor')
        (root / 'fixture').mkdir()
        for name in ('main.m', 'Makefile', 'Info.plist', 'control'):
            shutil.copyfile(ROOT / 'fixture' / name, root / 'fixture' / name)
        shutil.copyfile(ROOT / 'scripts/device-build-check.sh', root / 'build-check.sh')
        for name in ('LICENSE', 'THIRD_PARTY_NOTICES.md', 'upstreams.json'):
            shutil.copyfile(ROOT / name, root / name)
        shutil.copytree(ROOT / 'notices', root / 'notices')
        manifest = []
        for path in sorted(root.rglob('*')):
            if path.is_file():
                manifest.append(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + str(path.relative_to(root)))
        (root / 'SHA256SUMS').write_text('\n'.join(manifest) + '\n')
        # Exclusive creation: never overwrite an existing owner file.
        with output.open('xb') as target:
            with tarfile.open(fileobj=target, mode='w:gz') as archive:
                archive.add(root, arcname=root.name)
    print('Archive:', output)
    print('SHA256:', hashlib.sha256(output.read_bytes()).hexdigest())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    bundle(parser.parse_args().output)
