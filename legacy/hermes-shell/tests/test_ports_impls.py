"""P0 · 支柱2：MemoryStore 是真接缝——filesystem 与 in-memory 两实现都满足 Protocol。

若将来只剩一个实现，接缝就该降级为直接调用；此测试是"≥2 实现才开接缝"纪律的机器强制点
（对应 PROJECT_STRUCTURE.md §3 接缝清单）。
"""

from __future__ import annotations

from pathlib import Path

from lecture_agent.adapters.memory import FsMemoryStore, InMemoryMemoryStore
from lecture_agent.ports.memory import MemorySnapshot, MemoryStore


def test_both_impls_satisfy_protocol() -> None:
    assert isinstance(InMemoryMemoryStore(), MemoryStore)
    assert isinstance(FsMemoryStore(), MemoryStore)


def test_inmem_roundtrip_and_frozen_version() -> None:
    store = InMemoryMemoryStore()
    empty = store.load_snapshot()
    store.append_user("偏好深色 cartesian 主题")
    store.append_memory("sim widget 在该主题需留白")
    snap = store.load_snapshot()
    assert "cartesian" in snap.user_md
    assert "留白" in snap.memory_md
    assert snap.version != empty.version  # 内容变了，指纹跟着变
    # 同内容 → 同指纹（prefix-cache / replay 命中的地基）
    assert snap.version == MemorySnapshot.of(snap.user_md, snap.memory_md).version


def test_fs_roundtrip_and_write_through(tmp_path: Path) -> None:
    store = FsMemoryStore(root=tmp_path)
    store.append_user("受众默认研究生")
    snap = store.load_snapshot()
    assert "研究生" in snap.user_md
    assert (tmp_path / "USER.md").exists()
    # 另起 store 指向同目录：写穿透可见（"下会话生效"语义）
    assert FsMemoryStore(root=tmp_path).load_snapshot().user_md == snap.user_md
