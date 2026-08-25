from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import runner


class MatrixTests(unittest.TestCase):
    def test_matrix_has_32_unique_tasks(self) -> None:
        tasks = {(case["page"], arm["id"])
                 for case in runner.load_cases() for arm in runner.ARMS}
        self.assertEqual(len(tasks), 32)
        self.assertEqual(runner.validate(), [])

    def test_tool_surfaces_are_exact(self) -> None:
        builder = {s["name"] for s in runner.tool_specs("builder")}
        lab = {s["name"] for s in runner.tool_specs("lab")}
        self.assertEqual(builder, {"Read", "Write", "Edit", "Patch", "Check", "Look", "Bash", "Skill"})
        self.assertEqual(lab, {"Read", "Write", "Edit", "Bash", "Skill", "Render"})

    def test_prompts_reference_sandbox_not_production_run(self) -> None:
        case = runner.load_cases()[0]
        arm = runner.arm_by_id("workflow-builder")
        root, names = runner.assigned_skills(case, arm)
        self.assertEqual(root, runner.WORKFLOW_SKILLS)
        prompt = runner.prompt_for(case, arm, Path("/tmp/isolated-workspace"), names)
        self.assertIn("/tmp/isolated-workspace", prompt)
        self.assertIn(case["workflow"], prompt)
        self.assertNotIn(str(runner.SOURCE), prompt)
        self.assertNotIn("最后一次 `Check`", prompt)


class IsolationTests(unittest.TestCase):
    def test_direct_write_outside_target_page_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            pages = Path(td)
            result = runner.dispatch(
                "Write", {"file_path": str(runner.V2 / "forbidden.txt"), "content": "x"},
                pages, "page-01.html", runner.WORKFLOW_SKILLS, ["compose-page"], "builder",
            )
        self.assertIn("拒绝写入", result)
        self.assertFalse((runner.V2 / "forbidden.txt").exists())

    def test_unassigned_skill_is_observed_not_loaded(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            result = runner.dispatch(
                "Skill", {"skill": "design-motion"}, Path(td), "page-01.html",
                runner.WORKFLOW_SKILLS, ["compose-page"], "builder",
            )
        self.assertIn("可读的 Skill 只有", result)


class StopTests(unittest.TestCase):
    def test_no_tool_use_stops_without_skill_enforcement(self) -> None:
        message = SimpleNamespace(
            type="message", content=[SimpleNamespace(type="output_text", text="done")]
        )
        response = SimpleNamespace(output=[message], usage=None, id="fake")

        def fake_respond(*args, **kwargs):
            return response

        case = runner.load_cases()[0]
        arm = runner.arm_by_id("workflow-builder")
        runner.RUNS.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=runner.RUNS) as td:
            result = runner.run_trial(
                case, arm, Path(td), runner.MODEL, runner.EFFORT,
                respond_fn=fake_respond, do_external_check=False,
            )
        self.assertEqual(result["calls"], 1)
        self.assertEqual(result["termination"], "no_tool_use")
        self.assertTrue(result["converged"])
        self.assertFalse(result["loaded_any_skill"])


if __name__ == "__main__":
    unittest.main()
