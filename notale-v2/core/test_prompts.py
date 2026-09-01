#!/usr/bin/env python3
"""Planner and prompt-contract tests."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from core import planner, skills
from core.llm import fill


ROOT = Path(__file__).resolve().parents[1]


CSS_OK = """/* ==== INTERFACE ====
token --bg #ffffff page background
==== /INTERFACE ==== */
:root { --pad-x:56px; --pad-y:28px; --bg:#fff; }
#stage { display:flex; flex-direction:column; padding:var(--pad-y) var(--pad-x); }
"""

PAGES_OK = """本套无需图池

# page-01 [标题页]
AdaBoosting 算法

# page-02 [内容页]
AdaBoosting 算法的历史

# page-03 [交互页]
交互理解 AdaBoosting 算法

# page-04 [代码页]
代码实操 AdaBoosting 算法
"""


class PromptTests(unittest.TestCase):
    def test_templates_fill_without_placeholders(self):
        cases = {
            "brief": dict(query="Q", pid="page-01", total=4),
            "tech": dict(n_pages=4, canvas_w=1600, canvas_h=900,
                         libs="local libs", font_floor=skills.FONT_FLOOR),
            "deck": dict(
                query="Q", minutes=90, audience="students", scenario="classroom",
                canvas_w=1600, canvas_h=900, direction="direction",
                theme_bans="theme bans", font_floor=skills.FONT_FLOOR,
                css_path="/run/pages/assets/theme.css",
                pages_path="/run/pages/plan/pages.md",
            ),
        }
        for name, args in cases.items():
            with self.subTest(name=name):
                source = (ROOT / f"prompts/{name}.md").read_text(encoding="utf-8")
                rendered = fill(source, _where=f"{name}.md", **args)
                self.assertNotRegex(rendered, r"\{[a-z_][a-z0-9_]*\}")

    def test_planner_owns_only_sequence_label_topic_and_shared_theme(self):
        deck = (ROOT / "prompts/deck.md").read_text(encoding="utf-8")
        self.assertIn("Planner 只决定顺序、标签和主题", deck)
        self.assertIn("数据、控件、步骤", deck)
        self.assertIn("公式、讲解、UI 和构图都归建页 agent", deck)
        self.assertIn("# page-NN [代码页]", deck)
        self.assertIn("代码实操 AdaBoosting 算法", deck)
        self.assertNotIn("每章排 3–5 个内容页", deck)
        self.assertNotIn("4–6 章", deck)

    def test_builder_prompt_uses_native_reads_and_absent_target(self):
        brief = (ROOT / "prompts/brief.md").read_text(encoding="utf-8")
        self.assertIn("第一轮按它当前注册的加载规则和精确路径并行 `Read`", brief)
        self.assertIn("目标文件尚不存在", brief)
        self.assertIn("CodeScaffold", brief)
        self.assertIn("不要用 Bash/Read 枚举依赖", brief)
        self.assertNotIn("WorkflowContext", brief)

    def test_anti_slop_guidance_is_split_by_decision_owner(self):
        builder_block = skills.anti_slop_block(skills.WORKFLOWS)
        theme_block = skills.theme_slop_block(skills.WORKFLOWS)
        self.assertIn("<anti_ai_slop_copy>", builder_block)
        self.assertIn("<anti_ai_slop_visual>", builder_block)
        self.assertNotIn("<anti_ai_slop_theme>", builder_block)
        self.assertIn("<anti_ai_slop_theme>", theme_block)


class ValidatorTests(unittest.TestCase):
    def test_page_validator_accepts_one_page_and_all_four_labels(self):
        self.assertEqual(planner._valid_pages(PAGES_OK), "")
        one = "# page-01 [标题页]\n一个足够的标题"
        self.assertEqual(planner._valid_pages(one), "")

    def test_page_validator_rejects_only_protocol_breakage(self):
        self.assertIn(
            "未知标签",
            planner._valid_pages("# page-01 [标题页]\nA\n# page-02 [练习页]\nB"),
        )
        self.assertIn(
            "不连续",
            planner._valid_pages("# page-01 [标题页]\nA\n# page-03 [内容页]\nB"),
        )
        self.assertIn(
            "page-01",
            planner._valid_pages("# page-01 [内容页]\nA"),
        )

    def test_css_validator_has_no_arbitrary_rule_count(self):
        self.assertEqual(planner._valid_css(CSS_OK), "")
        self.assertIn(
            "display:flex",
            planner._valid_css(
                "/* ==== INTERFACE ==== x ==== /INTERFACE ==== */\n#stage{padding:1px}"
            ),
        )
        self.assertIn("围栏", planner._valid_css("```css\n" + CSS_OK + "\n```"))


class PlannerExecutionTests(unittest.TestCase):
    @staticmethod
    def function_call(path: Path, content: str, ident: str):
        return SimpleNamespace(
            type="function_call",
            name="Write",
            arguments=json.dumps({"file_path": str(path), "content": content}),
            call_id=ident,
        )

    def test_deck_call_calls_model_once_and_materializes_two_targets(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            run = SimpleNamespace(root=root, log=SimpleNamespace(add=lambda *args: None))
            response = SimpleNamespace(
                output=[
                    self.function_call(root / planner.CSS_REL, CSS_OK, "css"),
                    self.function_call(root / planner.PAGES_REL, PAGES_OK, "pages"),
                ],
                usage=None,
                id="deck-response",
            )
            with patch.object(planner.llm, "respond", return_value=response) as respond:
                css, pages = planner.deck_call(run, "prompt")
            self.assertEqual(respond.call_count, 1)
            self.assertEqual(css, CSS_OK)
            self.assertEqual(pages, PAGES_OK)
            self.assertEqual((root / planner.CSS_REL).read_text(), CSS_OK)
            self.assertEqual((root / planner.PAGES_REL).read_text(), PAGES_OK)

    def test_invalid_deck_is_rejected_once_without_retry(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            run = SimpleNamespace(root=root, log=SimpleNamespace(add=lambda *args: None))
            response = SimpleNamespace(
                output=[self.function_call(root / planner.PAGES_REL, PAGES_OK, "pages")],
                usage=None,
                id="bad-deck",
            )
            with patch.object(planner.llm, "respond", return_value=response) as respond:
                with self.assertRaisesRegex(RuntimeError, "交付不合格"):
                    planner.deck_call(run, "prompt")
            self.assertEqual(respond.call_count, 1)
            self.assertTrue((root / "deck.rejected.json").is_file())

    def test_plan_run_leaves_every_page_target_absent(self):
        with tempfile.TemporaryDirectory() as td, patch.object(planner, "ROOT", Path(td)):
            run = planner.Run("AdaBoosting 算法", 20, "students", "fresh")

            def fake_seed(current, _chassis, _lib):
                current.assets.mkdir(parents=True, exist_ok=True)
                (current.assets / "CHASSIS.md").write_text("chassis", encoding="utf-8")

            def fake_deck(current, _prompt):
                css_path = current.root / planner.CSS_REL
                pages_path = current.root / planner.PAGES_REL
                css_path.parent.mkdir(parents=True, exist_ok=True)
                pages_path.parent.mkdir(parents=True, exist_ok=True)
                css_path.write_text(CSS_OK, encoding="utf-8")
                pages_path.write_text(PAGES_OK, encoding="utf-8")
                return CSS_OK, PAGES_OK

            with patch.object(planner, "seed", fake_seed), \
                    patch.object(planner, "deck_call", fake_deck), \
                    patch.object(planner, "assets", return_value=""):
                result = planner.plan_run(
                    run, Path(td) / "chassis", Path(td) / "lib", skills.WORKFLOWS
                )

            self.assertEqual(result["pages"], 4)
            self.assertEqual(len(list((run.pages / "plan").glob("p??.md"))), 4)
            self.assertEqual(list(run.pages.glob("page-*.html")), [])
            self.assertTrue((run.root / "briefs.json").is_file())


if __name__ == "__main__":
    unittest.main()
