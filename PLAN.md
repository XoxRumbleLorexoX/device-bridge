# Plan
A. Inspect and pin candidates; choose UI executor; threat model and contracts.
B. Implement stdio gateway, SSH transport, independent policy helper, restricted
   ios-mcp UI build, benign fixture; run unit/simulated integration tests.
   Hardware gate: pair, observe, fixture launch/tap/Unicode verification, cancel/revoke.
C. Only after B: authenticated host-assisted cross-network test, reconnect and
   direct-backend rejection. Evaluate phone-originated connectivity separately.
D. Only after B: calibrate gestures, approve scoped development and demonstrate rollback.
E. Complete guided setup and failure coverage; operator page only with an actual
   supported agent runtime connected. No disconnected chat-box substitute.

All gates require recorded evidence, not just source. See STATUS.md.

## Progress 2026-09-19

- A: comparison, pins, notices, architecture, threat model and capability contract
  recorded. Native/Go baseline blockers and mobile-mcp test-runner failure recorded.
- B independent portions: implemented and 36 host unit/simulated integration tests
  pass. Real SDK negotiation/config validation done. Native adapter and fixture
  source prepared, not compiled. Actual hardware gate remains open.
- Owner provided phone address; SSH is reachable. Do not accept its key or log in
  before local fingerprint verification and username/authentication are available.
- C–E remain gated as described above; no production/remote/fidelity claims.

- Cancellation follow-up: closed the MCP-abort/SSH-session gap with awaited
  authenticated cancellation and a tested native peer guard. Full suite: 46 host
  tests pass. No hardware or remote gate advanced on the strength of these tests.

- Owner setup/recovery follow-up: preflight before state creation, ordinary-error
  cleanup, serialized owner writes, symlink rejection, fail-closed journal failure
  and fresh-grant-only resume implemented. Fourteen isolated lifecycle tests added;
  full host suite is 60 passes. Real installation/uninstallation remains unverified.

- Blocked audit: actual-device prerequisites remained unresolved across at least
  three consecutive goal turns and were rechecked. Independent gate-B work is
  tested; advancing the required native/device gate needs owner identity/access
  information and an iPhoneOS build environment. Goal blocked, not completed;
  resume with read-only device inventory and native compilation/preflight.

Pairing follow-up: owner accepted saved ECDSA pin with unknown trust history; strict-pinned mobile SSH authentication failed. Obtain inventory through existing owner SSH terminal or owner-provisioned key access; no device execution or hardware gate passed.

Owner supplied partial device inventory (root terminal, iPhone14,3, 20C65, /var/jb tools). Next verify Python runtime modules and actual SDK/Theos availability; keep owner-reported findings distinct from bridge-tested hardware.

Runtime follow-up: owner reports required Python imports passing; validate Theos/SDK paths using Python directory inspection (avoid zsh unmatched glob aborts). On-device compilation remains unverified and optional; host build is still preferred.

Next: owner transfers prepared v2 source bundle using existing SSH credentials; verify archive hash, extract in a fresh mobile-owned directory, compile as mobile. Do not package/install/activate until compilation and bootstrap/package preflight succeed.

Owner requested public GitHub publication at XoxRumbleLorexoX/device-bridge. Publish reviewed integration sources/notices/tests; preserve local-only artifacts. Resume native compile after publication.

Native compile reached fixture under mobile; fixed UIKit window property attributes. Retry build, then address any subsequent native errors before packaging or installation.

Fixture owner-build succeeded for both architectures; executor fixes prepared. Retry executor compilation before any device installation.

Retry existing v3 build with upstream unused-function warning flag; native linking remains unverified.

Authenticated on-device native build passed for both architectures. Next prepare package contents/entitlements and independent helper recovery preflight before owner-approved installation. No installation or activation authorized in this build-only session.

Package preflight complete; owner approval required for the concrete fixture-only install in docs/INSTALLATION_REVIEW.md. UI executor activation still requires independent privileged recovery setup and verification.

While fixture-install approval is pending, closed CLI ECDSA pairing gap with strict pinning/parser tests. Continue owner installation/recovery gate after explicit approval.

Blocked approval audit: same unanswered specific fixture-install request across three turns; current artifacts/access revalidated read-only. Resume with explicit owner fixture-install approval; full goal remains incomplete.

Fixture-only approval received. Installer ready and staged; owner sudo authentication needed. Do not ask for approval again for this exact action. Verify actual install/registration after owner executes it.

