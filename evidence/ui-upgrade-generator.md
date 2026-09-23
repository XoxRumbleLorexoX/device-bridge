# UI upgrade generator — 2026-09-23

This record covers host/source behavior only. It does not authorize or evidence a
phone package replacement, SpringBoard reload, grant, or UI action.

## Change

`scripts/prepare_ui_upgrade.py` generates a single owner-run upgrade script from:

1. a concrete candidate `.deb`;
2. the offline review JSON for that exact candidate;
3. historical preflight evidence for the exact currently installed package; and
4. explicit current and candidate version strings.

The generator re-reviews the candidate bytes instead of trusting the JSON alone.
It requires the current evidence to contain exactly one `dev.devicebridge.ui`
package, architecture `iphoneos-arm64`, no maintainer scripts and the exact six-file
restricted payload. Generated output is create-only and contains the exact old/new
package sizes, SHA-256 values, versions and per-file hashes.

`scripts/ui_upgrade_template.py` is the non-self-elevating owner execution template.
Before mutation the generated script verifies live package version/status and every
current installed file, verifies both the previous and candidate `.deb` files with
`O_NOFOLLOW`, retains protected copies under `/var/root`, runs a no-trigger dpkg dry
run, installs with triggers suppressed, then verifies every candidate file and final
package version/status. It records a protected outcome journal and does not retry an
uncertain mutation.

The script performs no SpringBoard reload/respring, no trigger drain, no credential
or grant change, no fixture launch and no input. The retained previous package is a
rollback artifact only; rollback remains a separately reviewed owner action.

## Regression coverage

`tests/test_prepare_ui_upgrade.py` covers successful generation and fail-closed
rejection of tampered candidate review evidence, incomplete current-file evidence,
wrong current version, same-version replacement, and overwrite of an existing
output file. Existing UI-package review tests cover malformed or broadened package
contents.

## Verification status

PR #4 implementation head passed CI run `35854640217`; the STATUS-complete head
passed run `35855116599`, including `npm ci`, the full `npm test`, and
`npm run check`. The final documentation-only head must also remain green before
merge. No device access or package mutation occurred while preparing this change.
