import unittest

from scripts.physical_test_evidence import REQUIRED_STEPS, new_record, validate


class PhysicalTestEvidenceTests(unittest.TestCase):
    def valid_record(self):
        record = new_record()
        record["source"] = {
            "repository_commit": "a" * 40,
            "source_bundle_sha256": "b" * 64,
            "candidate_deb_sha256": "c" * 64,
            "upgrade_installer_sha256": "d" * 64,
        }
        record["device"] = {
            "model": "iPhone14,3",
            "ios_version": "16.2",
            "build": "20C65",
            "bootstrap": "rootless-test",
        }
        record["safety"]["owner_present"] = True
        for name in REQUIRED_STEPS:
            record["steps"][name] = {
                "outcome": "pass",
                "evidence": [f"recorded evidence for {name}"],
                "limitations": [],
            }
        return record

    def test_all_required_evidence_can_reach_pass(self):
        result = validate(self.valid_record())
        self.assertEqual(result["verdict"], "pass")
        self.assertEqual(result["validation_errors"], [])

    def test_pass_without_evidence_is_invalid(self):
        record = self.valid_record()
        record["steps"]["target_tap"]["evidence"] = []
        result = validate(record)
        self.assertEqual(result["verdict"], "invalid")
        self.assertTrue(any("target_tap" in error for error in result["validation_errors"]))

    def test_blocked_step_stays_blocked_not_pass(self):
        record = self.valid_record()
        record["steps"]["unicode_input"] = {
            "outcome": "blocked",
            "evidence": [],
            "limitations": ["keyboard unavailable"],
        }
        result = validate(record)
        self.assertEqual(result["verdict"], "blocked")

    def test_uncertain_mutation_replay_is_invalid(self):
        record = self.valid_record()
        record["safety"]["uncertain_mutation_replayed"] = True
        result = validate(record)
        self.assertEqual(result["verdict"], "invalid")
        self.assertTrue(any("uncertain mutations" in error for error in result["validation_errors"]))

    def test_template_is_never_a_pass(self):
        record = new_record()
        self.assertEqual(record["verdict"], "not_run")
        self.assertTrue(all(step["outcome"] == "not_run" for step in record["steps"].values()))


if __name__ == "__main__":
    unittest.main()
