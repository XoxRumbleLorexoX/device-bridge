#!/usr/bin/env python3
"""Build a self-contained, hash-reviewable owner setup file without credentials."""
import argparse
import base64
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def prepare(output):
    payload = {}
    for name in ('helper.py', 'owner.py', 'LICENSE'):
        data = (ROOT / ('LICENSE' if name == 'LICENSE' else 'device/' + name)).read_bytes()
        payload[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
    template = (ROOT / 'scripts/owner_helper_setup.py').read_text()
    assert template.count('PAYLOAD = {}') == 1
    source = template.replace('PAYLOAD = {}', 'PAYLOAD = ' + repr(payload))
    compile(source, 'owner-helper-setup.py', 'exec')
    with output.open('x') as stream:
        stream.write(source)
    print('Prepared owner setup, not executed:', output)
    print('SHA256:', hashlib.sha256(output.read_bytes()).hexdigest())

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True, type=Path)
    prepare(parser.parse_args().output)
