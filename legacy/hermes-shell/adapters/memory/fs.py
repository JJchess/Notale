"""FsMemoryStore —— 文件系统实现 ports.MemoryStore。

USER.md(讲者画像) + MEMORY.md(制作笔记) 存 <root>/。append_* 追加一条带分隔的条目；
load_snapshot 读两文件全文冻结成 MemorySnapshot（version=两文件内容 sha256）。
"""

from __future__ import annotations

from pathlib import Path

from ...ports.memory import MemorySnapshot

_ENTRY_SEP = "\n\n---\n\n"


class FsMemoryStore:
    def __init__(self, root: str | Path = "memory") -> None:
        self.root = Path(root)

    @property
    def _user_path(self) -> Path:
        return self.root / "USER.md"

    @property
    def _memory_path(self) -> Path:
        return self.root / "MEMORY.md"

    @staticmethod
    def _read(path: Path) -> str:
        return path.read_text(encoding="utf-8") if path.exists() else ""

    def load_snapshot(self) -> MemorySnapshot:
        return MemorySnapshot.of(self._read(self._user_path), self._read(self._memory_path))

    def _append(self, path: Path, note: str) -> None:
        note = note.strip()
        if not note:
            return
        self.root.mkdir(parents=True, exist_ok=True)
        cur = self._read(path)
        path.write_text((cur + _ENTRY_SEP + note) if cur.strip() else note, encoding="utf-8")

    def append_user(self, note: str) -> None:
        self._append(self._user_path, note)

    def append_memory(self, note: str) -> None:
        self._append(self._memory_path, note)
