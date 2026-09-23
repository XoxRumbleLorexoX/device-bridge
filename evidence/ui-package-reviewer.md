# UI package reviewer — 2026-09-23

This record covers host/source behavior only. It does not advance the actual-device
or cross-network acceptance gates.

## Change

`scripts/review_ui_package.py` performs an offline, no-install review of a candidate
Device Bridge UI Debian package. It parses the ar container and compressed tar
members in memory. The reviewer requires:

- Debian format marker `2.0` and exactly one control archive plus one data archive.
- package identifier `dev.devicebridge.ui`.
- an explicitly supplied expected version and architecture (default `iphoneos-arm`).
- exactly two regular payload files: `DeviceBridgeUI.dylib` and
  `DeviceBridgeUI.plist` under the rootless MobileSubstrate DynamicLibraries path.
- no symlinks, hardlinks, devices, FIFOs, extra payload files, maintainer scripts or
  triggers.

A successful review emits package and payload SHA-256 hashes/sizes and the state
`package_structure_verified_not_installed` with explicit runtime limitations.

## Regression coverage

`tests/test_ui_package_review.py` covers a narrow valid package and fail-closed
rejection of maintainer scripts, extra payload files, non-regular entries, package
identity mismatch, version mismatch and architecture mismatch.

## Verification status

PR #3 CI run `35853561704` completed successfully on the reviewed branch head:
`npm ci`, `npm test`, and `npm run check` all passed on Ubuntu. This verifies the
host/source reviewer and its regression coverage only. No package was installed,
transferred to a phone, signed, executed, or used to issue UI input as part of this
change.
