#!/usr/bin/env python3
"""Prepare a hash-bound Gate-B test pack without accessing or mutating a device."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil

try:
    from .physical_test_evidence import new_record
    from .prepare_ui_upgrade import prepare as prepare_upgrade
except ImportError:
    from physical_test_evidence import new_record
    from prepare_ui_upgrade import prepare as prepare_upgrade

HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_sums(path: Path) -> dict[str, str]:
    entries: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        digest, sep, name = raw.partition("  ")
        if not sep or not HEX64.fullmatch(digest):
            raise ValueError(f"Malformed SHA256SUMS line in {path.name}")
        candidate = PurePosixPath(name)
        if candidate.is_absolute() or ".." in candidate.parts or not candidate.name:
            raise ValueError(f"Unsafe SHA256SUMS path: {name}")
        if candidate.name in entries:
            raise ValueError(f"Duplicate SHA256SUMS basename: {candidate.name}")
        entries[candidate.name] = digest
    if not entries:
        raise ValueError(f"Empty SHA256SUMS file: {path.name}")
    return entries


def verify_sums(sidecar: Path, files: tuple[Path, ...]) -> dict[str, str]:
    entries = parse_sums(sidecar)
    expected = {path.name for path in files}
    if set(entries) != expected:
        raise ValueError(
            f"{sidecar.name} entries {sorted(entries)} do not exactly match {sorted(expected)}"
        )
    for path in files:
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"Expected regular file: {path}")
        actual = sha256_file(path)
        if actual != entries[path.name]:
            raise ValueError(f"SHA-256 mismatch for {path.name}")
    return entries


def render_checklist(manifest: dict) -> str:
    return f"""# Gate-B owner physical-test handoff

This directory is **prepared, not deployed**. Repository automation has not installed,
activated, paired, granted, reloaded, or issued device input.

## Bound artifacts

- Repository commit: `{manifest['repository_commit']}`
- Source bundle SHA-256: `{manifest['source_bundle']['sha256']}`
- Candidate UI package SHA-256: `{manifest['candidate']['sha256']}`
- Candidate review SHA-256: `{manifest['candidate']['review_sha256']}`
- Owner upgrade installer SHA-256: `{manifest['upgrade']['installer_sha256']}`
- Upgrade: `{manifest['upgrade']['from_version']}` -> `{manifest['upgrade']['to_version']}`

## Owner-operated boundary

1. Review `owner-ui-upgrade-plan.json` and the exact hashes above.
2. Confirm the previous reviewed package required for rollback is available and matches
   the current-package hash in the plan.
3. Only after explicit approval, run `owner-ui-upgrade.py` from an independently
   authenticated root terminal with the exact candidate and previous `.deb` files.
4. Separately approve/perform the required UI activation or SpringBoard reload. The
   generated installer does not do this.
5. With the owner present, unlocked locally, and a fresh five-minute fixture grant,
   run `docs/SMOKE.md` Gate B. Never automate passcode/biometric entry and never
   replay an uncertain mutation.
6. Fill `gate-b-evidence.json`, then validate it with:

   `python3 scripts/physical_test_evidence.py --validate gate-b-evidence.json`

A Gate-B pass is valid only when every required step is recorded as `pass` with
non-empty evidence and the validator returns `verdict: pass`.
"""


def prepare(*, source_bundle: Path, source_sums: Path, candidate: Path,
            review: Path, candidate_sums: Path, current_preflight: Path,
            expected_current_version: str, expected_version: str,
            repository_commit: str, output_dir: Path) -> dict:
    if not HEX40.fullmatch(repository_commit):
        raise ValueError("repository_commit must be a 40-character lowercase git SHA")
    if output_dir.exists():
        raise FileExistsError(f"Output directory already exists: {output_dir}")

    source_entries = verify_sums(source_sums, (source_bundle,))
    candidate_entries = verify_sums(candidate_sums, (candidate, review))

    output_dir.mkdir(mode=0o700)
    try:
        installer = output_dir / "owner-ui-upgrade.py"
        plan = output_dir / "owner-ui-upgrade-plan.json"
        upgrade = prepare_upgrade(
            review_path=review,
            package_path=candidate,
            current_preflight_path=current_preflight,
            expected_current_version=expected_current_version,
            expected_version=expected_version,
            output=installer,
            plan_output=plan,
        )

        evidence = new_record()
        evidence["source"].update({
            "repository_commit": repository_commit,
            "source_bundle_sha256": source_entries[source_bundle.name],
            "candidate_deb_sha256": candidate_entries[candidate.name],
            "upgrade_installer_sha256": upgrade["installer_sha256"],
        })
        evidence_path = output_dir / "gate-b-evidence.json"
        evidence_path.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")

        manifest = {
            "state": "physical_test_prepared_not_deployed",
            "repository_commit": repository_commit,
            "source_bundle": {
                "file": source_bundle.name,
                "sha256": source_entries[source_bundle.name],
            },
            "candidate": {
                "file": candidate.name,
                "sha256": candidate_entries[candidate.name],
                "review_file": review.name,
                "review_sha256": candidate_entries[review.name],
            },
            "upgrade": upgrade,
            "gate_b_evidence_template": evidence_path.name,
            "safety_boundary": {
                "device_access": "not_performed",
                "installation": "not_performed",
                "activation_or_reload": "not_performed",
                "pairing_acceptance": "not_performed",
                "grant": "not_issued",
                "ui_input": "not_performed",
            },
        }
        manifest_path = output_dir / "physical-test-manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        (output_dir / "CHECKLIST.md").write_text(render_checklist(manifest), encoding="utf-8")
        return manifest
    except Exception:
        shutil.rmtree(output_dir)
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-bundle", required=True, type=Path)
    parser.add_argument("--source-sums", required=True, type=Path)
    parser.add_argument("--candidate", required=True, type=Path)
    parser.add_argument("--review", required=True, type=Path)
    parser.add_argument("--candidate-sums", required=True, type=Path)
    parser.add_argument("--current-preflight", required=True, type=Path)
    parser.add_argument("--expected-current-version", required=True)
    parser.add_argument("--expected-version", required=True)
    parser.add_argument("--repository-commit", required=True)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    result = prepare(
        source_bundle=args.source_bundle,
        source_sums=args.source_sums,
        candidate=args.candidate,
        review=args.review,
        candidate_sums=args.candidate_sums,
        current_preflight=args.current_preflight,
        expected_current_version=args.expected_current_version,
        expected_version=args.expected_version,
        repository_commit=args.repository_commit,
        output_dir=args.output_dir,
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"Physical-test preparation failed closed: {error}")
