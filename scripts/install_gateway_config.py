#!/usr/bin/env python3
"""Install the root-protected host gateway configuration.

The source key and credential remain operator-owned; this script only copies
them into the fixed protected runtime directory. It never prints secrets and
refuses existing destination files rather than overwriting them.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import shutil
import stat
import tempfile


class InstallError(Exception):
    pass


def regular(path, uid, mode):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_mode & mode:
        raise InstallError(f"source file is not a protected regular file: {path}")


def protected_directory(path, uid, mode):
    if path.exists() or path.is_symlink():
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & mode:
            raise InstallError(f"destination directory is not protected: {path}")
    else:
        path.mkdir(mode=0o755)
        os.chown(path, uid, 0)
        os.chmod(path, 0o755)


def copy_new(source, destination, uid, gid, mode):
    if os.path.lexists(destination):
        raise InstallError(f"destination already exists; refusing overwrite: {destination}")
    temporary = destination.with_name(destination.name + "." + secrets.token_hex(8))
    try:
        shutil.copyfile(source, temporary)
        os.chown(temporary, uid, gid)
        os.chmod(temporary, mode)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--device-id", required=True)
    parser.add_argument("--host", required=True)
    parser.add_argument("--operator-uid", required=True, type=int)
    parser.add_argument("--source-key", type=Path, required=True)
    parser.add_argument("--source-credential", type=Path, required=True)
    parser.add_argument("--source-known-hosts", type=Path, required=True)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit("Run this reviewed installer with sudo; it does not change device policy.")
    if not (0 <= args.operator_uid <= 2**31 - 1):
        raise SystemExit("Invalid operator UID.")
    try:
        import uuid
        uuid.UUID(args.device_id)
        if not args.host or any(c in args.host for c in "\n\r\t/\\\""):
            raise InstallError("Invalid host.")
        regular(args.source_key, args.operator_uid, 0o077)
        regular(args.source_credential, args.operator_uid, 0o077)
        regular(args.source_known_hosts, os.stat(args.source_known_hosts).st_uid, 0o022)
        credential = args.source_credential.read_text()
        if len(credential) != 65 or not credential.endswith("\n") or any(c not in "0123456789abcdef\n" for c in credential):
            raise InstallError("Credential source has an invalid format.")
        root = Path("/etc/device-bridge")
        runtime = root / "runtime"
        protected_directory(root, 0, 0o022)
        protected_directory(runtime, 0, 0o022)
        destinations = [root / "known_hosts", runtime / "ssh_key", runtime / "device_credential", root / "gateway.json"]
        if any(os.path.lexists(path) for path in destinations):
            raise InstallError("A gateway destination already exists; preserve it and inspect before retrying.")
        copy_new(args.source_known_hosts, destinations[0], 0, 0, 0o644)
        copy_new(args.source_key, destinations[1], args.operator_uid, os.getgid(), 0o600)
        copy_new(args.source_credential, destinations[2], args.operator_uid, os.getgid(), 0o600)
        config = {
            "version": 1,
            "device_id": args.device_id,
            "principal": "operator",
            "operator_uid": args.operator_uid,
            "host": args.host,
            "port": 22,
            "user": "root",
            "known_hosts": str(destinations[0]),
            "identity_file": str(destinations[1]),
            "credential_file": str(destinations[2]),
            "fixture_app": "dev.devicebridge.fixture",
        }
        temporary = destinations[3].with_name(destinations[3].name + "." + secrets.token_hex(8))
        try:
            temporary.write_text(json.dumps(config, indent=2) + "\n")
            os.chown(temporary, 0, 0)
            os.chmod(temporary, 0o644)
            os.replace(temporary, destinations[3])
        finally:
            temporary.unlink(missing_ok=True)
    except (OSError, ValueError, InstallError) as error:
        raise SystemExit(str(error)) from None
    print(json.dumps({"status": "gateway_config_installed", "config": "/etc/device-bridge/gateway.json", "operator_uid": args.operator_uid}))


if __name__ == "__main__":
    main()
