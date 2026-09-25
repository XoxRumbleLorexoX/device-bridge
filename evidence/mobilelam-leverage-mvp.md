# MobileLAM / Personal Leverage Intelligence MVP evidence

Date: 2026-09-25
Branch: `feature/mobilelam-leverage-mvp`
PR: #13 (follow-up to merged MVP PR #12)

## Implemented host-local vertical slice

The leverage subsystem is deliberately separate from the privileged DeviceBridge phone-control path.

Implemented and covered by repository tests:

- canonical privacy-classified event ingestion with bounded context and duplicate rejection;
- user-controlled observation pause plus application/domain/source/time exclusions;
- explicit consent gates for SENSITIVE and RESTRICTED event classes;
- retention filtering before accepted-event persistence;
- semantic activity grouping with evidence and confidence;
- variable definitions separated from timestamped observations;
- repeated-workflow/friction detection and deterministic capacity counterfactual arithmetic;
- explicit goals plus inferred-goal provenance;
- inferred goals are created `unconfirmed`, cannot self-confirm at creation, and only become active through the separate explicit `leverage_goal_confirm` / `goal-confirm` transition;
- outcome metrics, bottleneck records, competing hypotheses and value-of-information;
- leverage candidates with transparent ranking dimensions, assumptions, alternatives and evidence;
- opportunity-cost alternatives returned as not-ranked trade-offs;
- causal/leverage graph edges that preserve `hypothesis` / `counterfactual_estimate` claim types instead of silently asserting causation;
- proactive insight projection and `why` traceability;
- recommendation feedback kept separate from measured outcomes;
- bounded experiment plans for uncertain causal claims;
- feedback suppression keyed to unchanged evidence signatures;
- local structured persistence with atomic replacement and restrictive filesystem modes;
- provider and domain-module extension contracts;
- MCP, CLI and programmatic APIs;
- reproducible synthetic earning-power fixture covering 5.3 h job discovery, 2 applications, 12 h software development, 4 h repeated administration, an automation candidate, competing career bottleneck hypotheses, and missing application-to-interview conversion.

## Security / authority boundary

Leverage operations do not grant phone privileges and do not invoke DeviceBridge SSH transport. MCP regression tests inject a transport that throws if called and assert zero device-transport calls for leverage analysis, privacy changes, measured outcomes and inferred-goal confirmation.

Every generated opportunity is marked `action_authority: user_required` and `action_state: recommendation_only`. Experiments are plans only. No recommendation is automatically executed.

## Evidence semantics

The model keeps these states distinct:

1. observation;
2. inference;
3. hypothesis;
4. recommendation;
5. user-authorized action state;
6. measured outcome.

The ranking `heuristic_score` is an ordering heuristic, not a probability of truth or guaranteed utility. Counterfactual time reclamation is arithmetic under explicit assumptions and is not automatically converted into an outcome claim.

## CI state

Merged MVP PR #12 passed repository CI through head `6a148e8f...` and landed on `main` as merge commit `7d794052...`.

Follow-up PR #13 adds the explicit inferred-goal confirmation transition and its MCP/CLI/tests/evidence. The exact final PR #13 head still requires a fresh full CI pass before merge. DeviceBridge Gate B remains independently open; no native candidate deployment or physical phone acceptance is implied by MobileLAM host CI.
