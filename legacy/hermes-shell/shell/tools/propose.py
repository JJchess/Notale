"""propose_skill —— 提一个技能/契约的**逐条 delta** 改动，入待审队列（绝不自动改 skills/）。

高风险写入的唯一出口：走 ProposalQueue → 人工过 evolve 闸（支柱1）。技能改动必须是逐条 delta
（禁整档重写，支柱6）——本工具只收 deltas 列表，不收整份契约文本。
"""

from __future__ import annotations

from typing import Any

from ...ports.proposals import ProposalQueue
from ...ports.tool import ToolSpec


class ProposeSkillTool:
    def __init__(self, queue: ProposalQueue) -> None:
        self._queue = queue

    @property
    def spec(self) -> ToolSpec:
        return {
            "name": "propose_skill",
            "description": (
                "提议新增/改动一个内容组件技能（逐条 delta）。**只入待审队列**，不会自动改 skills/，"
                "须人工过闸。用于把反复出现的可修缺陷沉淀成技能改进。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": ["new-skill", "patch-contract"]},
                    "skill": {"type": "string", "description": "目标技能家族名"},
                    "target_type": {"type": "string", "description": "patch 时的目标 block 类型"},
                    "deltas": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": "逐条改动 [{op:set/append/remove, key, value}]",
                    },
                    "rationale": {"type": "string", "description": "为什么改 + 预期效果 + 回退风险"},
                    "targeted_pattern": {"type": "string", "description": "针对的失败模式"},
                },
                "required": ["kind", "skill", "rationale"],
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        proposal = {
            "kind": str(args.get("kind", "patch-contract")),
            "skill": str(args.get("skill", "")),
            "target_type": str(args.get("target_type", "")),
            "deltas": list(args.get("deltas") or []),
            "rationale": str(args.get("rationale", "")),
            "audit": {"targeted_pattern": str(args.get("targeted_pattern", ""))},
        }
        pid = self._queue.enqueue(proposal)
        return f"技能提案已入队待人工审批：{pid}（绝不自动改 skills/，须人过 evolve 闸）"
