# Evidence — 2026-09-19 (Europe/Zagreb)

## Tested host

macOS host, Node **20.5.0**, npm **9.8.0**, Python **3.11.4**, installed Codex CLI
**0.155.1**. Xcode selection is `/Library/Developer/CommandLineTools`; `iphoneos`
SDK is absent. Theos, Go, idevice_id, iproxy and Tailscale were not found in the
checked paths/PATH. No verified iOS configuration yet.

## Commands actually run

| Command / scope | Result |
|---|---|
| `git -C <candidate> status --short`, `rev-parse HEAD` | All three clean before/after; pins in upstreams.json |
| `codex --version`, `codex mcp add --help` | 0.155.1; stdio command/args supported |
| `xcode-select -p`, `xcrun --sdk iphoneos --show-sdk-path` | Command Line Tools selected; SDK lookup fails |
| filtered `system_profiler SPUSBDataType -json` | No iPhone returned; IO service errors make negative result inconclusive |
| `ssh-keyscan -T 5 -t ed25519 <owner-supplied phone>` | Sandbox initially denied; approved retry reached OpenSSH 9.7 on port 22 and obtained public key; **not trusted or logged in** |
| selected-host `ssh-keygen -F` check | No existing matching ED25519 trust entry found; no unrelated host entries disclosed |
| `npm ci --ignore-scripts --cache /private/tmp/device-bridge-npm-cache --no-audit --no-fund` in mobile-mcp | Sandbox DNS failed; approved retry installed 421 packages. Engine warnings on this Node version |
| `npm run build` in mobile-mcp | **Pass**, TypeScript compile |
| `npm test -- --workers=1` in mobile-mcp | **Fail before tests**: Playwright loading config yields “Cannot use import statement outside a module”; no device tests executed |
| `make -n` in ios-mcp and jb-p1lot | **Blocked/fail**: missing Theos makefiles; no native build |
| `go test ./...` in jb-p1lot | **Blocked**: go command unavailable |
| pinned `npm install --ignore-scripts ...` in device-bridge | Sandbox DNS failed; approved retry installed 94 dependencies and lockfile |
| `python3 scripts/prepare_executor.py` (new output directories) | **Pass** pinned-byte checks/copy/manifest; native compile not performed |
| `make -C build/executor-final -n` | **Blocked/fail** missing Theos |
| `plutil -lint fixture/Info.plist` | **Pass** |
| `npm test` in device-bridge | **Pass: 7 Node + 29 Python = 36 tests**, no skips; unit/simulated categories only |
| `npm run check` in device-bridge | **Pass** JS syntax and Python byte-compilation, not native compilation |
| `node scripts/check-codex-config.mjs` | **Pass** installed Codex parsed stdio entry via temporary CLI overrides; no file edited |
| `node src/cli.mjs doctor`, `setup`, `connect codex` | Doctor/config path exercised; diagnostics report missing runtime/toolchain prerequisites |

Local Unix socket tests initially failed with sandbox `Operation not permitted`;
approved retry outside the sandbox passed. No network listener or device action was
used by those tests. An early simulated screenshot had invalid Base64; the real SDK
caught it, the test fixture was corrected, and the final suite passed. A duplicate
request file-descriptor cleanup issue was caught by ResourceWarning and fixed with
an ExitStack. Two test invocations from the parent JBAI directory returned ENOENT
(no package.json); corrected working-directory runs are recorded above.

Full final test output: [host-tests.txt](host-tests.txt). Synthetic credentials in
tests are test constants, not device/operator credentials. No screenshots or phone
content were collected. No live config changes, package installs, credential/grant
issuance, resprings, restarts or network/router changes were made.

## Coverage vs. required acceptance

| Requirement | Host evidence | Real-device / separate-network evidence |
|---|---|---|
| Fresh setup/pair/reconnect/revoke/stop/uninstall | CLI diagnosis, pinned-key implementation, helper revocation/stop tests; full install/uninstall pending | None |
| Missing/revoked credentials | Helper tests pass; SSH flags tested | Missing real SSH/peer-UID/legacy-port denial test |
| Small targets/orientation/scale/stale refs | Bounds, tree/process/epoch/rotation rejection tests; fixture targets included | Accuracy and actual delivery unmeasured |
| Unicode/keyboard/long press/drag/cancel | Simulated Unicode exact echo and control-character denial; cancellation tests; unsupported gestures disabled | None; long press/drag not implemented |
| Verification/dropped ack/no duplicate | SDK simulated flow and helper restart/durable pending tests pass | Real network interruption not tested |
| Unapproved packages/files/semantic bypass | No broad tools; helper rejects action variants and self-issued grants; injection remains data | No installed enforcement test |
| Scoped files/preferences restore | Unsupported, no claims | None |
| Benign deployment/rollback | Source preparation/hashes only | Not compiled/deployed or rolled back |
| Network/lock/SpringBoard recovery | Simulated locks, unavailable socket, independent helper status | No failure injected; recovery untested |
| Real agent through operator page | Codex config schema accepted; SDK client integration tested | No actual Codex device task or operator page |

## Next reproducible step

