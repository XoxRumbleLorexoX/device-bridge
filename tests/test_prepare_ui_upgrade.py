import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

from scripts.prepare_ui_upgrade import prepare
from scripts.review_ui_package import EXPECTED_PAYLOAD, review_package_bytes

CURRENT_VERSION = "0.1.0-2+debug"
NEW_VERSION = "0.1.1-test"
ARCH = "iphoneos-arm64"


def tar_bytes(files):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode="w:gz") as archive:
        for name, data in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o644
            info.mtime = 0
            archive.addfile(info, io.BytesIO(data))
    return out.getvalue()


def ar_member(name, data):
    header = b"".join([
        (name + "/").encode().ljust(16), b"0".ljust(12), b"0".ljust(6),
        b"0".ljust(6), b"100644".ljust(8), str(len(data)).encode().ljust(10), b"`\n",
    ])
    return header + data + (b"\n" if len(data) % 2 else b"")


def candidate_package(version=NEW_VERSION):
    control = (
        "Package: dev.devicebridge.ui\n"
        f"Version: {version}\n"
        f"Architecture: {ARCH}\n"
        "Description: candidate\n"
    ).encode()
    payload = {
        "./var/jb/Library/MobileSubstrate/DynamicLibraries/DeviceBridgeUI.dylib": b"new-dylib",
        "./var/jb/Library/MobileSubstrate/DynamicLibraries/DeviceBridgeUI.plist": b"new-plist",
        "./var/jb/usr/share/doc/device-bridge/DEVICE_BRIDGE_LICENSE": b"bridge-license",
        "./var/jb/usr/share/doc/device-bridge/LICENSE": b"upstream-license",
        "./var/jb/usr/share/doc/device-bridge/NOTICE": b"upstream-notice",
        "./var/jb/usr/share/doc/device-bridge/THIRD_PARTY_NOTICES.md": b"third-party",
    }
    return (
        b"!<arch>\n"
        + ar_member("debian-binary", b"2.0\n")
        + ar_member("control.tar.gz", tar_bytes({"./control": control}))
        + ar_member("data.tar.gz", tar_bytes(payload))
    )


def current_preflight(version=CURRENT_VERSION, *, omit=None):
    files = []
    for index, path in enumerate(sorted(EXPECTED_PAYLOAD)):
        if path == omit:
            continue
        data = f"current-{index}".encode()
        files.append({
            "path": path,
            "mode": "0o644",
            "size": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        })
    return {
        "installed": False,
        "packages": [{
            "file": "executor/packages/current.deb",
            "sha256": "a" * 64,
            "size": 12345,
            "files": files,
            "maintainer_scripts": [],
            "control": (
                "Package: dev.devicebridge.ui\n"
                f"Architecture: {ARCH}\n"
                f"Version: {version}\n"
            ),
        }],
    }


class PrepareUIUpgradeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.package = self.root / "candidate.deb"
        self.package.write_bytes(candidate_package())
        review = review_package_bytes(self.package.read_bytes(), expected_version=NEW_VERSION)
        self.review = self.root / "review.json"
        self.review.write_text(json.dumps(review))
        self.preflight = self.root / "preflight.json"
        self.preflight.write_text(json.dumps(current_preflight()))

    def tearDown(self):
        self.tmp.cleanup()

    def call_prepare(self, **overrides):
        args = {
            "review_path": self.review,
            "package_path": self.package,
            "current_preflight_path": self.preflight,
            "expected_current_version": CURRENT_VERSION,
            "expected_version": NEW_VERSION,
            "output": self.root / "owner-upgrade.py",
            "plan_output": self.root / "plan.json",
        }
        args.update(overrides)
        return prepare(**args)

    def test_generates_hash_bound_nonexecuted_upgrade(self):
        result = self.call_prepare()
        self.assertEqual(result["state"], "generated_not_executed")
        self.assertEqual(result["from_version"], CURRENT_VERSION)
        self.assertEqual(result["to_version"], NEW_VERSION)
        source = (self.root / "owner-upgrade.py").read_text()
        compile(source, "owner-upgrade.py", "exec")
        self.assertIn(result["candidate_sha256"], source)
        self.assertIn("a" * 64, source)
        plan = json.loads((self.root / "plan.json").read_text())
        self.assertEqual(plan["review_state"], "owner_upgrade_plan_not_executed")
        self.assertTrue(plan["safety"]["previous_package_copy_required"])

    def test_rejects_tampered_review_or_candidate(self):
        review = json.loads(self.review.read_text())
        review["package_sha256"] = "0" * 64
        self.review.write_text(json.dumps(review))
        with self.assertRaisesRegex(ValueError, "no longer matches"):
            self.call_prepare()

    def test_rejects_incomplete_current_payload(self):
        missing = sorted(EXPECTED_PAYLOAD)[0]
        self.preflight.write_text(json.dumps(current_preflight(omit=missing)))
        with self.assertRaisesRegex(ValueError, "restricted UI file set"):
            self.call_prepare()

    def test_rejects_wrong_current_version(self):
        self.preflight.write_text(json.dumps(current_preflight(version="0.0.0")))
        with self.assertRaisesRegex(ValueError, "Current package version"):
            self.call_prepare()

    def test_refuses_same_version_and_existing_output(self):
        self.package.write_bytes(candidate_package(version=CURRENT_VERSION))
        review = review_package_bytes(self.package.read_bytes(), expected_version=CURRENT_VERSION)
        self.review.write_text(json.dumps(review))
        with self.assertRaisesRegex(ValueError, "must differ"):
            self.call_prepare(expected_version=CURRENT_VERSION)

        self.package.write_bytes(candidate_package())
        review = review_package_bytes(self.package.read_bytes(), expected_version=NEW_VERSION)
        self.review.write_text(json.dumps(review))
        output = self.root / "existing.py"
        output.write_text("preserve")
        with self.assertRaises(FileExistsError):
            self.call_prepare(output=output, plan_output=None)
        self.assertEqual(output.read_text(), "preserve")


if __name__ == "__main__":
    unittest.main()
