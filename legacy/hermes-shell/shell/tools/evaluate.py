"""evaluate —— 对某份 deck 跑确定性完整性门（零 LLM），返回摘要。

复用 domain.evaluation.gate（截断/占位、hero 跑题、页数遵循）。这是外壳的"体检"工具：
先跑确定性门抓最贵的共性缺陷；评委式打分（走 LLM）留待后续。
"""

from __future__ import annotations

from typing import Any

from ...domain.evaluation import gate
from ...ports.store import CorpusStore
from ...ports.tool import ToolSpec


class EvaluateTool:
    def __init__(self, store: CorpusStore) -> None:
        self._store = store

    @property
    def spec(self) -> ToolSpec:
        return {
            "name": "evaluate",
            "description": "对某份 deck 跑确定性完整性门（截断/占位、hero 跑题、页数遵循），返回摘要。",
            "parameters": {
                "type": "object",
                "properties": {
                    "deck_id": {"type": "string"},
                    "topic": {"type": "string"},
                    "target_pages": {"type": "integer"},
                },
                "required": ["deck_id", "topic"],
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        try:
            doc = self._store.load_deck(str(args.get("deck_id")))
        except KeyError:
            return f"ERROR: 无此 deck '{args.get('deck_id')}'"
        target = int(args.get("target_pages") or len(doc.get("scenes", [])))
        rep = gate(doc, topic=str(args.get("topic", "")), target_pages=target)
        verdict = "PASS ✓" if rep["pass"] else "FAIL ✗"
        trunc, off = rep["truncation"], rep["hero_offtopic"]
        parts = [
            f"{verdict} · {rep['pages']}页(目标差{rep['page_delta']})",
            f"截断/占位 {len(trunc)} 处" + (f"：{trunc[0]}" if trunc else ""),
            f"hero 跑题 {len(off)} 处" + (f"：{off[0]}" if off else ""),
        ]
        return " · ".join(parts)
