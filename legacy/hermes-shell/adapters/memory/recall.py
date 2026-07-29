"""LedgerRecall —— 实现 ports.memory.Recall：把实验账本行读成情景记忆的原始 dict。

只做 I/O（读 results/ledger.jsonl）。排序/筛选交给 domain.memory.select_recall（由 agent 层组合），
以保持 adapters↔domain 互不 import。
"""

from __future__ import annotations

from typing import Any

from ..store.ledger import LedgerStore


class LedgerRecall:
    def __init__(self, ledger: LedgerStore | None = None) -> None:
        self._ledger = ledger or LedgerStore()

    def episodes(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for r in self._ledger.read_all():
            out.append({"topic": r.topic, "pages": r.pages, "theme": r.theme, "ok": r.ok})
        return out
