# Restricted UI replacement review

This procedure prepares a specific owner-reviewed replacement for the restricted
Device Bridge UI package. It does not authorize or perform installation, SpringBoard
reload, respring, control grants, or input.

## 1. Review the built candidate

Run the offline package reviewer against the exact `.deb`:

```sh
python3 scripts/review_ui_package.py build/dev.devicebridge.ui_VERSION_iphoneos-arm64.deb \
  --expected-version VERSION \
  --output build/ui-package-review.json
```

The reviewer accepts only `dev.devicebridge.ui`, architecture `iphoneos-arm64`, no
maintainer scripts/triggers, and the six regular files produced by the reviewed
Theos package: the restricted dylib/filter plist plus four license/notice files.
It emits exact package and payload hashes. A pass is package-structure evidence,
not native runtime or hardware acceptance.

## 2. Generate one immutable owner upgrade

Bind the candidate review to the exact current package evidence:

```sh
python3 scripts/prepare_ui_upgrade.py \
  --review build/ui-package-review.json \
  --package build/dev.devicebridge.ui_VERSION_iphoneos-arm64.deb \
  --current-preflight evidence/package-preflight.json \
  --expected-current-version 0.1.0-2+debug \
  --expected-version VERSION \
  --output build/owner-ui-upgrade.py \
  --plan-output build/owner-ui-upgrade-plan.json
```

The generator re-parses the candidate package rather than trusting the JSON alone.
It also requires the current preflight to describe exactly one Device Bridge UI
package with the restricted six-file payload. The generated installer embeds both
the old and new package/file hashes and is written as a new file only.

Record the generated installer SHA-256 together with the candidate package SHA-256,
from/to versions and recovery plan when requesting the owner's specific deployment
approval. Any rebuild, package change, review change or installer change requires a
new review; approval for an earlier hash does not transfer.

## 3. Owner execution boundary

The generated installer is intentionally not self-elevating. The owner runs it in
an independently authenticated root terminal and supplies two already reviewed files:

```sh
python3 owner-ui-upgrade.py \
  --candidate /owner/chosen/path/candidate.deb \
  --previous-package /owner/chosen/path/previous-reviewed.deb
```

Before package mutation it verifies the installed version and every current file,
then verifies both `.deb` files by size/SHA-256 and preserves protected copies under
`/var/root`. It performs `dpkg --no-act --no-triggers` before the real
`--no-triggers` install and verifies every candidate file afterward. The protected
previous `.deb` is retained for a separately reviewed recovery action.

The installer does **not** reload SpringBoard, respring, execute arbitrary pending
triggers, create or rotate credentials, clear STOP, issue a control grant, launch the
fixture, or send UI input. After a successful file replacement, activation and the
Gate-B hardware sequence remain distinct owner-approved steps.
