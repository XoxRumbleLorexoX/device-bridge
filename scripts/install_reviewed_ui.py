#!/usr/bin/env python3
"""Owner-approved installation of the restricted UI package, without reload."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile

PACKAGE = 'dev.devicebridge.ui'
VERSION = '0.1.0-2+debug'
PACKAGE_HASH = '748c29c121e8468e67e86ce117a3052cbf0ec9cea75ee766e6e9a5ac86e2b212'
SOURCE = Path('/var/jb/var/mobile/device-bridge-ui-reviewed.deb')
FILES = {
    Path('/var/jb/Library/MobileSubstrate/DynamicLibraries/DeviceBridgeUI.dylib'):
        '5375a7e5f0cbaad3ab6492765e004ae3755c7f9bb9de099bf1bb0c0706cafba3',
    Path('/var/jb/Library/MobileSubstrate/DynamicLibraries/DeviceBridgeUI.plist'):
        'f0f5f53f83d5a79930ce9b6ee491e6674d911918564049111468f40f625d791f',
}


def run(args, timeout=60):
    return subprocess.run(args, check=True, timeout=timeout,
                          env={'PATH': '/var/jb/usr/bin:/var/jb/usr/sbin:/usr/bin:/bin:/usr/sbin:/sbin',
                               'HOME': '/var/root', 'LANG': 'C'}, stdin=subprocess.DEVNULL)


def package_bytes():
    fd = os.open(str(SOURCE), os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size != 304648:
            raise RuntimeError('Unexpected package type or size.')
        data = stream.read()
    if hashlib.sha256(data).hexdigest() != PACKAGE_HASH:
        raise RuntimeError('Package hash mismatch; nothing installed.')
    return data


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run in the owner root terminal. No password is accepted by this script.')
    query = subprocess.run(['/var/jb/usr/bin/dpkg-query', '-W', '-f=${Status}', PACKAGE],
                           capture_output=True, text=True, timeout=10)
    if query.returncode != 1 or query.stdout.strip():
        raise RuntimeError('UI package state is not absent; preserve it and inspect.')
    for path in FILES:
        if os.path.lexists(path):
            raise RuntimeError(f'UI destination already exists; preserve it: {path}')
    data = package_bytes()
    stage = Path(tempfile.mkdtemp(prefix='device-bridge-ui-', dir='/var/root'))
    package = stage / 'ui.deb'
    fd = os.open(str(package), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    journal = stage / 'outcome.json'
    def record(state):
        journal.write_text(json.dumps({'state': state, 'package': PACKAGE, 'version': VERSION,
                                       'sha256': PACKAGE_HASH, 'reload': 'not_performed'}) + '\n')
        journal.chmod(0o600)
    record('staged')
    print('Protected package:', package, flush=True)
    run(['/var/jb/usr/bin/dpkg', '--no-act', '--no-triggers', '--install', str(package)])
    record('install_started_outcome_not_yet_verified')
    run(['/var/jb/usr/bin/dpkg', '--no-triggers', '--install', str(package)])
    for path, expected in FILES.items():
        info = path.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or
                hashlib.sha256(path.read_bytes()).hexdigest() != expected):
            raise RuntimeError('Installed UI file verification failed; preserve evidence, do not retry.')
    record('installed_files_verified_no_reload')
    run(['/var/jb/usr/bin/dpkg-query', '-W', '-f=${Package} ${Version} ${Status}\n', PACKAGE])
    print('UI package installed and files verified. No SpringBoard reload or respring performed.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        print('Stopped:', error)
        print('If installation began, preserve the protected staging directory; do not retry blindly.')
        raise SystemExit(1)
