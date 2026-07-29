"""上下文工程纯函数：观测遮蔽 / 压缩 / 技能索引 / 预算判定。无 I/O，可纯测。

原则（ce-context-optimization）：deck 本体常驻 CorpusStore、不进窗口；工具只回摘要/引用；
旧观测按预算折叠（mask）；系统提示前缀缓存稳定（build_skill_index 顺序确定、无时间戳）。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .skills import SkillEntry, plan_menu


def mask(text: str, *, ref: str = "", keep: bool = False, limit: int = 600) -> str:
    """观测遮蔽：过长的旧观测折叠成一行引用，正文可经 view_* 取回。

    keep=True（最近一轮 / 活跃自修的错误）或短观测原样返回；否则折叠为
    `[Obs:{ref} 已折叠·N字·关键:…]`——省窗口、又留取回线索。纯函数、幂等。
    """
    if keep or len(text) <= limit:
        return text
    head = " ".join(text.split())[:140]
    return f"[Obs:{ref or '—'} 已折叠·{len(text)}字·关键:{head}… ·可 view_* 取回]"


@dataclass(frozen=True)
class LoopBudget:
    """外壳循环的有界预算（Hydra 常量，记进 ledger）。到顶即注入终结轮、收束。

    max_rounds 交给 tool_loop 计数；max_tool_calls / max_build_calls 由外壳累计（造 deck 贵，单独设限）。
    """

    max_rounds: int = 8
    max_tool_calls: int = 12
    max_build_calls: int = 2

    def stop_reason(self, *, rounds: int, tool_calls: int, build_calls: int) -> str | None:
        if rounds >= self.max_rounds:
            return f"已达轮次上限({self.max_rounds})"
        if tool_calls >= self.max_tool_calls:
            return f"已达工具调用上限({self.max_tool_calls})"
        if build_calls >= self.max_build_calls:
            return f"已达 make_lecture 次数上限({self.max_build_calls})"
        return None


def build_skill_index(registry: dict[str, SkillEntry]) -> str:
    """紧凑技能索引（家族+描述+可选类型），进系统提示。**顺序稳定、无时间戳** → 前缀缓存/replay 命中。

    渐进披露第一层：这里只给一行摘要，要看完整契约再调 skill_view。复用 plan_menu 的稳定分组。
    """
    return "\n".join(
        f"- {skill}（{', '.join(types)}）：{desc}" for skill, desc, types in plan_menu(registry)
    )


def estimate_tokens(msgs: list[dict[str, Any]] | str) -> int:
    """粗估 token（≈字符数/4）——只用于触发压缩判定，不需精确。"""
    if isinstance(msgs, str):
        return len(msgs) // 4
    return sum(len(str(m.get("content", ""))) for m in msgs) // 4


def compact_plan(
    msgs: list[dict[str, Any]], *, window: int = 128_000, threshold: float = 0.7, keep_last: int = 6
) -> dict[str, Any]:
    """压缩**策略**（纯函数）：判断是否该压 + 划分 fold/keep。真正的蒸馏（LLM 调用）留给外壳。

    因 deck 在 CorpusStore、可随时 re-view，这里只压对话历史，近乎无损。永不含系统提示（外壳不把它传进来）。
    """
    over = estimate_tokens(msgs) > window * threshold
    if not over or len(msgs) <= keep_last:
        return {"compact": False, "fold": [], "keep": list(msgs)}
    return {"compact": True, "fold": msgs[:-keep_last], "keep": msgs[-keep_last:]}
