"""有界并发池：对 items 跑 async worker，最多 n 个并行，保持结果顺序。对应旧 llm.mjs pool。"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import TypeVar

T = TypeVar("T")
R = TypeVar("R")


async def pool(items: list[T], n: int, worker: Callable[[T, int], Awaitable[R]]) -> list[R]:
    sem = asyncio.Semaphore(max(1, n))

    async def run(i: int, it: T) -> R:
        async with sem:
            return await worker(it, i)

    return await asyncio.gather(*(run(i, it) for i, it in enumerate(items)))
