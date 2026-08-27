#!/usr/bin/env python3
"""Prompt contracts and the small deterministic validators around them."""

from __future__ import annotations

import contextlib
import io
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.artifacts import parse_table  # noqa: E402
from core.llm import fill  # noqa: E402
from core import skills  # noqa: E402
from core.planner import (IFACE_SECTIONS, MAX_CHARS, _chassis_names,  # noqa: E402
                          _valid_css, _valid_spec, check_visual_world)


# 每份提示词的字符数上限。**只降不升** —— 这一栏在 2026-08-26 精简 contract/brief/spec
# 之后重定过一次,同时修掉一个一直存在的错:原来的数(brief 1457 / contract 5646 / spec 11150)
# 是按 `wc -c` 的**字节**定的,而这道闸比的是 `len(text)` 的**字符**。中文 3 字节/字,
# 于是上限一直比本意宽了约一倍 —— 契约实际 1,998 字符却挂着 5,646 的天花板,
# 这道闸事实上从没拦过任何东西。现在按真实字符数 + 约 10% 余量重定。
BASELINE_CHARS = {
    "brief": 700,
    "contract": 2200,
    "philosophy": 2100,
    "plan": 3200,
    "spec": 3000,
    # theme 里内联了 plan-direction 全文(约 14.7KB) —— 见 skills.direction_block。
    # 这不是模板变啰嗦,是把一份此前到不了任何地方的视觉指导接进了流水线。
    #
    # 3200 → 9000。**这一栏"只降不升",这是唯一一次破例,理由要留在这里。**
    # 涨的部分是接口块八节的格式说明加一份完整样例,而样例正是这次改动的载体:
    # 交付物的详细程度只能靠样例带,写「要详细」不产生任何约束(`planner.py:376`
    # 那条「可算的约束会被贴边满足」的另一面 —— 不可算的形容词干脆不起作用)。
    # 而且这一份提示词只发一次;真正按页复制的是 brief 和 contract,那两条没动。
    "theme": 9000,
}

PROMPT_ARGS = {
    "brief": dict(query="Q", pid="page-01", assets="/tmp/assets",
                  contract="/tmp/CONTRACT.md", total=12, spec="/tmp/p01.md",
                  assignment="## 主工作流\n  - build-page", stay="60 秒"),
    "contract": dict(n_pages=12, minutes=30, audience="高中生", scenario="课堂投影",
                     spine="主线", world="视觉世界", canvas_w=1600, canvas_h=900,
                     libs="库清单", font_floor="字号地板"),
    "philosophy": {},
    "plan": dict(query="Q", minutes=30, audience="高中生", scenario="课堂投影",
                 libs="库清单"),
    "spec": dict(act="I", query="Q", minutes=30, audience="高中生",
                 scenario="课堂投影", deck="deck", img_pool="图池",
                 theme_api="theme API", rows_block="页表行",
                 workflows="workflow 清单"),
    "theme": dict(n_pages=12, world="视觉世界", audience="高中生", scenario="课堂投影",
                  layouts="focus\nsplit-lr", img_pool="无", canvas_w=1600, canvas_h=900,
                  font_floor="字号地板", direction="(视觉方向)",
                  query="Q", spine="(主线)", theme_bans="(配色禁令)"),
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


IFACE_OK = ("/* ==== INTERFACE ====\n"
            + "".join(f"\n## {x}\n\n占位正文。\n" for x in IFACE_SECTIONS[:-3])
            + "\n## 类名录\n\n"
            + "".join(f"`.x{i}`  —— 用途｜什么时候拿｜和谁组合\n" for i in range(8))
            + "\n## 不许\n\n不要加投影。这套系统的纵深来自留白。\n"
            + "\n## 加新东西时\n\n任何新容器都是 `.panel`,不要新建卡片类。\n"
            + "\n==== /INTERFACE ==== */\n")


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

    def test_css_requires_an_interface_block(self) -> None:
        """接口块是 theme.css 到建页 agent 的唯一通道 —— 缺了它 21 页各自发明。"""
        self.assertIn("INTERFACE", _valid_css(self._css(self.STAGE_OK, iface="")))

    def test_css_requires_every_interface_section(self) -> None:
        """八节缺一节,下游就少一整类判断依据。逐节挖掉,每一节都要被点名。"""
        for section in IFACE_SECTIONS:
            with self.subTest(section=section):
                holed = IFACE_OK.replace(f"## {section}\n", "## 别的\n", 1)
                bad = _valid_css(self._css(self.STAGE_OK, iface=holed))
                self.assertIn(section, bad)

    def test_css_gate_does_not_count_entries(self) -> None:
        """闸只判小节在不在,**不判每节写了几条**。

        两个理由,都是踩出来的:「可算的约束会被贴边满足」(planner.py:376),
        以及 `cached()` 重试时原样重发同一个提示词 —— 拦住了模型也收不到反馈,
        三次做不到同一件事整轮就死了。
        """
        thin = IFACE_OK.replace("不要加投影。这套系统的纵深来自留白。", "无。")
        self.assertEqual(_valid_css(self._css(self.STAGE_OK, iface=thin)), "")

    def test_chassis_names_only_scrapes_the_catalog_section(self) -> None:
        """块从 1,929 涨到一万多字符之后大半是散文,原来那句全块扫描会把
        `assets/theme.css` 刮成一个叫 `.css` 的类,名录覆盖率这个读数就被虚高地污染。
        """
        block = ("\n## 视觉论点\n\n参见 `assets/theme.css` 和 `pages/plan/p01.md`。\n"
                 "\n## 类名录\n\n`.panel`  容器\n`.legend > .li > .sw`  图例\n")
        got = _chassis_names(block)
        self.assertEqual(got, ("legend", "li", "panel", "sw"))
        self.assertNotIn("css", got)

    def test_chassis_names_falls_back_for_old_runs(self) -> None:
        """旧轮次的接口块没有「类名录」那一节,退回全块扫描,续跑不炸。"""
        self.assertEqual(_chassis_names("组件 .panel 读数容器"), ("panel",))


# §0.5 的新形状:声明视觉**要求**,不做视觉**决定**。
WORLD_OK = """## 0.5 视觉世界

- 现实参照：工程实验记录本。
- 必须靠形状区分的概念对：
  观察量 / 可调量 —— 一个是读数一个是能拖的，混起来读者不知道该动哪个
  前向传播 / 反向传播 —— 方向反了整个梯度就讲错了
  样本 / 模型 —— 这一课全程要分清哪个是给定的、哪个是学出来的
- 需要专属色的概念：
  模型当前产生的预测或前向信息
  此刻需要观察或操作的位置
- 母题：参数旋钮；样本卡到预测框的流向；损失坡面；更新前后的账页
- 否决方向：
  霓虹赛博大脑 —— 会把「学习」误导成神秘的类脑活动
  纯黑板粉笔推导 —— 暗示需要连续公式推导，这批受众没有微积分基础
"""


# `PageTableLayoutTests` / `VisualWorldGateTests` / `SpecGateTests` 2026-08-28 删除。
# 三组断言的对象分别是 PLAN.md 的九列页表、PLAN.md §0.5 视觉世界、逐页 pNN.md 的
# 小节格式 —— planner 塌缩成一次调用之后这三样都不存在了。测试要跟着被测对象走,
# 留着只会变成断言一个不再发生的形状。


if __name__ == "__main__":
    unittest.main()
