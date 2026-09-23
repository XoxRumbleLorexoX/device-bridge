# UI package reviewer — 2026-09-23

This record covers host/source behavior only. It does not advance the actual-device
or cross-network acceptance gates.

## Change

`scripts/review_ui_package.py` performs an offline, no-install review of a candidate
Device Bridge UI Debian package. It parses the ar container and compressed tar
members in memory. The reviewer requires:

- Debian format marker `2.0` and exactly one control archive plus one data archive.
- package identifier `dev.devicebridge.ui`.
- an explicitly supplied expected version and architecture (default `iphoneos-arm64`).
- exactly six regular payload files matching the reviewed Theos staging rule: the
  `DeviceBridgeUI.dylib` and `DeviceBridgeUI.plist` plus `DEVICE_BRIDGE_LICENSE`,
  upstream `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.md` under
  `usr/share/doc/device-bridge`.
- no symlinks, hardlinks, devices, FIFOs, extra payload files, maintainer scripts or
  triggers.

A successful review emits package and payload SHA-256 hashes/sizes and the state
`package_structure_verified_not_installed` with explicit runtime limitations.

## Regression coverage

`tests/test_ui_package_review.py` covers a valid six-file package and fail-closed
rejection of maintainer scripts, extra payload files, non-regular entries, package
identity mismatch, version mismatch and architecture mismatch.

## Verification status

PR #3 CI run `35853561704` verified the original reviewer implementation. PR #4
corrects its payload/architecture model to match `device/Makefile` and the recorded
historical package preflight, and adds replacement-generation coverage. Treat the
PR #4 correction as pending until CI passes on its final head. No package was
installed, transferred to a phone, signed, executed, or used to issue UI input as
part of this host-side work.
