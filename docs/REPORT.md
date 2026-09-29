# MobileLAM local leverage report

MobileLAM can render its current **derived leverage state** into one standalone HTML file for local inspection.

The report is intentionally not a web application. It has:

- no HTTP server;
- no client-side JavaScript;
- no CDN or external fonts/assets;
- no network calls;
- no DeviceBridge/SSH authority;
- no MCP file-writing tool.

The leverage map is rendered as static inline SVG during report generation.

## Generate a report

```sh
node src/cli.mjs leverage report \
  --output leverage-report.html
```

Use a non-default leverage store when required:

```sh
node src/cli.mjs leverage report \
  --store /path/to/leverage-store.json \
  --output /path/to/leverage-report.html
```

The CLI uses create-only file semantics (`wx`) with mode `0600`. It refuses to overwrite an existing path. Choose a new path or deliberately remove/rename the old report yourself when you intend to replace it.

Programmatic callers can use:

```js
import { buildLeverageReportModel, renderLeverageReport } from './src/leverage/index.mjs';
```

## Included derived state

The report can include:

- analysis coverage/count metadata;
- confirmed/inferred goal metadata and descriptions;
- variable definitions and derived observation values;
- bottleneck type/status/confidence and missing-variable names;
- leverage opportunity title, expected effect, confidence and ordering heuristic;
- experiment hypothesis/intervention/metric names and measurement phase counts;
- sanitized descriptive experiment comparisons for numeric baseline/intervention measurements;
- registered fixed-threshold plans and sanitized held-out validation summaries;
- sanitized leverage-graph node/edge labels, claim type and confidence;
- high-level observation-policy status.

The ordering heuristic remains an ordering aid, not a truth/value probability.

### Experiment evidence in the report

For each experiment metric the report can display:

- confidence-weighted baseline mean;
- confidence-weighted intervention mean;
- observed direction (`increase`, `decrease`, or `within_tolerance`);
- evidence level based on comparable per-phase sample count;
- whether evidence is insufficient;
- the explicit causal marker `not_established`.

The report deliberately evaluates these summaries with **direction `unspecified`** and a zero configured meaningful-change tolerance. That means it describes observed change but does not automatically label the experiment `improved`, `worsened`, successful, or failed.

Use `leverage experiment-evaluate` / `leverage_experiment_evaluate` when you explicitly want a target direction and meaningful-change tolerance applied. Those evaluations also remain descriptive and do not establish causality.

### Registered threshold evidence in the report

The public report API composes the base renderer with the same registered-threshold evaluator used by CLI/MCP validation. It does not reimplement or re-search thresholds inside the report.

For each registered threshold the report may show:

- driver → outcome metric IDs;
- fixed threshold and units;
- registered phase and expected direction;
- validation status/evidence level;
- number of records appended after registration;
- below/above sample counts when enough valid pairs exist;
- observed aggregate outcome separation;
- whether the held-out descriptive pattern is consistent with the registered expectation;
- `threshold reselected: no`;
- `causality not established`;
- `real-world observation novelty independently verified: no`.

Before displaying held-out results, the evaluator verifies the frozen pre-registration store-prefix digest. If that integrity check fails, the report degrades to `boundary_integrity_failed`; it does not expose the underlying digest, changed measurement, or raw validation error.

The append-order boundary proves that records already present in the store at registration are excluded. It does **not** prove that a later-appended record corresponds to a real-world observation that actually happened later.

## Deliberately excluded

The report model does **not** include:

- raw event records;
- event object payloads;
- provider event context;
- `raw_event_ref` values;
- full evidence arrays/text;
- measurement IDs from experiment evaluation internals;
- full assumption text;
- full alternative text;
- measurement evidence text;
- threshold sample IDs;
- threshold raw measurements;
- threshold integrity digests;
- threshold registration notes.

Regression fixtures place deliberately sensitive sentinel strings in those fields and require them to be absent from the report model and HTML.

## HTML safety boundary

All rendered text is HTML-escaped. The standalone output contains no script element and no external HTTP/HTTPS resource.

This reduces accidental raw-content exposure and eliminates a browser-network dependency. It does **not** make the report non-sensitive.

Goals, variable values, bottlenecks, hypotheses, experiment/threshold summaries and recommendations are themselves derived personal information. Treat the generated HTML as private data and store/share it accordingly.

The file is not application-level encrypted. Host/disk encryption remains the appropriate control when encryption-at-rest is required.

## Why there is no MCP report-write tool

MobileLAM MCP analysis tools operate on data already present in the local leverage store. Giving that interface an arbitrary host-file output path would add a new file-write authority unrelated to leverage reasoning.

For now report creation therefore remains:

- an explicit local CLI action; or
- a programmatic renderer whose caller owns the destination-file decision.

This mirrors the provider boundary: analytical authority should not silently expand into filesystem discovery or arbitrary filesystem mutation.

## Interpretation boundary

The report visualizes the model as it currently exists. It does not:

- turn a hypothesis edge into a causal fact;
- turn a before/after experiment difference into a causal effect;
- turn threshold-pattern consistency into causal confirmation;
- automatically accept a recommendation;
- execute a recommendation;
- change experiment/threshold status;
- change ranking or feedback;
- contact the phone.

Dashed leverage-map edges represent hypotheses where applicable. Counterfactual, observational, experiment before/after and threshold-validation relationships retain their existing claim semantics.
