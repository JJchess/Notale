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
:root { --pad-x:56px; --pad-y:28px; --bg:#fff; --text:#111; --font-sans:sans-serif; }
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
    def test_text_cap_is_restored_and_keeps_notes(self):
        self.assertIn('可见文字总量不超过 200 个字符', builder.NOTES_BLOCK)
        self.assertIn('标题、正文、标签、数值都算', builder.NOTES_BLOCK)
        self.assertNotIn('按内容复杂度与可读性决定文字量', builder.NOTES_BLOCK)
        self.assertIn('<aside class="notes" hidden>', builder.NOTES_BLOCK)
        self.assertNotIn('200', builder.NOTES_ONLY_BLOCK)

    def test_templates_fill_without_placeholders(self):
        cases = {
            "brief": dict(query="Q", pid="page-01", total=4),
            "tech": dict(n_pages=4, canvas_w=1600, canvas_h=900,
                         libs="local libs", font_floor=skills.FONT_FLOOR),
            "deck": dict(
                query="Q", minutes=90, audience="students", scenario="classroom",
                canvas_w=1600, canvas_h=900, direction="direction",
                philosophy=skills.philosophy_block("deck"),
                page_skills=skills.page_skill_descriptions(),
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

    def test_planner_owns_sequence_type_topic_and_media_not_page_implementation(self):
        deck = (ROOT / "prompts/deck.md").read_text(encoding="utf-8")
        self.assertIn("Planner 决定顺序、页型、主题及素材分配", deck)
        self.assertIn("页面内的实现与呈现交给建页 agent", deck)
        self.assertEqual(deck.count("{query}"), 1)
        for label, workflow in builder.LABEL_WORKFLOWS.items():
            self.assertIn(f"`{workflow}` → `[{label}]`", deck)
        self.assertIn("# page-01 [标题页]", deck)
        self.assertIn("# page-02 [内容页]", deck)
        self.assertNotIn("AdaBoost", deck)
        self.assertNotIn("一个算法或一个概念通常 3–5 页", deck)
        self.assertNotIn("`[内容页]` 无需动手", deck)
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
        self.assertIn("响应目标不超过 11 次", builder.IDENTITY)
        self.assertIn("通常应在 4–7 次内完成", builder.IDENTITY)
        self.assertIn("同一响应中的多个工具调用会按列出顺序执行", builder.IDENTITY)
        self.assertIn("设计时先核对确定性数据和公式", builder.IDENTITY)
        self.assertIn("实现正确就据实调整解释，不修改数据或显示值来凑结论", builder.IDENTITY)
        self.assertNotIn("公式和预期状态的一致性", builder.IDENTITY)
        self.assertIn("下一次响应直接结束", builder.IDENTITY)

    def test_library_index_routes_first_read_without_injecting_api_body(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            library = root / 'pages/assets/lib'
            library.mkdir(parents=True)
            source = (ROOT / 'vendor/chassis/lib/LIBS.md').read_text()
            (library / 'LIBS.md').write_text(source)
            index = builder._libs_index(root)
        self.assertIn('mlp.js', index)
        self.assertIn('matter.min.js', index)
        self.assertIn('首轮一并 Read', index)
        self.assertNotIn('activationLevels()', index)
        self.assertNotIn('Matter.Engine.create()', index)
        self.assertIn('activationLevels()', source)
        self.assertIn('Matter.Engine.create()', source)
        self.assertNotIn('zzz/lib', source)
        self.assertNotIn('自行下载', source)

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

    def test_first_page_does_not_have_to_be_a_cover(self):
        for label in planner.PAGE_LABELS:
            with self.subTest(label=label):
                self.assertEqual(planner._valid_pages(f"# page-01 [{label}]\nA"), "")

    def test_page_validator_rejects_only_protocol_breakage(self):
        self.assertIn(
            "未知标签",
            planner._valid_pages("# page-01 [标题页]\nA\n# page-02 [练习页]\nB"),
        )
        self.assertIn(
            "不连续",
            planner._valid_pages("# page-01 [标题页]\nA\n# page-03 [内容页]\nB"),
        )

    def test_css_validator_has_no_arbitrary_rule_count(self):
        self.assertEqual(planner._valid_css(CSS_OK), "")
        # No arbitrary rule count; actual missing values / chassis overrides are errors.
        self.assertEqual(
            planner._valid_css(
                CSS_OK + '\n.nt-controls{border:2px solid;border-radius:12px}'
            ),
            "",
        )
        self.assertIn("围栏", planner._valid_css("```css\n" + CSS_OK + "\n```"))


class PlannerExecutionTests(unittest.TestCase):
    @staticmethod
    def function_call(path: Path, content: str, ident: str):
        values = dict(
            type="function_call",
            name="FinalizePlan" if path.name == "pages.md" else "Write",
            arguments=json.dumps({"pages_md": content} if path.name == "pages.md"
                                 else {"file_path": str(path), "content": content}),
            call_id=ident,
        )
        return SimpleNamespace(**values, model_dump=lambda **_: values)

    def test_deck_call_returns_one_final_submission_without_intermediate_files(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            run = SimpleNamespace(root=root, style_director=False,
                                  log=SimpleNamespace(add=lambda *args: None))
            response = SimpleNamespace(
                output=[
                    self.function_call(root / planner.CSS_REL, CSS_OK, "css"),
                    self.function_call(root / planner.PAGES_REL, PAGES_OK, "pages"),
                ],
                usage=None,
                id="deck-response",
            )
            with patch.object(planner.llm, "respond", return_value=response) as respond:
                css, pages, mapping = planner.deck_call(run, "prompt")
            self.assertEqual(respond.call_count, 1)
            self.assertEqual(css, CSS_OK)
            self.assertEqual(pages, PAGES_OK)
            self.assertEqual(mapping, {})
            self.assertFalse((root / planner.CSS_REL).exists())
            self.assertFalse((root / planner.PAGES_REL).exists())

    def test_non_cover_start_finalizes_and_routes_without_repair(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            doc = "# page-01 [内容页]\n从核心问题开始\n"
            run = SimpleNamespace(root=root, style_director=True,
                                  log=SimpleNamespace(add=lambda *args: None))
            response = SimpleNamespace(output=[self.function_call(
                root / planner.PAGES_REL, doc, "pages")], usage=None, id="non-cover")
            with patch.object(planner.llm, "respond", return_value=response) as respond:
                _, delivered, _ = planner.deck_call(run, "prompt")
            self.assertEqual(respond.call_count, 1)
            self.assertEqual(delivered, doc)
            spec = root / "pages/plan/p01.md"
            spec.parent.mkdir(parents=True)
            spec.write_text(doc)
            page = builder.route_page(root, SimpleNamespace(pid="page-01"))
            self.assertEqual(page.workflow, "build-page")
            context = builder.chapter_preloads(root, 1)["page-01"]
            self.assertIn("从核心问题开始", context)

    def test_invalid_deck_retries_then_raises_with_diagnostic(self):
        """A half-delivery is retried, not fatal on the first try.

        Measured 2026-09-04: this step dropped one of its two Write calls six
        times running (5x gemini-3.8-flash, 1x AWS-GPT-5.6-Sol), always writing a
        complete theme.css and never calling Write for pages.md. One shot with no
        retry turned that into a dead run.
        """
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            run = SimpleNamespace(root=root, style_director=False,
                                  log=SimpleNamespace(add=lambda *args: None))
            response = SimpleNamespace(
                output=[self.function_call(root / planner.PAGES_REL, PAGES_OK, "pages")],
                usage=None,
                id="bad-deck",
            )
            with patch.object(planner.llm, "respond", return_value=response) as respond:
                with self.assertRaisesRegex(RuntimeError, "交付不合格"):
                    planner.deck_call(run, "prompt")
            self.assertEqual(respond.call_count, planner.DECK_TRIES)
            self.assertFalse((root / planner.PAGES_REL).exists())

    def test_deck_recovers_when_a_later_try_delivers_both(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "pages" / "plan").mkdir(parents=True)
            run = SimpleNamespace(root=root, style_director=False,
                                  log=SimpleNamespace(add=lambda *args: None))
            half = SimpleNamespace(
                output=[self.function_call(root / planner.PAGES_REL, PAGES_OK, "pages")],
                usage=None, id="half")
            whole = SimpleNamespace(
                output=[self.function_call(root / planner.CSS_REL, CSS_OK, "css"),
                        self.function_call(root / planner.PAGES_REL, PAGES_OK, "pages")],
                usage=None, id="whole")
            seen = []

            def fake(_ident, msgs, _spec, _eff, tag=None):
                seen.append(json.dumps(msgs, ensure_ascii=False))
                return half if len(seen) == 1 else whole

            with patch.object(planner.llm, "respond", fake):
                css, pages, mapping = planner.deck_call(run, "prompt")
            self.assertEqual((css, pages), (CSS_OK, PAGES_OK))
            self.assertEqual(len(seen), 2)
            # The retry tells the model what was missing instead of re-rolling blind.
            self.assertIn("缺少 theme.css", seen[1])
            self.assertFalse((root / "deck.rejected.json").exists())

    def test_plan_run_leaves_every_page_target_absent(self):
        with tempfile.TemporaryDirectory() as td, patch.object(planner, "ROOT", Path(td)):
            run = planner.Run("AdaBoosting 算法", 20, "students", "fresh")
            self.assertTrue(run.style_director)

            def fake_seed(current, _chassis, _lib):
                current.assets.mkdir(parents=True, exist_ok=True)
                (current.assets / "CHASSIS.md").write_text("chassis", encoding="utf-8")

            def fake_deck(current, _prompt):
                self.assertIn(skills.page_skill_descriptions(), _prompt)
                self.assertNotIn("check-page", _prompt)
                self.assertNotIn("In the first response", _prompt)
                self.assertNotIn("## `theme.css`", _prompt)
                self.assertNotIn("提交完整纯 CSS", _prompt)
                return "", PAGES_OK, {}

            def fake_direct(current, *_):
                (current.assets / "theme.css").write_text(CSS_OK, encoding="utf-8")

            with patch.object(planner, "seed", fake_seed), \
                    patch.object(planner, "deck_call", fake_deck), \
                    patch("core.director.direct", side_effect=fake_direct) as direct:
                result = planner.plan_run(
                    run, Path(td) / "chassis", Path(td) / "lib", skills.WORKFLOWS
                )

            direct.assert_called_once()
            self.assertEqual((run.assets / "theme.css").read_text(), CSS_OK)
            self.assertEqual(result["pages"], 4)
            self.assertEqual(len(list((run.pages / "plan").glob("p??.md"))), 4)
            self.assertEqual(list(run.pages.glob("page-*.html")), [])
            self.assertTrue((run.root / "briefs.json").is_file())

    def test_planner_cli_director_default_and_overrides(self):
        for flags, expected in (([], True), (["--style-director"], True),
                                (["--no-style-director"], False)):
            with self.subTest(flags=flags), tempfile.TemporaryDirectory() as td:
                root = Path(td)
                script = root / "skills/make-illustration/scripts/gen.py"
                script.parent.mkdir(parents=True)
                script.touch()
                argv = ["planner", "--query", "test", "--label", "cli",
                        "--skills", str(root / "skills"), *flags]
                with patch("sys.argv", argv), \
                        patch.object(planner, "ROOT", root), \
                        patch.object(skills, "DEFAULT", root / "skills"), \
                        patch.object(planner.llm, "override"), \
                        patch.object(planner, "plan_run") as plan:
                    planner.main()
                plan.assert_called_once()
                self.assertEqual(plan.call_args.args[0].style_director, expected)

    def test_planner_receives_skill_metadata_with_and_without_director(self):
        with tempfile.TemporaryDirectory() as td, patch.object(planner, "ROOT", Path(td)):
            workflow_root = Path(td) / "custom-workflows"
            for name in skills.PAGE_WORKFLOWS:
                path = workflow_root / name / "SKILL.md"
                path.parent.mkdir(parents=True)
                path.write_text(
                    f'---\nname: {name}\ndescription: "Custom capability: {name}"\n'
                    '---\nBODY_MUST_NOT_REACH_PLANNER\n', encoding="utf-8")
            for use_director in (False, True):
                with self.subTest(style_director=use_director):
                    run = planner.Run("test", 20, "students", f"metadata-{use_director}",
                                      style_director=use_director)

                    def fake_deck(current, prompt):
                        for name in skills.PAGE_WORKFLOWS:
                            self.assertIn(f"- {name}: Custom capability: {name}", prompt)
                        self.assertNotIn("BODY_MUST_NOT_REACH_PLANNER", prompt)
                        self.assertNotIn("check-page", prompt)
                        self.assertNotIn("{page_skills}", prompt)
                        # Content guidance survives both theme routes, once;
                        # page-type capabilities still come from skill metadata.
                        for principle in (
                            "读者与目的", "核心问题与前置", "来由、语境与演进",
                            "解释与证据", "顺序与递进", "运用、辨析与边界",
                            "素材用途", "收束与迁移",
                        ):
                            self.assertEqual(prompt.count(f"**{principle}**"), 1)
                        self.assertIn("来源背景有助于理解时展开讲述", prompt)
                        self.assertIn("人物、原论文或历史资料", prompt)
                        self.assertNotIn("AdaBoost", prompt)
                        return CSS_OK, PAGES_OK, {}

                    def fake_direct(current, *_):
                        (current.assets / "theme.css").write_text(CSS_OK, encoding="utf-8")

                    def fake_seed(current, *_):
                        (current.assets / "CHASSIS.md").write_text("Deck.fmt(v, d)", encoding="utf-8")

                    with patch.object(planner, "seed", fake_seed), \
                            patch.object(planner, "deck_call", fake_deck), \
                            patch.object(skills, "theme_slop_block", return_value=""), \
                            patch("core.director.direct", fake_direct):
                        planner.plan_run(run, Path(td), Path(td), workflow_root)


if __name__ == "__main__":
    unittest.main()
