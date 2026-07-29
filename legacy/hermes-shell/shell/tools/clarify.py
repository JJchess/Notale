"""clarify —— 需求含糊/缺关键约束时向用户提问。经 ports.UserPort（可注入、可 replay）。"""

from __future__ import annotations

from typing import Any

from ...ports.interaction import UserPort
from ...ports.tool import ToolSpec


class ClarifyTool:
    def __init__(self, user: UserPort) -> None:
        self._user = user

    @property
    def spec(self) -> ToolSpec:
        return {
            "name": "clarify",
            "description": "需求含糊或缺关键约束（受众/篇幅/侧重/主题）时，向用户提一个澄清问题并取回答复。",
            "parameters": {
                "type": "object",
                "properties": {"question": {"type": "string", "description": "要问用户的问题"}},
                "required": ["question"],
            },
        }

    async def run(self, args: dict[str, Any]) -> str:
        q = str(args.get("question", "")).strip()
        if not q:
            return "ERROR: 缺 question"
        ans = await self._user.ask(q)
        return f"用户答复：{ans}"
