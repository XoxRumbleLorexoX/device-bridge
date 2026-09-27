# MobileLAM opt-in Git metadata provider

Date: 2026-09-28
PR: #15

## Purpose

This is the first real MobileLAM event provider. It is designed to supply low-content development metadata without turning leverage-analysis authority into authority to inspect arbitrary host files or source repositories.

## Consent / collection boundary

Collection requires an explicit local repository path and user-chosen safe label.

Supported surfaces:

- programmatic `GitMetadataProvider`;
- local CLI `bridge leverage collect-git --repo PATH --label SAFE_LABEL ...`.

There is deliberately **no Git/source-discovery MCP tool**. Regression coverage asserts that the leverage MCP tool list contains no Git/repository/filesystem source-discovery capability.

The provider does not scan the filesystem to find repositories.

### Pre-collection privacy gate

Real provider execution goes through `LeverageService.collectProvider()`.

Before `provider.collect()` is called, the service checks the current privacy policy and skips collection when:

- `observation_enabled` is false;
- the provider source ID is excluded;
- the provider's declared privacy class is not allowed.

Skipped results carry `collection_skipped: true` and a machine-readable reason. No provider source is touched in that path.

Tests prove the ordering with deliberately nonexistent repository paths. When observation is paused, `git-metadata` is source-excluded, or `PRIVATE` is disallowed, `service.collectProvider()` returns the skip result instead of failing on the nonexistent path. The CLI regression exercises the same behavior, proving `collect-git` also honors pause before repository access.

If preflight allows collection, returned events still pass through `LeverageService.ingest()` afterward. This second gate re-evaluates event-level privacy decisions, duplicate IDs, exclusions and retention before persistence.

## Emitted data

For non-merge commits in the requested window:

- repository label;
- commit timestamp;
- aggregate files-changed count;
- aggregate insertion count;
- aggregate deletion count;
- opaque hashed event reference.

Default privacy class: `PRIVATE`.

Each event marks the numeric change data as `change_volume_metadata_not_productivity`.

## Deliberately excluded data

- commit message;
- author name;
- author email;
- file name/path;
- source/file contents;
- diff;
- remote URL;
- branch name;
- terminal history;
- raw commit SHA in persisted event output.

## Executable evidence

`tests/git_provider.test.mjs` creates a real temporary Git repository containing deliberately sensitive fixture values in commit messages, filenames, author and email. Tests assert that those values do not appear in:

- collected canonical events;
- CLI output;
- persisted leverage events.

The provider manifest test verifies the explicit collection mode, declared privacy class and exclusions. Service/CLI tests verify that collection flows through the pre-collection policy gate and then the normal event-level persistence policy.

`tests/git_provider_mcp_boundary.test.mjs` verifies that Git repository collection is not an MCP capability.

PR #15 privacy-hardening head `b63a0aa9c409c7d20bde3ab910de24638059ee7a` passed CI run `36354609548`: full repository tests, `npm run check`, pinned native-source reproducibility verification and verified artifact upload. Documentation/governance synchronization after that head still requires a fresh exact-head CI pass before merge.

## DeviceBridge boundary

No SSH transport, helper, native UI adapter, grant, package, deployment or physical-test behavior changes in this milestone. DeviceBridge Gate B remains open and independent.
