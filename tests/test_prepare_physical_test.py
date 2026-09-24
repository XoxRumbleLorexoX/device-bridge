import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

from scripts.prepare_physical_test import prepare
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


def current_preflight():
    files = []
    for index, path in enumerate(sorted(EXPECTED_PAYLOAD)):
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
                f"Version: {CURRENT_VERSION}\n"
            ),
        }],
    }


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class PreparePhysicalTestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.source = self.root / "device-bridge-build.tar.gz"
        self.source.write_bytes(b"deterministic-source-bundle")
        self.source_sums = self.root / "SOURCE_SHA256SUMS"
        self.source_sums.write_text(f"{digest(self.source)}  {self.source.name}\n")

        self.candidate = self.root / "candidate.deb"
        self.candidate.write_bytes(candidate_package())
        review_data = review_package_bytes(self.candidate.read_bytes(), expected_version=NEW_VERSION)
        self.review = self.root / "candidate-review.json"
        self.review.write_text(json.dumps(review_data))
        self.candidate_sums = self.root / "CANDIDATE_SHA256SUMS"
        self.candidate_sums.write_text(
            f"{digest(self.candidate)}  {self.candidate.name}\n"
            f"{digest(self.review)}  {self.review.name}\n"
        )
        self.preflight = self.root / "preflight.json"
        self.preflight.write_text(json.dumps(current_preflight()))
        self.output = self.root / "physical-pack"

    def tearDown(self):
        self.tmp.cleanup()

    def call_prepare(self, **overrides):
        args = {
            "source_bundle": self.source,
            "source_sums": self.source_sums,
            "candidate": self.candidate,
            "review": self.review,
            "candidate_sums": self.candidate_sums,
            "current_preflight": self.preflight,
            "expected_current_version": CURRENT_VERSION,
            "expected_version": NEW_VERSION,
            "repository_commit": "b" * 40,
            "output_dir": self.output,
        }
        args.update(overrides)
        return prepare(**args)

    def test_generates_hash_bound_physical_test_pack(self):
        result = self.call_prepare()
        self.assertEqual(result["state"], "physical_test_prepared_not_deployed")
        self.assertEqual(result["candidate"]["sha256"], digest(self.candidate))
        self.assertTrue((self.output / "owner-ui-upgrade.py").is_file())
        self.assertTrue((self.output / "owner-ui-upgrade-plan.json").is_file())
        self.assertTrue((self.output / "gate-b-evidence.json").is_file())
        self.assertTrue((self.output / "physical-test-manifest.json").is_file())
        self.assertTrue((self.output / "CHECKLIST.md").is_file())
        compile((self.output / "owner-ui-upgrade.py").read_text(), "owner-ui-upgrade.py", "exec")
        evidence = json.loads((self.output / "gate-b-evidence.json").read_text())
        self.assertEqual(evidence["source"]["repository_commit"], "b" * 40)
        self.assertEqual(evidence["verdict"], "not_run")
        self.assertEqual(result["safety_boundary"]["installation"], "not_performed")

    def test_rejects_tampered_candidate_and_cleans_output(self):
        self.candidate.write_bytes(self.candidate.read_bytes() + b"tamper")
        with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
            self.call_prepare()
        self.assertFalse(self.output.exists())

    def test_rejects_extra_sidecar_entry(self):
        self.candidate_sums.write_text(
            self.candidate_sums.read_text() + ("f" * 64) + "  unrelated.txt\n"
        )
        with self.assertRaisesRegex(ValueError, "do not exactly match"):
            self.call_prepare()
        self.assertFalse(self.output.exists())

    def test_refuses_existing_output_directory(self):
        self.output.mkdir()
        marker = self.output / "preserve"
        marker.write_text("keep")
        with self.assertRaises(FileExistsError):
            self.call_prepare()
        self.assertEqual(marker.read_text(), "keep")

    def test_rejects_noncanonical_repository_commit(self):
        with self.assertRaisesRegex(ValueError, "repository_commit"):
            self.call_prepare(repository_commit="ABC")
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
