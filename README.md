# Device Bridge

Experimental, fixture-scoped MCP gateway for an owner-controlled jailbroken iPhone.
It reuses pinned **ios-mcp** UI modules behind a restricted Unix socket and an
independent SSH policy helper. Upstream repositories are preserved.

**Working now:** host CLI and SDK stdio gateway; tested authorization, leases,
stale-state rejection, durable duplicate/uncertain outcomes; simulated full MCP
fixture flow. **Native build verified:** fixture and executor compiled, linked and
signed on the owner phone (iOS 16.2 / 20C65, arm64 + arm64e, Theos SDK 16.5).
**Not yet verified:** installation, UI control, runtime pairing, remote control,
deployment/rollback or operator web page. This is not production-ready or
standalone phone control.

```sh
git clone https://github.com/XoxRumbleLorexoX/device-bridge.git
cd device-bridge
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
node src/cli.mjs setup
node src/cli.mjs connect codex
```

Tests require Python 3 and a C compiler in addition to Node. They do not touch the phone. Some tests bind a temporary local Unix socket and
need permission in sandboxes. No installation, grant, respring or config edit
happens automatically.

- [Setup and pairing](docs/SETUP.md)
- [Architecture and repository comparison](docs/ARCHITECTURE.md)
- [Security boundaries](docs/SECURITY.md) and [capability contract](docs/CONTRACT.md)
- [Smoke tests and acceptance gates](docs/SMOKE.md)
- [Recovery, revocation and uninstall](docs/RECOVERY.md)
- [Compatibility](docs/COMPATIBILITY.md), [current status](STATUS.md), [evidence](evidence/RESULTS.md)
- [Licensing and local patches](THIRD_PARTY_NOTICES.md)

Only fixture observation, launch, observed element taps and bounded Unicode
insertion are exposed. Root shell, arbitrary apps/URLs, package/file writes,
clipboard, submission, multi-touch and uncalibrated generic gestures are disabled.
Screen content returned through MCP may be sent to the selected model provider.

For native source preparation only, clone the selected upstream beside this repository
and check out the recorded revision (host tests do not require this checkout):

```sh
git clone https://github.com/witchan/ios-mcp.git ../ios-mcp
git -C ../ios-mcp checkout --detach 38cafd5fbda7a4dcb3821b94cbb3523fc905c0b2
python3 scripts/prepare_executor.py --output build/executor-reviewed
```

Use a fresh destination; preserve any existing upstream checkout. The preparer
verifies reused source bytes against the pinned commit. See the setup guide for
the build and owner approval boundaries. Evaluated alternatives are recorded in
`upstreams.json`; they are not required dependencies.
