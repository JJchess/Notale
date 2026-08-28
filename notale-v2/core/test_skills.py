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
            "build-interaction": {"widget-core.md", "pattern-routing.md",
                                  "pattern-tune.md", "pattern-build.md",
                                  "pattern-observe.md", "pattern-judge.md",
                                  "craft-render.md", "motion.md", "recipes.md",
                                  "worked-example.md", "studies.md", "delivery.md"},
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

    def test_design_interaction_routes_instead_of_loading_one_huge_file(self) -> None:
        """`interactive-widget.md` 2026-08-28 切成 12 份路由化的文件。

        原来那一份 93,524 B、SKILL.md 要求「completely in one `Read`」,于是每一页
        都付全额。实测它**一份就占建页输入 token 的 35.7%**(两轮 35.6%/35.7%),
        而 workflows/ 下其余每个 workflow 的最大单份 reference 都在 4.7KB 以内。

        这条测试守两件事:路由是 N 选一的形状(照 build-chart / build-2d-sim 的句式),
        以及**下面那条可移植性** —— 那才是原来那份文件真正的设计约束。
        """
        root = skills.WORKFLOWS / "build-interaction"
        skill = (root / "SKILL.md").read_text(encoding="utf-8")
        links = re.findall(r"\]\((references/[^)]+\.md)\)", skill)

        self.assertIn("references/widget-core.md", links)      # 总是读的基底
        self.assertIn("references/pattern-routing.md", links)  # 选家族用的路由表
        self.assertIn("only the one pattern family", skill)
        self.assertIn("Do not read an unselected pattern family", skill)
        # 不要再回到「一次读完一整份」
        self.assertNotIn("completely in one `Read`", skill)

    def test_every_interaction_reference_stays_portable(self) -> None:
        """**可移植性是原来那份文件的真实设计意图,切分不许把它弄丢。**

        它是「bounded interactive component, not a page」——不绑 Notale 宿主。
        原来只对一份文件断言,现在逐份断言:切分是加强这条,不是削弱。
        """
        refs = sorted((skills.WORKFLOWS / "build-interaction" / "references").glob("*.md"))
        self.assertGreaterEqual(len(refs), 10)
        for f in refs:
            with self.subTest(reference=f.name):
                text = f.read_text(encoding="utf-8")
                for host_detail in ("#stage", "data-page", "data-total", "Deck.", "page-NN"):
                    self.assertNotIn(host_detail, text)
                # 每一份都要说清自己什么时候读 —— 路由化之后这是必需的
                self.assertTrue(text.startswith("<!--"), f.name)

    def test_the_split_kept_the_load_bearing_sentences(self) -> None:
        """搬运不许丢内容。这两句是原来那份文件的定义句和规范组件签名。

        两句都在 §1/§7,都进了 widget-core.md —— 即「总是读」的那一份。
        """
        core = (skills.WORKFLOWS / "build-interaction" / "references"
                / "widget-core.md").read_text(encoding="utf-8")
        self.assertIn("bounded interactive component, not a page", core)
        self.assertIn("function createWidget(root, host)", core)

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
