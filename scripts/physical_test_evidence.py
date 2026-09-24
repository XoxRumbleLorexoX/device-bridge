#!/usr/bin/env python3
"""Create and validate Gate-B physical-test evidence without touching a device."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re

SCHEMA_VERSION = 1
OUTCOMES = {"pass", "fail", "blocked", "not_run"}
REQUIRED_DEVICE_FIELDS = ("model", "ios_version", "build", "bootstrap")
REQUIRED_SOURCE_FIELDS = (
    "repository_commit",
    "source_bundle_sha256",
    "candidate_deb_sha256",
    "upgrade_installer_sha256",
)
REQUIRED_STEPS = (
    "environment_inventory",
    "auth_and_peer_boundaries",
    "session_open",
    "fixture_launch_and_observe",
    "target_tap",
    "unicode_input",
    "stale_and_lock_negative_cases",
    "cancel_and_local_stop",
    "revocation_and_recovery",
)
HEX64 = re.compile(r"^[0-9a-f]{64}$")
HEX40 = re.compile(r"^[0-9a-f]{40}$")


def new_record() -> dict:
    return {
        "schema_version": SCHEMA_VERSION,
        "gate": "B",
        "source": {field: None for field in REQUIRED_SOURCE_FIELDS},
        "device": {field: None for field in REQUIRED_DEVICE_FIELDS},
        "safety": {
            "owner_present": False,
            "passcode_or_biometric_automated": False,
            "uncertain_mutation_replayed": False,
        },
        "steps": {
            name: {"outcome": "not_run", "evidence": [], "limitations": []}
            for name in REQUIRED_STEPS
        },
        "verdict": "not_run",
    }


def _nonempty_string(value) -> bool:
    return isinstance(value, str) and bool(value.strip())


def validate(record: dict) -> dict:
    errors: list[str] = []
    if record.get("schema_version") != SCHEMA_VERSION:
        errors.append("unsupported schema_version")
    if record.get("gate") != "B":
        errors.append("gate must be B")

    source = record.get("source")
    if not isinstance(source, dict):
        errors.append("source must be an object")
        source = {}
    commit = source.get("repository_commit")
    if not (isinstance(commit, str) and HEX40.fullmatch(commit)):
        errors.append("source.repository_commit must be a 40-character lowercase git SHA")
    for field in REQUIRED_SOURCE_FIELDS[1:]:
        value = source.get(field)
        if not (isinstance(value, str) and HEX64.fullmatch(value)):
            errors.append(f"source.{field} must be a lowercase SHA-256")

    device = record.get("device")
    if not isinstance(device, dict):
        errors.append("device must be an object")
        device = {}
    for field in REQUIRED_DEVICE_FIELDS:
        if not _nonempty_string(device.get(field)):
            errors.append(f"device.{field} is required")

    safety = record.get("safety")
    if not isinstance(safety, dict):
        errors.append("safety must be an object")
        safety = {}
    if safety.get("owner_present") is not True:
        errors.append("safety.owner_present must be true for a Gate-B pass")
    if safety.get("passcode_or_biometric_automated") is not False:
        errors.append("passcode/biometric automation is not permitted")
    if safety.get("uncertain_mutation_replayed") is not False:
        errors.append("uncertain mutations must not be replayed")

    steps = record.get("steps")
    if not isinstance(steps, dict):
        errors.append("steps must be an object")
        steps = {}

    outcomes: list[str] = []
    for name in REQUIRED_STEPS:
        step = steps.get(name)
        if not isinstance(step, dict):
            errors.append(f"steps.{name} is missing")
            outcomes.append("not_run")
            continue
        outcome = step.get("outcome")
        if outcome not in OUTCOMES:
            errors.append(f"steps.{name}.outcome is invalid")
            outcomes.append("not_run")
            continue
        outcomes.append(outcome)
        evidence = step.get("evidence")
        limitations = step.get("limitations")
        if not isinstance(evidence, list) or any(not _nonempty_string(item) for item in evidence):
            errors.append(f"steps.{name}.evidence must be a list of non-empty strings")
        if not isinstance(limitations, list) or any(not _nonempty_string(item) for item in limitations):
            errors.append(f"steps.{name}.limitations must be a list of non-empty strings")
        if outcome == "pass" and not evidence:
            errors.append(f"steps.{name} cannot pass without evidence")

    if errors:
        verdict = "invalid"
    elif "fail" in outcomes:
        verdict = "fail"
    elif "blocked" in outcomes:
        verdict = "blocked"
    elif all(outcome == "pass" for outcome in outcomes):
        verdict = "pass"
    else:
        verdict = "incomplete"

    normalized = dict(record)
    normalized["verdict"] = verdict
    normalized["validation_errors"] = errors
    return normalized


def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--init", action="store_true")
    group.add_argument("--validate", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    if args.init:
        record = new_record()
    else:
        record = json.loads(args.validate.read_text(encoding="utf-8"))
        record = validate(record)

    text = json.dumps(record, indent=2, sort_keys=True) + "\n"
    if args.output:
        with args.output.open("x", encoding="utf-8") as stream:
            stream.write(text)
    else:
        print(text, end="")

    if record.get("verdict") == "invalid":
        raise SystemExit(2)


if __name__ == "__main__":
    try:
        main()
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise SystemExit(f"Gate-B evidence handling failed closed: {error}")
