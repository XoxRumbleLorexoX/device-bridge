#!/bin/sh
# Source-only compile check. Run as mobile in a new owner-selected build directory.
set -eu
if [ "$(id -u)" = 0 ]; then
    echo 'Run this build as mobile, not root.' >&2
    exit 1
fi
: "${THEOS:?Set THEOS to the verified Theos directory}"
test -f "$THEOS/makefiles/common.mk" || { echo 'Theos makefiles missing' >&2; exit 1; }
cd "$(dirname "$0")"
# Noninteractive SSH bash startup output can corrupt Theos $(shell pwd).
# Disable startup files for build subshells without changing owner configuration.
unset BASH_ENV ENV CDPATH
bridge_build_bash=$(command -v bash)
# Explicit all target: no package, install, activation or respring.
# Rootless here is a compile configuration, not a device compatibility claim.
make -C fixture THEOS="$THEOS" THEOS_PACKAGE_SCHEME=rootless TARGET=iphone:clang:16.5:15.0 SHELL="$bridge_build_bash" '.SHELLFLAGS=--noprofile --norc -c' all
make -C executor THEOS="$THEOS" THEOS_PACKAGE_SCHEME=rootless TARGET=iphone:clang:16.5:15.0 SHELL="$bridge_build_bash" '.SHELLFLAGS=--noprofile --norc -c' all
echo 'Compilation finished. Nothing installed or activated.'
