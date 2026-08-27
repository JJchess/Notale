#!/usr/bin/env python3
"""Production workflow registry tests."""

from __future__ import annotations

import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core import skills, tools  # noqa: E402


class WorkflowRegistryTests(unittest.TestCase):
    def test_all_declared_workflows_exist(self) -> None:
        available = set(skills.available(skills.WORKFLOWS))
        self.assertEqual(set(skills.ALL_WORKFLOWS), available)

    def test_planner_catalog_contains_only_page_routes_in_priority_order(self) -> None:
        lines = skills.workflow_catalog().splitlines()
        names = [line[2:].split(":", 1)[0] for line in lines]
        self.assertEqual(names, list(skills.PAGE_WORKFLOWS))
        self.assertNotIn("check-page", names)
        self.assertNotIn("plan-direction", names)

    def test_builder_assignment_contains_one_workflow(self) -> None:
        block = skills.assigned_workflow("build-page")
        self.assertIn("- build-page:", block)
        self.assertNotIn("build-chart", block)

    def test_builder_assignment_requires_routed_references_before_edit(self) -> None:
        block = skills.assigned_workflow("build-page")
        self.assertIn("Reference routing", block)
        self.assertIn("任何页面修改前", block)
        for tool in ("`Write`", "`Edit`", "`Patch`", "`Bash`"):
            self.assertIn(tool, block)
        self.assertIn("不要读取未选分支或无关 reference", block)
        self.assertNotIn("按实际需要", block)

    def test_every_workflow_has_valid_top_level_reference_routing(self) -> None:
        expected = {
            "build-3d-scene": {"renderer-routing.md", "three-core-recipe.md",
                               "globe-recipe.md"},
            "build-learning-game": {"game-model-recipes.md"},
            "get-photo-ref": {"source-routing.md"},
            "build-page": {"relationship-compositions.md", "framing-and-density.md",
                           "motion-engine-recipes.md"},
            "build-interaction": {"interactive-widget.md"},
            "get-illustration": {"prompt-and-integration.md"},
            "check-page": {"review-lenses.md"},
            "plan-direction": {"direction-recipes.md", "material-and-effects.md"},
            "build-2d-sim": {"renderer-routing.md", "konva-recipe.md",
                            "matter-recipe.md", "pixi-recipe.md"},
            "build-chart": {"renderer-routing.md", "echarts-recipe.md",
                               "d3-relations-recipe.md"},
        }
        for name in skills.ALL_WORKFLOWS:
            with self.subTest(workflow=name):
                root = skills.WORKFLOWS / name
                text = (root / "SKILL.md").read_text(encoding="utf-8")
                self.assertEqual(text.count("## Reference routing"), 1)
                self.assertLess(text.index("## Reference routing"), text.index("page mutation"))
                links = re.findall(r"\]\((references/[^)]+\.md)\)", text)
                self.assertTrue(links)
                self.assertTrue(expected[name].issubset({Path(link).name for link in links}))
                for link in links:
                    target = root / link
                    self.assertEqual(target.parent, root / "references")
                    self.assertTrue(target.is_file(), target)

    def test_renderer_workflows_select_one_recipe(self) -> None:
        for name in ("build-2d-sim", "build-chart"):
            with self.subTest(workflow=name):
                text = (skills.WORKFLOWS / name / "SKILL.md").read_text(encoding="utf-8")
                self.assertIn("read only the selected recipe", text.lower())
                self.assertIn("Do not read an unselected recipe", text)

    def test_design_interaction_loads_one_portable_widget_reference(self) -> None:
        root = skills.WORKFLOWS / "build-interaction"
        skill = (root / "SKILL.md").read_text(encoding="utf-8")
        links = re.findall(r"\]\((references/[^)]+\.md)\)", skill)
        self.assertEqual(links, ["references/interactive-widget.md"])
        self.assertIn("completely in one `Read`", skill)

        reference = (root / links[0]).read_text(encoding="utf-8")
        for host_detail in ("#stage", "data-page", "data-total", "Deck.", "page-NN"):
            self.assertNotIn(host_detail, reference)
        self.assertIn("bounded interactive component, not a page", reference)
        self.assertIn("function createWidget(root, host)", reference)

    def test_workflow_reference_read_returns_the_complete_file_once(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "workflows"
            reference = root / "build-interaction" / "references" / "large.md"
            reference.parent.mkdir(parents=True)
            body = "START\n" + ("substantial guidance\n" * 4000) + "UNIQUE EOF CONTENT"
            reference.write_text(body, encoding="utf-8")

            result = tools.run(
                "Read",
                {"file_path": str(reference), "offset": 3000, "limit": 1},
                Path(td),
                root,
            )

        self.assertIsInstance(result, str)
        self.assertIn("START", result)
        self.assertIn("UNIQUE EOF CONTENT", result)
        self.assertIn("reference 全文结束", result)
        self.assertNotIn("已截断", result)


if __name__ == "__main__":
    unittest.main()
