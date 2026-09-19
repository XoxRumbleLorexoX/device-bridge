#!/usr/bin/env python3
"""Owner-approved fixture 0.1.0 to 0.1.1 replacement. No executor, grants, or restart operations."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile

PACKAGE = 'dev.devicebridge.fixture'
VERSION = '0.1.1-1+debug'
PREVIOUS_VERSION = '0.1.0-2+debug'
PACKAGE_HASH = 'd5df4005ea604c80b8806d97307ba96eacac49d41fcfaac4ee44a991e4bad3fd'
PREVIOUS_HASH = '9e9b807e7b87d3118f9ce84245f50e3ba82e254fa0a995cf76fa55b9b728acc9'
PREVIOUS_SOURCE = Path('/var/jb/tmp/device-bridge-build-f45txwo0/device-bridge-build/fixture/packages/dev.devicebridge.fixture_0.1.0-2+debug_iphoneos-arm64.deb')
SOURCE = Path('/tmp/bridge-fixture-candidate-5afp9pka/fixture/packages/dev.devicebridge.fixture_0.1.1-1+debug_iphoneos-arm64.deb')
DESTINATION = Path('/var/jb/Applications/BridgeFixture.app')
PREVIOUS_FILES = {
    'BridgeFixture': '852dfe3e5504e90f48f8b1e838f54ee3fcfdbdadfc2ec341a02b69b35f341c02',
    'Info.plist': '2633dbeba0bcbe44087a659ce6a53f2759735a0abc54fb550a488dae62739df7',
    'LICENSE': 'cda3de542bded2ed96971e6fbebfddcb9e1d4ad755222225b74755ec0b5c1e7d',
}
FILES = {'AppIcon60.png': '43586a1fdeb23a63eb3729a85c6487a4f154665fef73060c25fcf180089c566a', 'AppIcon60@2x.png': '7a1f2010cf35c4609758bd2210b4c59705ef8beb74556dbe74d80d3ea53be3f6', 'AppIcon60@3x.png': '17bc6a0645ab13430d9ccfb83396257080214688370175c47dabeb2a566a432f', 'BridgeFixture': '4fdc6d009ece5e8ab955ad6211f0a4dd0bb4e7b235e362ffb82e82423e510189', 'Info.plist': '650274529bbbe0f51a090255117e9d613461e825de7874ffacf24cd8cf1cd8e3', 'LICENSE': 'cda3de542bded2ed96971e6fbebfddcb9e1d4ad755222225b74755ec0b5c1e7d'}


def protected_directory(path):
    path = path.resolve(strict=True)
    for parent in [path, *path.parents]:
        info = parent.stat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('Installation requires root-owned, non-writable ancestors.')


def verified_package(path, expected=PACKAGE_HASH, size=13842):
    fd = os.open(str(path), os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size != size:
            raise RuntimeError('Unexpected package type or size.')
        data = stream.read(size + 1)
    if hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError('Package hash mismatch; nothing installed.')
    return data


def run(args, timeout=60):
    # Absolute executables; no shell, user RC files or inherited loader options.
    return subprocess.run(args, check=True, timeout=timeout,
                          env={'PATH': '/var/jb/usr/bin:/var/jb/usr/sbin:/usr/bin:/bin:/usr/sbin:/sbin',
                               'HOME': '/var/root', 'LANG': 'C'},
                          stdin=subprocess.DEVNULL)


def verify_files(files):
    for name, expected in files.items():
        path = DESTINATION / name
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Installed file verification failed; preserve evidence, do not retry installation.')

def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run in the owner root terminal. No password is accepted by this script.')
    protected_directory(Path('/var/root'))
    protected_directory(DESTINATION.parent)
    protected_directory(DESTINATION)
    query = subprocess.run(['/var/jb/usr/bin/dpkg-query', '-W', '-f=${Version}\n${Status}', PACKAGE],
                           capture_output=True, text=True, timeout=10)
    accepted = [PREVIOUS_VERSION + '\ninstall ok installed', PREVIOUS_VERSION + '\ninstall ok triggers-awaited']
    if query.returncode != 0 or query.stdout.strip() not in accepted:
        raise RuntimeError('Expected previous fixture version/state; stop and inspect.')
    verify_files(PREVIOUS_FILES)
    previous_data = verified_package(PREVIOUS_SOURCE, PREVIOUS_HASH, 13192)
    data = verified_package(SOURCE)
    stage = Path(tempfile.mkdtemp(prefix='device-bridge-fixture-', dir='/var/root'))
    previous = stage / 'previous-fixture.deb'
    fd = os.open(str(previous), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(previous_data)
        stream.flush()
        os.fsync(stream.fileno())
    package = stage / 'fixture.deb'
    fd = os.open(str(package), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    # Retain this protected package and outcome journal even on failure.
    journal = stage / 'outcome.json'
    def record(state):
        journal.write_text(json.dumps({'state': state, 'package': PACKAGE, 'version': VERSION,
                                       'sha256': PACKAGE_HASH}) + '\n')
        journal.chmod(0o600)
    record('staged')
    print('Protected package:', package, flush=True)
    run(['/var/jb/usr/bin/dpkg', '--no-act', '--no-triggers', '--install', str(package)])
    record('install_started_outcome_not_yet_verified')
    run(['/var/jb/usr/bin/dpkg', '--no-triggers', '--install', str(package)])
    verify_files(FILES)
    record('files_verified_registration_pending')
    run(['/var/jb/usr/bin/uicache', '-p', str(DESTINATION)])
    run(['/var/jb/usr/bin/dpkg-query', '-W', '-f=${Package} ${Version} ${Status}\n', PACKAGE])
    run(['/var/jb/usr/bin/uicache', '-i', PACKAGE])
    record('replacement_and_registration_commands_completed_runtime_unverified')
    print('Replacement files verified. Open Bridge Fixture manually to test launch. No restart or executor installation performed.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        print('Stopped:', error)
        print('If installation began, its outcome may be partial. Preserve the protected staging directory; do not repeat blindly.')
        raise SystemExit(1)
