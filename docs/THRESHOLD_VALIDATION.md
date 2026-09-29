# MobileLAM pre-registered threshold validation

Exploratory threshold discovery deliberately searches several possible splits, so the largest observed separation is selection-biased. MobileLAM therefore separates **discovery** from **validation**.

The validation workflow is:

```text
exploratory paired measurements
        ↓
threshold-detect
        ↓
inspect candidate + caveats
        ↓
explicit threshold-register
        ↓
registration boundary freezes
        ↓
collect NEW paired measurements
        ↓
threshold-validate
        ↓
fixed-threshold held-out description
```

Validation does not re-run the threshold search.

## 1. Register the hypothesis

Registration is explicit. Discovery never auto-registers its own result.

```sh
node src/cli.mjs leverage threshold-register \
  --experiment EXPERIMENT_UUID \
  --driver focus.hours \
  --outcome output.units \
  --threshold 5.5 \
  --driver-unit hours \
  --outcome-unit units/week \
  --expected-change outcome_higher_above_threshold \
  --phase intervention \
  --minimum-samples 8 \
  --minimum-per-side 3 \
  --minimum-absolute-change 4
```

A registration stores a separate `threshold_hypotheses` record containing:

- experiment ID;
- driver and outcome metric IDs;
- fixed threshold value;
- phase;
- expected descriptive direction;
- driver and outcome units;
- minimum total sample count;
- minimum sample count on each side;
- optional minimum absolute change for directional hypotheses;
- registration time;
- the current `outcome_measurements` append index;
- `causal_interpretation: not_established`;
- `authority: measurement_plan_only`.

Registration does not modify the experiment, recommendation ranking, feedback, device state or provider state.

## 2. Why the hold-out boundary is an append index

Outcome measurements may contain caller-supplied observation timestamps. Those timestamps are useful domain data, but they are not a sufficiently strong provenance boundary for deciding whether a measurement was already available during discovery.

At registration, MobileLAM therefore freezes:

```text
registration_measurement_index = outcome_measurements.length
```

Validation sees only:

```text
outcome_measurements.slice(registration_measurement_index)
```

This means measurements already present in the store cannot become held-out evidence merely by carrying a later timestamp.

If the measurement collection has been truncated or corrupted so the saved boundary is beyond its current length, validation fails rather than silently changing the boundary.

## 3. Collect new paired measurements

Continue recording driver/outcome measurements with explicit `sample_id` values after registration:

```sh
node src/cli.mjs leverage outcome \
  --experiment EXPERIMENT_UUID \
  --metric focus.hours \
  --sample holdout-week-01 \
  --phase intervention \
  --value 6.2 \
  --unit hours

node src/cli.mjs leverage outcome \
  --experiment EXPERIMENT_UUID \
  --metric output.units \
  --sample holdout-week-01 \
  --phase intervention \
  --value 17 \
  --unit units/week
```

The pairing rules from `docs/NONLINEARITY.md` still apply:

- same experiment;
- same sample ID;
- same experiment phase;
- one driver and one outcome record per pair;
- finite numeric values;
- positive confidence;
- consistent units.

## 4. Validate without moving the threshold

```sh
node src/cli.mjs leverage threshold-validate \
  --hypothesis HYPOTHESIS_UUID
```

The validator reports the fixed threshold, side counts, weighted outcome means, medians, descriptive standardized mean difference, absolute/relative separation, expected direction, observed direction and evidence depth.

It also returns:

- `threshold_reselected: false`;
- `direction_consistent`;
- `magnitude_requirement_met` when a directional minimum was registered;
- `pattern_consistent`;
- `causal_interpretation: not_established`;
- `held_out_boundary.discovery_measurements_reused: false`.

`pattern_consistent` means only that the held-out descriptive pattern points in the pre-registered direction and, when applicable, meets the pre-registered magnitude requirement. It is not a causal or statistical-significance verdict.

## Direction semantics

Supported expectations are:

- `outcome_higher_above_threshold`
- `outcome_lower_above_threshold`
- `no_observed_mean_difference`
- `unspecified`

`minimum_absolute_change` is allowed only for the two directional expectations.

`no_observed_mean_difference` currently means exact equality of the two confidence-weighted descriptive means. It is **not** an equivalence/non-inferiority test and accepts no equivalence margin. A future equivalence layer would need its own explicit statistical model.

With `expected_change=unspecified`, validation reports the held-out direction but does not create a pass/fail interpretation.

## Unit drift

Registration freezes both the driver and outcome units. If held-out pairs use different units, validation returns insufficient evidence instead of converting or guessing.

Unit conversion should happen explicitly upstream and be represented consistently before the measurement enters this comparison.

## Store compatibility and deletion

`threshold_hypotheses` is a structured collection in schema version 1. Older schema-v1 stores that do not contain the field are normalized with an empty array.

`leverage delete-history --confirm DELETE_LEVERAGE_HISTORY` deletes registered threshold hypotheses along with experiments and measurements. Retaining goals does not retain threshold hypotheses.

## MCP surface

Three local tools mirror the workflow:

- `leverage_threshold_register` — local state mutation that freezes a measurement plan;
- `leverage_threshold_hypotheses` — local, read-only, idempotent listing;
- `leverage_threshold_validate` — local, read-only, idempotent held-out evaluation.

None invokes DeviceBridge, SSH or a provider.

## Interpretation boundary

A held-out pattern is stronger evidence than re-scoring the discovery data, but it still does **not** prove causality.

Possible explanations still include:

- confounding variables;
- secular/time trends;
- coincident interventions;
- measurement drift;
- selection into the observed samples;
- regression to the mean;
- random variation.

The current validator deliberately reports descriptive consistency rather than p-values, posterior probabilities, causal effects or universal recommendations.
