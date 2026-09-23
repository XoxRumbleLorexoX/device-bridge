import hashlib
import io
import tarfile
import unittest

from scripts.review_ui_package import (
    EXPECTED_PAYLOAD,
    review_package_bytes,
)


VERSION = "0.1.1-test"
ARCH = "iphoneos-arm64"


def tar_bytes(files, *, symlink=None):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode="w:gz") as archive:
        for name, data in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o644
            info.mtime = 0
            archive.addfile(info, io.BytesIO(data))
        if symlink:
            name, target = symlink
            info = tarfile.TarInfo(name)
            info.type = tarfile.SYMTYPE
            info.linkname = target
            info.mode = 0o777
            info.mtime = 0
            archive.addfile(info)
    return out.getvalue()


def ar_member(name, data):
    fields = [
        (name + "/").encode().ljust(16),
        b"0".ljust(12),
        b"0".ljust(6),
        b"0".ljust(6),
        b"100644".ljust(8),
        str(len(data)).encode().ljust(10),
        b"`\n",
    ]
    result = b"".join(fields) + data
    if len(data) % 2:
        result += b"\n"
    return result


def package_bytes(*, control_extra=None, payload_extra=None, symlink=None,
                  package="dev.devicebridge.ui", version=VERSION, architecture=ARCH):
    control = (
        f"Package: {package}\n"
        f"Version: {version}\n"
        f"Architecture: {architecture}\n"
        "Description: Device Bridge test candidate\n"
    ).encode()
    control_files = {"./control": control}
    if control_extra:
        control_files.update(control_extra)
    payload = {
        "./var/jb/Library/MobileSubstrate/DynamicLibraries/DeviceBridgeUI.dylib": b"native-dylib",
        "./var/jb/Library/MobileSubstrate/DynamicLibraries/DeviceBridgeUI.plist": b"plist",
        "./var/jb/usr/share/doc/device-bridge/DEVICE_BRIDGE_LICENSE": b"bridge-license",
        "./var/jb/usr/share/doc/device-bridge/LICENSE": b"upstream-license",
        "./var/jb/usr/share/doc/device-bridge/NOTICE": b"upstream-notice",
        "./var/jb/usr/share/doc/device-bridge/THIRD_PARTY_NOTICES.md": b"third-party",
    }
    if payload_extra:
        payload.update(payload_extra)
    control_tar = tar_bytes(control_files)
    data_tar = tar_bytes(payload, symlink=symlink)
    return (
        b"!<arch>\n"
        + ar_member("debian-binary", b"2.0\n")
        + ar_member("control.tar.gz", control_tar)
        + ar_member("data.tar.gz", data_tar)
    )


class UIPackageReviewTests(unittest.TestCase):
    def test_valid_packaged_payload_generates_hash_manifest(self):
        blob = package_bytes()
        report = review_package_bytes(blob, expected_version=VERSION)
        self.assertEqual(report["review_state"], "package_structure_verified_not_installed")
        self.assertEqual(report["package_sha256"], hashlib.sha256(blob).hexdigest())
        self.assertEqual(set(report["payload"]), EXPECTED_PAYLOAD)
        self.assertEqual(report["architecture"], ARCH)
        self.assertEqual(report["maintainer_scripts"], [])
        self.assertTrue(any("No installation" in item for item in report["limitations"]))

    def test_rejects_maintainer_script(self):
        blob = package_bytes(control_extra={"./postinst": b"#!/bin/sh\nexit 0\n"})
        with self.assertRaisesRegex(ValueError, "Maintainer scripts"):
            review_package_bytes(blob, expected_version=VERSION)

    def test_rejects_extra_payload_file(self):
        blob = package_bytes(payload_extra={"./var/jb/etc/device-bridge-extra": b"no"})
        with self.assertRaisesRegex(ValueError, "Unexpected payload"):
            review_package_bytes(blob, expected_version=VERSION)

    def test_rejects_non_regular_payload_entry(self):
        blob = package_bytes(symlink=("./var/jb/tmp/link", "/var/mobile"))
        with self.assertRaisesRegex(ValueError, "Non-regular"):
            review_package_bytes(blob, expected_version=VERSION)

    def test_rejects_identity_version_and_architecture_mismatch(self):
        with self.assertRaisesRegex(ValueError, "package identifier"):
            review_package_bytes(package_bytes(package="evil.example"), expected_version=VERSION)
        with self.assertRaisesRegex(ValueError, "package version"):
            review_package_bytes(package_bytes(), expected_version="9.9")
        with self.assertRaisesRegex(ValueError, "package architecture"):
            review_package_bytes(package_bytes(architecture="all"), expected_version=VERSION)


if __name__ == "__main__":
    unittest.main()
