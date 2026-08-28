#!/usr/bin/env python3
"""Prompt contracts and the small deterministic validators around them."""

from __future__ import annotations

import contextlib
import io
import re
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.llm import fill  # noqa: E402
from core import skills  # noqa: E402
from core.planner import (MAX_CHARS, _valid_css, _valid_pages,  # noqa: E402
                          split_pages, take_writes)


# 每份提示词的字符数上限。**只降不升** —— 这一栏在 2026-08-26 精简 contract/brief/spec
# 之后重定过一次,同时修掉一个一直存在的错:原来的数(brief 1457 / contract 5646 / spec 11150)
# 是按 `wc -c` 的**字节**定的,而这道闸比的是 `len(text)` 的**字符**。中文 3 字节/字,
# 于是上限一直比本意宽了约一倍 —— 契约实际 1,998 字符却挂着 5,646 的天花板,
# 这道闸事实上从没拦过任何东西。现在按真实字符数 + 约 10% 余量重定。
BASELINE_CHARS = {
    "brief": 700,
    "tech": 2200,
    "philosophy": 2100,
    "deck": 5200,
}

PROMPT_ARGS = {
    "brief": dict(query="Q", pid="page-01", assets="/tmp/assets",
                  total=12, spec="/tmp/p01.md"),
    "tech": dict(n_pages=12, canvas_w=1600, canvas_h=900,
                 libs="库清单", font_floor="字号地板"),
    "philosophy": {},
    "deck": dict(query="Q", minutes=30, audience="高中生", scenario="课堂投影",
                 libs="库清单", canvas_w=1600, canvas_h=900, stay_ceiling=150.0,
                 n_lo=12, n_hi=40, n_target=20, direction="(视觉方向)",
                 theme_bans="(配色禁令)", font_floor="字号地板",
                 css_path="/tmp/r/pages/assets/theme.css",
                 pages_path="/tmp/r/pages/plan/pages.md"),
}


class PromptTemplateTests(unittest.TestCase):
    def test_all_templates_fill_without_leftover_placeholders(self) -> None:
        for name, args in PROMPT_ARGS.items():
            with self.subTest(name=name):
                template = (ROOT / "prompts" / f"{name}.md").read_text(encoding="utf-8")
                rendered = fill(template, _where=f"{name}.md", **args)
                self.assertFalse(re.search(r"\{[a-z_][a-z0-9_]*\}", rendered))

    def test_no_prompt_exceeds_its_previous_size(self) -> None:
        for name, ceiling in BASELINE_CHARS.items():
            with self.subTest(name=name):
                text = (ROOT / "prompts" / f"{name}.md").read_text(encoding="utf-8")
                self.assertLessEqual(len(text), ceiling)

    def test_no_hard_character_cap(self) -> None:
        """字数上限已经去掉 —— 它拦掉的是「差 1.9%」,代价是整轮停下。

        实测:CONTRACT.md 连续三次 6,190 / 6,057 / 6,115,上限 6,000。
        长度由提示词里的目标字数引导;真正跑飞的产物由 MAX_OUT(输出 token)
        和 MIN_CHARS(空响应)兜住。这条测试守的是「别再加回来」。
        """
        self.assertEqual(MAX_CHARS, {})


# 回退后的接口块是自由格式(见 prompts/theme.md 的「接口注释」),不再有八节结构。
IFACE_OK = ("/* ==== INTERFACE ====\n"
            "   token    --model #2457A6   当前模型算出的值\n"
            "   版式     .focus            单焦点构图\n"
            "   组件     .panel            读数与控件容器\n"
            "   ==== /INTERFACE ==== */\n")


