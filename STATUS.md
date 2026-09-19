# Status — 2026-09-19

**Overall goal incomplete. No real iOS or cross-network gate has passed.**

| Gate | State | Evidence / blocker |
|---|---|---|
| A: baseline and architecture | Implemented/documented; upstream native/Go baselines blocked | Three clean pinned repos traced; mobile-mcp build passes, its tests fail before running on this host; missing SDK/Theos/Go recorded |
| B: local vertical slice | Host implementation and simulated slice pass; actual-device gate pending | 60 automated tests; SDK stdio → gateway → real policy helper → simulated UI; native adapter/fixture compiled and signed on phone; installation/UI pending |
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

## First owner-run native compilation — 2026-09-19

Owner supplied a compiler error from the mobile account using iPhoneOS16.5.sdk:
fixture main.m arm64e compilation failed with Wproperty-attribute-mismatch for
UIApplicationDelegate.window. Corrected the fixture declaration to nonatomic,
strong to match the SDK protocol. This is an actual owner-run build failure, not
a passed hardware gate. Native compile retry is pending; executor compilation,
installation and UI behavior remain unverified. No private device paths retained.

## Native executor compiler fixes — 2026-09-19

Owner reports fixture compiled, linked, merged and signed for arm64 and arm64e.
No installation or UI execution yet. Executor compile failed: missing closing
parenthesis, Handle symbol collision with MacTypes.h, and missing roothide.h from
AppManager/MCPProcessUtil. Fixed syntax/name; removed unused broad app/process
modules from prepared sources and build. Fixture launch uses the same guarded
LaunchServices selector directly and reports dispatched; foreground state uses
the retained AccessibilityManager resolver, leaving unresolved identity unknown.
No Roothide path shim or additional dependency added. Native retry pending.

## Upstream warning flag — 2026-09-19

Owner-run v3 build again compiled/signed the fixture for both architectures.
Prior BridgeUI syntax/header failures no longer appear. Executor stops compiling
MCPAXNodeSource.m on 17 unused static functions under -Werror, on both arm64 and
arm64e. Added -Wno-unused-function matching the pinned upstream Makefile; no
global warning/error suppression. Native link, install and UI test still pending.

## Authenticated on-device build — 2026-09-19

Owner-opened SSH multiplex connection verified uid=501(mobile). Checked all v3
source manifest entries, applied reviewed warning fix with a backup, and built
fixture/executor on-device with 120-second per-target timeouts. Both artifacts
link/sign for arm64 and arm64e; lipo and SHA256 recorded in
evidence/native-build-artifacts.json. SystemVersion reports iOS16.2 / 20C65.
Installed ElleKit1.2 advertises mobilesubstrate compatibility. No bridge packages
are installed; no helper state or UI socket directory was found.

Initial noninteractive make failed because bash startup emitted Hi into Theos pwd
output. Explicit bash --noprofile --norc build shells resolve this without editing
owner startup files. Build succeeded with two sysctl-not-found warnings (host
parallelism discovery); these did not prevent compilation. Full sanitized native
output: evidence/native-build.txt. This is a real native build pass, not a UI,
installation, recovery or remote-network pass. Nothing installed or restarted.

## Package and runtime preflight — 2026-09-19

Packaged both components as mobile without installation. Corrected doubled
rootless documentation prefix and added integration-license coverage to both
packages, then rebuilt. Reviewed final control/data archives: only expected
regular files/directories, root ownership, no maintainer scripts, links, setuid
bits or traversal. Exact artifacts/file hashes: evidence/package-preflight.json.
Retrieved both reviewed packages to ignored host build storage and verified hashes.
Fixture/UI package status and all installation destinations are absent.

38 helper/owner tests passed on phone Python3.9.9 in temporary mobile-owned state;
these use simulated UI and do not prove privileged deployment or real UI control.
No live credential/grant or system service was created. Root-owned recovery
locations were inspected read-only. uicache help confirms per-bundle register and
unregister without respring. Fixture-only owner installation proposal is concrete
in docs/INSTALLATION_REVIEW.md; executor activation remains held for recovery.

