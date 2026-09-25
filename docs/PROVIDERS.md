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

`collectProvider()` validates the provider and canonicalizes returned events before they enter the normal privacy/store pipeline.

Real providers should also expose a human-readable `describe()` manifest containing at least:

- collection mode;
- whether processing is local;
- privacy classes emitted;
- fields/data exposed;
- nearby data explicitly not collected;
- important interpretation limitations.

Collection and storage are separate steps. Producing provider events does not itself persist them; `LeverageService.ingest()` still applies the current observation policy and retention rules.

## First real provider: minimized Git metadata

`GitMetadataProvider` is the first real provider included in the repository.

It is intentionally **not** an MCP collection tool. A local owner/operator must explicitly invoke it programmatically or through the CLI and must provide each repository path and a safe label.

Example:

```sh
node src/cli.mjs leverage collect-git \
  --repo /path/to/repository \
  --label project-a \
  --since 7d
```

The command uses the normal leverage store unless `--store PATH` is supplied.

### Data collected

For each non-merge commit inside the requested time window:

- user-supplied repository label;
- commit timestamp;
- aggregate number of files changed;
- aggregate insertion count;
- aggregate deletion count;
- opaque hashed event reference.

The default privacy class is `PRIVATE`.

Aggregate change counts are tagged:

```text
change_volume_metadata_not_productivity
```

They must not be interpreted as code quality, productivity, value delivered, difficulty, or developer performance.

### Data deliberately not collected

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

## Why no MCP collection tool?

MobileLAM analysis tools can inspect data the user has already chosen to store. They should not automatically turn that analytical authority into authority to discover new host filesystem data sources.

For that reason the current Git provider is exposed through:

- the local CLI;
- the programmatic provider API;

but not as `leverage_collect_git` in the MCP tool list.

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

Prefer metadata providers before content providers. For example, calendar event timing/categories may be useful without meeting notes; development activity may be useful without source code; communication latency may be useful without message contents.

High-sensitivity providers such as health, financial transactions or message contents require additional source-specific consent and minimization work and are not enabled by the Git milestone.
