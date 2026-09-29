# MobileLAM threshold / nonlinearity signals

MobileLAM can inspect explicitly paired numeric experiment measurements for an **exploratory threshold candidate**: a driver value around which the observed outcome distribution separates materially.

This is a discovery aid, not a causal estimator and not proof that a real discontinuity exists.

## Why pairing is explicit

Threshold analysis does not infer that two measurements belong together because their timestamps are nearby.

`OutcomeMeasurementSchema` therefore supports an optional `sample_id`:

```json
{
  "experiment_id": "...",
  "metric_id": "focus.hours",
  "sample_id": "week-01",
  "phase": "intervention",
  "value": 4.5,
  "unit": "hours",
  "confidence": 0.9
}
```

The driver and outcome records must have:

- the same `experiment_id`;
- the same `sample_id`;
- the same experiment phase;
- positive confidence;
- numeric finite values.

`sample_id` is optional so older outcome measurements remain valid. Measurements without it simply cannot participate in paired threshold analysis.

Even with `phase="any"`, MobileLAM pairs on **phase + sample ID**. A baseline driver can never be paired to an intervention outcome merely because the caller reused the same sample label.

Duplicate driver or outcome records for one phase/sample are treated as ambiguous and excluded rather than silently averaged.

## Recording paired samples

CLI example:

```sh
node src/cli.mjs leverage outcome \
  --experiment EXPERIMENT_UUID \
  --metric focus.hours \
  --sample week-01 \
  --phase intervention \
  --value 4.5 \
  --unit hours

node src/cli.mjs leverage outcome \
  --experiment EXPERIMENT_UUID \
  --metric output.units \
  --sample week-01 \
  --phase intervention \
  --value 12 \
  --unit units/week
```

## Detecting a candidate split

```sh
node src/cli.mjs leverage threshold-detect \
  --experiment EXPERIMENT_UUID \
  --driver focus.hours \
  --outcome output.units \
  --phase intervention \
  --minimum-samples 8 \
  --minimum-per-side 3
```

The MCP equivalent is `leverage_threshold_detect`. It is local, read-only and idempotent. It only reads the local leverage store; it does not invoke DeviceBridge, SSH or a provider.

## Method

For usable paired samples, the detector:

1. verifies one consistent driver unit and one consistent outcome unit;
2. sorts samples by the driver value;
3. considers midpoint splits only between distinct observed driver values;
4. rejects splits that leave fewer than `minimum_per_side` samples on either side;
5. computes confidence-weighted outcome means on both sides;
6. selects the split with the largest absolute weighted mean separation;
7. breaks exact ties in favour of the more balanced split;
8. reports medians and an ordinary unweighted pooled standardized mean difference when the within-side variance supports one.

The standardized mean difference is descriptive and is **not** used to select the threshold. Measurement confidence only weights the descriptive outcome means.

## Output semantics

A successful discovery returns approximately:

```json
{
  "status": "exploratory_threshold_candidate",
  "threshold": {
    "value": 5.5,
    "below_count": 5,
    "above_count": 5,
    "below_outcome_mean": 10,
    "above_outcome_mean": 20,
    "absolute_change": 10,
    "relative_change": 1
  },
  "observed_change": "outcome_higher_above_threshold",
  "causal_interpretation": "not_established",
  "validation_required": true
}
```

The result deliberately omits sample IDs, measurement evidence text and raw provider content.

Evidence levels are qualitative descriptions of usable sample depth (`thin`, `moderate`, `richer` exploratory samples). They are not probabilities that the threshold is true.

## Fail-closed cases

The detector returns `insufficient_evidence` rather than manufacturing a split when, for example:

- too few usable pairs exist;
- sample IDs are absent;
- pairs are incomplete or ambiguous;
- driver or outcome values are nonnumeric;
- confidence is zero/nonpositive;
- units are inconsistent;
- too few samples remain on either side of every candidate split.

## Selection bias and held-out validation

The largest separation is chosen using the same observations used to estimate that separation. This creates winner-selection bias: even random/noisy data can produce a seemingly impressive best split when enough alternatives are searched.

For that reason every discovered threshold says:

- `causal_interpretation: not_established`;
- `validation_required: true`;
- the candidate should be pre-registered and checked on **new** paired observations without moving the threshold.

A later validation layer can compare the pre-registered split against held-out data. Discovery and confirmation should remain separate records.

## What this does not establish

A threshold candidate does not prove:

- that changing the driver causes the outcome to change;
- that the relationship is discontinuous rather than gradual;
- that an unmeasured variable did not produce the pattern;
- that the candidate generalizes to future periods;
- that the driver should be increased or decreased;
- that the observed difference is practically valuable to the user.

Those questions require goal context, additional variables, experiment design and/or held-out evidence.
