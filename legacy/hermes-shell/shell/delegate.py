"""delegate —— 上下文分区：把子任务派给隔离子代理并行跑，父只收各自的一句话汇报。

隔离 = 每个子代理全新对话、受限工具集、独立完成一个聚焦子任务；**父上下文只见汇报，不见子过程**。
硬黑名单（不可协商）：子代理拿不到 delegate（禁递归）、clarify（禁替用户拍板）、remember/propose_skill
（禁写共享记忆/技能）、cron。并发有界（utils.concurrency.pool），结果按 index 稳定合并。
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ..domain.context import LoopBudget
from ..domain.tool_loop import run_tool_loop
from ..ports.llm import ToolCallingLLM
from ..ports.tool import Tool, ToolSpec
from ..utils.concurrency import pool

DELEGATE_BLOCKED = frozenset({"delegate", "clarify", "remember", "propose_skill", "cron"})


def child_toolset(base_tools: dict[str, Tool]) -> dict[str, Tool]:
    """子代理工具集 = 父工具集去掉硬黑名单。纯函数、可直接断言。"""
    return {k: v for k, v in base_tools.items() if k not in DELEGATE_BLOCKED}


def _child_system(task: str) -> str:
    return (
        "你是一个**隔离子代理**：只完成下面这一个子任务，不与用户交互、不写共享记忆、不再派生子代理。"
        "完成后用一两句话**汇报结果**（父代理只看到你的汇报，看不到你的中间过程）。\n"
        f"子任务：{task}"
    )


async def run_delegated(
    llm: ToolCallingLLM,
    subtasks: list[str],
    *,
    base_tools: dict[str, Tool],
    budget: LoopBudget | None = None,
    concurrency: int = 4,
) -> list[str]:
    """并行跑各子任务，返回**按 index 对齐**的汇报字符串列表。"""
    budget = budget or LoopBudget()
    ctools = child_toolset(base_tools)

    async def worker(task: str, _i: int) -> str:
        msgs: list[dict[str, Any]] = [
            {"role": "system", "content": _child_system(task)},
            {"role": "user", "content": task},
        ]
        return await run_tool_loop(llm, msgs, ctools, max_rounds=budget.max_rounds, purpose="delegate")

    return await pool(list(subtasks), max(1, concurrency), worker)


class DelegateTool:
    def __init__(
        self,
        llm: ToolCallingLLM,
        base_tools: dict[str, Tool],
        *,
        budget: LoopBudget | None = None,
        concurrency: int = 4,
    ) -> None:
        self._llm = llm
        self._base_tools = base_tools  # 传活引用；调用时再过黑名单过滤
        self._budget = budget
        self._concurrency = concurrency

    @property
    def spec(self) -> ToolSpec:
        return {
            "name": "delegate",
            "description": (
                "把若干**独立**子任务派给隔离子代理并行完成（各自受限工具、全新上下文），"
                "只回每个子任务的一句话汇报。用于并行工作流（多视角规划/并行改多页等）。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "subtasks": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "彼此独立、可并行的子任务描述列表",
                    }
                },
                "required": ["subtasks"],
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        subtasks = [str(t) for t in (args.get("subtasks") or []) if str(t).strip()]
        if not subtasks:
            return "ERROR: 缺 subtasks"
        results = await run_delegated(
            self._llm, subtasks, base_tools=self._base_tools,
            budget=self._budget, concurrency=self._concurrency,
        )
        lines = [f"{i + 1}. {t} → {r}" for i, (t, r) in enumerate(zip(subtasks, results))]
        return "子任务汇报（父仅见汇报，不见子过程）：\n" + "\n".join(lines)
