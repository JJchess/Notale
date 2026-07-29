"""cron 的 I/O 侧：JobStore（jobs.json 读写）+ run_job（no-agent 走子进程；agent 走注入的 runner）。

run_job 不 import agent/app——agent 路的执行器由上层（app/scripts）作为回调注入，保持 adapters 层干净。
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

AgentRunner = Callable[[str], Awaitable[str]]


class JobStore:
    def __init__(self, path: str | Path = "results/cron/jobs.json") -> None:
        self.path = Path(path)

    def load(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        return list(json.loads(self.path.read_text(encoding="utf-8")))

    def save(self, jobs: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(jobs, ensure_ascii=False, indent=2), encoding="utf-8")


async def run_job(job: dict[str, Any], *, agent_runner: AgentRunner | None = None) -> str:
    """执行一个到期作业。no-agent：跑命令、原样回 stdout（零 LLM）；agent：调注入的 runner。"""
    act = job.get("action", {})
    if act.get("kind") == "no_agent":
        cmd = [str(c) for c in act.get("command", [])]
        if not cmd:
            return "ERROR: no_agent 作业缺 command"
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        out_b, err_b = await proc.communicate()
        out = out_b.decode("utf-8", "replace")
        return out if proc.returncode == 0 else out + "\n[stderr] " + err_b.decode("utf-8", "replace")
    if agent_runner is not None:
        return await agent_runner(str(act.get("request", "")))
    return "ERROR: agent 作业需要注入 agent_runner"
