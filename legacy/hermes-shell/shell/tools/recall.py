"""recall —— 按主题从情景记忆（过往 deck 账本）召回相关历史，回摘要串。

组合：Recall 端口只给原始条目（I/O），domain.memory.select_recall 负责排序（保 adapters↔domain 独立）。
"""

from __future__ import annotations

from typing import Any

from ...domain.memory import select_recall
from ...ports.memory import Recall
from ...ports.tool import ToolSpec


class RecallTool:
    def __init__(self, recall: Recall) -> None:
        self._recall = recall

    @property
    def spec(self) -> ToolSpec:
        return {
            "name": "recall",
            "description": "按主题从过往做过的讲义里召回相关历史（供参考风格/避免重复），回摘要。",
            "parameters": {
                "type": "object",
                "properties": {"topic": {"type": "string"}},
                "required": ["topic"],
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        topic = str(args.get("topic", "")).strip()
        if not topic:
            return "ERROR: 缺 topic"
        hits = select_recall(self._recall.episodes(), topic)
        if not hits:
            return "（无相关历史讲义）"
        return "过往相关讲义：\n" + "\n".join(f"- {h}" for h in hits)