## Pairing compatibility continuation — 2026-09-19

Previous goal turn: progress (native package review and phone Python evidence).
Specific fixture installation approval is pending; no device mutations this turn.
Found a real setup gap: CLI accepted only ED25519 despite the owner using ECDSA.
Added explicit --key-type ecdsa with default ED25519 and no implicit fallback.
Verifier rejects mismatched fingerprints, algorithms, wire labels, endpoint,
ambiguous scan output and malformed key encoding. No live trust/credential changes.
Five pairing unit tests added; native package candidates and approval scope unchanged.

## Installation approval gate audit — 2026-09-19

Previous goal turn made progress (ECDSA CLI implementation/tests). The specific
fixture-install approval has remained unanswered across the package-review turn
and two automatic continuations. Continuation is not approval for package code
execution under the owner's explicit permission requirements.

Read-only revalidation: SSH master is alive and account is mobile uid501; reviewed
fixture package still matches its recorded SHA256; fixture destination, both
bridge packages and shared helper state remain absent. An SSH master is an access
channel, not a running build job; no pending build/test is being awaited. All
independent preparation needed for the next gate is complete. Mark goal blocked
at this approval boundary, not complete. Resume after owner explicitly approves
the fixture-only installation/registration described in docs/INSTALLATION_REVIEW.md.
Executor activation, recovery, MCP UI, cross-network and remaining original gates
remain incomplete. No phone state changed in this audit.

## Approved fixture step, authentication prerequisite — 2026-09-19

Owner said go ahead to the concrete fixture-only installation/registration. This
approval persists. SSH remains uid501; sudo -n id reports a password is required.
No password attempted or requested in chat. Package hash/absent destination were
reverified. A specific owner-run installer was staged (not executed), with protected
root staging, expected package hash, dry run, no-triggers install, installed-file
hashes, per-bundle registration and partial-outcome journal. Phone Python read-only
preflight passed. Initial staging command had a quoting SyntaxError before any
write; corrected staging succeeded with matching source hash.

Four installer preflight tests added: nonroot/existing destination/corrupt or
symlink package/dry-run failure. Host suite: 21 Node + 48 Python = 69 passes;
syntax checks pass and installer py_compile passes. No live install has occurred.
Next owner action is sudo authentication for the approved, hash-pinned installer,
not renewed permission. Executor/restart/grants remain outside this approval.

## Owner fixture installation result — 2026-09-19

Owner supplied installer output: fixture 0.1.0-2+debug unpacked/configured; all
three installed-file hashes verified; per-bundle uicache registration succeeded.
Registered display name Bridge Fixture, bundle ID dev.devicebridge.fixture.
Dpkg reports install ok triggers-awaited, so package state is not yet settled.
Do not process arbitrary pending triggers or run global uicache/respring. Next
inspect this package's Triggers-Awaited and Triggers-Pending fields and review the
exact handler before any execution. Owner manual app launch is still unverified.

An independent read-only SSH recheck failed before running the remote command
(connection closed, shared SSH channel unavailable). The result above is owner
terminal evidence, not a fresh agent-side verification. No executor, control grant,
restart or helper deployment occurred. Private container/bootstrap paths omitted.

## Fixture launch failure / diagnostics pending — 2026-09-19

Owner reports the fixture crashes on launch and has no icon. Source Info.plist
contains no icon resources, confirming the icon omission; crash cause is unknown.
Owner changed network address; public ECDSA scan matched the existing accepted
pin. Reopened owner SSH master reports locally alive, but diagnostic request
returned no output and a separate five-second TCP/SSH probe timed out. Cancelled
only the agent diagnostic client (exit143), leaving owner master unchanged. No
crash report was retrieved, no package/signing changes or restarts performed.
Resume crash-specific read-only collection after actual phone reachability is
restored. Do not infer code-signing or entitlement cause without crash evidence.

## Fixture crash diagnosis and replacement candidate — 2026-09-19

