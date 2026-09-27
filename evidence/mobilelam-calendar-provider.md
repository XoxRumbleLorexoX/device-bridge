# MobileLAM opt-in calendar timing provider

Date: 2026-09-28
PR: #16

## Purpose

This milestone adds a second real MobileLAM provider for explicitly selected local `.ics` files. The provider is designed to expose schedule timing structure without persisting the calendar content that gives those blocks their human meaning.

## Collection authority

Supported collection surfaces:

- programmatic `CalendarMetadataProvider`;
- local CLI `bridge leverage collect-calendar --file PATH.ics --label SAFE_LABEL ...`.

There is deliberately no calendar/source-discovery MCP tool. The provider does not search the filesystem, calendar accounts, cloud services, or device APIs. The caller supplies the exact file path and a safe user-chosen label.

## Pre-collection privacy gate

`CalendarMetadataProvider.describe()` declares:

- source: `calendar-metadata`;
- privacy class: `PRIVATE` by default;
- synthetic application: `calendar`.

`LeverageService.collectProvider()` checks the current policy before opening the file. Collection is skipped when:

- observation is paused;
- source `calendar-metadata` is excluded;
- the declared privacy class is not allowed;
- application `calendar` is excluded.

Regression tests use a nonexistent `.ics` path for each case. Successful `collection_skipped` results prove the gate runs before source access. Returned events still pass through the normal event-level privacy, exclusion, duplicate and retention checks before persistence.

The same shared preflight now accepts provider-declared applications generally; `GitMetadataProvider` declares application `git` as well.

## Emitted data

For supported non-cancelled `VEVENT` instances in the requested window, the provider emits:

- user-supplied calendar label;
- start timestamp;
- represented duration;
- all-day flag;
- busy/free flag derived from `TRANSP`;
- timing-basis marker;
- opaque hashed event reference.

The provider supplies activity hints `Schedule / Calendar Block`, allowing the existing activity/variable pipeline to derive schedule-time observations without adding a special calendar reasoning path.

Events are tagged `calendar_timing_metadata_not_importance_or_productivity`.

## Deliberately excluded data

The provider does not emit:

- `SUMMARY` / event title;
- description or notes;
- location;
- attendees;
- organizer;
- conference URL;
- alarm content;
- attachments;
- raw `UID`.

A raw UID may be used transiently when deriving an opaque SHA-256-based event reference. The raw value does not enter the canonical event or CLI output.

## Time-semantics boundary

The first implementation intentionally supports only unambiguous representations:

- UTC timed values ending in `Z`;
- all-day `DATE` values.

It rejects:

- floating/local timed values;
- `TZID` timed values requiring timezone-database interpretation;
- `RRULE` recurrence definitions requiring expansion.

The caller can export materialized recurrence instances for collection. This avoids silently under-counting a recurrence as one event or expanding it incorrectly without timezone/exclusion semantics.

All-day dates use a canonical UTC-midnight placeholder with `time_basis: date_only_placeholder_utc_midnight`. They are not evidence that the event occurred at midnight and must not be used as hour-of-day observations.

## Source hardening

The provider:

- accepts 1–16 explicitly configured files;
- uses safe user-chosen labels;
- opens the configured source as a regular file;
- uses `O_NOFOLLOW` where supported and refuses symlink sources in Linux CI;
- caps each source at 4 MiB;
- caps emitted events;
- fails the configured calendar rather than broadening discovery when parsing/access fails.

## Executable evidence

`tests/calendar_provider.test.mjs` uses a real temporary `.ics` file seeded with deliberately sensitive values in:

- summaries;
- descriptions;
- location;
- attendee name/email;
- organizer email;
- meeting URL;
- alarm text;
- UIDs.

Tests assert that those values do not appear in:

- collected canonical events;
- CLI output;
- persisted leverage history.

The suite also verifies:

- exact UTC duration extraction;
- all-day date handling and explicit placeholder semantics;
- cancelled event suppression;
- busy/free metadata;
- `Schedule / Calendar Block` activity and variable integration;
- failure for TZID/floating/RRULE semantics without content disclosure;
- symlink refusal on Linux;
- pre-source pause/source/privacy/application exclusions;
- local CLI collection;
- absence of provider source-collection tools from MCP.

PR #16 implementation head `e6198846ccbe507e015670878e7afe009d5fb894` passed CI run `36355508190`: full repository tests, `npm run check`, pinned native-source reproducibility verification and verified artifact upload. Documentation/governance commits after that head still require an exact final-head CI pass before merge.

## DeviceBridge boundary

No SSH transport, helper, native UI adapter, grant, package, deployment or physical-test behavior changes in this milestone. DeviceBridge Gate B remains open and independent.
