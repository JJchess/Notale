"""会话末复盘 fork —— 与主外壳隔离的自演化环入口（P9）。

独立跑一个 run_tool_loop，工具白名单**只有** {remember, propose_skill}：低风险经验自动记；
可修缺陷提技能 delta 入待审队列。**只喂它分数+摘要，绝不喂评测器实现**（支柱4：评测器在环外、
对 proposer 隐藏；检测到刷分记为失败候选由 evolve.accept 处置）。
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from ..domain.context import LoopBudget
from ..domain.tool_loop import run_tool_loop
from ..ports.llm import ToolCallingLLM
from ..ports.memory import MemoryStore
from ..ports.proposals import ProposalQueue
from .tools.propose import ProposeSkillTool
from .tools.remember import RememberTool

REVIEW_SYSTEM = """你是**复盘子代理**（与主外壳隔离，只在会话末跑）。依据给你的会话摘要 + 评测分数
（**只给分数与 trace，不给评测器实现**），做两件事：
- 用 remember 记下可复用的讲者偏好 / 制作经验（低风险，写入下会话生效）。
- 若发现某类**反复出现、且属 harness 可修**的缺陷，用 propose_skill 提一个逐条 delta 的技能改动（只入队待人工审批，绝不自动改 skills/）。
纪律：不谎报改进；证据不足就不要提案；你只有 remember / propose_skill 两个工具。"""


@dataclass
class ReviewResult:
    final: str
    tool_sequence: list[str] = field(default_factory=list)


async def run_review(
    llm: ToolCallingLLM,
    *,
    digest: str,
    eval_scores: dict[str, Any],
    memory: MemoryStore,
    queue: ProposalQueue,
    budget: LoopBudget | None = None,
) -> ReviewResult:
    tools = {
        "remember": RememberTool(memory),
        "propose_skill": ProposeSkillTool(queue),
    }
    user = (
        f"会话摘要：\n{digest}\n\n"
        f"评测分数（只读结果，非评测器实现）：\n{json.dumps(eval_scores, ensure_ascii=False)}"
    )
    msgs: list[dict[str, Any]] = [
        {"role": "system", "content": REVIEW_SYSTEM},
        {"role": "user", "content": user},
    ]
    seq: list[str] = []
    on_round: Callable[[int, list[str]], None] = lambda _r, called: seq.extend(called)
    final = await run_tool_loop(
        llm, msgs, tools, max_rounds=(budget or LoopBudget()).max_rounds,
        purpose="review", on_round=on_round,
    )
    return ReviewResult(final=final, tool_sequence=seq)
