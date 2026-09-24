# Restricted UI replacement review

This procedure prepares a specific owner-reviewed replacement for the restricted
Device Bridge UI package. It does not authorize or perform installation, SpringBoard
reload, respring, control grants, or input.

## 0. Prepare and build the reviewed native candidate

On a host with the pinned `ios-mcp` checkout beside this repository, create the
source bundle into a new path:

```sh
python3 scripts/prepare_device_bundle.py \
  --output build/device-bridge-observation-0.1.1.tar.gz
```

The bundle generator verifies reused upstream bytes through `prepare_executor.py`,
normalizes tar/gzip ownership, permissions and timestamps, and emits a SHA-256.
Identical reviewed source bytes therefore produce identical archive bytes. The
archive includes `SHA256SUMS`, `CANDIDATE_VERSION`, the compile-only
`build-check.sh`, the package-only `package-candidate.sh`, and the offline package
reviewer. No device access occurs while creating the bundle.

The owner transfers the exact archive through their existing trusted channel,
verifies the announced archive SHA-256, and extracts it into a **fresh**
mobile-owned directory. As the non-root mobile user with verified `THEOS`, run:

```sh
./package-candidate.sh
```

That script verifies every source file against `SHA256SUMS`, refuses pre-existing
package/review output, checks the executor control version/architecture, and runs a
package-only Theos build with `FINALPACKAGE=1`. It selects exactly one generated
`.deb`, runs the bundled offline reviewer against version `0.1.1` and architecture
`iphoneos-arm64`, and writes `candidate-review.json` plus
`CANDIDATE_SHA256SUMS`. It does not run `make install`, `dpkg`, reload/respring, a
grant, fixture launch, or input.

Return the exact `.deb`, `candidate-review.json`, and `CANDIDATE_SHA256SUMS` through
the trusted owner channel for the host-side immutable-upgrade preparation below.
A successful package build/review is native artifact evidence only; it is not an
installed/runtime Gate-B pass.

## 1. Review the built candidate

If the candidate was not produced through the bundled `package-candidate.sh`, run
the repository offline reviewer against the exact `.deb`:

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

For the physical-test handoff, prefer the stricter wrapper in
`docs/PHYSICAL_TEST.md`: `scripts/prepare_physical_test.py` also verifies the
retained CI source-bundle sidecar and `CANDIDATE_SHA256SUMS`, then calls this
immutable-upgrade generator and emits a bound manifest, checklist and Gate-B
evidence template in one fresh output directory.

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
