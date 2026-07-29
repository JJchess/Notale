"""P10 · cron：先推进后执行的 at-most-once（重叠 tick 不双发）+ no-agent 快路零 LLM。"""

from __future__ import annotations

import sys
from typing import Any

import pytest
from lecture_agent.adapters.cron import JobStore, run_job
from lecture_agent.domain.cron import due_and_advance, is_no_agent, parse_schedule


def test_due_and_advance_is_at_most_once() -> None:
    jobs: list[dict[str, Any]] = [
        {"id": "j", "enabled": True, "next_run_at": 100.0, "schedule": {"kind": "interval", "seconds": 60}}
    ]
    due1, jobs = due_and_advance(jobs, 100.0)
    assert [d["id"] for d in due1] == ["j"]
    due2, jobs = due_and_advance(jobs, 100.0)  # 同一 now 的重叠 tick
    assert due2 == []  # 不双发
    due3, jobs = due_and_advance(jobs, 160.0)  # 下一个槽
    assert [d["id"] for d in due3] == ["j"]


def test_interval_skips_missed_slots_no_burst() -> None:
    jobs = [{"id": "j", "enabled": True, "next_run_at": 0.0, "schedule": {"kind": "interval", "seconds": 60}}]
    # now 远超多个槽：只发一次，next 推进到未来（不补发一堆）
    due, jobs = due_and_advance(jobs, 300.0)
    assert len(due) == 1 and jobs[0]["next_run_at"] > 300.0


def test_once_disables_after_firing() -> None:
    jobs = [{"id": "o", "enabled": True, "next_run_at": 50.0, "schedule": {"kind": "once", "at": 50.0}}]
    due, jobs = due_and_advance(jobs, 60.0)
    assert len(due) == 1 and jobs[0]["enabled"] is False
    due2, _ = due_and_advance(jobs, 9999.0)
    assert due2 == []


def test_parse_schedule() -> None:
    assert parse_schedule("interval:3600", now=0)["seconds"] == 3600
    assert parse_schedule("@100", now=0)["at"] == 100.0
    with pytest.raises(ValueError):
        parse_schedule("weird", now=0)


async def test_no_agent_path_runs_without_llm() -> None:
    calls: list[str] = []

    async def spy_agent(req: str) -> str:
        calls.append(req)
        return "agent ran"

    job = {"id": "n", "action": {"kind": "no_agent", "command": [sys.executable, "-c", "print('tick-ok')"]}}
    out = await run_job(job, agent_runner=spy_agent)
    assert "tick-ok" in out and calls == []  # no-agent 路零 LLM/零 agent
    assert is_no_agent(job) is True


def test_jobstore_roundtrip(tmp_path) -> None:
    s = JobStore(tmp_path / "jobs.json")
    assert s.load() == []
    s.save([{"id": "a", "enabled": True}])
    assert s.load() == [{"id": "a", "enabled": True}]
