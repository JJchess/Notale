"""Hydra 入口：跑一次 cron tick。文件锁保单实例、**先推进后执行**保 at-most-once。

例（放进系统 crontab / 计划任务，每分钟一跳）：
  uv run python scripts/cron.py
jobs 存 results/cron/jobs.json，每条形如：
  {"id":"daily","enabled":true,"next_run_at":<ts>,"schedule":{"kind":"interval","seconds":86400},
   "action":{"kind":"agent","request":"给我做一份今日 AI 要闻讲义"}}
  {"id":"backup","enabled":true,"next_run_at":<ts>,"schedule":{"kind":"interval","seconds":3600},
   "action":{"kind":"no_agent","command":["python","scripts/backfill_ledger.py"]}}   # 零 LLM
"""

from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path

import hydra
from lecture_agent.adapters.cron import JobStore, run_job
from lecture_agent.app.chat import run_shell
from lecture_agent.domain.cron import due_and_advance
from omegaconf import DictConfig, open_dict


async def _tick(cfg: DictConfig) -> None:
    cron_dir = Path(str(cfg.get("cron_dir", "results/cron")))
    cron_dir.mkdir(parents=True, exist_ok=True)
    lock = cron_dir / ".tick.lock"
    try:  # O_EXCL 原子创建 = 跨平台单实例锁；已被占则本次 tick 直接跳过
        fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        print("[cron] 另一个 tick 持锁，跳过本次")
        return
    try:
        store = JobStore(cron_dir / "jobs.json")
        jobs = store.load()
        due, updated = due_and_advance(jobs, time.time())
        store.save(updated)  # 先落"推进后"的状态（锁内），再执行——重叠 tick 不双发

        async def agent_runner(request: str) -> str:
            with open_dict(cfg):
                cfg.request = request
            res = await run_shell(cfg)
            return res.final

        for job in due:
            out = await run_job(job, agent_runner=agent_runner)
            print(f"[cron] {job.get('id')} →\n{out}")
    finally:
        os.close(fd)
        lock.unlink(missing_ok=True)


@hydra.main(version_base=None, config_path="../configs", config_name="config")
def main(cfg: DictConfig) -> None:
    asyncio.run(_tick(cfg))


if __name__ == "__main__":
    main()
