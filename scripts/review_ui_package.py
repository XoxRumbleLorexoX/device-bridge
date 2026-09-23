#!/usr/bin/env python3
"""Review a Device Bridge UI .deb without installing or extracting it.

The reviewer is intentionally narrow: it accepts only the expected package identity,
architecture and two-file payload, rejects maintainer scripts and non-regular payload
entries, and emits hashes for owner review. Passing this check is source/package
evidence only; it is not installation or hardware acceptance evidence.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import tarfile

PACKAGE = "dev.devicebridge.ui"
DEFAULT_ARCHITECTURE = "iphoneos-arm"
EXPECTED_PAYLOAD = {
    "var/jb/Library/MobileSubstrate/DynamicLibraries/DeviceBridgeUI.dylib",
    "var/jb/Library/MobileSubstrate/DynamicLibraries/DeviceBridgeUI.plist",
}
ALLOWED_CONTROL_FILES = {"control", "md5sums"}
FORBIDDEN_MAINTAINER_FILES = {
    "preinst", "postinst", "prerm", "postrm", "config", "triggers",
}


@dataclass(frozen=True)
class ArMember:
    name: str
    data: bytes


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _parse_ar(blob: bytes) -> dict[str, bytes]:
    if not blob.startswith(b"!<arch>\n"):
        raise ValueError("Not a Debian ar archive.")
    offset = 8
    members: dict[str, bytes] = {}
    while offset < len(blob):
        if len(blob) - offset < 60:
            raise ValueError("Truncated ar header.")
        header = blob[offset:offset + 60]
        offset += 60
        if header[58:60] != b"`\n":
            raise ValueError("Invalid ar member header.")
        raw_name = header[:16].decode("ascii", "strict").strip()
        if raw_name.startswith("#1/") or raw_name in {"/", "//"}:
            raise ValueError("Extended ar member names are not accepted.")
        name = raw_name[:-1] if raw_name.endswith("/") else raw_name
        try:
            size = int(header[48:58].decode("ascii", "strict").strip())
        except ValueError as error:
            raise ValueError("Invalid ar member size.") from error
        if size < 0 or offset + size > len(blob):
            raise ValueError("Truncated ar member.")
        if name in members:
            raise ValueError(f"Duplicate ar member: {name}")
        members[name] = blob[offset:offset + size]
        offset += size
        if offset % 2:
            offset += 1
    return members


def _clean_tar_name(name: str) -> str:
    while name.startswith("./"):
        name = name[2:]
    path = PurePosixPath(name)
    if not name or path.is_absolute() or ".." in path.parts:
        raise ValueError(f"Unsafe archive path: {name!r}")
    return str(path)


def _tar_regular_files(payload: bytes, *, control: bool) -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    try:
        archive = tarfile.open(fileobj=io.BytesIO(payload), mode="r:*")
    except tarfile.TarError as error:
        raise ValueError("Unsupported or invalid tar member compression.") from error
    with archive:
        for member in archive.getmembers():
            name = _clean_tar_name(member.name)
            if member.isdir():
                continue
            if not member.isfile():
                raise ValueError(f"Non-regular archive entry rejected: {name}")
            if name in files:
                raise ValueError(f"Duplicate archive entry: {name}")
            stream = archive.extractfile(member)
            if stream is None:
                raise ValueError(f"Could not read archive entry: {name}")
            files[name] = stream.read()
    if control:
        forbidden = sorted(FORBIDDEN_MAINTAINER_FILES.intersection(files))
        if forbidden:
            raise ValueError(f"Maintainer scripts/triggers are forbidden: {', '.join(forbidden)}")
        unexpected = sorted(set(files) - ALLOWED_CONTROL_FILES)
        if unexpected:
            raise ValueError(f"Unexpected control file(s): {', '.join(unexpected)}")
        if "control" not in files:
            raise ValueError("Missing Debian control file.")
    return files


def _parse_control(raw: bytes) -> dict[str, str]:
    text = raw.decode("utf-8", "strict")
    fields: dict[str, str] = {}
    current: str | None = None
    for line in text.splitlines():
        if not line:
            continue
        if line[:1].isspace():
            if current is None:
                raise ValueError("Malformed control continuation line.")
            fields[current] += "\n" + line[1:]
            continue
        key, sep, value = line.partition(":")
        if not sep or not key or key in fields:
            raise ValueError("Malformed or duplicate control field.")
        current = key
        fields[key] = value.strip()
    return fields


def review_package_bytes(blob: bytes, *, expected_version: str,
                         expected_architecture: str = DEFAULT_ARCHITECTURE) -> dict:
    members = _parse_ar(blob)
    if members.get("debian-binary") != b"2.0\n":
        raise ValueError("Unsupported or missing debian-binary marker.")
    control_members = [name for name in members if name.startswith("control.tar")]
    data_members = [name for name in members if name.startswith("data.tar")]
    expected_members = {"debian-binary", *control_members, *data_members}
    if len(control_members) != 1 or len(data_members) != 1 or set(members) != expected_members:
        raise ValueError("Package must contain exactly debian-binary, one control archive and one data archive.")

    control_files = _tar_regular_files(members[control_members[0]], control=True)
    metadata = _parse_control(control_files["control"])
    if metadata.get("Package") != PACKAGE:
        raise ValueError("Unexpected package identifier.")
    if metadata.get("Version") != expected_version:
        raise ValueError("Unexpected package version.")
    if metadata.get("Architecture") != expected_architecture:
        raise ValueError("Unexpected package architecture.")

    payload_files = _tar_regular_files(members[data_members[0]], control=False)
    if set(payload_files) != EXPECTED_PAYLOAD:
        missing = sorted(EXPECTED_PAYLOAD - set(payload_files))
        extra = sorted(set(payload_files) - EXPECTED_PAYLOAD)
        raise ValueError(f"Unexpected payload; missing={missing}, extra={extra}")

    return {
        "review_state": "package_structure_verified_not_installed",
        "package": PACKAGE,
        "version": expected_version,
        "architecture": expected_architecture,
        "package_sha256": _sha256(blob),
        "package_size": len(blob),
        "maintainer_scripts": [],
        "payload": {
            name: {"sha256": _sha256(payload_files[name]), "size": len(payload_files[name])}
            for name in sorted(payload_files)
        },
        "limitations": [
            "No installation or device mutation performed.",
            "No code-signing, native runtime, accessibility, tap, text, or cross-network behavior verified.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("package", type=Path)
    parser.add_argument("--expected-version", required=True)
    parser.add_argument("--expected-architecture", default=DEFAULT_ARCHITECTURE)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    blob = args.package.read_bytes()
    report = review_package_bytes(
        blob,
        expected_version=args.expected_version,
        expected_architecture=args.expected_architecture,
    )
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(rendered)
        print(f"Reviewed {args.package}; wrote {args.output}. No installation performed.")
    else:
        print(rendered, end="")


if __name__ == "__main__":
    try:
        main()
    except (OSError, UnicodeError, ValueError, tarfile.TarError) as error:
        raise SystemExit(f"Package review failed closed: {error}")
