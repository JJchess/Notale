#!/usr/bin/env python3
"""Production workflow registry tests."""

from __future__ import annotations

import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core import skills, tools  # noqa: E402


class WorkflowRegistryTests(unittest.TestCase):
    def test_all_declared_workflows_exist(self) -> None:
        available = set(skills.available(skills.WORKFLOWS))
        self.assertEqual(set(skills.ALL_WORKFLOWS), available)

    def test_skill_resolves_the_shapes_models_actually_send(self) -> None:
        """`Skill` 不能只认 workflow 名 —— 模型会照 SKILL.md 正文的形状传 reference。

        这三个字符串是 sonnet-full2-20260828 真实传进来的(15 次调用里的 5 次):
        `widget-core` ×2、`pattern-routing` ×2、`relationship-compositions` ×1。
        当时全部返回「没有名为…的 skill」,page-07 就此放弃、一份 reference 都没读。
        它们不是乱传:模型刚在 SKILL.md 里读到
        `[widget-core.md](references/widget-core.md)`,照着传是合理推断。
        """
        for arg in ("widget-core", "pattern-routing", "relationship-compositions",
                    "widget-core.md", "build-interaction/references/widget-core.md",
                    "build-page", "build-page/SKILL.md"):
            with self.subTest(arg=arg):
                out = skills.load(arg, skills.WORKFLOWS)
                self.assertFalse(out.startswith("没有名为"), out[:80])
                self.assertGreater(len(out), 500)

    def test_skill_does_not_guess_on_ambiguous_reference(self) -> None:
        """撞名要列候选,不能挑一个给。给错文档是静默的,比报错更坏。"""
        out = skills.load("renderer-routing", skills.WORKFLOWS)
        self.assertIn("不替你猜", out)
        self.assertIn("build-chart/references/renderer-routing.md", out)

    def test_direction_menus_are_off_by_default(self) -> None:
        """两张选项菜单表默认不注入,`--direction-menus` 才接回。

        这个开关是**有期限的**,见 skills.direction_block 的 docstring:出了结论就要
        和 prompts/direction-menus.md 一起删掉。这条测试守的是默认值别被翻过去 ——
        对照臂的默认值一旦悄悄翻转,两条臂就都不是它们自称的那条了。
        """
        off, on = skills.direction_block(), skills.direction_block(menus=True)
        self.assertNotIn("Direction families", off)
        self.assertNotIn("Selection table", off)
        self.assertIn("Direction families", on)
        self.assertIn("Selection table", on)
        # 菜单文件抬头那段中文是给人看的账,不进模型输入。
        self.assertNotIn("有期限的", on)
        self.assertTrue(on.startswith(off[:200]))

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
                "page-01",
            )

        self.assertIsInstance(result, str)
        self.assertIn("START", result)
        self.assertIn("UNIQUE EOF CONTENT", result)
        self.assertIn("reference 全文结束", result)
        self.assertNotIn("已截断", result)


class OutOfBoundsTests(unittest.TestCase):
    """本页只能碰自己 run 的 pages/,page-*.html 里只能碰自己那一页。

    2026-08-28 Sonnet 全量那轮 page-06 花了 46 步、43 次 Bash、**一次 Write 都没有**;
    同模型 sonB 那轮留下了参数,能看见它 `cd` 去别的 run `cat` 页面、
    `diff` 两个 run 的 CHASSIS.md、`echo BASHTEST >` 往别的 run 写文件。
    tools.py 顶上写着「cwd 钉死」,但 `cd` 一下就不算数 —— 这组测试守的是它现在算数了。
    """

    PID = "page-06"

    def setUp(self) -> None:
        self.td = tempfile.TemporaryDirectory()
        self.cwd = Path(self.td.name) / "runs" / "mine" / "pages"
        (self.cwd / "assets" / "lib").mkdir(parents=True)
        self.other = Path(self.td.name) / "runs" / "other" / "pages"
        self.other.mkdir(parents=True)

    def tearDown(self) -> None:
        self.td.cleanup()

    def blocked(self, args):
        return tools._out_of_bounds(args, self.cwd, self.PID)

    def test_other_pages_are_refused(self) -> None:
        self.assertEqual(self.blocked({"file_path": "page-05.html"}), "page-05.html")
        self.assertEqual(self.blocked({"page": "page-09.html"}), "page-09.html")

    def test_same_name_in_another_run_is_refused(self) -> None:
        """**只比基名挡不住这一条。** 别的 run 里也有 page-06.html。"""
        off = self.blocked({"file_path": str(self.other / "page-06.html")})
        self.assertIsNotNone(off)
        self.assertIn("run 目录之外", off)

    def test_bash_cd_into_another_run_is_refused(self) -> None:
        off = self.blocked({"command": f"cd {self.other} && cat page-06.html"})
        self.assertIsNotNone(off)
        self.assertIn("run 目录之外", off)

    def test_bash_writing_into_another_run_is_refused(self) -> None:
        """sonB 那轮真发生过:`echo BASHTEST > 别的run/pages/test_marker.txt`。"""
        self.assertIsNotNone(self.blocked({"command": f"echo X > {self.other}/t.txt"}))

    def test_own_page_and_own_run_pass(self) -> None:
        """**别把自己也挡了。** 审计过的 1,024 次 Bash 里 263 次是读回自己的页。"""
        for args in ({"file_path": "page-06.html"},
                     {"page": "page-06.html"},
                     {"command": "sed -n '1,40p' page-06.html"},
                     {"command": "grep -n stage page-06.html | head -20"},
                     {"command": f"cat {self.cwd}/assets/lib/LIBS.md"},
                     {"file_path": ".shots/page-06-after2.png"},
                     {"skill": "build-interaction"}):
            with self.subTest(args=args):
                self.assertIsNone(self.blocked(args))

    def test_relative_path_is_not_mistaken_for_absolute(self) -> None:
        """`assets/lib/mlp.js` 里那个斜杠一度被当成绝对路径 `/lib/mlp.js` 而误拦。"""
        self.assertIsNone(self.blocked({"command": "cat assets/lib/mlp.js"}))

    def test_page_content_is_not_a_reference(self) -> None:
        """扫的是**引用**不是**内容** —— 正文里出现别页名不算跨页访问。"""
        self.assertIsNone(self.blocked(
            {"file_path": "page-06.html", "content": "<a href='page-05.html'>x</a>"}))
        self.assertIsNone(self.blocked(
            {"page": "page-06.html", "edits": [{"old": "page-05.html", "new": "x"}]}))

    def test_run_refuses_without_dispatching(self) -> None:
        """拒绝要发生在 _dispatch 之前 —— 否则文件已经被读/写过了。"""
        with patch.object(tools, "_dispatch") as d:
            res = tools.run("Read", {"file_path": "page-05.html"},
                            self.cwd, self.cwd, self.PID)
        d.assert_not_called()
        self.assertIn("page-05.html", res)
        self.assertIn(self.PID, res)


if __name__ == "__main__":
    unittest.main()
