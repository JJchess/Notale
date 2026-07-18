"""CorpusStore 接缝：deck 语料与 run 产物的读写。

实现见 adapters/store（文件系统）；测试传 in-memory 版隔离磁盘。
"""

from __future__ import annotations

from typing import Any, Protocol


class CorpusStore(Protocol):
    def save_deck(self, deck_id: str, doc: dict[str, Any]) -> None:
        """保存一份生成的 LectureDoc（JSON 可序列化 dict）。"""
        ...

    def load_deck(self, deck_id: str) -> dict[str, Any]:
        """读回一份 deck；不存在时抛 KeyError。"""
        ...

    def list_decks(self) -> list[str]:
        """列出全部 deck id。"""
        ...
