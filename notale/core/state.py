"""Atomic current-run state. It intentionally knows no legacy formats."""

from __future__ import annotations

import datetime as dt
import uuid
from pathlib import Path

from notale.core.models import PageRun, PageRunStatus, RunState


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _atomic_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


class RunStore:
    def __init__(self, run_dir: Path, state: RunState) -> None:
        self.run_dir = Path(run_dir).resolve()
        self.state = state

    @classmethod
    def create(cls, out_root: Path, topic: str, contract_hash: str) -> "RunStore":
        run_id = f"{dt.date.today().isoformat()}-{uuid.uuid4().hex[:6]}"
        run_dir = Path(out_root).resolve() / run_id
        run_dir.mkdir(parents=True, exist_ok=False)
        store = cls(
            run_dir,
            RunState(
                run_id=run_id,
                topic=topic,
                contract_hash=contract_hash,
                created_at=now(),
            ),
        )
        store.save()
        return store

    @classmethod
    def load(cls, run_dir: Path) -> "RunStore":
        run_dir = Path(run_dir).resolve()
        path = run_dir / "run.json"
        if not path.is_file():
            raise ValueError("resume requires a current-format run.json")
        return cls(run_dir, RunState.model_validate_json(path.read_text(encoding="utf-8")))

    def save(self) -> None:
        _atomic_text(self.run_dir / "run.json", self.state.model_dump_json(indent=2))

    def register_plan(self, page_count: int) -> None:
        if self.state.pages and len(self.state.pages) != page_count:
            raise ValueError("run page count does not match plan")
        if not self.state.pages:
            self.state.pages = [PageRun() for _ in range(page_count)]
        self.state.plan_status = "completed"
        self.save()

    def reset_running(self) -> list[int]:
        reset: list[int] = []
        for number, page in enumerate(self.state.pages, 1):
            if page.status == PageRunStatus.RUNNING:
                page.status = PageRunStatus.PENDING
                page.error = ""
                page.started_at = ""
                page.finished_at = ""
                reset.append(number)
        if reset:
            self.save()
        return reset

    def start_page(self, number: int) -> None:
        page = self.state.pages[number - 1]
        if page.status != PageRunStatus.PENDING:
            raise ValueError(f"page {number} is not pending")
        page.status = PageRunStatus.RUNNING
        page.attempts += 1
        page.error = ""
        page.started_at = now()
        page.finished_at = ""
        self.save()

    def finish_page(self, number: int, status: PageRunStatus, error: str = "") -> None:
        if status not in {PageRunStatus.COMPLETED, PageRunStatus.DEGRADED}:
            raise ValueError("page can only finish completed or degraded")
        page = self.state.pages[number - 1]
        if page.status != PageRunStatus.RUNNING:
            raise ValueError(f"page {number} is not running")
        page.status = status
        page.error = error
        page.finished_at = now()
        self.save()

    def pending_pages(self) -> list[int]:
        return [
            number
            for number, page in enumerate(self.state.pages, 1)
            if page.status == PageRunStatus.PENDING
        ]

    def pages_with(self, status: PageRunStatus) -> list[str]:
        return [
            f"p{number}"
            for number, page in enumerate(self.state.pages, 1)
            if page.status == status
        ]
