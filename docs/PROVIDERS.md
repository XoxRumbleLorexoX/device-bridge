# MobileLAM event providers

Providers are the opt-in boundary between real-world data sources and the canonical MobileLAM event model.

A provider should collect the minimum information required for a specific analytical purpose, declare what it exposes, and avoid silently acquiring adjacent data merely because the underlying system makes it available.

## Provider contract

The shared provider interface remains deliberately small:

```js
class EventProvider {
  id = 'stable-provider-id';
  async collect(context) { return []; }
}
```

`collectProvider()` validates the provider and canonicalizes returned events. Real collection through `LeverageService.collectProvider()` adds a privacy gate **before** the provider runs and then sends any returned events through the normal event-level privacy/store gate.

Real providers should also expose a human-readable `describe()` manifest containing at least:

- collection mode;
- whether processing is local;
- privacy classes emitted;
- synthetic applications emitted, where stable;
- fields/data exposed;
- nearby data explicitly not collected;
- important interpretation limitations.

### Two-stage privacy gate

Collection and storage are separate steps, but a paused/excluded provider should not be allowed to inspect its source just because later persistence would reject the result.

`LeverageService.collectProvider()` therefore checks the current policy before `provider.collect()` runs. Collection is skipped when:

- observation is paused;
- the provider source ID is excluded;
- none of the provider's declared privacy classes are currently allowed;
- every synthetic application declared by the provider is excluded.

The returned result is marked `collection_skipped` with a reason such as `observation_paused`, `source_excluded`, `privacy_class_not_allowed`, or `application_excluded`.

If the preflight passes, provider events are collected and then `LeverageService.ingest()` applies the full event-level policy again. That second gate covers event-specific application/domain/time exclusions, policy changes between preflight and persistence, duplicate rejection and retention.

Providers that may emit more than one privacy class or application must declare those sets accurately. A future provider with source-specific consent beyond the shared policy should fail closed inside its own collection contract as well.

## Git metadata provider

`GitMetadataProvider` is a real provider for low-content development metadata.

It is intentionally **not** an MCP collection tool. A local owner/operator must explicitly invoke it programmatically or through the CLI and must provide each repository path and a safe label.

Example:

```sh
node src/cli.mjs leverage collect-git \
  --repo /path/to/repository \
  --label project-a \
  --since 7d
```

The command uses the normal leverage store unless `--store PATH` is supplied.

### Git data collected

For each non-merge commit inside the requested time window:

- user-supplied repository label;
- commit timestamp;
- aggregate number of files changed;
- aggregate insertion count;
- aggregate deletion count;
- opaque hashed event reference.

The default privacy class is `PRIVATE`. The provider declares synthetic application `git` so an application exclusion can stop collection before repository access.

Aggregate change counts are tagged:

```text
change_volume_metadata_not_productivity
```

They must not be interpreted as code quality, productivity, value delivered, difficulty, or developer performance.

### Git data deliberately not collected

The provider does **not** emit:

- commit messages;
- author names;
- author email addresses;
- file names or paths;
- file contents;
- diffs;
- remote URLs;
- branch names;
- terminal history.

The provider executes `git log` only inside explicitly supplied repository directories. It does not search the filesystem for repositories.

Git prompts, pagers and optional locks are disabled for the collection subprocess. A missing/unreadable/non-directory repository or failed `git` command aborts that repository collection rather than falling back to broader discovery.

When observation is paused, `git-metadata` is source-excluded, its declared privacy class is disallowed, or application `git` is excluded, the service can skip collection before resolving the configured repository path or executing `git log`.

## Calendar timing provider

`CalendarMetadataProvider` is the second real provider. It reads only `.ics` files explicitly selected by the local owner/operator and emits schedule timing metadata without persisting calendar text.

Example:

```sh
node src/cli.mjs leverage collect-calendar \
  --file /path/to/export.ics \
  --label work-calendar \
  --since 30d
```

The provider is exposed through the local CLI and programmatic API, not as an MCP source-collection tool.

### Calendar data collected

For supported `VEVENT` instances inside the requested window:

- user-supplied calendar label;
- event start timestamp;
- event duration when represented unambiguously;
- all-day flag;
- busy/free flag from `TRANSP`;
- opaque hashed event reference.

Events are emitted as synthetic application `calendar`, activity category `Schedule`, subcategory `Calendar Block`, and default privacy class `PRIVATE`.

Timing metadata is tagged:

```text
calendar_timing_metadata_not_importance_or_productivity
```

It does not establish importance, productivity, intent, attendance, meeting quality, necessity, or whether the block actually occurred as scheduled.

### Calendar data deliberately not emitted

The provider does **not** emit:

- event title / `SUMMARY`;
- description or notes;
- location;
- attendees;
- organizer;
- conference URL;
- alarms;
- attachments;
- raw `UID`.

A raw UID may be used transiently as part of an opaque local hash, but the UID itself is not written to the canonical event.

### Calendar time semantics are deliberately narrow

The first implementation accepts only:

- UTC timed values ending in `Z`, such as `20260920T100000Z`;
- all-day `DATE` values such as `20260920`.

It fails closed for:

- floating/local timed values without an explicit UTC basis;
- `TZID` timed values that would require timezone-database interpretation;
- `RRULE` recurrence definitions that would require expansion.

For recurring calendars, export materialized instances before collection. This avoids silently counting a recurring definition as one event or expanding it with incomplete timezone/exception semantics.

All-day dates are represented by a UTC-midnight placeholder solely to fit the canonical event timestamp field and carry `time_basis: date_only_placeholder_utc_midnight`. They must not be interpreted as hour-of-day observations.

The provider opens the explicitly supplied file as a regular file, refuses symlink traversal where the host supports `O_NOFOLLOW`, bounds the file to 4 MiB, and does not search for calendar files.

When observation is paused, `calendar-metadata` is source-excluded, its declared privacy class is disallowed, or application `calendar` is excluded, collection is skipped before the `.ics` path is opened. Regression tests use nonexistent paths to prove that ordering.

## Why no MCP collection tools?

MobileLAM analysis tools can inspect data the user has already chosen to store. They should not automatically turn that analytical authority into authority to discover new host filesystem data sources.

For that reason current real providers are exposed through:

- the local CLI;
- the programmatic provider API;

but not as Git/calendar source-collection tools in MCP.

A future graphical provider setup flow can provide the same explicit source-selection step.

## Adding another provider

A new provider should answer these questions before implementation:

1. What exact analytical variable or activity does this source enable?
2. What is the minimum data needed to derive it?
3. Which adjacent fields must not be collected?
4. Which privacy class should events use by default?
5. Does collection require additional explicit consent?
6. Can identifiers be replaced with user-chosen labels or opaque references?
7. Can raw content remain transient rather than enter the event store?
8. How will tests prove excluded information is absent?
9. Which policy conditions must prevent the provider from touching its source at all?
10. Which time/identity semantics are ambiguous enough that the provider should fail closed instead of guessing?

Prefer metadata providers before content providers. Development activity can be useful without source code; scheduled-block timing can be useful without titles or meeting notes; communication latency may be useful without message contents.

High-sensitivity providers such as health, financial transactions or message contents require additional source-specific consent, minimization and threat-model work and are not enabled by the Git/calendar milestones.
