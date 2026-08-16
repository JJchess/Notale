"""Reliable, bounded execution for the local Node.js validation process."""

from __future__ import annotations

import asyncio
import weakref
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from notale.utils.config import get_config


_CONFIG = get_config()
_NODE_SLOTS: weakref.WeakKeyDictionary[
    asyncio.AbstractEventLoop, asyncio.Semaphore
] = weakref.WeakKeyDictionary()


class NodeProcessTimeout(RuntimeError):
    """Raised when Node remains unavailable after local infrastructure retries."""


@dataclass(frozen=True)
class NodeResult:
    returncode: int
    stdout: bytes
    stderr: bytes
    attempts: int


def _limiter() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    limiter = _NODE_SLOTS.get(loop)
    if limiter is None:
        limiter = asyncio.Semaphore(_CONFIG.tools.node_process_concurrency)
        _NODE_SLOTS[loop] = limiter
    return limiter


async def run_node(
    arguments: Sequence[str],
    *,
    cwd: Path | None = None,
    timeout_sec: float,
) -> NodeResult:
    """Run Node with bounded concurrency and one local retry on infrastructure timeout."""
    attempts = _CONFIG.tools.node_timeout_retries + 1
    async with _limiter():
        for attempt in range(1, attempts + 1):
            process = await asyncio.create_subprocess_exec(
                "node",
                *arguments,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(), timeout=timeout_sec
                )
            except TimeoutError:
                process.kill()
                try:
                    await asyncio.wait_for(process.communicate(), timeout=1)
                except TimeoutError:
                    pass
                continue
            return NodeResult(
                returncode=process.returncode or 0,
                stdout=stdout,
                stderr=stderr,
                attempts=attempt,
            )
    raise NodeProcessTimeout(
        f"Node process timed out after {attempts} local attempt(s)"
    )
