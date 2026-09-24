# Physical Gate-B handoff

This is the shortest supported path from green host CI to the first real-device
Gate-B acceptance run. It deliberately stops at owner-controlled boundaries.
Repository automation does **not** deploy, accept pairing, issue grants, reload
SpringBoard, unlock the phone, or send physical UI input.

## 1. Start from the verified main-branch source artifact

Use the artifact from a successful `main` CI run named:

`device-bridge-native-source-<main-commit>`

Inside the GitHub artifact wrapper, use only:

- `device-bridge-build.tar.gz`
- `SHA256SUMS`

The ZIP wrapper digest is not the source trust boundary. Verify the inner archive
against `SHA256SUMS`, and preserve the 40-character main commit associated with the
workflow run. The archive was built twice from the exact pinned `ios-mcp` commit and
compared byte-for-byte by CI before upload.

## 2. Owner builds the native candidate without installing it

Transfer the exact verified `device-bridge-build.tar.gz` over an owner-trusted
channel. On the test phone, extract it into a **fresh mobile-owned directory** and,
as the non-root mobile user with the already verified Theos environment, run:

```sh
./package-candidate.sh
```

The script verifies all source hashes, refuses stale output, builds only the
restricted UI package, reviews the resulting `.deb` offline, and emits:

- the single candidate `.deb`
- `candidate-review.json`
- `CANDIDATE_SHA256SUMS`

It does not install or activate the package.

Return those three files through the trusted owner channel. Do not rename the
candidate `.deb` or `candidate-review.json`; the host handoff intentionally binds
SHA sidecar basenames as well as bytes.

## 3. Host creates the immutable physical-test pack

Place the returned native outputs beside the retained source artifact and run:

```sh
python3 scripts/prepare_physical_test.py \
  --source-bundle incoming/device-bridge-build.tar.gz \
  --source-sums incoming/SHA256SUMS \
  --candidate incoming/dev.devicebridge.ui_0.1.1_iphoneos-arm64.deb \
  --review incoming/candidate-review.json \
  --candidate-sums incoming/CANDIDATE_SHA256SUMS \
  --current-preflight evidence/package-preflight.json \
  --expected-current-version 0.1.0-2+debug \
  --expected-version 0.1.1 \
  --repository-commit <main-commit> \
  --output-dir build/physical-test-0.1.1
```

Preparation fails closed if source/candidate sidecars contain extra or missing
entries, any bytes changed, the candidate review is stale, package identity/version/
architecture/payload changed, current-package evidence differs, the repository SHA
is malformed, or the output directory already exists.

A successful output directory contains:

- `owner-ui-upgrade.py` — hash-bound owner installer; **not executed**
- `owner-ui-upgrade-plan.json` — current/candidate package and payload hashes
- `physical-test-manifest.json` — source/candidate/installer binding and safety state
- `gate-b-evidence.json` — initialized hardware evidence template, verdict `not_run`
- `CHECKLIST.md` — artifact-specific owner handoff

The output state is `physical_test_prepared_not_deployed`, not a Gate-B pass.

## 4. Owner approval, replacement, and activation

Review the exact hashes in `physical-test-manifest.json` and
`owner-ui-upgrade-plan.json`. The previous reviewed `.deb` required by the generated
installer must be available for protected retention/recovery.

Only after specific owner approval, the owner executes the generated installer in
an independently authenticated root terminal with the exact candidate and previous
reviewed packages. The installer verifies live current version/files, both package
hashes, performs a no-action package-manager preflight, installs with triggers
suppressed, verifies every resulting candidate file, and records its outcome.

The installer does **not** reload SpringBoard, clear STOP, change credentials, issue
a grant, launch the fixture, or send input. Required activation/reload remains a
separate owner-approved action under the existing recovery procedure.

## 5. Run Gate B physically

After successful replacement and separately approved activation:

1. Owner is present and watches the entire run.
2. Unlock locally. Never automate passcode or biometric entry.
3. Confirm recovery/STOP works before enabling a new test session.
4. Issue only the fresh, time-bounded fixture grant required by `docs/SMOKE.md`.
5. Run the Gate-B sequence in `docs/SMOKE.md`: environment/auth boundaries, session,
   fixture launch and observation, observed-reference tap, Unicode input, stale/lock
   negative cases, cancellation/local STOP, then revocation/recovery.
6. Never automatically retry a mutation whose outcome is uncertain.
7. Record concrete evidence in `gate-b-evidence.json`.

Validate the completed evidence file with:

```sh
python3 scripts/physical_test_evidence.py --validate \
  build/physical-test-0.1.1/gate-b-evidence.json
```

`verdict: pass` is possible only when every required Gate-B category is explicitly
`pass`, each pass has non-empty evidence, the device/source identifiers and hashes
are complete, the owner was present, and the forbidden safety conditions remain
false. `blocked`, `fail`, `incomplete`, and `invalid` are never promoted to a pass.

## Ready-to-test definition

The repository is **physically test-ready** when all of the following are true:

- successful `main` CI produced the retained deterministic source artifact;
- owner produced the native candidate using the bundled package-only path;
- candidate `.deb`, review JSON and sidecar returned unchanged;
- `prepare_physical_test.py` produced a clean immutable test pack;
- owner reviewed and explicitly approved the exact replacement/activation scope;
- recovery/STOP remains independently available.

Only the subsequent real-device run can close Gate B.
