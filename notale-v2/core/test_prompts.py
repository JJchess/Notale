#!/usr/bin/env python3
"""Prompt contracts and the small deterministic validators around them."""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.artifacts import parse_table  # noqa: E402
from core.llm import fill  # noqa: E402
from core.planner import MAX_CHARS, _valid_css, _valid_spec  # noqa: E402
import plan_quality  # noqa: E402


# 每份提示词的字符数上限。**只降不升** —— 这一栏在 2026-08-26 精简 contract/brief/spec
# 之后重定过一次,同时修掉一个一直存在的错:原来的数(brief 1457 / contract 5646 / spec 11150)
# 是按 `wc -c` 的**字节**定的,而这道闸比的是 `len(text)` 的**字符**。中文 3 字节/字,
# 于是上限一直比本意宽了约一倍 —— 契约实际 1,998 字符却挂着 5,646 的天花板,
# 这道闸事实上从没拦过任何东西。现在按真实字符数 + 约 10% 余量重定。
BASELINE_CHARS = {
    "brief": 700,
    "contract": 2200,
    "lec": 700,
    "philosophy": 2100,
    "plan": 3200,
    "spec": 3000,
    "theme": 3200,
}

PROMPT_ARGS = {
    "brief": dict(query="Q", pid="page-01", assets="/tmp/assets",
                  contract="/tmp/CONTRACT.md", total=12, spec="/tmp/p01.md",
                  assignment="## 主工作流\n  - build-page", stay="60 秒"),
    "contract": dict(n_pages=12, minutes=30, audience="高中生", scenario="课堂投影",
                     spine="主线", world="视觉世界", canvas_w=1600, canvas_h=900,
                     libs="库清单", lec_api="Lec API"),
    "lec": dict(query="Q"),
    "philosophy": {},
    "plan": dict(query="Q", minutes=30, audience="高中生", scenario="课堂投影",
                 libs="库清单", lec_api="Lec API"),
    "spec": dict(num=1, nn="01", query="Q", minutes=30, audience="高中生",
                 scenario="课堂投影", layout="focus", deck="deck", img_pool="图池",
                 theme_api="theme API", row="页表行", lec_api="Lec API",
                 lec_values="K 值", stay="60", structure="comparison",
                 workflows="workflow 清单"),
    "theme": dict(n_pages=12, world="视觉世界", audience="高中生", scenario="课堂投影",
                  layouts="focus\nsplit-lr", img_pool="无", canvas_w=1600, canvas_h=900),
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


class PageTableLayoutTests(unittest.TestCase):
    def test_layout_is_a_first_class_column(self) -> None:
        text = """# demo
## 1. 页表
| # | 幕 | 证据 | 停留 | 知识结构 | 版式 | 交互 | 一句话 | 不许碰 |
|---|---|---|---|---|---|---|---|---|
| 01 | I | E1 | 60 | comparison | split-lr | 拖游标 | 同尺度比较 | 不讲机制（p02） |
## 2. 后续
"""
        rows = parse_table(text)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].layout, "split-lr")
        self.assertIn("| comparison | split-lr | 拖游标 |", rows[0].raw)
        self.assertNotIn("版式", rows[0].missing())

    def test_legacy_table_parses_but_reports_missing_layout(self) -> None:
        text = """## 1. 页表
| # | 停留 | 知识结构 | 交互 | 一句话 | 不许碰 |
|---|---|---|---|---|---|
| 01 | 60 | comparison | 无 | 同尺度比较 | 不讲机制（p02） |
"""
        rows = parse_table(text)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].layout, "")
        self.assertIn("版式", rows[0].missing())


class ValidatorTests(unittest.TestCase):
    @staticmethod
    def _css(stage: str) -> str:
        rest = "".join(f".x{i}{{color:var(--text);}}" for i in range(8))
        return stage + rest

    def test_css_requires_shared_stage_padding(self) -> None:
        good = self._css(
            ":root{--pad-x:56px;--pad-y:28px;}"
            "#stage{display:flex;flex-direction:column;"
            "padding:var(--pad-y) var(--pad-x);}")
        self.assertEqual(_valid_css(good), "")

        bad = self._css("#stage{display:flex;flex-direction:column;}")
        self.assertIn("padding", _valid_css(bad))

    @staticmethod
    def _spec(extra: str = "") -> str:
        return """# page-01 · 对照 · **60 秒**

## 照这个写
| 元素 | 文字 |
|---|---|
| kicker | TEST |
| 主标题 | 两个对象必须共用尺度 |
| 收束句 | 基线相同，差异才有意义。 |
| 下一问 | 差异从哪里来？ |

## 知识结构：comparison
同一维度必须同行并共享一根基线。使用 `.k-comparison` 显示对应关系，禁止拆成独立卡片。

## 表征形式
静态 SVG 对照，不需要第三方库；两组标记按同一线性比例尺定位。

## 两项对照
| 对象 | 数值 | 单位 |
|---|---:|---|
| A | 12 | m |
| B | 18 | m |

## 主工作流
build-page ← 主要难点是把比较关系组织成清楚的单页构图

## 不许碰
不解释差异机制；机制留给 p02。
""" + extra + ("补充说明。" * 30)

    def test_spec_contract_gate(self) -> None:
        self.assertEqual(_valid_spec(self._spec(), chassis=("k-comparison",)), "")

    def test_spec_requires_exactly_one_known_workflow(self) -> None:
        missing = self._spec().replace(
            "\n## 主工作流\nbuild-page ← 主要难点是把比较关系组织成清楚的单页构图\n", "\n")
        self.assertIn("主工作流", _valid_spec(missing))

        multiple = self._spec().replace(
            "build-page ← 主要难点是把比较关系组织成清楚的单页构图",
            "build-page ← 构图\nbuild-chart ← 图表")
        self.assertIn("只能有一行", _valid_spec(multiple))

        unknown = self._spec().replace("build-page ←", "not-a-workflow ←")
        self.assertIn("未知主工作流", _valid_spec(unknown))

    def test_pointer_cells_are_not_gated_at_all(self) -> None:
        """指针格这条闸整条删了 —— 当场退回、事后硬判、报表行,三处都没有了。

        判据有假阳性:`| loss(w₁) | 对两样本的 `Lec.P.bce` 取平均 |` 是合法写法
        (loss 是函数不是常量,采样值在下一张核对表里,而写公式入口正是
        `spec.md` 明文要求的),和真缺陷「值列里塞指针」在表格几何上分不开。
        要求本身留在 `spec.md` 正文里,靠提示词说,不靠闸判。
        """
        with_pointer = self._spec("\n| C | `Lec.K.values` 中对应条目 | m |\n")
        self.assertEqual(_valid_spec(with_pointer, chassis=("k-comparison",)), "")
        self.assertFalse(hasattr(plan_quality, "PTR"))

    def test_only_deterministic_quality_checks_block(self) -> None:
        self.assertEqual({name for name, *_ in plan_quality.HARD},
                         {"#stage 有 padding"})


if __name__ == "__main__":
    unittest.main()
