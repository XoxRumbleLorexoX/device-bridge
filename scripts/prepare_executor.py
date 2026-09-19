#!/usr/bin/env python3
"""Copy only pinned MIT UI source into a new build dir; never modify upstream."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MODULES = ['ScreenManager', 'AccessibilityManager', 'HIDManager', 'TextInputManager', 'MCPAXQueryContext', 'MCPAXRemoteContextResolver', 'MCPUIElementSerializer', 'MCPUIElementsFacade', 'MCPAXAttributeBridge', 'MCPAXNodeSource']
HEADERS = ['MCPLogger.h', 'IOSMCPPreferences.h', 'IOHIDPrivate.h', 'SpringBoardPrivate.h', 'AXPrivate.h']

def prepare(destination):
    pin = json.loads((ROOT / 'upstreams.json').read_text())['ios-mcp']
    upstream = (ROOT / pin['path']).resolve()
    revision = subprocess.check_output(['git', '-C', str(upstream), 'rev-parse', 'HEAD'], text=True).strip()
    if revision != pin['commit']:
        raise SystemExit('Pinned ios-mcp revision does not match; no build generated.')
    files = [name + suffix for name in MODULES for suffix in ('.h', '.m')] + HEADERS + ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']
    # Compare working bytes with pinned git object, including untracked replacement files.
    for name in files:
        expected = subprocess.check_output(['git', '-C', str(upstream), 'show', f'{revision}:{name}'])
        if (upstream / name).read_bytes() != expected:
            raise SystemExit(f'Local changes in reused file {name}; preserve and review before repinning.')
    destination.mkdir(parents=True, exist_ok=False)
    for name in files:
        shutil.copyfile(upstream / name, destination / name)
    for name in ['BridgeUI.m', 'BridgePeer.h', 'QuietLogger.m', 'Makefile', 'DeviceBridgeUI.plist', 'control']:
        shutil.copyfile(ROOT / 'device' / name, destination / name)
    accessibility = destination / 'AccessibilityManager.m'
    source = accessibility.read_text()
    marker = 'static const BOOL MCPEnableAXUIClientBootstrap = YES;'
    if source.count(marker) != 1:
        raise SystemExit('AX bootstrap patch anchor changed; review before building.')
    accessibility.write_text(source.replace(marker, marker.replace('YES', 'NO')))
    manifest = {file.name: hashlib.sha256(file.read_bytes()).hexdigest() for file in destination.iterdir()}
    (destination / 'source-manifest.json').write_text(json.dumps({'upstream': revision, 'files': manifest}, indent=2) + '\n')
    print(f'Prepared {destination}; no compilation or installation performed.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'build' / 'executor')
    prepare(parser.parse_args().output)
