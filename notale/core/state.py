"""run manifest + 页状态机 + 断点续跑（HARNESS P4：落盘状态机是长程的脊柱）。

每次运行一个 run 目录：
    runs/<date>-<id>/
    ├── manifest.json    # 页状态机现状（每页 status/attempts）
    └── events.jsonl     # 事件日志，append-only

resume 语义：加载 manifest，只继续非终态（pending / drafted）的页；
completed 与 degraded 页原样保留——续跑一页不重跑整本。
"""

from __future__ import annotations

import datetime
import json
import uuid
from pathlib import Path

from notale.core.models import PageStatus
from notale.utils.config import get_config
from pydantic import BaseModel, Field

# 合法状态转移（非法转移是 bug，直接抛）
_TRANSITIONS: dict[PageStatus, set[PageStatus]] = {
    PageStatus.PENDING: {PageStatus.DRAFTED, PageStatus.DEGRADED},
    PageStatus.DRAFTED: {PageStatus.COMPLETED, PageStatus.DEGRADED},
    PageStatus.COMPLETED: set(),  # 终态
    PageStatus.DEGRADED: set(),  # 终态（降级页不回炉，待人审）
}

TERMINAL = {PageStatus.COMPLETED, PageStatus.DEGRADED}


class PageState(BaseModel):
    pageId: str
    status: PageStatus = PageStatus.PENDING
    attempts: int = 0
    updatedAt: str = ""


class RunManifest(BaseModel):
    runId: str
    query: str = ""
    createdAt: str
    pages: dict[str, PageState] = Field(default_factory=dict)


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class Manifest:
    """manifest.json + events.jsonl 的读写门面（orchestrator 是唯一写者）。"""

    def __init__(self, run_dir: Path, data: RunManifest) -> None:
        self.run_dir = run_dir
        self.data = data

    # ---- 创建 / 加载 ----

    @classmethod
    def create(cls, out_root: Path, query: str) -> Manifest:
        suffix_chars = get_config().runtime.run_id_suffix_chars
        run_id = f"{datetime.date.today().isoformat()}-{uuid.uuid4().hex[:suffix_chars]}"
        run_dir = out_root / run_id
        run_dir.mkdir(parents=True, exist_ok=False)
        m = cls(run_dir, RunManifest(runId=run_id, query=query, createdAt=_now()))
        m.save()
        m.event("run-created", query=query)
        return m

    @classmethod
    def load(cls, run_dir: Path) -> Manifest:
        data = RunManifest.model_validate_json((run_dir / "manifest.json").read_text())
        return cls(run_dir, data)

    def save(self) -> None:
        (self.run_dir / "manifest.json").write_text(
            self.data.model_dump_json(indent=2), encoding="utf-8"
        )

    def event(self, kind: str, **fields: object) -> None:
        """事件日志只追加。"""
        rec = {"ts": _now(), "kind": kind, **fields}
        with (self.run_dir / "events.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    # ---- 页状态机 ----

    def register_pages(self, page_ids: list[str]) -> None:
        for pid in page_ids:
            self.data.pages.setdefault(pid, PageState(pageId=pid, updatedAt=_now()))
        self.save()

    def transition(self, page_id: str, to: PageStatus, **event_fields: object) -> None:
        state = self.data.pages[page_id]
        if to not in _TRANSITIONS[state.status]:
            raise ValueError(f"非法状态转移：{page_id} {state.status} → {to}")
        state.status = to
        state.updatedAt = _now()
        if to == PageStatus.DRAFTED:
            state.attempts += 1
        self.save()
        self.event("page-transition", pageId=page_id, to=to.value, **event_fields)

    def todo_pages(self) -> list[str]:
        """resume 的工作集：所有非终态页。"""
        return [pid for pid, s in self.data.pages.items() if s.status not in TERMINAL]

    def pages_by_status(self, status: PageStatus) -> list[str]:
        return [pid for pid, s in self.data.pages.items() if s.status == status]
