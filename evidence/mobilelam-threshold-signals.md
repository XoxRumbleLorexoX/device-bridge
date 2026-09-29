# MobileLAM threshold-signal milestone — 2026-09-29

## Scope

This milestone adds exploratory nonlinearity/change-point discovery over explicitly paired experiment outcome measurements. It does not add a provider, background observation, device authority, filesystem discovery or recommendation execution.

## Implemented evidence path

- `OutcomeMeasurementSchema.sample_id` is optional and backwards compatible.
- Driver/outcome measurements are paired only when experiment, sample ID and experiment phase agree.
- `phase=any` still keeps phases separate; it never cross-pairs baseline and intervention records.
- Duplicate members of a pair are treated as ambiguous and excluded rather than averaged silently.
- Only finite numeric values with positive confidence participate.
- Driver and outcome units must each be internally consistent.
- Candidate thresholds are midpoints between distinct observed driver values.
- Every candidate must satisfy the caller's minimum samples per side.
- Selection uses the largest absolute confidence-weighted outcome-mean separation; exact ties prefer the more balanced split.
- Medians and an ordinary unweighted pooled standardized mean difference are reported as descriptive context where defined.
- The result never returns raw measurement evidence or sample IDs.
- Every discovered split returns `causal_interpretation: not_established` and `validation_required: true`.
- The recommended next step is a held-out confirmation using a pre-registered split, not further re-optimization on the same observations.

## Surfaces

- Programmatic: `detectThresholdSignal()` from `src/leverage/nonlinearity.mjs` / `src/leverage/index.mjs`.
- CLI: `bridge leverage threshold-detect --experiment ... --driver ... --outcome ...`.
- Measurement pairing: `bridge leverage outcome ... --sample SAMPLE_ID`.
- MCP: `leverage_threshold_detect`, marked local/read-only/idempotent.

The MCP handler reads only `service.store`; it does not invoke DeviceBridge transport, SSH or a provider.

## Regression coverage added

`tests/threshold_signals.test.mjs` covers:

- backwards-compatible optional `sample_id`;
- a clean step-pattern threshold;
- missing sample IDs;
- duplicate/ambiguous pair members;
- inconsistent units;
- zero-confidence and nonnumeric measurements;
- phase scoping;
- `phase=any` cross-phase isolation;
- local/read-only/idempotent MCP semantics and persisted-state non-mutation.

`package.json` syntax coverage includes `src/leverage/nonlinearity.mjs`.

## Interpretation boundary

This is an exploratory detector, not a causal or inferential test. Selecting the maximum separation on the same data used to estimate it creates winner-selection bias. Apparent thresholds can also arise from confounding, time trends, interventions, regression to the mean or outliers.

No p-value, causal effect, guaranteed leverage or out-of-sample performance is claimed.

## Verification process

Per the current repository-development preference, GitHub Actions/workflow runs are **not** used as a development or merge gate. GitHub is used here for repository storage and version history. The branch is reviewed through its direct `main...feature/mobilelam-threshold-signals` diff before promotion.

Full native/physical DeviceBridge verification remains a separate owner-operated gate and is unchanged by this host-local MobileLAM work.
