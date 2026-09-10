from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import lab


class LabContractTests(unittest.TestCase):
    def test_case_matrix_is_exactly_two_per_skill(self):
        cases = lab.load_cases()
        self.assertEqual(len(cases), 14)
        self.assertEqual(len({row["id"] for row in cases}), 14)
        self.assertFalse({row["skill"] for row in cases} & set(lab.RETIRED_SKILLS))
        for skill in lab.SKILLS:
            selected = [row for row in cases if row["skill"] == skill]
            self.assertEqual(len(selected), 2, skill)
            self.assertEqual({row["kind"] for row in selected}, {"typical", "boundary"})

    def test_scrub_documents_are_explicitly_excluded(self):
        instructions = lab.agent_instructions()
        for name in lab.SCRUB_FILES:
            self.assertIn(name, instructions)
            self.assertFalse((lab.PLAYGROUND_SKILLS / name).exists())
        self.assertEqual(
            {path.name for path in lab.PLAYGROUND_SKILLS.iterdir() if path.is_symlink()},
            set(lab.SKILLS),
        )

    def test_retired_media_cases_remain_decodable_but_are_not_scheduled(self):
        active_ids = {row["id"] for row in lab.load_cases()}
        all_cases = lab.cases_by_id()
        self.assertNotIn("photo-life-support", active_ids)
        self.assertNotIn("illustration-savanna", active_ids)
        self.assertEqual(all_cases["photo-life-support"]["skill"], "get-photo-ref")
        self.assertEqual(all_cases["illustration-savanna"]["skill"], "get-illustration")

    def test_arm_prompts_differ_only_by_explicit_skill_invocation(self):
        for case in lab.load_cases():
            baseline = lab.prompt_for(case, "baseline")
            treatment = lab.prompt_for(case, "treatment")
            prefix = f"Use ${case['skill']} for this task. Follow its routing and references before implementation.\n\n"
            self.assertEqual(treatment, prefix + baseline)
            self.assertNotIn("$", baseline)

    def test_prepared_pair_has_matched_payload_and_one_sided_install(self):
        case = next(row for row in lab.load_cases() if row["id"] == lab.CANARY_CASE)
        with tempfile.TemporaryDirectory(prefix="skill-lab-test-") as tmp:
            root = lab.prepare_run("unit-pair", [case], Path(tmp))
            pair = root / case["skill"] / case["id"]
            baseline = json.loads((pair / "baseline" / "prepared.json").read_text())
            treatment = json.loads((pair / "treatment" / "prepared.json").read_text())
            self.assertEqual(baseline["payload_hash"], treatment["payload_hash"])
            self.assertFalse((pair / "baseline" / ".agents").exists())
            installed = pair / "treatment" / ".agents" / "skills"
            self.assertEqual([path.name for path in installed.iterdir()], [case["skill"]])
            self.assertTrue((installed / case["skill"]).is_symlink())
            self.assertEqual((installed / case["skill"]).resolve(), lab.skill_source(case["skill"]).resolve())

    def test_codex_command_pins_runtime_and_hides_home_from_agent_shell(self):
        command = lab.codex_command(Path("/tmp/arm"), Path("/tmp/arm/last.md"), "do it")
        joined = " ".join(command)
        self.assertIn("--ephemeral", command)
        self.assertIn("--ignore-user-config", command)
        self.assertIn("--strict-config", command)
        self.assertIn(lab.MODEL, command)
        self.assertIn('model_reasoning_effort="low"', command)
        self.assertIn('service_tier="fast"', command)
        self.assertIn('shell_environment_policy.exclude=["CODEX_HOME"]', command)
        self.assertIn("agents.enabled=false", command)
        self.assertNotIn("PARATERA_API_KEY", joined)

    def test_child_environment_passes_only_the_media_secret(self):
        source = {
            "PATH": "/bin",
            "PARATERA_API_KEY": "media-value",
            "OPENAI_API_KEY": "remove-me",
            "SOME_PASSWORD": "remove-me-too",
        }
        with mock.patch.dict(os.environ, source, clear=True):
            env = lab.child_environment(Path("/tmp/private-codex-home"))
        self.assertEqual(env["PARATERA_API_KEY"], "media-value")
        self.assertEqual(env["CODEX_HOME"], "/tmp/private-codex-home")
        self.assertNotIn("OPENAI_API_KEY", env)
        self.assertNotIn("SOME_PASSWORD", env)

    def test_temporary_codex_home_is_private_and_outside_the_arm(self):
        with tempfile.TemporaryDirectory(prefix="auth-source-") as source_tmp:
            source = Path(source_tmp) / "auth.json"
            source.write_text('{"test": true}', encoding="utf-8")
            with mock.patch.object(lab, "auth_source", return_value=source):
                home = lab.make_codex_home()
            try:
                self.assertEqual((home / "auth.json").read_text(), '{"test": true}')
                self.assertEqual(stat.S_IMODE(home.stat().st_mode), 0o700)
                self.assertEqual(stat.S_IMODE((home / "auth.json").stat().st_mode), 0o600)
                with self.assertRaises(ValueError):
                    home.relative_to(lab.HERE)
            finally:
                shutil.rmtree(home, ignore_errors=True)

    def test_gallery_is_blinded_and_its_script_parses(self):
        case = next(row for row in lab.load_cases() if row["id"] == lab.CANARY_CASE)
        document = lab.gallery_document(Path("/tmp/blind-run"), [case])
        self.assertNotIn("baseline", document.lower())
        self.assertNotIn("treatment", document.lower())
        self.assertIn(f"/artifact/{case['id']}/A/pages/index.html", document)
        self.assertIn(f"/artifact/{case['id']}/B/pages/index.html", document)
        script = document.rsplit("<script>", 1)[1].split("</script>", 1)[0]
        with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8") as handle:
            handle.write(script)
            handle.flush()
            proc = subprocess.run(["node", "--check", handle.name], text=True, capture_output=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_illustration_manifest_accepts_documented_formats(self):
        with tempfile.TemporaryDirectory(prefix="illustration-log-") as tmp:
            pages = Path(tmp)
            log = pages / "asset.prompt.json"
            log.write_text(json.dumps({
                "file": "asset.png",
                "prompt": "wide habitat with no text",
                "model": "example-image-model",
                "size": "2048x1152",
            }), encoding="utf-8")
            self.assertTrue(lab.illustration_log_ok(pages)[0])
            log.unlink()
            (pages / "asset.prompt.md").write_text(
                "# Generation manifest\n\nSelected file: `asset.png`\n"
                "Backend: example image model\nNative size: 2048 × 1152\n"
                "## Selected prompt\nwide habitat with no text\n",
                encoding="utf-8",
            )
            self.assertTrue(lab.illustration_log_ok(pages)[0])

    def test_illustration_prompt_without_full_manifest_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="illustration-log-") as tmp:
            pages = Path(tmp)
            (pages / "asset-prompt.txt").write_text(
                "Generated with: example model\nPrompt: wide habitat with no text\n",
                encoding="utf-8",
            )
            self.assertFalse(lab.illustration_log_ok(pages)[0])

    def test_attribution_accepts_collection_field_aliases(self):
        with tempfile.TemporaryDirectory(prefix="attribution-") as tmp:
            pages = Path(tmp)
            (pages / "attribution.json").write_text(json.dumps({
                "selected": {
                    "file": "artifact.jpg",
                    "object_page": "https://museum.example/object/1",
                    "rights": "Public Domain",
                }
            }), encoding="utf-8")
            self.assertTrue(lab.attribution_ok(pages)[0])

    def test_fixture_fact_matching_normalizes_unit_whitespace(self):
        density = next(row for row in lab.load_cases() if row["id"] == "check-density")
        states = next(row for row in lab.load_cases() if row["id"] == "check-states")
        self.assertTrue(lab.fixture_facts_ok(density, "猿人 · 3 L · 回收率 90 %")[0])
        self.assertTrue(lab.fixture_facts_ok(states, "备用氧气罐，质量 80 kg")[0])


if __name__ == "__main__":
    unittest.main()
