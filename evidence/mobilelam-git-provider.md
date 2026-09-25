# MobileLAM opt-in Git metadata provider

Date: 2026-09-25
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

The provider manifest test verifies the explicit collection mode and declared exclusions. The service-ingestion test verifies that collection and persistence remain separate operations.

`tests/git_provider_mcp_boundary.test.mjs` verifies that Git repository collection is not an MCP capability.

PR #15 implementation-head run `36149846153` passed the full repository tests/checks, pinned native-source reproducibility verification and artifact upload before the final MCP-boundary/documentation/governance commits. The exact final PR head still requires a fresh CI pass before merge.

## DeviceBridge boundary

No SSH transport, helper, native UI adapter, grant, package, deployment or physical-test behavior changes in this milestone. DeviceBridge Gate B remains open and independent.
