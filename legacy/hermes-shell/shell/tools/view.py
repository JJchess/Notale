"""view_scene / view_block —— 按需从 CorpusStore 拉**单个** scene/block 进上下文。

这是"deck 不进窗口"的配套：正文常驻库里，模型要看哪一页/哪一块才拉哪一块，用完即老化。
"""

from __future__ import annotations

import json
from typing import Any

from ...ports.store import CorpusStore
from ...ports.tool import ToolSpec


def _dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2)


class ViewSceneTool:
    def __init__(self, store: CorpusStore) -> None:
        self._store = store

    @property
    def spec(self) -> ToolSpec:
        return {
            "name": "view_scene",
            "description": "拉取某份 deck 的第 index 页（单页 JSON）进上下文查看；不返回整档。",
            "parameters": {
                "type": "object",
                "properties": {
                    "deck_id": {"type": "string"},
                    "index": {"type": "integer", "description": "页序号，0 起"},
                },
                "required": ["deck_id", "index"],
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        try:
            doc = self._store.load_deck(str(args.get("deck_id")))
        except KeyError:
            return f"ERROR: 无此 deck '{args.get('deck_id')}'"
        scenes = doc.get("scenes", [])
        i = int(args.get("index", 0))
        if not (0 <= i < len(scenes)):
            return f"ERROR: index {i} 越界（共 {len(scenes)} 页）"
        return _dump(scenes[i])


class ViewBlockTool:
    def __init__(self, store: CorpusStore) -> None:
        self._store = store

    @property
    def spec(self) -> ToolSpec:
        return {
            "name": "view_block",
            "description": "按 block_id 拉取某份 deck 里的单个 block（JSON）进上下文查看。",
            "parameters": {
                "type": "object",
                "properties": {
                    "deck_id": {"type": "string"},
                    "block_id": {"type": "string"},
                },
                "required": ["deck_id", "block_id"],
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        try:
            doc = self._store.load_deck(str(args.get("deck_id")))
        except KeyError:
            return f"ERROR: 无此 deck '{args.get('deck_id')}'"
        bid = str(args.get("block_id"))
        for s in doc.get("scenes", []):
            for b in s.get("blocks") or []:
                if b.get("id") == bid:
                    return _dump(b)
        return f"ERROR: deck '{args.get('deck_id')}' 内无 block '{bid}'"
