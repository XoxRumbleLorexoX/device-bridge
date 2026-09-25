# MobileLAM repeated-sequence and friction milestone

Date: 2026-09-25
PR: #14

## Behavior added

The host-local leverage engine now detects repeated ordered multi-step workflows in addition to the existing same-action repetition model.

Implemented evidence records:

- bounded repeated sequences (2–4 steps by default);
- non-overlapping occurrence counting;
- redundant shorter-subsequence suppression when a longer sequence has the same execution count;
- weekly and annualized time estimates with explicit assumptions;
- privacy-sensitive automation-feasibility heuristics;
- rapid application-transition and A→B→A bounce-back signals;
- short retry-loop signals;
- repeated-information-retrieval signals;
- structured sequence/friction variables and observations;
- `repeated_multi_step_work`, `context_switching`, `retry_loop`, and `repeated_retrieval` bottleneck records;
- friction-derived leverage candidates routed through the existing confidence/ranking/feedback/why pipeline;
- persistence of `sequences` and `frictions` with schema-v1 backfill for older stores.

## Interpretation boundary

A friction record is a **signal**, not a conclusion that the user behaved badly or inefficiently.

The model retains alternatives including necessary multi-application work, intentional iteration, changing information, judgment-sensitive workflow steps, and temporary project-specific patterns.

Context-switch opportunities are experiments and request a task completion/output metric before claiming improvement. Retry-loop recommendations ask for cause/validation analysis before automation. Repeated retrieval starts with a reversible saved-reference workflow rather than a broad autonomous agent.

Time-reclamation estimates are counterfactual arithmetic under explicit assumptions. They are not guaranteed outcome improvements.

## Privacy / authority boundary

Default sequence tokens use application + action type, not raw event objects. Providers may add a stable `context.workflow_step` semantic label. Repeated-search matching may use an opaque `context.query_hash`; raw query text is not placed in the friction statement.

Sequences containing SENSITIVE or RESTRICTED events receive lower automation-feasibility estimates even when those privacy classes were explicitly permitted for local storage.

All resulting ranked opportunities are still stamped:

- `action_authority: user_required`
- `action_state: recommendation_only`

No friction analysis invokes the DeviceBridge SSH/device transport, changes grants, deploys code, or executes a workflow.

## Regression coverage

`tests/friction.test.mjs` covers:

- recurring A→B→C sequence discovery;
- non-overlapping execution counting;
- redundant subsequence suppression;
- no sequence bridging across long session gaps;
- lower feasibility for RESTRICTED data;
- rapid app switching/bounce-backs;
- retry-loop signals and competing interpretations;
- repeated-search statements that do not echo raw query text;
- sequence/friction variable extraction;
- assumption-bound friction candidates;
- service persistence, bottleneck integration, ranking and `user_required` authority;
- schema-v1 storage migration/backfill.

Implementation-head PR #14 run `36148511610` passed the full repository `npm test`, `npm run check`, pinned native-source reproducibility verification and artifact upload. A final-head CI pass is still required after documentation/PLAN/STATUS/evidence synchronization.

DeviceBridge hardware Gate B remains independent and open; this host reasoning milestone is not device acceptance evidence.