Slower bounded SSH requests succeeded as uid501. Two latest fixture-only crash
summaries show EXC_BAD_ACCESS/SIGBUS, top frames libobjc readClass, map_images and
dyld initialization, before app UI. Reports do not classify termination as code
signing. Root cause remains unproven; no raw reports, device/container identifiers
or unrelated app logs retained. Fixture is install ok triggers-awaited, awaiting
uikittools. Its read-only inspected trigger handler invokes uicache -a; not run.

A minimal Foundation runtime probe compiled/signed as arm64 but was killed with
signal9 on direct execution. This does not establish the fixture cause; no signing
entitlement/bypass changes were made or additional probe variants executed.

Prepared fixture0.1.1 as arm64-only to test the architecture hypothesis; kept
executor architectures unchanged. Added original geometric icon PNGs at 60/120/180
and bundle metadata; source SVG and optional Pillow-pinned generator included.
Theos documents arm64e ABI/toolchain constraints at
https://theos.dev/docs/arm64e-deployment ; these inform the hypothesis, not proof.
Candidate compiled/signed/packaged on phone; package control has no scripts, data
contains only six fixture bundle files. Hashes: evidence/fixture-candidate-preflight.json.
Native build is a pass; candidate launch is NOT tested and crash fix NOT confirmed.
Host suite 21 Node + 49 Python =70 tests passed, plus syntax checks.

## Approved fixture replacement staged — 2026-09-19

Owner explicitly confirmed replacement approval. Read-only SSH preflight verified
uid501, expected installed0.1.0 binary/status and candidate package hash; sudo -n
still requires a password. Prepared scoped owner upgrade with prior-version/file
collision checks, protected previous/candidate package retention, dry-run guard,
no-trigger install, new-file verification, per-app registration and outcome journal.
Staged script on phone; its read-only Python preflight verifies all previous files
and both packages. Upgrade was NOT executed. Owner local sudo authentication is
the remaining immediate prerequisite; no new approval is needed for this artifact.

Three upgrade test cases pass (including both settled and triggers-awaited prior
state): unexpected version, changed files and failed dry-run all stop mutations;
prior package retained before attempted install. Host totals:21 Node +52 Python
=73 passes; syntax checks pass. Runtime launch and crash fix remain unverified.

## Fixture 0.1.1 installation verified — 2026-09-19

Owner ran the approved replacement: per-bundle registration succeeded and previous
package was retained by the installer. Independent mobile SSH verification now
confirms installed0.1.1-1+debug, all six expected file hashes and root ownership.
Evidence: evidence/fixture-0.1.1-installed.json. Dpkg still awaits uikittools; no
global trigger handler was run. Actual icon appearance, launch and UI behavior
remain pending owner observation. Do not call the crash fixed from file hashes.
No executor/helper deployment, grants or restart occurred.

## Owner-visible fixture feedback — 2026-09-19

Owner reports0.1.1 icon appears, three squares are visible and text can be typed,
but no visible feedback. This is owner-observed UI launch evidence, not agent
screenshot/AX/control evidence. The squares are deliberate small target buttons.
Source inspection found a forced white background with theme-dependent label/text
colors, allowing white-on-white feedback in dark appearance. User appearance mode
has not been independently verified; the contrast defect is confirmed in source.

Prepared fixture0.1.2 using systemBackgroundColor/labelColor, explicit input
background, Button1/2/3 captions, explanatory text and Echo: prefix. Small target
bounds remain unchanged for later calibration. If matching the echo label through
MCP, expected_text must include the Echo: prefix; no implicit submission is added.
Host tests remain73 passes; syntax checks pass. This source change is not yet
installed. Current owner-approved0.1.1 installation remains unchanged.

Feedback-candidate native build response timed out after110 seconds. No success
claim or automatic retry; inspect existing candidate/process on restored connection
before resuming. Remote make was bounded to90 seconds after it started. No package
installation was requested. Host-tested source is committed separately from native
verification, which remains unknown for0.1.2.
