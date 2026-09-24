# Device Bridge

Experimental, fixture-scoped MCP gateway for an owner-controlled jailbroken iPhone.
It reuses pinned **ios-mcp** UI modules behind a restricted Unix socket and an
independent SSH policy helper. Upstream repositories are preserved.

**Working now:** host CLI and SDK stdio gateway; tested authorization, leases,
stale-state rejection, durable duplicate/uncertain outcomes; simulated full MCP
fixture flow. Historical owner/device evidence also verifies native compilation,
independent recovery helper setup, restricted forced-command transport, the older
restricted UI package installation and UI socket activation. **Gate B is still not
passed:** the latest observation-resilience `0.1.1` UI candidate has not yet been
built/deployed/activated and the required real observe/tap/Unicode/cancel sequence
has not passed. Cross-network control, broader deployment/rollback and an operator
web page remain gated. This is not production-ready or standalone phone control.

```sh
git clone https://github.com/XoxRumbleLorexoX/device-bridge.git
cd device-bridge
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
node src/cli.mjs setup
node src/cli.mjs readiness
node src/cli.mjs connect codex
```

Tests require Python 3 and a C compiler in addition to Node. They do not touch the phone. Some tests bind a temporary local Unix socket and
need permission in sandboxes. No installation, grant, respring or config edit
happens automatically.

- [Setup and pairing](docs/SETUP.md)
- [Architecture and repository comparison](docs/ARCHITECTURE.md)
- [Security boundaries](docs/SECURITY.md) and [capability contract](docs/CONTRACT.md)
- [Physical Gate-B handoff](docs/PHYSICAL_TEST.md) and [smoke/acceptance procedure](docs/SMOKE.md)
- [Recovery, revocation and uninstall](docs/RECOVERY.md)
- [Compatibility](docs/COMPATIBILITY.md), [current status](STATUS.md), [evidence](evidence/RESULTS.md)

`bridge readiness` is the machine-readable acceptance summary. It is deliberately fail-closed: host/simulated test success cannot mark native hardware or cross-network gates verified.
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
verifies reused source bytes against the pinned commit. For the current owner/device
handoff, use the verified source artifact retained by successful `main` CI and follow
`docs/PHYSICAL_TEST.md` rather than regenerating deployment inputs ad hoc. Evaluated
alternatives are recorded in `upstreams.json`; they are not required dependencies.
