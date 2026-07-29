"""InMemoryMemoryStore —— 内存实现 ports.MemoryStore，供 replay/测试隔离磁盘。"""

from __future__ import annotations

from ...ports.memory import MemorySnapshot

_ENTRY_SEP = "\n\n---\n\n"


class InMemoryMemoryStore:
    def __init__(self, user_md: str = "", memory_md: str = "") -> None:
        self._user = user_md
        self._memory = memory_md

    def load_snapshot(self) -> MemorySnapshot:
        return MemorySnapshot.of(self._user, self._memory)

    def append_user(self, note: str) -> None:
        note = note.strip()
        if note:
            self._user = (self._user + _ENTRY_SEP + note) if self._user.strip() else note

    def append_memory(self, note: str) -> None:
        note = note.strip()
        if note:
            self._memory = (self._memory + _ENTRY_SEP + note) if self._memory.strip() else note
