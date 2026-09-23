# Deterministic native candidate bundle — 2026-09-23

This record covers source/bundle/package-review preparation only. It does not claim
a native phone build, package installation, UI activation, accessibility success,
input success, or cross-network acceptance.

## Candidate identity

The restricted UI candidate is versioned `0.1.1` in `device/control`, architecture
`iphoneos-arm64`. The version differs from the historically installed
`0.1.0-2+debug` package so the hash-bound replacement generator cannot accept a
same-version transition.

## Deterministic source bundle

`scripts/prepare_device_bundle.py` still begins with `prepare_executor.py`, which
verifies the selected ios-mcp checkout is at the pinned commit and that every reused
working-tree byte matches that commit. The bundle now also includes:

- `SHA256SUMS` covering every source/tool file in the extracted bundle;
- `CANDIDATE_VERSION` derived from the reviewed `device/control`;
- compile-only `build-check.sh`;
- package-only `package-candidate.sh`; and
- the stdlib-only offline `tools/review_ui_package.py`.

Tar/gzip timestamps, uid/gid, user/group names and file modes are normalized and
gzip timestamp metadata is fixed. Output creation is exclusive. Given identical
prepared source bytes, the generated archive bytes and SHA-256 are deterministic.
Symlinks and non-regular source entries are rejected.

## Owner package-only build/review

`package-candidate.sh` must run as the non-root mobile user in a fresh extracted
bundle with a verified Theos directory. Before compiling it verifies every
`SHA256SUMS` entry, the candidate marker, and executor control version/architecture.
It refuses pre-existing package or review output.

The build command is limited to `make -C executor clean package` with the reviewed
rootless target and `FINALPACKAGE=1`. It neither invokes `make install` nor a package
manager. After build it requires exactly one regular, non-symlink `.deb`, runs the
bundled offline reviewer for version `0.1.1` / `iphoneos-arm64`, and writes
`candidate-review.json` plus `CANDIDATE_SHA256SUMS` for the `.deb` and review JSON.
No installation, reload/respring, grant, fixture launch, or UI input is performed.

## Regression coverage

`tests/test_device_candidate_bundle.py` verifies normalized archives are byte-identical
across different parent directories and source mtimes, checks normalized tar metadata,
checks the source manifest, rejects symlinks, binds the candidate version to `0.1.1`,
and checks the package script contains the package/reviewer flow without install,
package-manager, SSH or reload commands. `npm run check` also parses the bundle Python
and both device build shell scripts.

## Verification status

PR #5 implementation-head CI run `35855946445` passed `npm test` and `npm run check`.
Final-head CI is still required after documentation/status evidence updates. No
native `.deb` for `0.1.1` has been built on the phone by this GitHub-only work.
