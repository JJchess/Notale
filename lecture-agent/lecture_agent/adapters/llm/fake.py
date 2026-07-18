"""FakeClient —— 测试用 in-memory LLMClient + ToolCallingLLM。按顺序/purpose 返回罐装响应，不联网。

证明 domain/agent 只依赖 ports：单测传它即可端到端跑（含 tool-loop），无需真 key、无需 fixtures。
"""

from __future__ import annotations

from collections import deque
from typing import Any

from ...ports.llm import Message, Turn


class FakeClient:
    def __init__(
        self,
        queue: list[str] | None = None,
        by_purpose: dict[str, str] | None = None,
        default: str = "{}",
        tool_turns: list[Turn] | None = None,
    ) -> None:
        self._queue: deque[str] = deque(queue or [])
        self._by_purpose = by_purpose or {}
        self._default = default
        self._tool_turns: deque[Turn] = deque(tool_turns or [])
        self.calls: list[tuple[str, list[Message]]] = []
        self.tool_calls: list[tuple[str, list[dict[str, Any]]]] = []

    async def complete(
        self, messages: list[Message], *, json_mode: bool = True, purpose: str = "chat"
    ) -> str:
        self.calls.append((purpose, messages))
        if purpose in self._by_purpose:
            return self._by_purpose[purpose]
        if self._queue:
            return self._queue.popleft()
        return self._default

    async def complete_tools(
        self, messages: list[dict[str, Any]], tools: list[Any], *, purpose: str = "tools"
    ) -> Turn:
        self.tool_calls.append((purpose, messages))
        if self._tool_turns:
            return self._tool_turns.popleft()
        return Turn(content=self._default)
