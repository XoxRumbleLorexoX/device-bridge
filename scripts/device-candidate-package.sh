#!/bin/sh
# Build and review one restricted UI candidate package. No installation or activation.
set -eu

if [ "$(id -u)" = 0 ]; then
    echo 'Run candidate packaging as mobile, not root.' >&2
    exit 1
fi
: "${THEOS:?Set THEOS to the verified Theos directory}"
test -f "$THEOS/makefiles/common.mk" || { echo 'Theos makefiles missing' >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo 'python3 is required' >&2; exit 1; }

cd "$(dirname "$0")"
unset BASH_ENV ENV CDPATH
bridge_build_bash=$(command -v bash)

test -f SHA256SUMS || { echo 'SHA256SUMS missing' >&2; exit 1; }
test -f CANDIDATE_VERSION || { echo 'CANDIDATE_VERSION missing' >&2; exit 1; }
test -f tools/review_ui_package.py || { echo 'Offline package reviewer missing' >&2; exit 1; }

# Verify the source bundle before compiling. Build output is intentionally excluded
# from SHA256SUMS and may be created only after this check succeeds.
python3 - <<'PY'
from hashlib import sha256
from pathlib import Path
import stat
root = Path('.').resolve()
for raw in Path('SHA256SUMS').read_text().splitlines():
    digest, sep, relative = raw.partition('  ')
    if not sep or len(digest) != 64:
        raise SystemExit('Malformed SHA256SUMS entry')
    path = root / relative
    try:
        info = path.lstat()
    except FileNotFoundError:
        raise SystemExit(f'Missing source file: {relative}')
    if not stat.S_ISREG(info.st_mode) or path.is_symlink():
        raise SystemExit(f'Non-regular source file: {relative}')
    if sha256(path.read_bytes()).hexdigest() != digest:
        raise SystemExit(f'Source hash mismatch: {relative}')
print('Source manifest verified.')
PY

candidate_version=$(tr -d '\r\n' < CANDIDATE_VERSION)
case "$candidate_version" in
    ''|*[!0-9A-Za-z.+~-]*) echo 'Invalid candidate version marker' >&2; exit 1 ;;
esac
control_version=$(awk -F': ' '$1 == "Version" { print $2 }' executor/control)
control_arch=$(awk -F': ' '$1 == "Architecture" { print $2 }' executor/control)
[ "$control_version" = "$candidate_version" ] || { echo 'Executor control version mismatch' >&2; exit 1; }
[ "$control_arch" = 'iphoneos-arm64' ] || { echo 'Executor control architecture mismatch' >&2; exit 1; }

# A transferred source bundle must be fresh. Refuse stale package output rather than
# choosing one package from a mixed directory.
if [ -e executor/packages ]; then
    echo 'executor/packages already exists; use a fresh extracted bundle.' >&2
    exit 1
fi
[ ! -e candidate-review.json ] || { echo 'candidate-review.json already exists' >&2; exit 1; }
[ ! -e CANDIDATE_SHA256SUMS ] || { echo 'CANDIDATE_SHA256SUMS already exists' >&2; exit 1; }

# FINALPACKAGE=1 creates a clean package version from executor/control. The command
# stops at package creation: it does not run make install, dpkg, reload or respring.
make -C executor clean package \
    FINALPACKAGE=1 \
    THEOS="$THEOS" \
    THEOS_PACKAGE_SCHEME=rootless \
    TARGET=iphone:clang:16.5:15.0 \
    SHELL="$bridge_build_bash" \
    '.SHELLFLAGS=--noprofile --norc -c'

candidate_deb=$(python3 - <<'PY'
from pathlib import Path
packages = [p for p in Path('executor/packages').glob('*.deb') if p.is_file() and not p.is_symlink()]
if len(packages) != 1:
    raise SystemExit(f'Expected exactly one candidate .deb, found {len(packages)}')
print(packages[0])
PY
)

python3 tools/review_ui_package.py "$candidate_deb" \
    --expected-version "$candidate_version" \
    --expected-architecture iphoneos-arm64 \
    --output candidate-review.json

CANDIDATE_DEB="$candidate_deb" python3 - <<'PY'
from hashlib import sha256
from pathlib import Path
import os
paths = [Path(os.environ['CANDIDATE_DEB']), Path('candidate-review.json')]
lines = []
for path in paths:
    lines.append(f'{sha256(path.read_bytes()).hexdigest()}  {path}')
Path('CANDIDATE_SHA256SUMS').write_text('\n'.join(lines) + '\n')
PY

printf '%s\n' 'Candidate package created and reviewed. Nothing installed or activated.'
printf 'Package: %s\n' "$candidate_deb"
cat CANDIDATE_SHA256SUMS
