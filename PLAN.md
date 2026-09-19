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
