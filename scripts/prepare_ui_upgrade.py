#!/usr/bin/env python3
"""Generate a one-artifact, owner-run UI upgrade from reviewed package evidence.

Generation performs no device access or installation. The generated script is bound
to both the exact currently installed package evidence and the exact candidate .deb.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

try:
    from .review_ui_package import (
        DEFAULT_ARCHITECTURE,
        EXPECTED_PAYLOAD,
        PACKAGE,
        review_package_bytes,
    )
except ImportError:  # Direct script execution keeps scripts/ on sys.path.
    from review_ui_package import (
        DEFAULT_ARCHITECTURE,
        EXPECTED_PAYLOAD,
        PACKAGE,
        review_package_bytes,
    )

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "scripts" / "ui_upgrade_template.py"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_control(text: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in text.splitlines():
        if not line or line[:1].isspace():
            continue
        key, sep, value = line.partition(":")
        if not sep or not key or key in fields:
            raise ValueError("Malformed or duplicate current-package control field.")
        fields[key] = value.strip()
    return fields


def current_package_from_preflight(preflight: dict, expected_version: str) -> dict:
    matches = []
    for entry in preflight.get("packages", []):
        control = parse_control(entry.get("control", ""))
        if control.get("Package") == PACKAGE:
            matches.append((entry, control))
    if len(matches) != 1:
        raise ValueError("Current preflight must contain exactly one Device Bridge UI package.")
    entry, control = matches[0]
    if control.get("Version") != expected_version:
        raise ValueError("Current package version does not match the explicit expected version.")
    if control.get("Architecture") != DEFAULT_ARCHITECTURE:
        raise ValueError("Current package architecture is not the reviewed architecture.")
    if entry.get("maintainer_scripts") != []:
        raise ValueError("Current package evidence contains maintainer scripts.")
    files = entry.get("files")
    if not isinstance(files, list):
        raise ValueError("Current package file evidence is missing.")
    payload = {}
    for item in files:
        path = item.get("path")
        if not isinstance(path, str) or path in payload:
            raise ValueError("Malformed or duplicate current payload path.")
        digest = item.get("sha256")
        size = item.get("size")
        if not isinstance(digest, str) or len(digest) != 64 or not isinstance(size, int) or size < 0:
            raise ValueError("Malformed current payload hash/size evidence.")
        payload[path] = {"sha256": digest, "size": size}
    if set(payload) != EXPECTED_PAYLOAD:
        raise ValueError("Current package payload does not match the restricted UI file set.")
    package_hash = entry.get("sha256")
    package_size = entry.get("size")
    if not isinstance(package_hash, str) or len(package_hash) != 64:
        raise ValueError("Current package SHA-256 evidence is invalid.")
    if not isinstance(package_size, int) or package_size <= 0:
        raise ValueError("Current package size evidence is invalid.")
    return {
        "version": expected_version,
        "architecture": DEFAULT_ARCHITECTURE,
        "package_sha256": package_hash,
        "package_size": package_size,
        "payload": dict(sorted(payload.items())),
    }


def validate_candidate(review: dict, package_bytes: bytes, expected_version: str) -> dict:
    if review.get("review_state") != "package_structure_verified_not_installed":
        raise ValueError("Candidate review state is not a completed offline package review.")
    if review.get("package") != PACKAGE or review.get("version") != expected_version:
        raise ValueError("Candidate review identity/version mismatch.")
    if review.get("architecture") != DEFAULT_ARCHITECTURE:
        raise ValueError("Candidate review architecture mismatch.")
    if review.get("maintainer_scripts") != []:
        raise ValueError("Candidate review unexpectedly contains maintainer scripts.")

    fresh = review_package_bytes(
        package_bytes,
        expected_version=expected_version,
        expected_architecture=DEFAULT_ARCHITECTURE,
    )
    security_keys = (
        "review_state", "package", "version", "architecture",
        "package_sha256", "package_size", "maintainer_scripts", "payload",
    )
    if any(review.get(key) != fresh.get(key) for key in security_keys):
        raise ValueError("Candidate package no longer matches its review evidence.")
    return {key: fresh[key] for key in (
        "version", "architecture", "package_sha256", "package_size", "payload"
    )}


def prepare(*, review_path: Path, package_path: Path, current_preflight_path: Path,
            expected_current_version: str, expected_version: str, output: Path,
            plan_output: Path | None = None) -> dict:
    review = json.loads(review_path.read_text())
    candidate_bytes = package_path.read_bytes()
    candidate = validate_candidate(review, candidate_bytes, expected_version)
    current_preflight = json.loads(current_preflight_path.read_text())
    current = current_package_from_preflight(current_preflight, expected_current_version)
    if current["version"] == candidate["version"]:
        raise ValueError("Upgrade version must differ from the current version.")

    plan = {
        "review_state": "owner_upgrade_plan_not_executed",
        "package": PACKAGE,
        "current": current,
        "candidate": candidate,
        "safety": {
            "reload": "not_performed",
            "grant": "not_issued",
            "requires_owner_root_terminal": True,
            "previous_package_copy_required": True,
        },
    }

    template = TEMPLATE.read_text()
    marker = "REVIEW_PLAN = {}"
    if template.count(marker) != 1:
        raise ValueError("Upgrade template review marker changed; inspect before generation.")
    source = template.replace(marker, "REVIEW_PLAN = " + repr(plan))
    compile(source, str(output), "exec")
    with output.open("x") as stream:
        stream.write(source)
    output.chmod(0o600)

    if plan_output is not None:
        with plan_output.open("x") as stream:
            json.dump(plan, stream, indent=2, sort_keys=True)
            stream.write("\n")

    result = {
        "installer_sha256": sha256(output.read_bytes()),
        "candidate_sha256": candidate["package_sha256"],
        "current_sha256": current["package_sha256"],
        "from_version": current["version"],
        "to_version": candidate["version"],
        "state": "generated_not_executed",
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--review", required=True, type=Path)
    parser.add_argument("--package", required=True, type=Path)
    parser.add_argument("--current-preflight", required=True, type=Path)
    parser.add_argument("--expected-current-version", required=True)
    parser.add_argument("--expected-version", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--plan-output", type=Path)
    args = parser.parse_args()
    prepare(
        review_path=args.review,
        package_path=args.package,
        current_preflight_path=args.current_preflight,
        expected_current_version=args.expected_current_version,
        expected_version=args.expected_version,
        output=args.output,
        plan_output=args.plan_output,
    )


if __name__ == "__main__":
    try:
        main()
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"UI upgrade preparation failed closed: {error}")
