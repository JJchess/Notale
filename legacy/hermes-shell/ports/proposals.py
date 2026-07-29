"""ProposalQueue 接缝：技能/契约自改动提案的**待审队列**。

支柱1 的地基：自演化只往这里 enqueue（等人工过 evolve 闸），**绝不自动写 skills/**。
真接缝（≥2 实现）：filesystem（results/proposals/）/ in-memory（测试）。
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ProposalQueue(Protocol):
    def enqueue(self, proposal: dict[str, Any]) -> str:
        """入队一个提案（status=pending），返回其确定性 id。不改 skills/。"""
        ...

    def pending(self) -> list[dict[str, Any]]:
        """列出全部待审提案。"""
        ...
