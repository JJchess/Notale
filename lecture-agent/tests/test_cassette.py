"""录制盒测试：live 录制→replay 命中；replay 未命中即报错（绝不联网）。"""

from __future__ import annotations

import pytest
from lecture_agent.adapters.llm.cassette import CassetteClient, CassetteMiss
from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.ports.llm import Message

_MSGS: list[Message] = [{"role": "user", "content": "生成一个 hero block"}]


async def test_live_records_then_replay_hits(tmp_path) -> None:
    inner = FakeClient(queue=['{"type":"hero","title":["X"]}'])
    live = CassetteClient(mode="live", fixtures_dir=tmp_path, inner=inner, namespace="test")
    out = await live.complete(_MSGS, purpose="block:hero")
    assert '"hero"' in out

    # 同 namespace 的 replay 应命中同一 fixture，无需 inner
    replay = CassetteClient(mode="replay", fixtures_dir=tmp_path, namespace="test")
    out2 = await replay.complete(_MSGS, purpose="block:hero")
    assert out2 == out


async def test_replay_miss_raises(tmp_path) -> None:
    replay = CassetteClient(mode="replay", fixtures_dir=tmp_path, namespace="test")
    with pytest.raises(CassetteMiss):
        await replay.complete(_MSGS)


async def test_live_requires_inner() -> None:
    with pytest.raises(ValueError):
        CassetteClient(mode="live", inner=None)
