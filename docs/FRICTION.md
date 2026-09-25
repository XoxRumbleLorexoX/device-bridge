# MobileLAM friction and repeated-sequence reasoning

This milestone extends the Personal Leverage Intelligence MVP from single repeated actions to repeated **multi-step workflows** and carefully bounded friction signals.

It does not decide that a behavior is bad merely because it repeats. A friction record means only that the event stream contains a measurable pattern worth inspecting.

## Repeated multi-step sequences

`detectRepeatedSequences()` searches already permitted canonical events for recurring ordered sequences such as:

```text
Browser:filter_search:filter roles
  → PDF:document_open:check CV
  → Browser:form_fill:prepare application
```

Important constraints:

- sequence length is bounded (2–4 steps by default);
- at least three non-overlapping executions are required;
- steps must remain inside a bounded activity gap (10 minutes by default);
- longer repeated sequences suppress redundant shorter subsequences when they carry the same execution count;
- raw event objects are not used in the default sequence token;
- a provider may supply a stable `context.workflow_step` label when it wants a more useful semantic step name;
- SENSITIVE / RESTRICTED events lower the automation-feasibility estimate even when the user has explicitly allowed those events to be stored.

Each sequence stores:

- step signature;
- execution count;
- observed and weekly-normalized time;
- annualized-time extrapolation;
- automation-feasibility heuristic;
- confidence;
- event evidence;
- non-overlapping occurrences;
- assumptions.

Annualized time is an extrapolation of the measured rate, not a forecast.

## Friction signals

The engine currently creates four types of structured friction evidence.

### Context switching

Counts cross-application transitions occurring within five minutes and short `A → B → A` bounce-backs occurring within ten minutes.

The signal is emitted only after a minimum amount of evidence. It explicitly keeps alternatives such as:

- multi-app work may be necessary;
- transitions may represent parallel tasks rather than interruption.

A leverage candidate therefore proposes a bounded batching experiment, not the conclusion that switching is harmful. It also asks for a task-output/completion metric before claiming improvement.

### Retry loops

Three or more matching app/action/target events within fifteen minutes form a retry-loop **signal**.

This is not proof that an operation failed. Repeated actions may be intentional iteration, verification or work on a target whose state changed even if the available metadata did not.

The recommended next step is to inspect the cause and consider validation/templates/workflow guards before automating around the loop.

### Repeated information retrieval

Three or more matching search/query/filter events can indicate repeated retrieval of the same recorded subject.

Providers may supply `context.query_hash` so MobileLAM can match a subject without exposing raw query text in the friction statement. The resulting suggestion is deliberately small and reversible: test a saved view, bookmark, cached reference or scheduled retrieval before building a larger automation.

### Repeated sequences

A sufficiently frequent multi-step sequence is also exposed as friction evidence so it can become an explicit bottleneck and leverage candidate.

The engine may suggest:

- automation;
- workflow compression;
- batching;
- a template or shortcut;
- keeping judgment-sensitive steps manual.

It does not silently choose among these alternatives.

## Variables and bottlenecks

Sequence/friction records are converted into normal MobileLAM variables and observations, for example:

```text
sequence.<id>.weekly_hours
sequence.<id>.executions
friction.context_switching.rapid_switches
friction.context_switching.bouncebacks
friction.<id>.repeated_attempts
friction.<id>.searches
```

They then participate in the same bottleneck, ranking, graph and traceability pipeline as the original MVP variables.

New bottleneck types include:

- `repeated_multi_step_work`
- `context_switching`
- `retry_loop`
- `repeated_retrieval`

Each bottleneck carries evidence, confidence, competing hypotheses and missing variables where appropriate.

## Recommendation authority

Friction-derived opportunities pass through normal MobileLAM ranking and feedback logic and are finally marked:

```json
{
  "action_authority": "user_required",
  "action_state": "recommendation_only"
}
```

No sequence detection or friction analysis invokes DeviceBridge SSH/device transport or executes an automation.

## Storage compatibility

`sequences` and `frictions` are separate structured collections in the local leverage store. Existing schema-v1 stores that predate these collections are normalized by adding empty arrays; existing events/goals/outcomes are retained.

Deleting leverage history deletes sequence and friction records together with the other behavioral analysis collections, subject to the same explicit confirmation requirement.

## Interpretation rule

Use friction signals as questions, not verdicts:

> “This sequence repeated four times. Is there a safe smaller workflow that removes repeated transitions?”

not:

> “You are wasting time because you switched apps.”

The useful result is the smallest evidence-backed, reversible change that can be measured against a user-defined outcome.
