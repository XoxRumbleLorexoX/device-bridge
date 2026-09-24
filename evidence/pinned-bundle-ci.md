# Pinned upstream bundle CI — 2026-09-23

This record covers host/source reproducibility only. It does not advance native
phone build, installation, activation, accessibility/input, or cross-network gates.

## Verification

PR #6 CI run `35856906069` extended the ordinary host test/check workflow with an
end-to-end source-bundle verification against the exact selected public upstream.
Before any fetch, CI asserted that its expected source URL and commit matched
`upstreams.json`:

- URL: `https://github.com/witchan/ios-mcp.git`
- commit: `38cafd5fbda7a4dcb3821b94cbb3523fc905c0b2`

CI initialized a fresh sibling `../ios-mcp` repository, fetched only that commit,
checked out the resulting detached HEAD, and verified the checked-out commit ID.
It then ran `scripts/prepare_device_bundle.py` twice into separate fresh outputs and
required the two `.tar.gz` files to be byte-identical with `cmp`.

The resulting archive was inspected for the required source manifest, candidate
version marker, compile-only and package-only scripts, offline package reviewer and
executor control file. Every archive member was required to have a safe relative
path, to be a regular file or directory only, and to have normalized timestamp and
uid/gid metadata.

## Result

Run `35856906069` completed successfully. `npm ci`, the full `npm test`,
`npm run check`, and `Verify pinned native source bundle end to end` all passed.
This closes the synthetic-only reproducibility gap: the deterministic bundler now
has executable CI evidence against the actual pinned ios-mcp commit.

It does **not** produce or verify an iPhone binary or `.deb`, access a phone, install
or activate anything, alter credentials/grants, or issue UI input. Gate B therefore
remains open at the owner-operated native build/deployment/hardware acceptance step.
