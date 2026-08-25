#!/usr/bin/env python3
"""Production workflow registry tests."""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core import skills  # noqa: E402


class WorkflowRegistryTests(unittest.TestCase):
    def test_all_declared_workflows_exist(self) -> None:
        available = set(skills.available(skills.WORKFLOWS))
        self.assertEqual(set(skills.ALL_WORKFLOWS), available)

    def test_planner_catalog_contains_only_page_routes_in_priority_order(self) -> None:
        lines = skills.workflow_catalog().splitlines()
        names = [line[2:].split(":", 1)[0] for line in lines]
        self.assertEqual(names, list(skills.PAGE_WORKFLOWS))
        self.assertNotIn("review-page", names)
        self.assertNotIn("set-visual-direction", names)

    def test_builder_assignment_contains_one_workflow(self) -> None:
        block = skills.assigned_workflow("compose-page")
        self.assertIn("- compose-page:", block)
        self.assertNotIn("design-motion", block)

    def test_builder_assignment_requires_routed_references_before_edit(self) -> None:
        block = skills.assigned_workflow("compose-page")
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
            "collect-visual-references": {"source-routing.md"},
            "compose-page": {"relationship-compositions.md", "framing-and-density.md"},
            "design-interaction": {"interaction-recipes.md"},
            "design-motion": {"motion-engine-recipes.md"},
            "generate-illustration": {"prompt-and-integration.md"},
            "review-page": {"review-lenses.md"},
            "set-visual-direction": {"direction-recipes.md", "material-and-effects.md"},
            "shape-typography": {"projected-type-system.md", "cjk-numeric-math.md"},
            "simulate-2d": {"renderer-routing.md", "konva-recipe.md",
                            "matter-recipe.md", "pixi-recipe.md"},
            "visualize-data": {"renderer-routing.md", "echarts-recipe.md",
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
        for name in ("simulate-2d", "visualize-data"):
            with self.subTest(workflow=name):
                text = (skills.WORKFLOWS / name / "SKILL.md").read_text(encoding="utf-8")
                self.assertIn("read only the selected recipe", text.lower())
                self.assertIn("Do not read an unselected recipe", text)


if __name__ == "__main__":
    unittest.main()
