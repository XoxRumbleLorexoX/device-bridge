# MobileLAM threshold-validation report milestone — 2026-09-29

## Scope

This milestone integrates registered threshold plans and their current fixed-split validation summaries into the existing local standalone leverage report.

It does not add a web server, external network resource, DeviceBridge authority, provider access or recommendation execution.

## Architecture

- The existing `src/leverage/report.mjs` renderer remains unchanged.
- `src/leverage/report_thresholds.mjs` composes the base report rather than duplicating it.
- Registered-threshold evaluation is shared through `evaluateRegisteredThresholdState()` from `src/leverage/thresholds.mjs`.
- CLI/programmatic report exports route through the composed layer via `src/leverage/index.mjs`.

This keeps CLI/MCP threshold validation and report summaries on the same fixed-threshold/boundary-integrity implementation.

## Included threshold summary

The report may show:

- driver/outcome metric IDs;
- fixed threshold and units;
- registered phase and expected direction;
- held-out validation status/evidence level;
- appended measurement count;
- below/above pair counts;
- aggregate outcome separation;
- expected-pattern consistency;
- threshold-reselection marker;
- causal marker;
- explicit statement that real-world observation novelty is not independently verified.

## Deliberately excluded

The report model/HTML exclude:

- `registration_prefix_digest`;
- threshold sample IDs;
- raw threshold measurements;
- measurement evidence text;
- threshold registration notes;
- raw boundary-integrity errors.

If boundary verification throws, the report projects only `boundary_integrity_failed` and does not surface the changed record/digest/error text.

## Regression evidence encoded in repository tests

`tests/leverage_report_thresholds.test.mjs` covers:

- aggregate fixed-threshold validation appearing in the public report model;
- expected held-out direction/absolute change and fixed split;
- explicit novelty/causality caveats;
- absence of sample IDs, evidence strings, notes and integrity digests;
- sanitized degradation when the pre-registration prefix is changed;
- stores with no registered threshold hypotheses.

`package.json` syntax coverage includes `src/leverage/report_thresholds.mjs`.

## Verification process

Per the user's repository workflow preference, GitHub Actions/workflow runs are not used as a merge gate. GitHub is used as versioned repository storage; the branch is reviewed through its direct diff against `main` before fast-forward promotion.

The added tests are executable regression specifications committed to the repository. This GitHub-only editing path does not itself claim a local runtime execution of them.

## Device boundary

DeviceBridge physical Gate B is unchanged. No phone deployment, grant, pairing acceptance, package activation, SpringBoard action or UI input is performed by this work.
