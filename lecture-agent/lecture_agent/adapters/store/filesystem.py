"""FilesystemStore —— 文件系统实现 ports.CorpusStore。每份 deck 存 <root>/<id>.lecture.json。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class FilesystemStore:
    def __init__(self, root: str | Path = "data/corpus") -> None:
        self.root = Path(root)

    def save_deck(self, deck_id: str, doc: dict[str, Any]) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / f"{deck_id}.lecture.json").write_text(
            json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def load_deck(self, deck_id: str) -> dict[str, Any]:
        path = self.root / f"{deck_id}.lecture.json"
        if not path.exists():
            raise KeyError(deck_id)
        data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
        return data

    def list_decks(self) -> list[str]:
        if not self.root.exists():
            return []
        return sorted(p.name[: -len(".lecture.json")] for p in self.root.glob("*.lecture.json"))
