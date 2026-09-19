# First fixture installation review

Status: owner executed the approved installer and reports verified files plus successful registration. Dpkg state is triggers-awaited; manual launch and independent recheck remain pending. Shared agent SSH connection has ended.

## Proposed action

Install only `dev.devicebridge.fixture_0.1.0-2+debug_iphoneos-arm64.deb` using the owner's independent root terminal,
then register only `/var/jb/Applications/BridgeFixture.app` with
`/var/jb/usr/bin/uicache -p /var/jb/Applications/BridgeFixture.app`.
Do not use uicache `-a`, `-f` or `-r`. No restart or SpringBoard hook installation
is included in this approval. This does not issue a control grant.

Package SHA256: `9e9b807e7b87d3118f9ce84245f50e3ba82e254fa0a995cf76fa55b9b728acc9`.
Version: 0.1.0-2+debug; architecture: iphoneos-arm64; binary slices arm64/arm64e.
The package adds exactly three files inside the fixture app bundle: executable,
Info.plist and MIT LICENSE. It has no dependencies or maintainer scripts.
The binary entitlement dump is empty. Launch compatibility is untested; do not
add entitlements or signing bypass components if launch fails without review.
The fixture's source is offline, contains no account/submission workflow and
provides known targets plus a Unicode input/echo field.

## Owner installation procedure after approval

1. Keep the independently authenticated administrative SSH terminal available.
2. Confirm the package and destination are still absent. Stop if either exists;
   preserve that state rather than overwriting an unexpected installation.
3. Create a fresh root-owned mode-0700 staging directory under `/var/root`.
   Copy the reviewed package from the mobile build directory into it and set mode
   0600. Verify SHA256 on the protected copy against the value above before use.
   Install only this protected copy, not a mutable mobile-owned package path.
4. Run `/var/jb/usr/bin/dpkg --no-act --install PROTECTED_PACKAGE_PATH` and stop
   on conflicts, dependencies or unrelated changes. Then run the same command
   without `--no-act` only within this specific approval.
5. Register only the bundle with the exact uicache command above. Verify package
   status, installed file hashes against evidence/package-preflight.json, and
   `uicache -i dev.devicebridge.fixture`. Launch by the owner tapping the icon.
   Verify Ready, target counter and text echo manually; this is not MCP testing.

## Reversal

There is no previous fixture version: package status and exact destination were
absent in the live preflight. With the owner-authorized uninstall action, unregister
only `/var/jb/Applications/BridgeFixture.app` using `uicache -u`, then remove only
`dev.devicebridge.fixture` using `dpkg --remove`. Verify package status and icon
removal. Do not delete unrelated application data or issue a respring. This reversal
procedure is prepared but not yet tested on the phone; a round-trip test needs
owner approval as a separate removal/reinstallation action.

## Executor held for later recovery gate

Executor candidate: `dev.devicebridge.ui_0.1.0-2+debug_iphoneos-arm64.deb`.
SHA256: `748c29c121e8468e67e86ce117a3052cbf0ec9cea75ee766e6e9a5ac86e2b212`.
It contains the SpringBoard dylib/filter and four license/notice files. No package
scripts, unsafe paths, links, device nodes or setuid/setgid files were found.
ElleKit 1.2 provides its mobilesubstrate dependency on this phone. Installation,
activation, independent root-owned helper/policy provisioning and control grants
are not authorized by the fixture-only step. Recovery status/stop/revoke must be
verified independently of SpringBoard before any approved activation.

Both packages are saved locally under ignored build/reviewed-packages with matching
hashes. The original defective executor 0.1.0-1+debug is not an install candidate.
See evidence/package-preflight.json for full file metadata and hashes.

## Approved owner installer

`scripts/install_reviewed_fixture.py` implements this exact reviewed package step.
It is specific to the current artifact/build directory, accepts no password, and
requires root. It rejects an existing destination/package state, verifies the
package bytes, stages a protected copy, uses dpkg --no-triggers to avoid executing
unrelated pending triggers, verifies installed file hashes, and registers only the
fixture. It retains a protected outcome journal on error and does not retry.

The owner must authenticate in their terminal. Current mobile SSH has no
noninteractive sudo access. This is an authentication prerequisite, not a new
approval request. No unrestricted root key/session is required for the agent.
Installer SHA256: d1e848f9b235b36d341c63ad40a4f9ae8f902c5fe0c344436a50603622123f55.
