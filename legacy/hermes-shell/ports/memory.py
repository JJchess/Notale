"""MemoryStore / Recall 接缝：跨会话记忆与情景召回。

记忆是"注入的依赖"，藏在 port 后——外壳/领域只认接口，不知道存哪、怎么召回。
两实现证明它是真接缝：filesystem(live) / in-memory(fixture、replay、测试)。

冻结快照语义：会话开始 load_snapshot() 一次，烘焙进系统提示；append_* 立即写盘
（持久），但**不改当前会话的 prompt**——只在下次会话的 load_snapshot() 生效。这既保
prefix-cache 稳定，又让"记忆快照版本"成为可钉死的实验输入（见 schema.ExperimentRecord）。
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable


@dataclass(frozen=True)
class MemorySnapshot:
    """会话开始冻结的记忆：讲者画像(user_md) + 制作笔记(memory_md) + 内容指纹(version)。"""

    user_md: str
    memory_md: str
    version: str  # sha256(user_md \0 memory_md) 前 16 位，作实验输入身份 / replay key

    @classmethod
    def of(cls, user_md: str, memory_md: str) -> MemorySnapshot:
        h = hashlib.sha256()
        h.update(user_md.encode("utf-8"))
        h.update(b"\x00")
        h.update(memory_md.encode("utf-8"))
        return cls(user_md=user_md, memory_md=memory_md, version=h.hexdigest()[:16])


@runtime_checkable
class MemoryStore(Protocol):
    def load_snapshot(self) -> MemorySnapshot:
        """读回冻结快照（会话开始调一次）。空记忆返回空串 + 稳定 version。"""
        ...

    def append_user(self, note: str) -> None:
        """向讲者画像(USER)追加一条；写穿透落盘，下会话生效。"""
        ...

    def append_memory(self, note: str) -> None:
        """向制作笔记(MEMORY)追加一条；写穿透落盘，下会话生效。"""
        ...


@runtime_checkable
class Recall(Protocol):
    def episodes(self) -> list[dict[str, Any]]:
        """返回情景记忆的**原始**条目（ledger/corpus 派生的 dict）。只做 I/O——

        排序/筛选是 domain 的事（domain.memory.select_recall），由 agent 层组合，保持
        adapters↔domain 相互独立（见 .importlinter 的 layers 契约）。
        """
        ...
