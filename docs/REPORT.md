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
- sanitized leverage-graph node/edge labels, claim type and confidence;
- high-level observation-policy status.

The ordering heuristic remains an ordering aid, not a truth/value probability.

## Deliberately excluded

The report model does **not** include:

- raw event records;
- event object payloads;
- provider event context;
- `raw_event_ref` values;
- full evidence arrays/text;
- full assumption text;
- full alternative text;
- measurement evidence text.

Regression fixtures place deliberately sensitive sentinel strings in those fields and require them to be absent from the report model and HTML.

## HTML safety boundary

All rendered text is HTML-escaped. The standalone output contains no script element and no external HTTP/HTTPS resource.

This reduces accidental raw-content exposure and eliminates a browser-network dependency. It does **not** make the report non-sensitive.

Goals, variable values, bottlenecks, hypotheses and recommendations are themselves derived personal information. Treat the generated HTML as private data and store/share it accordingly.

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
- automatically accept a recommendation;
- execute a recommendation;
- change experiment status;
- change ranking or feedback;
- contact the phone.

Dashed leverage-map edges represent hypotheses where applicable. Counterfactual and observational relationships retain their existing claim semantics.