class AntiSlopWiringTests(unittest.TestCase):
    """三份去 AI 味清单各挂各的层,**一条禁令只加载一次**。"""

    def test_theme_bans_are_not_sent_to_the_builder(self) -> None:
        """配色清单不许混进 builder 的 system 块。

        那个块每页每步重发。把配色禁令塞进去,是让 21 个 agent 反复读一份
        它们无权执行的规则 —— 页面只能消费主题给的 token,改不了调色板。
        这条测试守的是「别哪天顺手加进 ANTI_SLOP_FILES」。
        """
        names = [f for _, f in skills.ANTI_SLOP_FILES]
        self.assertNotIn("scrub-theme-slop.md", names)
        # **判内容,不判文件名。** 第一版断言 "scrub-theme-slop" 不出现在 builder 块里,
        # 结果被自己的指路行绊倒 —— `scrub-visual-slop.md` 里那句「迁到
        # scrub-theme-slop.md §5」是**故意留的**、也是对的。要判的是正文有没有被搬过去。
        builder_block = skills.anti_slop_block(skills.WORKFLOWS)
        self.assertNotIn("<anti_ai_slop_theme>", builder_block)
        self.assertNotIn("isCreamColor", builder_block)   # theme 那份独有的判据

    def test_theme_bans_reach_the_theme_step(self) -> None:
        block = skills.theme_slop_block(skills.WORKFLOWS)
        self.assertIn("<anti_ai_slop_theme>", block)
        self.assertIn("cream", block.lower())

    def test_missing_file_is_loud(self) -> None:
        """路径给错要报错,不能静默返回空 —— 那样会让人以为注入了其实没有。"""
        with self.assertRaises(FileNotFoundError):
            skills.theme_slop_block(ROOT / "nowhere")

    def test_a_rule_lives_in_exactly_one_list(self) -> None:
        """渐变标题和彩色发光已迁到 theme 层,页面层只留指路、不留副本。

        同一条禁令两处各有一份,改一处就漂一处 —— 这条流水线上已经栽过四次。
        """
        visual = (skills.WORKFLOWS / "scrub-visual-slop.md").read_text(encoding="utf-8")
        theme = (skills.WORKFLOWS / "scrub-theme-slop.md").read_text(encoding="utf-8")
        self.assertIn("background-clip", theme)          # 正本在 theme 层
        self.assertIn("scrub-theme-slop.md", visual)     # 页面层只留指路


class ValidatorTests(unittest.TestCase):
    @staticmethod
    def _css(stage: str, iface: str = IFACE_OK) -> str:
        rest = "".join(f".x{i}{{color:var(--text);}}" for i in range(8))
        return iface + stage + rest

    STAGE_OK = (":root{--pad-x:56px;--pad-y:28px;}"
                "#stage{display:flex;flex-direction:column;"
                "padding:var(--pad-y) var(--pad-x);}")

    def test_css_requires_shared_stage_padding(self) -> None:
        self.assertEqual(_valid_css(self._css(self.STAGE_OK)), "")

        bad = self._css("#stage{display:flex;flex-direction:column;}")
        self.assertIn("padding", _valid_css(bad))

# `PageTableLayoutTests` / `VisualWorldGateTests` / `SpecGateTests` 2026-08-28 删除。
# 三组断言的对象分别是 PLAN.md 的九列页表、PLAN.md §0.5 视觉世界、逐页 pNN.md 的
# 小节格式 —— planner 塌缩成一次调用之后这三样都不存在了。测试要跟着被测对象走,
# 留着只会变成断言一个不再发生的形状。



class _FakeCall:
    """伪造一次 `Write` 的 function_call —— 形状照 core/builder.py 里真实用到的那几个字段。"""

    def __init__(self, path, content, name="Write"):
        import json as _j
        self.name = name
        self.arguments = _j.dumps({"file_path": str(path), "content": content})


class _FakeRun:
    def __init__(self, root):
        from pathlib import Path as _P
        self.root = _P(root)
        self.pages = self.root / "pages"
        self.assets = self.pages / "assets"


CSS_OK = (":root{--pad-x:56px;--pad-y:28px;}"
          "#stage{display:flex;flex-direction:column;padding:var(--pad-y) var(--pad-x);}"
          + "".join(f".x{i}{{color:red;}}" for i in range(8)))
