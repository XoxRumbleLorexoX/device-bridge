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
