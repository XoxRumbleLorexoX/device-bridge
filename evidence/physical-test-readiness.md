# Physical-test readiness — 2026-09-24

This record covers host/source preparation only. It does not claim native candidate
build, deployment, activation, pairing acceptance, control grant, UI input, or a
Gate-B hardware pass.

## Added preparation controls

- `scripts/prepare_physical_test.py` binds one retained CI source archive, its
  SHA-256 sidecar, one native candidate `.deb`, its offline review and candidate
  sidecar, the explicit current-package preflight, the expected from/to versions,
  and one 40-character repository commit.
- Sidecars must describe exactly the supplied files by basename; extra/missing,
  duplicate, traversal, malformed, symlink/non-file, or hash-mismatched inputs stop
  preparation.
- Candidate bytes are re-reviewed through the existing package reviewer and then
  passed through the existing immutable upgrade generator. Returned JSON is not
  trusted by itself.
- Preparation uses a new output directory only. Any failure after directory creation
  removes the entire newly created output so a partial pack cannot be mistaken for
  an approved one.
- Successful preparation writes an exact upgrade installer/plan, a physical-test
  manifest, an initialized Gate-B evidence file and an artifact-specific checklist.
  Its state is `physical_test_prepared_not_deployed`.

## Added evidence controls

`scripts/physical_test_evidence.py` defines nine required Gate-B evidence categories
aligned to `docs/SMOKE.md`: environment inventory, auth/peer boundaries, session,
fixture launch/observe, target tap, Unicode input, stale/lock negative cases,
cancel/local STOP, and revocation/recovery.

A Gate-B `pass` requires:

- a full repository commit plus source/candidate/installer SHA-256 values;
- device model, iOS version/build and bootstrap identification;
- owner presence;
- every required category marked `pass` with non-empty evidence;
- no automated passcode/biometric entry; and
- no replay of an uncertain mutation.

Malformed/missing evidence produces `invalid`; an explicit failure produces `fail`;
a blocked category produces `blocked`; otherwise an unfinished record remains
`incomplete`. None of those states can become a pass through omitted fields.

## Regression coverage

New tests cover a complete pass record, pass-without-evidence rejection, blocked
classification, uncertain mutation replay rejection, untouched template state,
successful immutable pack generation, candidate tampering, extra sidecar entries,
existing-output preservation and malformed repository commit rejection.

PR #11 implementation-head CI run `35996086124` passed `npm test`, `npm run check`,
the pinned-upstream source-bundle verification, and verified artifact upload. After
PLAN/STATUS/evidence/README/readiness synchronization, PR run `35996944042` passed
the same complete workflow on head `84f87e23cf6d759b37f23b38641a5d4995721cb0`.
Exact merge-head CI remains authoritative; this static evidence record does not
substitute an earlier green run for checks on a later commit.

## Remaining physical boundary

The next unsupported-by-host-CI facts are real native candidate bytes and runtime
behavior. The owner still needs to build the candidate from the retained verified
source artifact, return the exact `.deb`/review/sidecar, generate the immutable test
pack, explicitly approve replacement/activation, and run the real-device Gate-B
sequence. Hardware evidence remains separate from this host/source pass.
