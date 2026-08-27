#!/usr/bin/env python3
"""按幕分批展开规格的两个纯函数。

这两条是 `expand()` 的全部非 IO 逻辑,而它们出错的方式都**不会报错**:
分组错了只是批次大小变了,切分错了会把 p07 的正文存进 p05.md —— 两份都
「看起来正常」,没有任何下游闸能发现。所以单独钉住。
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.artifacts import Row  # noqa: E402
from core.planner import _group_acts, _split_specs  # noqa: E402


def _row(nn: str, act: str = "I") -> Row:
    return Row(pid=f"page-{nn}", stay=60, structure="comparison",
               interaction="无", claim="c", avoid="a", layout="focus", act=act)


class GroupActsTests(unittest.TestCase):
    def test_groups_by_contiguous_act(self) -> None:
        rows = ([_row("01", "I"), _row("02", "I"), _row("03", "II"),
                 _row("04", "II"), _row("05", "III")])
        got = _group_acts(rows)
        self.assertEqual([[r.nn for r in b] for b in got],
                         [["01", "02"], ["03", "04"], ["05"]])

    def test_oversized_act_is_split_at_the_cap(self) -> None:
        rows = [_row(f"{i:02d}", "I") for i in range(1, 12)]
        got = _group_acts(rows, cap=8)
        self.assertEqual([len(b) for b in got], [8, 3])
        # 切开之后仍然是连续的,不能打乱页序
        self.assertEqual([r.nn for b in got for r in b], [r.nn for r in rows])

    def test_missing_act_column_falls_back_to_fixed_chunks(self) -> None:
        """旧 PLAN.md 没有幕列。**绝不能退化成一个大批** —— 那正好是
        我们不要的一次性全出,失败半径重新变成整轮。"""
        rows = [_row(f"{i:02d}", "") for i in range(1, 15)]
        got = _group_acts(rows, blind=6)
        self.assertEqual([len(b) for b in got], [6, 6, 2])

    def test_empty_input(self) -> None:
        self.assertEqual(_group_acts([]), [])


class SplitSpecsTests(unittest.TestCase):
    def test_splits_in_order(self) -> None:
        text = ("# page-01 · 甲 · **60 秒**\n甲的正文\n\n"
                "# page-02 · 乙 · **75 秒**\n乙的正文\n")
        got = _split_specs(text, ["01", "02"])
        self.assertEqual(set(got), {"01", "02"})
        self.assertIn("甲的正文", got["01"])
        self.assertIn("乙的正文", got["02"])
        self.assertNotIn("乙", got["01"])

    def test_maps_by_page_number_not_position(self) -> None:
        """模型乱序输出时按位置对齐会把 p07 的正文存进 p05.md,
        而两份都「看起来正常」—— 没有下游闸能发现。"""
        text = ("# page-07 · 丙 · **60 秒**\n丙的正文\n\n"
                "# page-05 · 丁 · **60 秒**\n丁的正文\n")
        got = _split_specs(text, ["05", "07"])
        self.assertIn("丙的正文", got["07"])
        self.assertIn("丁的正文", got["05"])

    def test_drops_preamble_and_unwanted_pages(self) -> None:
        text = ("好的，下面是这一幕的规格：\n\n"
                "# page-01 · 甲 · **60 秒**\n甲的正文\n\n"
                "# page-99 · 不在这一批 · **60 秒**\n杂音\n")
        got = _split_specs(text, ["01"])
        self.assertEqual(set(got), {"01"})
        self.assertTrue(got["01"].startswith("# page-01"))
        self.assertNotIn("好的", got["01"])

    def test_duplicate_page_keeps_the_last_one(self) -> None:
        """沿用 `_extract_spec` 的经验:越靠后越可能是最终答案,
        前面那些是写废的草稿。"""
        text = ("# page-01 · 草稿 · **60 秒**\n废稿\n\n"
                "# page-01 · 定稿 · **60 秒**\n定稿正文\n")
        got = _split_specs(text, ["01"])
        self.assertIn("定稿正文", got["01"])
        self.assertNotIn("废稿", got["01"])

    def test_tolerates_a_markdown_fence(self) -> None:
        text = "```markdown\n# page-01 · 甲 · **60 秒**\n甲的正文\n```"
        got = _split_specs(text, ["01"])
        self.assertIn("甲的正文", got["01"])

    def test_missing_page_is_simply_absent(self) -> None:
        """缺页由调用方回落到单页展开,这里只如实报告缺了谁。"""
        text = "# page-01 · 甲 · **60 秒**\n甲的正文\n"
        got = _split_specs(text, ["01", "02"])
        self.assertEqual(set(got), {"01"})


if __name__ == "__main__":
    unittest.main()