Owner installer reports fixture files verified and registered; triggers-awaited remains. Next inspect exact trigger fields and test manual fixture launch; reconnect owner SSH for independent verification. Do not reinstall or drain global triggers.

Fixture manual launch failed per owner. Restore phone reachability, collect only fixture crash diagnostics, fix evidence-backed cause and missing icon, then build/review replacement before deployment.

Crash summaries collected. Arm64-only fixture with icon built/reviewed as a hypothesis test; request specific replacement approval before upgrade. Keep prior package and distinguish build success from runtime success.

Fixture0.1.1 approval received and scoped upgrade staged/preflighted. Owner runs hash-pinned sudo command; next verify installed files/registration then manual launch once.

Fixture0.1.1 installed hashes verified via SSH. Next owner opens app once and checks Ready, target counter and Unicode echo; if crash recurs collect fresh fixture-only report before further changes.

Owner can see0.1.1 UI/icon. Clarify target buttons; verify typed/tapped feedback.0.1.2 source fixes dark-appearance contrast and labels, pending build evidence/review before any replacement. Screen observation service remains undeployed.

Independent helper setup prepared/preflighted; owner runs reviewed sudo setup to install and test stop/revoke with control disabled. Next provision restricted runtime transport before any UI activation.

## Progress 2026-09-23

- Diagnosed a source-level resilience gap behind the latest hardware blocker: the
  restricted executor converted any bounded compact-accessibility timeout into
  `RECOVERY_REQUIRED` before preserving otherwise stable fixture foreground state.
- Added a fail-safe `state_only` observation mode. It requires an unchanged epoch,
  fixture PID/app, lock and screen state before/after the bounded AX query; it emits
  no elements or screenshot and therefore cannot authorize a blind element tap.
- Added simulation-only regression coverage for fixture launch verification and
  fail-closed tap behavior, plus host CI for `npm test` and `npm run check`.
- CI exposed and fixed an existing macOS-only `/private/tmp` assumption in the
  AF_UNIX test harness. PR CI then passed **21 Node + 59 Python = 80 tests** and
  `npm run check` on Ubuntu.
- Contract and evidence distinguish full AX observations from state-only foreground
  verification. Host/source verification is green; native iPhone verification is
  still separately gated and must not be inferred from CI.
- Added a machine-readable `bridge readiness` report and regression coverage so
  host/simulated success cannot be promoted to hardware or remote gate completion.
- Added an offline fail-closed UI `.deb` reviewer for the next native replacement.
  Follow-up inspection corrected it to match the actual `iphoneos-arm64` Theos
  package and exact six-file payload: dylib/filter plist plus four license/notice
  files. It rejects maintainer scripts and non-regular or extra entries and emits
  package/payload hashes without installation.
- Added an artifact-bound UI replacement generator. It re-reviews the candidate,
  binds the generated owner script to exact current and candidate package/file
  hashes, requires the prior reviewed `.deb` as a protected rollback artifact,
  verifies live current state before mutation, suppresses triggers, verifies the
  resulting candidate files, and performs no reload/respring/grant/input. PR #4
  final CI run `35855254311` passed and the change was merged as `9e3d548e`.
- Versioned the observation-resilience restricted UI candidate as `0.1.1` and added
  a deterministic source-bundle/package-review handoff. The archive normalizes
  tar/gzip metadata and includes source hashes, candidate version, compile-only and
  package-only scripts, plus the offline reviewer. `package-candidate.sh` verifies
  the source manifest, runs a non-root `FINALPACKAGE=1` package build, requires
  exactly one `.deb`, reviews its six-file payload and emits candidate hashes. It
  contains no install, package-manager, reload/respring, SSH, grant or input step.
- PR #5 implementation-head run `35855946445` passed `npm test` and `npm run check`;
  final-head CI remains required after documentation/status evidence is complete.
- Next gate-B step: create the deterministic 0.1.1 source archive from the pinned
  checkout; the owner verifies/transfers/extracts it into a fresh mobile-owned
  directory and runs `package-candidate.sh`; return the exact `.deb`, review JSON
  and hashes; generate the hash-bound replacement; obtain specific deployment and
  activation approval; then re-run observe → fixture launch → observe → tap →
  Unicode verification → cancel. Do not advance C–E until that hardware sequence
  is evidenced.
