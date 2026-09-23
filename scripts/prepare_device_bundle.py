#!/usr/bin/env python3
"""Create a deterministic source-only archive for owner-operated native build/review."""
import argparse
import gzip
import hashlib
from pathlib import Path
import shutil
import tarfile
import tempfile

try:
    from .prepare_executor import ROOT, prepare
except ImportError:  # Direct script execution keeps scripts/ on sys.path.
    from prepare_executor import ROOT, prepare


def _control_version(control: Path) -> str:
    versions = []
    for line in control.read_text().splitlines():
        key, sep, value = line.partition(':')
        if sep and key == 'Version':
            versions.append(value.strip())
    if len(versions) != 1 or not versions[0]:
        raise SystemExit('device/control must contain exactly one non-empty Version field.')
    version = versions[0]
    if any(character not in '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.+~-' for character in version):
        raise SystemExit('device/control Version contains unsupported characters.')
    return version


def _write_manifest(root: Path) -> None:
    lines = []
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise SystemExit(f'Symlink rejected from source bundle: {path.relative_to(root)}')
        if path.is_file():
            relative = path.relative_to(root)
            lines.append(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + str(relative))
    (root / 'SHA256SUMS').write_text('\n'.join(lines) + '\n')


def _tar_info(path: Path, root_parent: Path) -> tarfile.TarInfo:
    relative = path.relative_to(root_parent).as_posix()
    info = tarfile.TarInfo(relative)
    info.mtime = 0
    info.uid = 0
    info.gid = 0
    info.uname = ''
    info.gname = ''
    if path.is_symlink():
        raise SystemExit(f'Symlink rejected from source bundle: {relative}')
    if path.is_dir():
        info.type = tarfile.DIRTYPE
        info.mode = 0o755
        info.size = 0
    elif path.is_file():
        info.type = tarfile.REGTYPE
        info.mode = 0o755 if path.suffix == '.sh' else 0o644
        info.size = path.stat().st_size
    else:
        raise SystemExit(f'Non-regular source entry rejected: {relative}')
    return info


def _write_deterministic_archive(root: Path, output: Path) -> None:
    paths = [root, *sorted(root.rglob('*'))]
    # Exclusive creation: never overwrite an existing owner file. gzip and tar
    # metadata are normalized so identical source bytes produce identical archives.
    with output.open('xb') as raw:
        with gzip.GzipFile(filename='', mode='wb', compresslevel=9, fileobj=raw, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w', format=tarfile.GNU_FORMAT) as archive:
                for path in paths:
                    info = _tar_info(path, root.parent)
                    if info.isfile():
                        with path.open('rb') as source:
                            archive.addfile(info, source)
                    else:
                        archive.addfile(info)


def bundle(output: Path) -> str:
    with tempfile.TemporaryDirectory(prefix='bridge-source-') as temporary:
        root = Path(temporary) / 'device-bridge-build'
        root.mkdir()
        prepare(root / 'executor')

        (root / 'fixture').mkdir()
        for name in ('main.m', 'Makefile', 'Info.plist', 'control'):
            shutil.copyfile(ROOT / 'fixture' / name, root / 'fixture' / name)
        shutil.copytree(ROOT / 'fixture/Resources', root / 'fixture/Resources')

        shutil.copyfile(ROOT / 'scripts/device-build-check.sh', root / 'build-check.sh')
        shutil.copyfile(ROOT / 'scripts/device-candidate-package.sh', root / 'package-candidate.sh')
        (root / 'tools').mkdir()
        shutil.copyfile(ROOT / 'scripts/review_ui_package.py', root / 'tools/review_ui_package.py')
        (root / 'CANDIDATE_VERSION').write_text(_control_version(ROOT / 'device/control') + '\n')

        for name in ('LICENSE', 'THIRD_PARTY_NOTICES.md', 'upstreams.json'):
            shutil.copyfile(ROOT / name, root / name)
        shutil.copytree(ROOT / 'notices', root / 'notices')

        _write_manifest(root)
        _write_deterministic_archive(root, output)

    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print('Archive:', output)
    print('SHA256:', digest)
    print('Contains compile-only build-check.sh and package-only package-candidate.sh; neither installs or activates.')
    return digest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    bundle(parser.parse_args().output)
