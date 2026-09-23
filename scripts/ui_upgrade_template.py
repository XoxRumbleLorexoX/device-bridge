#!/usr/bin/env python3
"""Generated owner-run Device Bridge UI upgrade. REVIEW_PLAN is injected by generator."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile

REVIEW_PLAN = {}
DPKG = "/var/jb/usr/bin/dpkg"
DPKG_QUERY = "/var/jb/usr/bin/dpkg-query"
SAFE_ENV = {
    "PATH": "/var/jb/usr/bin:/var/jb/usr/sbin:/usr/bin:/bin:/usr/sbin:/sbin",
    "HOME": "/var/root",
    "LANG": "C",
}
ALLOWED_STATUS = {"install ok installed", "install ok triggers-awaited"}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_bound_file(path: Path, expected_hash: str, expected_size: int) -> bytes:
    fd = os.open(str(path), os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size != expected_size:
            raise RuntimeError(f"Unexpected file type or size: {path}")
        data = stream.read()
    if sha256(data) != expected_hash:
        raise RuntimeError(f"Hash mismatch: {path}")
    return data


def query_package() -> tuple[str, str]:
    result = subprocess.run(
        [DPKG_QUERY, "-W", "-f=${Version}\t${Status}", REVIEW_PLAN["package"]],
        capture_output=True,
        text=True,
        timeout=10,
        env=SAFE_ENV,
        stdin=subprocess.DEVNULL,
    )
    if result.returncode != 0:
        raise RuntimeError("Expected current UI package is not queryable; nothing changed.")
    version, sep, status = result.stdout.strip().partition("\t")
    if not sep:
        raise RuntimeError("Unexpected dpkg-query response; nothing changed.")
    return version, status


def verify_installed_files(files: dict[str, dict], *, label: str) -> None:
    for relative, expected in files.items():
        path = Path("/") / relative
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError(f"{label} file ownership/type/mode mismatch: {path}")
        if info.st_size != expected["size"] or sha256(path.read_bytes()) != expected["sha256"]:
            raise RuntimeError(f"{label} file hash/size mismatch: {path}")


def run(args, timeout=90):
    return subprocess.run(
        args,
        check=True,
        timeout=timeout,
        env=SAFE_ENV,
        stdin=subprocess.DEVNULL,
    )


def stage_file(directory: Path, name: str, data: bytes) -> Path:
    destination = directory / name
    fd = os.open(str(destination), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    return destination


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", required=True, type=Path)
    parser.add_argument("--previous-package", required=True, type=Path)
    args = parser.parse_args()

    if os.geteuid() != 0:
        raise SystemExit("Run only in the owner's root terminal. This script accepts no password.")
    if REVIEW_PLAN.get("review_state") != "owner_upgrade_plan_not_executed":
        raise RuntimeError("Generated review plan is missing or invalid.")

    current = REVIEW_PLAN["current"]
    candidate = REVIEW_PLAN["candidate"]
    version, status = query_package()
    if version != current["version"] or status not in ALLOWED_STATUS:
        raise RuntimeError(f"Unexpected current package state: version={version!r} status={status!r}")
    verify_installed_files(current["payload"], label="Current")

    previous_bytes = read_bound_file(
        args.previous_package, current["package_sha256"], current["package_size"]
    )
    candidate_bytes = read_bound_file(
        args.candidate, candidate["package_sha256"], candidate["package_size"]
    )

    stage = Path(tempfile.mkdtemp(prefix="device-bridge-ui-upgrade-", dir="/var/root"))
    previous_copy = stage_file(stage, "previous.deb", previous_bytes)
    candidate_copy = stage_file(stage, "candidate.deb", candidate_bytes)
    journal = stage / "outcome.json"

    def record(state: str) -> None:
        journal.write_text(json.dumps({
            "state": state,
            "package": REVIEW_PLAN["package"],
            "from_version": current["version"],
            "to_version": candidate["version"],
            "previous_sha256": current["package_sha256"],
            "candidate_sha256": candidate["package_sha256"],
            "previous_copy": str(previous_copy),
            "candidate_copy": str(candidate_copy),
            "reload": "not_performed",
            "grant": "not_issued",
        }, sort_keys=True) + "\n")
        journal.chmod(0o600)

    record("staged_and_current_state_verified")
    run([DPKG, "--no-act", "--no-triggers", "--install", str(candidate_copy)])
    record("upgrade_started_outcome_not_yet_verified")
    run([DPKG, "--no-triggers", "--install", str(candidate_copy)])

    verify_installed_files(candidate["payload"], label="Candidate")
    installed_version, installed_status = query_package()
    if installed_version != candidate["version"] or installed_status not in ALLOWED_STATUS:
        raise RuntimeError(
            f"Installed package state mismatch: version={installed_version!r} status={installed_status!r}"
        )
    record("candidate_files_verified_no_reload")
    print("UI package files verified. No SpringBoard reload, respring, grant or input performed.")
    print("Protected previous package retained at:", previous_copy)


if __name__ == "__main__":
    try:
        main()
    except (KeyError, OSError, RuntimeError, subprocess.SubprocessError) as error:
        print("Stopped:", error)
        print("Preserve any protected staging directory and outcome journal; do not retry blindly.")
        raise SystemExit(1)
