"""ScriptedUserPort —— 脚本化实现 ports.UserPort：按预置答案回，供 replay/测试确定性。

按问题精确匹配（answers dict），否则按顺序取（queue），都没有则回 fallback。记录 asked 便于断言。
"""

from __future__ import annotations

from collections import deque


class ScriptedUserPort:
    def __init__(
        self,
        answers: dict[str, str] | None = None,
        queue: list[str] | None = None,
        fallback: str = "",
    ) -> None:
        self._answers = answers or {}
        self._queue: deque[str] = deque(queue or [])
        self._fallback = fallback
        self.asked: list[str] = []

    async def ask(self, question: str) -> str:
        self.asked.append(question)
        if question in self._answers:
            return self._answers[question]
        if self._queue:
            return self._queue.popleft()
        return self._fallback
