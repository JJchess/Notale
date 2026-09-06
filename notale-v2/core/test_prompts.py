#!/usr/bin/env python3
"""Planner and prompt-contract tests."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from core import builder, planner, skills
from core.llm import fill


ROOT = Path(__file__).resolve().parents[1]


CSS_OK = """/* ==== INTERFACE ====
token --bg #ffffff page background
==== /INTERFACE ==== */
:root { --pad-x:56px; --pad-y:28px; --bg:#fff; }
#stage { padding:var(--pad-y) var(--pad-x); }
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
                philosophy=skills.philosophy_block("deck"),
                theme_bans="theme bans", font_floor=skills.FONT_FLOOR,
                css_path="/run/pages/assets/theme.css",
                pages_path="/run/pages/plan/pages.md",
                visual_focus="",
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
        self.assertIn("数据、操作、步骤", deck)
        self.assertIn("公式、讲解、UI 和构图都归建页 agent", deck)
        self.assertIn("# page-NN [代码页]", deck)
        self.assertIn("代码实操 AdaBoosting 算法", deck)
        self.assertNotIn("每章排 3–5 个内容页", deck)
        self.assertNotIn("4–6 章", deck)

    def test_builder_prompt_separates_global_loop_from_page_facts(self):
        brief = (ROOT / "prompts/brief.md").read_text(encoding="utf-8")
        self.assertIn("chapter_context", brief)
        self.assertNotIn("第一轮", brief)
        self.assertNotIn("使用 `Check`", brief)
        self.assertNotIn("WorkflowContext", brief)

        # Each shared rule lives in exactly one block. The brief carries only
        # this page's facts; the deck-wide contract stays in the cached prefix.
        tech = (ROOT / "prompts/tech.md").read_text(encoding="utf-8")
        self.assertIn("不要用 Bash/Read 枚举依赖", tech)
        self.assertIn("不修改 `assets/`", tech)
        for shared in ("chassis", "tech", "theme_css", "deck_outline",
                       "CodeScaffold", "base.js", "不修改 `assets/`"):
            self.assertNotIn(shared, brief)

        self.assertEqual(builder.RESPONSE_TARGET, 11)
        self.assertIn("最多有 11 次响应", builder.IDENTITY)
        self.assertIn("通常应在 4–7 次内完成", builder.IDENTITY)
        self.assertIn("同一响应中的多个工具调用会按列出顺序执行", builder.IDENTITY)
        self.assertIn("首次 Write 前先核对确定性数据", builder.IDENTITY)
        self.assertIn("下一次响应直接结束", builder.IDENTITY)

    def test_philosophy_reaches_both_sides_and_stays_minimal(self):
        """这份文件此前代码里零引用 —— 谁也收不到。接线后要保证两侧各拿到自己那块。

        同时钉住「不重复 reference 已经讲过的」：一条规则说四遍不会更成立，
        实测 check_use 的「one main evidence field」发了 73 遍，页面照样是卡片墙。
        """
        deck = skills.philosophy_block("deck")
        page = skills.philosophy_block("page")
        self.assertIn("重要的概念给更多页", deck)
        self.assertIn("不要缩字号", page)
        # 拆页是 planner 的动作，给 builder 就是一条它执行不了的出路
        self.assertNotIn("拆页", page)
        # 与 reference / check_use 重复的三条不得回流
        for dup in ("主体", "首屏", "card", "grid"):
            self.assertNotIn(dup, page)
        self.assertLess(len(deck) + len(page), 400)
        with self.assertRaises(ValueError):
            skills.philosophy_block("both")

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
        # #stage 的排法不再由共享层规定,只剩围栏和 INTERFACE 两条硬闸
        self.assertEqual(
            planner._valid_css(
                "/* ==== INTERFACE ==== x ==== /INTERFACE ==== */\n#stage{position:absolute}"
            ),
            "",
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

    def test_invalid_deck_retries_then_raises_with_diagnostic(self):
        """A half-delivery is retried, not fatal on the first try.

        Measured 2026-09-04: this step dropped one of its two Write calls six
        times running (5x gemini-3.8-flash, 1x AWS-GPT-5.6-Sol), always writing a
        complete theme.css and never calling Write for pages.md. One shot with no
        retry turned that into a dead run.
        """
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
            self.assertEqual(respond.call_count, planner.DECK_TRIES)
            self.assertTrue((root / "deck.rejected.json").is_file())

    def test_deck_recovers_when_a_later_try_delivers_both(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "pages" / "plan").mkdir(parents=True)
            run = SimpleNamespace(root=root, log=SimpleNamespace(add=lambda *args: None))
            half = SimpleNamespace(
                output=[self.function_call(root / planner.CSS_REL, CSS_OK, "css")],
                usage=None, id="half")
            whole = SimpleNamespace(
                output=[self.function_call(root / planner.CSS_REL, CSS_OK, "css"),
                        self.function_call(root / planner.PAGES_REL, PAGES_OK, "pages")],
                usage=None, id="whole")
            seen = []

            def fake(_ident, msgs, _spec, _eff, tag=None):
                seen.append(msgs[0]["content"])
                return half if len(seen) == 1 else whole

            with patch.object(planner.llm, "respond", fake):
                css, pages = planner.deck_call(run, "prompt")
            self.assertEqual((css, pages), (CSS_OK, PAGES_OK))
            self.assertEqual(len(seen), 2)
            # The retry tells the model what was missing instead of re-rolling blind.
            self.assertIn("上一次尝试被判不合格", seen[1])
            self.assertIn("pages.md", seen[1])
            self.assertFalse((root / "deck.rejected.json").exists())

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
