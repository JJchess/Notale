"""专能 Hermes 外壳：有界 ReAct 主循环，复用 domain.tool_loop.run_tool_loop。

一轮会话 = 冻结记忆快照 → 拼前缀缓存稳定系统提示 → 跑工具循环（模型自主选 make_lecture/
view_*/evaluate/clarify…）→ 无 tool_use 自然收束。deck 全程在 CorpusStore、不进窗口。
只依赖 ports + domain（禁 adapters）——换 live/replay/fake 只改注入。
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from ..domain.context import LoopBudget, build_skill_index
from ..domain.skills import SkillEntry
from ..domain.tool_loop import run_tool_loop
from ..ports.llm import ToolCallingLLM
from ..ports.memory import MemoryStore
from ..ports.tool import Tool
from .prompt import build_system_prompt


@dataclass
class ShellResult:
    final: str
    tool_sequence: list[str] = field(default_factory=list)
    rounds: int = 0
    memory_snapshot: str = ""  # 冻结快照指纹（写进 ledger，见 schema.ExperimentRecord）


async def run_shell(
    llm: ToolCallingLLM,
    *,
    user_request: str,
    tools: dict[str, Tool],
    registry: dict[str, SkillEntry],
    memory: MemoryStore,
    budget: LoopBudget | None = None,
    on_round: Callable[[int, list[str]], None] | None = None,
    log: Callable[[str], None] = lambda _m: None,
) -> ShellResult:
    budget = budget or LoopBudget()
    snap = memory.load_snapshot()  # 会话开始冻结一次；后续 remember 写穿透只下会话生效
    system = build_system_prompt(
        snapshot=snap, skill_index=build_skill_index(registry), tool_names=list(tools)
    )
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_request},
    ]

    seq: list[str] = []
    rounds = 0

    def _on_round(rnd: int, called: list[str]) -> None:
        nonlocal rounds
        rounds = rnd + 1
        seq.extend(called)
        log(f"[shell] 第 {rnd + 1} 轮: {', '.join(called)}")
        if on_round is not None:
            on_round(rnd, called)

    final = await run_tool_loop(
        llm, messages, tools, max_rounds=budget.max_rounds, purpose="shell", on_round=_on_round
    )
    return ShellResult(final=final, tool_sequence=seq, rounds=rounds, memory_snapshot=snap.version)
