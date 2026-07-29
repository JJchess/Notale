"""CliUserPort —— 交互式实现 ports.UserPort：终端里向用户提问、读回一行。

input() 是阻塞的，放进线程池以免卡住事件循环。
"""

from __future__ import annotations

import asyncio


class CliUserPort:
    async def ask(self, question: str) -> str:
        def _prompt() -> str:
            return input(f"\n[需要澄清] {question}\n> ")

        return (await asyncio.to_thread(_prompt)).strip()
