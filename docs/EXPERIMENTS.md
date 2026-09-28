# MobileLAM experiment evaluation

MobileLAM experiments are bounded measurement plans for hypotheses whose causal effect is uncertain. Evaluation is deliberately descriptive: it compares explicitly phase-tagged measurements and does **not** promote a before/after difference into a causal claim.

## Measurement phases

`OutcomeMeasurementSchema` now includes:

- `baseline`
- `intervention`
- `followup`
- `unspecified` (the backwards-compatible default)

Only positive-confidence numeric `baseline` and `intervention` measurements participate in the first evaluator. `followup`, `unspecified`, non-numeric and zero-confidence records remain stored but are ignored by this comparison and reported as a limitation.

Example CLI recording:

```sh
node src/cli.mjs leverage outcome \
  --experiment EXPERIMENT_UUID \
  --metric qualified_applications_per_week \
  --phase baseline \
  --value 2 \
  --unit count/week

node src/cli.mjs leverage outcome \
  --experiment EXPERIMENT_UUID \
  --metric qualified_applications_per_week \
  --phase intervention \
  --value 4 \
  --unit count/week
```

## Read-only evaluation

Evaluate without changing experiment, recommendation, feedback or ranking state:

```sh
node src/cli.mjs leverage experiment-evaluate \
  --experiment EXPERIMENT_UUID \
  --metric qualified_applications_per_week \
  --direction increase \
  --tolerance 1
```

The MCP equivalent is `leverage_experiment_evaluate`. It is marked local, read-only and idempotent.

The evaluator returns:

- confidence-weighted and arithmetic means for each phase;
- sample count and sample standard deviation;
- mean measurement confidence;
- absolute and relative change;
- observed direction;
- target direction and its provenance;
- evidence level based on per-phase sample count;
- an alignment assessment;
- explicit reasons when evidence is insufficient;
- limitations;
- `causal_interpretation: not_established`.

## Direction semantics

Evaluation can receive an explicit target direction:

- `increase`
- `decrease`
- `maintain`
- `unspecified`

The service also accepts `auto`. Resolution order is:

1. explicit evaluation request;
2. active outcome metric direction for the metric;
3. numeric direction implied by the experiment opportunity's current/proposed lever values;
4. `unspecified`.

The result includes `direction_provenance` so this choice is inspectable.

When direction is `unspecified`, the evaluator reports `direction_observed` or `no_detected_change`; it does not invent an improvement/worsening judgment.

## Meaningful-change tolerance

`minimum_meaningful_change` / CLI `--tolerance` is an absolute threshold in the metric's own unit.

For example, with a tolerance of `2`, a baseline mean of `100` and intervention mean of `101` is classified `within_tolerance` rather than improved/worsened.

A zero tolerance is permitted, but the result explicitly warns that unchanged then means only "no observed numeric difference"; it is not a statistical-equivalence test.

## Fail-closed cases

The evaluator returns `insufficient_evidence` when, for example:

- a phase lacks a positive-confidence numeric measurement;
- comparable baseline/intervention measurements use inconsistent units.

It never converts zero-confidence observations into evidence through an unweighted fallback.

Measurements from unrelated phases do not contaminate the baseline/intervention unit check.

## Causal boundary

Every evaluation states `causal_interpretation: not_established`.

A before/after difference can be explained by confounding, regression to the mean, seasonality, unrelated changes, measurement error or the intervention. The current evaluator does not estimate or eliminate those alternatives.

Evaluation is intentionally read-only. It does not automatically:

- mark an experiment successful/failed;
- change experiment status;
- alter opportunity ranking;
- create feedback;
- execute recommendations;
- invoke DeviceBridge or SSH.

Those boundaries keep measured change, user feedback and causal interpretation separate.
