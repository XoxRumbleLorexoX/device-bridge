# Device Bridge

Experimental, fixture-scoped MCP gateway for an owner-controlled jailbroken iPhone,
plus a host-local **MobileLAM / Personal Leverage Intelligence** layer. DeviceBridge
reuses pinned **ios-mcp** UI modules behind a restricted Unix socket and an independent
SSH policy helper; MobileLAM turns explicitly ingested behavioural events into
traceable activities, variables, bottleneck hypotheses, leverage opportunities,
experiments and measured outcomes. Upstream repositories are preserved.

**DeviceBridge working now:** host CLI and SDK stdio gateway; tested authorization,
leases, stale-state rejection, durable duplicate/uncertain outcomes; simulated full
MCP fixture flow. Historical owner/device evidence also verifies native compilation,
independent recovery helper setup, restricted forced-command transport, the older
restricted UI package installation and UI socket activation. **Gate B is still not
passed:** the latest observation-resilience `0.1.1` UI candidate has not yet been
built/deployed/activated and the required real observe/tap/Unicode/cancel sequence
has not passed. Cross-network control, broader deployment/rollback and an operator
web page remain gated.

**MobileLAM MVP working now:** canonical privacy-classified event ingestion; semantic
activity sessions; structured variables/observations/goals/outcome metrics; repeated
single-action and multi-step workflow detection; bounded friction signals for rapid
app transitions, retry loops and repeated retrieval; bottleneck hypotheses with
competing explanations; transparent leverage ranking; opportunity-cost alternatives;
value-of-information; proactive insight/why traces; experiments; feedback; separately
recorded measured outcomes; local structured persistence; pluggable provider/domain
contracts; MCP, CLI and programmatic APIs; and a reproducible earning-power synthetic
fixture. Inferred goals remain inactive until the user explicitly confirms them
through the separate confirmation action. MobileLAM does not observe apps automatically
yet and does not execute recommendations. This repository is not production-ready.

```sh
git clone https://github.com/XoxRumbleLorexoX/device-bridge.git
cd device-bridge
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run check
node src/cli.mjs setup
node src/cli.mjs readiness
npm run leverage:demo
node src/cli.mjs connect codex
```

The leverage demo is synthetic and non-persistent. It demonstrates 5.3 hours of job
discovery, 2 applications, 12 hours development, 4 hours repeated administration,
a career goal, a repeated-work automation candidate and the missing application →
interview conversion variable needed to distinguish volume from quality hypotheses.

Tests require Python 3 and a C compiler in addition to Node. They do not touch the phone. Some tests bind a temporary local Unix socket and
need permission in sandboxes. No installation, grant, respring or config edit
happens automatically. Leverage MCP tests explicitly assert that local leverage
calls do not invoke the SSH/device transport.

- [MobileLAM / Personal Leverage Intelligence](docs/LEVERAGE.md)
- [Friction and repeated-sequence reasoning](docs/FRICTION.md)
- [Setup and pairing](docs/SETUP.md)
- [Architecture and repository comparison](docs/ARCHITECTURE.md)
- [Security boundaries](docs/SECURITY.md) and [capability contract](docs/CONTRACT.md)
- [Physical Gate-B handoff](docs/PHYSICAL_TEST.md) and [smoke/acceptance procedure](docs/SMOKE.md)
- [Recovery, revocation and uninstall](docs/RECOVERY.md)
- [Compatibility](docs/COMPATIBILITY.md), [current status](STATUS.md), [evidence](evidence/RESULTS.md)

`bridge readiness` is the machine-readable DeviceBridge acceptance summary. It is
deliberately fail-closed: host/simulated test success cannot mark native hardware or
cross-network gates verified. MobileLAM host analysis does not alter that status.
- [Licensing and local patches](THIRD_PARTY_NOTICES.md)

Only fixture observation, launch, observed element taps and bounded Unicode insertion
are exposed through the privileged DeviceBridge path. Root shell, arbitrary apps/URLs,
package/file writes, clipboard, submission, multi-touch and uncalibrated generic
gestures are disabled. Screen content returned through MCP may be sent to the selected
model provider.

MobileLAM is a separate host-local path. Its default store is
`~/.local/share/device-bridge/leverage-store.json`; sensitive/restricted event classes
require explicit consent, applications/domains/sources/periods can be excluded,
observation can be paused, retention is bounded, and history deletion requires an
explicit confirmation string. Friction signals are explicitly not verdicts: a
repeated transition may be necessary work, and a retry may be intentional iteration.
See `docs/LEVERAGE.md` and `docs/FRICTION.md` for the exact model and limits.

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
