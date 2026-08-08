"""时长→页数→密度模型 v0（ROADMAP 问题 2 第一交付物的占位实现）。

权重来自 ROADMAP：开场 ~0.5min / 讲解 1.5–2 / 交互 sim 3–4 / 小结 ~1；60min ≈ 30–40 页 ≈ 6–8 章。
⚠️ 这是手工先验，**待 eval/gold/ 金样本拟合替换**——所有消费方只调函数，不硬编码数字。
"""

from __future__ import annotations

from notale.core.models import PageType

# 各页型的分钟成本（讲授时长的一等公民：交互组件有自己的时间成本）
PAGE_TYPE_MINUTES: dict[PageType, float] = {
    PageType.SECTION_BREAK: 0.5,
    PageType.NARRATIVE_SCENE: 1.5,
    PageType.WORKED_EXAMPLE: 2.0,
    PageType.FORMULA_DERIVATION: 2.0,
    PageType.CODE_RUNNABLE: 2.5,
    PageType.QUIZ_CHECK: 1.5,
    PageType.SIM_EXPLORABLE: 3.5,
}


def page_count(duration_min: int) -> tuple[int, int]:
    """时长 → 页数区间。60min → (30, 40)；10min → (5, 7)；25min → (13, 17)。"""
    lo = max(3, round(duration_min * 0.5))
    hi = max(lo + 1, round(duration_min * 0.65))
    return lo, min(hi, 80)


def chapter_count(duration_min: int) -> int:
    lo, hi = page_count(duration_min)
    return max(2, min(10, round((lo + hi) / 2 / 5)))


def time_budget_sec(page_type: PageType, scale: float = 1.0) -> int:
    """页型 → 每页时间预算（秒）。scale 用于总时长与预算对齐时整体缩放。"""
    return round(PAGE_TYPE_MINUTES[page_type] * 60 * scale)