Owner supplies SSH username and independently verifies the public host-key
fingerprint already reported in the conversation. Then run the read-only prerequisite
inventory over that verified owner connection; do not install anything yet. In
parallel, owner installs/configures Xcode iPhoneOS SDK and Theos, or identifies an
already-authorized build host. Native compilation and package review must precede
any requested deployment approval. See docs/SETUP.md.

## Cancellation hardening follow-up (same date)

The previous implementation killed host SSH on MCP abort but did not explicitly
cancel the remote lease. Fixed: no process for an already cancelled request; one
separately authenticated, awaited cancellation after uncertain mutation transport
failures; no mutation replay; clear confirmed/unconfirmed stop guidance.

Native input now checks its helper connection immediately before dispatch. The
portable guard in `device/BridgePeer.h` is compiled with `cc -std=c11 -Wall -Wextra
-Werror` and tested with real host AF_UNIX socketpairs (connected, peek without
consumption, half-close, full disconnect and invalid descriptor). This is not an
iOS compile or device test.

Commands: `node --test tests/transport.test.mjs` (9 passes), `npm test` (16 Node +
30 Python = **46 passes**, zero skips), `npm run check` (pass). Full current output
is in [cancellation-tests.txt](cancellation-tests.txt); earlier host-tests.txt remains
historical evidence. The first test-file creation command used a duplicated
working-directory prefix and failed without writing a file; corrected immediately.
No phone, credential, policy, overlay or live Codex configuration changes occurred.

## Owner lifecycle follow-up (same date)

Confirmed defect: old `owner.py init` created the state directory before checking
its credential output, leaving a failed setup difficult to retry. Owner policy
updates also lacked serialization. The implementation now validates locations
first, cleans up only newly created files after ordinary failures, locks owner
operations and reads fresh policy under that lock. Resume invalidates old grants
and sessions. Journal symlinks are rejected; stop remains fail-closed when journal
processing fails. No general crash transaction or tested device installation is
claimed.

Commands actually run: `python3 -m unittest discover -s tests -p test_owner.py -v`
(initial 13 tests passed), followed by `npm test` after adding journal-symlink
coverage (**16 Node + 44 Python = 60 passes**, zero skips), and `npm run check`
(pass). Output: [owner-lifecycle-tests.txt](owner-lifecycle-tests.txt).

All owner lifecycle tests create temporary synthetic policy/credential files under
the host test account and remove them afterward. Production owner CLI was not run,
no live grants were issued, and no device or protected host configuration changed.

## Final prerequisite recheck before blocked status

`xcode-select -p` still reports `/Library/Developer/CommandLineTools` and
`xcrun --sdk iphoneos --show-sdk-path` fails. Standard `/Applications` and user
Applications Xcode SDK locations yielded none; checked `/opt/theos`,
`/usr/local/theos`, `~/theos`, and workspace Theos locations yielded none.
Only existence/trust checks were made: no installed gateway config and no known
host entry for the supplied phone. No SSH login or device mutation was attempted.
All three candidate Git working trees remain clean. The completed 60-test evidence
was inspected, not rerun without a code change. No live process is pending.

This confirms the required hardware gate is blocked; it does not prove completion
of the overall task or replace missing device/network/deployment evidence.
# Pairing follow-up — 2026-09-19

Owner supplied inventory username `mobile`. Public-only `ssh-keyscan -T 5 -t
ed25519 DEVICE_ADDRESS` returned fingerprint
`SHA256:OBSERVED_ED25519_FINGERPRINT`.
This is observed, not independently verified identity evidence. No known-hosts
entry was accepted, login attempted, or device state changed.

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

Executor-fix host verification: npm test 60 passes; npm run check passes.
V3 source bundle manifest verified (48 entries, no app/process manager modules).
Archive SHA256: a603456a471f82b4adb8be0c4117ecd6f0c672b7402335cd7fa18b60b1a398a5.
This bundle still requires owner-run native compilation.

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

Pairing verification: npm test passed 21 Node + 44 Python = 65 tests; npm run check passed including new pairing module. No hardware or installation claim follows from these unit tests.

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

## Independent recovery-helper preparation — 2026-09-19

Connection responsive again. Read-only inventory found helper target parents root
protected and shared state absent; no feedback-candidate directory was found in
the checked /tmp namespace, so the timed-out0.1.2 build is still unverified and
was not replayed. Focus returned to the required independent recovery gate.

Implemented a self-contained owner setup generator/template: exact source payload
hashes, protected fresh targets, isolated installed-helper CLI checks, bounded
subprocesses, stopped/revoked final state and no grants. No SSH/service/UI changes.
Staged owner-helper-setup-v2.py under mobile home and ran read-only preflight on
phone successfully; no root setup executed. Scope reviewed in docs/HELPER_SETUP_REVIEW.md.
Host tests77 pass (21 Node +56 Python), syntax checks pass. Four new tests cover
nonroot denial, payload tampering, preflight-before-write and actual policy state
checks in an isolated no-UI test harness. Await owner-authenticated execution for
actual root/helper evidence; do not claim installation from unit tests.

Phone setup-test result:42 isolated Python tests passed on Python3.9.9; full
output in evidence/phone-helper-setup-tests.txt. No live grant or root deployment
was created by these tests.
