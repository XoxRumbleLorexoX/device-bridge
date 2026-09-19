"""SIMULATED device used only by the SDK stdio integration test."""
import json
import os
from pathlib import Path
import sys
from test_helper import h, FixtureUI
state = Path(sys.argv[1])
ui = FixtureUI()
if (state / 'fake-ui.json').exists():
    ui.data = json.loads((state / 'fake-ui.json').read_text())
helper = h.Helper(state, ui, uid=os.getuid())
try:
    response = helper.handle(json.load(sys.stdin))
    (state / 'fake-ui.json').write_text(json.dumps(ui.data))
    print(json.dumps(response))
finally:
    helper.close()