PAGES_OK = "本套无需图池\n\n" + "\n\n".join(
    f"# page-{i:02d}\n第{i}页要让读者看见的东西。" + "具体内容。" * 20 for i in range(1, 6))


class DeckWriteTests(unittest.TestCase):
    """产物由模型用 `Write` 工具直接写。

    **这一整组替换了原来的 `DeckSegmentTests`(分隔行 + 从散文里抠)。**
    换掉的理由是量出来的:那条路上 CSS 首行残留一个 markdown 围栏,
    浏览器把它连同 `:root` 一起丢弃,20 页全部无样式渲染而所有判据报绿。
    走工具之后内容是 JSON 字符串字段 —— 没有围栏可言,也就没有这一类 bug。
    """

    def test_two_writes_land_verbatim(self) -> None:
        """**逐字节落盘,不做任何剥离** —— 这正是走工具要换来的那件事。"""
        with tempfile.TemporaryDirectory() as td:
            run = _FakeRun(td)
            got, refused = take_writes([
                _FakeCall(run.root / "pages/assets/theme.css", CSS_OK),
                _FakeCall(run.root / "pages/plan/pages.md", PAGES_OK)], run)
            self.assertEqual(refused, [])
            self.assertEqual(got["theme.css"], CSS_OK)     # 逐字节
            self.assertEqual(got["pages.md"], PAGES_OK)

    def test_writes_outside_the_allowlist_are_refused(self) -> None:
        """`tools.run` 的 Write 会写任意绝对路径 —— 不限死就等于把 run 目录以外
        也交给模型。白名单是硬拦,不是建议。"""
        with tempfile.TemporaryDirectory() as td:
            run = _FakeRun(td)
            got, refused = take_writes([
                _FakeCall("/tmp/somewhere-else.css", CSS_OK),
                _FakeCall(run.root / "pages/plan/pages.md", PAGES_OK)], run)
            self.assertNotIn("theme.css", got)
            self.assertIn("pages.md", got)
            self.assertTrue(any("不许写" in r for r in refused))

    def test_a_non_write_tool_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            run = _FakeRun(td)
            _, refused = take_writes([_FakeCall("/x", "y", name="Read")], run)
            self.assertTrue(any("不该调" in r for r in refused))

    def test_truncated_arguments_do_not_crash(self) -> None:
        """参数被截断 = JSON 不合法。要记成拒绝原因让上层重试,不能抛出去。"""
        class Broken:
            name = "Write"
            arguments = '{"file_path": "/x", "content": "半句'
        with tempfile.TemporaryDirectory() as td:
            got, refused = take_writes([Broken()], _FakeRun(td))
            self.assertEqual(got, {})
            self.assertTrue(any("截断" in r for r in refused))

    def test_pages_split_by_number_not_position(self) -> None:
        """乱序输出必须按页号落位 —— 按位置对齐会把 p05 的正文存进 p03.md,
        而两份都「看起来正常」,没有任何下游闸能发现。"""
        doc = "\n\n".join(f"# page-{i:02d}\n第{i}页。" + "内容。" * 20
                          for i in (5, 1, 3, 2, 4))
        pages = split_pages(doc)
        self.assertEqual(sorted(pages), ["01", "02", "03", "04", "05"])
        self.assertIn("第3页", pages["03"])

    def test_pages_gate_names_the_missing_page(self) -> None:
        gap = "\n\n".join(f"# page-{i:02d}\n第{i}页。" + "内容。" * 20
                          for i in (1, 2, 4, 5))
        self.assertIn("page-03", _valid_pages(gap))
        self.assertEqual(_valid_pages(PAGES_OK), "")

    def test_fenced_css_is_still_rejected_as_a_backstop(self) -> None:
        """走工具之后围栏不该再出现;这条留着当兜底 —— 真触发就说明模型把围栏
        写进了字符串里,那是另一回事,值得知道。代价记在 _valid_css 里。"""
        self.assertIn("围栏", _valid_css("```css\n" + CSS_OK + "\n```"))
        self.assertEqual(_valid_css(CSS_OK), "")


if __name__ == "__main__":
    unittest.main()
