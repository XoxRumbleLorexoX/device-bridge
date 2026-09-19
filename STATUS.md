# Status — 2026-09-19

**Overall goal incomplete. No real iOS or cross-network gate has passed.**

| Gate | State | Evidence / blocker |
|---|---|---|
| A: baseline and architecture | Implemented/documented; upstream native/Go baselines blocked | Three clean pinned repos traced; mobile-mcp build passes, its tests fail before running on this host; missing SDK/Theos/Go recorded |
| B: local vertical slice | Host implementation and simulated slice pass; actual-device gate pending | 60 automated tests; SDK stdio → gateway → real policy helper → simulated UI; native adapter/fixture source prepared but uncompiled |
| C: remote slice | Not started | B, verified SSH identity/authentication, overlay enrollment and separate networks required |
| D: fidelity/development | Deferred | No hardware calibration, scoped file/plist implementation, deployment or tested rollback |
| E: usability/hardening | Partial CLI/docs only | Full guided provisioning, authenticated operator page with real agent execution, hardware failure coverage pending |

Implemented source: pinned MIT ios-mcp module build, root-peer-only local UI socket,
independent SSH forced-command helper, owner-only grants/rotation/revocation/stop,
shared lease fencing, deadlines, bounded requests, latest-observation/tree checks,
durable mutation uncertainty and duplicate handling, no raw screen retention,
SDK image results, typed fixture-only MCP tools, benign native fixture, CLI doctor/
pair-key pinning/config output/status/stop, reproducible source hashes and notices.
Local active-control/stop strip is source-only and needs native validation.

Host: macOS, Node 20.5.0, npm 9.8.0, Python 3.11.4, Codex 0.155.1, Command Line Tools.
Missing: iPhoneOS SDK, Theos, Go, idevice_id/iproxy and Tailscale in inspected paths.
USB inventory was inconclusive because the system profiler reported IO errors.

Owner supplied a private-LAN phone address. SSH port 22 is reachable (OpenSSH 9.7),
and username is `mobile`. Owner supplied a saved ECDSA fingerprint and authorized
continuing despite unknown prior trust history. A matching, temporary strict pin
was used for one read-only SSH attempt; authentication failed (exit 255). No
remote command ran. Device hardware/iOS/bootstrap/privileges/lock/packages remain
unknown. Persistent host trust was not modified.

No upstream source modifications, live Codex configuration edits, deployments,
new device credentials/grants, resprings, restarts or external resources created.

Next: verify owner SSH identity, read-only device inventory, obtain native build
prerequisites, compile/review artifacts, then request specific deployment approval
with hashes and recovery plan. See evidence/RESULTS.md and docs/SETUP.md.

## Cancellation hardening continuation

Previous goal turn classified as progress: it created implementation and executable
evidence. This continuation fixes a confirmed transport gap: pre-cancelled requests
now start no SSH process; uncertain mutations await one bounded, authenticated
session cancellation without replay. The UI checks helper socket liveness immediately
before input, including after waiting for the main queue. Shared `BridgePeer.h`
compiled and passed a host socket test; full iOS UI build remains unverified.

`npm test`: 16 Node + 30 Python = 46 passes, no skips. `npm run check` passes.
See evidence/cancellation-tests.txt. Device username/host-key verification and the
iOS build toolchain remain prerequisites; no new device access was attempted.

## Owner lifecycle continuation

Previous turn classified as progress (cancellation implementation and tests).
Owner initialization now validates all paths before creating state and cleans up
only its new files on ordinary setup failure. Administrative policy writes are
serialized; symlink policy/lock/journal paths fail closed. Stop/revoke/rotation
disable the native lease before policy/session changes. Resume clears previous
grants and sessions. These operations remain outside MCP and require independent
root administration in deployment.

`npm test`: 16 Node + 44 Python = **60 passes**, zero skips. `npm run check` passes.
Fourteen new lifecycle tests use isolated synthetic owner state; no live grants,
credentials or phone changes were made. Full output: evidence/owner-lifecycle-tests.txt.
Device pairing and iOS toolchain blockers are unchanged; hardware gates remain open.

## Blocked audit — 2026-09-19

Goal blocked at the actual-device gate, not complete. The same prerequisite gap
has persisted across the initial implementation turn and three continuations.
Prior turns made independent progress (implementation, cancellation, owner
lifecycle); that does not satisfy hardware acceptance. The next required step is
verified owner access and native compilation, before broader device powers.

