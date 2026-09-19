# Fixture 0.1.1 replacement review

Prepared, not installed. The owner approved the original fixture0.1.0 installation;
this candidate is a different artifact and needs specific replacement approval.
Do not rerun scripts/install_reviewed_fixture.py: it targets the old package and
correctly refuses an existing installation.

Artifact: `dev.devicebridge.fixture_0.1.1-1+debug_iphoneos-arm64.deb`
SHA256: `d5df4005ea604c80b8806d97307ba96eacac49d41fcfaac4ee44a991e4bad3fd`

Changes: standalone fixture now contains only arm64, to test whether the arm64e
slice contributes to the early Objective-C runtime crash. Adds an original bridge
icon at three resolutions and bumps app/package version. This is an unconfirmed
runtime hypothesis; a successful build does not prove the crash is fixed.
Executor, helper policy, signing entitlements and system configuration unchanged.
No installer scripts, package dependencies, links, special files or setuid bits.
Only six files under /var/jb/Applications/BridgeFixture.app are shipped; exact
paths/hashes are in evidence/fixture-candidate-preflight.json.

After approval, validate the currently installed0.1.0 hashes/version, retain its
reviewed package in protected root staging, and copy/hash the replacement into a
new protected root staging directory. Run fixture-only dpkg dry run, then upgrade
with --no-triggers and per-bundle uicache -p. No uicache -a, respring, reboot or
SpringBoard hook installation. Check installed hashes and registration, then owner
launches the icon once. If it fails, collect only its latest crash summary and stop.
Do not repeatedly launch, add entitlements, or install signing-bypass components.

The existing uikittools trigger remains a separate unresolved package state; its
handler invokes global uicache -a and is outside this proposed scope.

Previous artifact (already retained): dev.devicebridge.fixture_0.1.0-2+debug,
SHA256 9e9b807e7b87d3118f9ce84245f50e3ba82e254fa0a995cf76fa55b9b728acc9.
Restoring it would restore the previously crashing version, not a known-good app.
Any downgrade/removal must be owner-approved; neither is automatic or tested.
