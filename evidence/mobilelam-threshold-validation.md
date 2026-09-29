# MobileLAM held-out threshold validation milestone — 2026-09-29

## Scope

This milestone separates exploratory threshold discovery from pre-registered held-out evaluation. It remains host-local and adds no provider, background monitoring, DeviceBridge transport authority or recommendation execution.

## Implemented boundary

- Threshold discovery remains read-only and exploratory.
- Registration is a separate explicit action; discovery does not auto-register itself.
- A registered hypothesis freezes the threshold, metrics, phase, units, expected direction and sample requirements.
- Registration records the current `outcome_measurements.length` as an append boundary.
- Registration also hashes the complete pre-registration measurement prefix with SHA-256.
- Validation first verifies that frozen prefix digest, then uses only records appended after the boundary.
- Caller-supplied timestamps cannot move an already-present record into the held-out slice.
- Prefix mutation/reordering/truncation fails closed rather than silently reconstructing the boundary.
- The boundary proves store-level separation, not that every later-appended record was genuinely observed later in the real world; validation reports `real_world_observation_novelty_verified: false`.
- Validation never searches for or moves the threshold: `threshold_reselected: false`.
- Pre-registered unit drift fails closed.
- Direction mismatch is reported descriptively and does not rewrite the hypothesis.
- Optional `minimum_absolute_change` is allowed only for directional hypotheses.
- `no_observed_mean_difference` is exact descriptive equality in this version, not an equivalence/non-inferiority test.
- Every validation retains `causal_interpretation: not_established`.

## Structured memory

A new schema-v1 collection, `threshold_hypotheses`, stores pre-registered measurement plans separately from:

- raw events;
- experiments;
- outcome measurements;
- recommendations;
- user feedback.

Older schema-v1 stores backfill the collection as `[]` without a schema-version migration.

Leverage history deletion removes registered threshold hypotheses. `retain_goals=true` does not retain these experimental plans.

## Surfaces

Programmatic:

- `validateFixedThresholdSignal()`
- `registerThresholdHypothesis()`
- `listThresholdHypotheses()`
- `validateRegisteredThreshold()`

CLI:

- `threshold-register`
- `thresholds`
- `threshold-validate`

MCP:

- `leverage_threshold_register` — local state mutation only;
- `leverage_threshold_hypotheses` — local/read-only/idempotent;
- `leverage_threshold_validate` — local/read-only/idempotent.

No threshold tool invokes SSH, DeviceBridge or a provider.

## Regression evidence encoded in repository tests

`tests/threshold_validation.test.mjs` covers:

- registration freezing the current append boundary and prefix digest;
- immediate validation having zero later-appended measurements;
- opposite pre-registration store data not entering the validation slice;
- frozen-prefix mutation detection;
- fixed-threshold validation preserving the registered split;
- direction mismatch without state mutation;
- unit drift failure;
- directional-only magnitude requirements;
- explicit no-difference semantics;
- schema-v1 store backfill;
- deletion of registered threshold hypotheses;
- MCP local/read-only authority annotations;
- hypothesis listing without measurement evidence leakage.

`package.json` syntax coverage includes `src/leverage/thresholds.mjs`.

## Verification process

The user has explicitly requested that GitHub Actions/workflows not be used as development infrastructure. GitHub is therefore being used for repository storage, commits, branch diffs and fast-forward version history only.

This milestone is reviewed through the direct `main...feature/mobilelam-threshold-validation` repository diff. No GitHub Actions/workflow status is used as a merge gate.

The repository test cases are committed as executable regression specifications, but this GitHub-only editing path does not itself constitute a local runtime execution of those tests. Runtime validation remains appropriate on a local checkout before relying on the feature operationally.

## Device boundary

No grant, deployment, pairing acceptance, package activation, SpringBoard action, biometric/passcode action or physical UI input is part of this milestone. DeviceBridge Gate B remains an independent owner-operated physical acceptance gate.