Revalidated now: no installed `/etc/device-bridge/gateway.json`; no existing host
trust entry for the supplied phone; Xcode selection remains Command Line Tools;
`xcrun --sdk iphoneos --show-sdk-path` still fails; no alternate Xcode iPhoneOS SDK
or Theos found in the checked standard locations. SSH username and independent
fingerprint verification have not been supplied. No live build/test process is
being awaited. Last completed host suite remains 60 passes; no hardware passes.

Resume with the phone's SSH username and locally verified host-key fingerprint,
then an owner-authorized iPhoneOS SDK/Theos build environment (local or a specified
build host). Do not provide passwords/private keys in chat. First resumed action:
read-only device inventory over verified SSH; native build and artifact preflight
must precede specific deployment approval. Later remote/fidelity/development/UI
gates retain their original scope and remain incomplete.

## Pairing update — 2026-09-19

Owner supplied SSH username `mobile` for `DEVICE_ADDRESS:22`. Public-only
ED25519 key scan returned the same previously observed fingerprint. Independent
owner verification remains pending; the key was not trusted and no login was
attempted. SDK/Theos and actual hardware acceptance remain blocked as above.

## Owner-authorized pairing attempt — 2026-09-19

Owner elected to continue with the saved ECDSA public fingerprint despite unknown
trust history. Fresh ECDSA scan matched
`SHA256:OWNER_REPORTED_ECDSA_FINGERPRINT`. One BatchMode SSH attempt
to `mobile@DEVICE_ADDRESS:22` used a temporary strict known-hosts pin, no forwarding
and the reviewed read-only inventory script. SSH rejected available credentials:
`Permission denied (publickey,password,keyboard-interactive)`, exit 255. No remote
command ran, no password was tried, and no persistent trust or device state was
changed. Authentication and native toolchain prerequisites still block gate B.
This is owner-accepted first-use trust, not independent physical verification.

## Owner-reported inventory — 2026-09-19

Owner pasted results from their existing SSH terminal: `uid=0(root)`,
`gid=0(wheel)`, model/machine output `iPhone14,3`, kernel build `20C65`,
`/var/jb`, and `/Library/`. Reported executables:
`/var/jb/usr/bin/{python3,dpkg,launchctl,clang,ldid}`. These are user-reported
observations, not an authenticated bridge probe. The `/Library/` line does not
match the requested literal `/Library/MobileSubstrate` path, so it does not verify
that directory. Root identity describes this terminal only; it does not establish
root access for the bridge or authorize root deployment. Presence of clang/ldid
does not establish a usable SDK, Theos, signing setup, or successful build.
Python sqlite3/socket/fcntl imports, actual bootstrap type, lock state and native
compatibility remain unverified. No UI or deployment acceptance test passed.

## Owner-reported runtime checks — 2026-09-19

Owner reports Python 3.9.9, SQLite 3.39.5 and successful imports of sys, sqlite3,
socket and fcntl. Clang reports Procursus 16.0.0, target arm64-apple-ios16.0,
installed in /var/jb/usr/bin. THEOS environment value is /var/theos. Shell glob
errors interrupted directory inspection; SDK and Theos installation remain
unverified. Host ast parsing accepts helper.py and owner.py under Python 3.9
grammar; this is not a Python 3.9 execution test or an on-device helper test.
No new login, file transfer, build, installation or UI test occurred.

## Device build bundle — 2026-09-19

Owner reports Theos resolves to /private/var/theos, common.mk exists, and SDK
directories include iPhoneOS16.5.sdk and /var/jb/usr/share/SDKs/iPhoneOS.sdk.
These are directory checks, not evidence of valid SDK contents or compilation.
Prepared source-only build/device-bridge-build-20260919-v2.tar.gz, SHA256
b9ce68054752a1ac0cde4feb63ce67ea71807155fd63877b1ec704a7b97378b8.
The bundle includes pinned executor modules, fixture, notices and a non-root-only
build-check.sh using explicit make all targets (no installation/activation).
Verified all 52 manifest entries and archive paths/types; shell syntax check passed.
Host npm test: 16 Node + 44 Python passes. npm run check passed from device-bridge;
an initial invocation from its parent failed due to no package.json there.
Native compilation still pending. No archive has been transferred to the phone.

## Public source preparation — 2026-09-19

Owner reports source archive transfer completed (121 KB); device compilation is
still pending. Public documentation omits private LAN address, host fingerprints
and host user paths. Original local records remain in ignored build storage.
Generated archives, dependencies, caches and runtime credentials are excluded.
