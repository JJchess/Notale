"""render —— 对某份 deck 跑渲染验证（经 ports.RenderVerifier），返回报告摘要（不回 HTML/DOM）。

注入哪种 verifier 决定验证强度：当前只有 StructuralVerifier（无浏览器，吃 deck JSON）。
工具只认 ports.RenderVerifier 接口——将来加真机 verifier 换实现即可，不动本文件。
"""

from __future__ import annotations

import json
from typing import Any

from ...ports.renderer import RenderVerifier
from ...ports.store import CorpusStore
from ...ports.tool import ToolSpec


class RenderTool:
    def __init__(self, store: CorpusStore, verifier: RenderVerifier) -> None:
        self._store, self._verifier = store, verifier

    @property
    def spec(self) -> ToolSpec:
        return {
            "name": "render",
            "description": "对某份 deck 跑渲染验证（结构/控制台/溢出），返回报告摘要；不返回 HTML。",
            "parameters": {
                "type": "object",
                "properties": {"deck_id": {"type": "string"}},
                "required": ["deck_id"],
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        did = str(args.get("deck_id"))
        try:
            doc = self._store.load_deck(did)
        except KeyError:
            return f"ERROR: 无此 deck '{did}'"
        rep = await self._verifier.verify(json.dumps(doc, ensure_ascii=False))
        verdict = "OK ✓" if rep.ok else "FAIL ✗"
        parts = [f"{verdict} · 错误 {len(rep.errors)} · 警告 {len(rep.warnings)}"]
        if rep.errors:
            parts.append("首个错误：" + rep.errors[0])
        return " · ".join(parts)
