"""LedgerStore —— append-only 实验账本，一行一个 ExperimentRecord（JSONL）。"""

from __future__ import annotations

from pathlib import Path

from ...schema import ExperimentRecord


class LedgerStore:
    def __init__(self, path: str | Path = "results/ledger.jsonl") -> None:
        self.path = Path(path)

    def append(self, record: ExperimentRecord) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as f:
            f.write(record.model_dump_json())
            f.write("\n")

    def read_all(self) -> list[ExperimentRecord]:
        if not self.path.exists():
            return []
        out: list[ExperimentRecord] = []
        for line in self.path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                out.append(ExperimentRecord.model_validate_json(line))
        return out
