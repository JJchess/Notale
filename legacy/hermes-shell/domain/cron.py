"""cron 调度的纯逻辑（无 I/O）：schedule 解析 + **先推进后执行**的 at-most-once 到期计算。

多数 cron 实现栽在这一步：tick 里必须**先在锁内把 next_run_at 推进过 now**，再去执行——否则
重叠 tick / 慢作业会双发。这里把该语义做成纯函数，可确定性测试（now 由外部注入）。
"""

from __future__ import annotations

import math
from typing import Any


def parse_schedule(spec: str, *, now: float) -> dict[str, Any]:
    """支持 'interval:<秒>' / '@<ts>'（一次性绝对时刻）/ 'once'（立即一次）。不引 croniter。"""
    spec = spec.strip()
    if spec.startswith("interval:"):
        return {"kind": "interval", "seconds": max(1, int(spec.split(":", 1)[1]))}
    if spec.startswith("@"):
        return {"kind": "once", "at": float(spec[1:])}
    if spec == "once":
        return {"kind": "once", "at": now}
    raise ValueError(f"不支持的 schedule: {spec!r}（用 interval:<秒> / @<ts> / once）")


def is_no_agent(job: dict[str, Any]) -> bool:
    """no-agent 快路：作业本身是脚本/命令，零 LLM、零 token。"""
    return job.get("action", {}).get("kind") == "no_agent"


def due_and_advance(jobs: list[dict[str, Any]], now: float) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """返回 (本次到期作业, 推进后的全量作业)。

    **先推进** next_run_at 越过 now（interval：跳过错过的槽，不补发；once：置 enabled=False），
    再交给调用方执行——重叠 tick 第二次调用同一 now 不会再命中（at-most-once）。
    """
    due: list[dict[str, Any]] = []
    updated: list[dict[str, Any]] = []
    for src in jobs:
        j = dict(src)
        if j.get("enabled", True) and j.get("next_run_at", math.inf) <= now:
            due.append(dict(j))
            sch = j.get("schedule", {})
            if sch.get("kind") == "interval":
                step = max(1, int(sch.get("seconds", 1)))
                nxt = float(j["next_run_at"]) + step
                while nxt <= now:  # 跳过错过的槽，不 burst 补发
                    nxt += step
                j["next_run_at"] = nxt
            else:
                j["enabled"] = False  # once：跑完即停
        updated.append(j)
    return due, updated
