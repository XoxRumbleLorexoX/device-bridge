#!/bin/sh
# Read-only prerequisite inventory. Run ONLY over an independently verified owner SSH session.
# Does not enumerate apps, personal files, credentials, or device serial numbers.
set -eu
id
uname -m
sysctl -n hw.machine kern.osversion
for item in /var/jb /Library/MobileSubstrate /var/containers/Bundle/tweaksupport; do
    if test -d "$item"; then printf 'bootstrap_path=%s\n' "$item"; fi
done
for program in python3 sshd dpkg launchctl clang ldid; do
    command -v "$program" || true
done
if command -v python3 >/dev/null 2>&1; then
    python3 -I -c 'import sys,sqlite3,socket,fcntl; print("python="+sys.version.split()[0]); print("sqlite="+sqlite3.sqlite_version)'
fi
if command -v plutil >/dev/null 2>&1; then
    plutil -extract ProductVersion raw /System/Library/CoreServices/SystemVersion.plist || true
    plutil -extract ProductBuildVersion raw /System/Library/CoreServices/SystemVersion.plist || true
fi
# Only inspect bridge-related package names, not the user's full package inventory.
if command -v dpkg-query >/dev/null 2>&1; then
    dpkg-query -W com.witchan.ios-mcp dev.adrian.jb-p1lot dev.devicebridge.ui dev.devicebridge.fixture 2>/dev/null || true
fi
