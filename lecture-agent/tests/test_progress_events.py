"""结构化 progress 事件契约:确定性(FakeClient)跑一次生成,断言事件序列与 schema。

进度视图(viewer/progress-view.js)消费这套事件——本测试钉死 engine 发出的形状,防回归。
"""

from __future__ import annotations

import json

from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.engine import GeneratorOptions, generate_lecture

_SKELETON = json.dumps(
    {
        "id": "demo",
        "title": "示例讲义",
        "language": "zh-CN",
        "theme": "cartesian",
        "scenes": [
            {
                "id": "cover",
                "kind": "hero",
                "notes": "开场。",
                "blocks": [{"id": "b0", "type": "hero", "intent": "封面"}],
            },
            {
                "id": "p1",
                "kind": "statement",
                "notes": "主旨。",
                "blocks": [{"id": "b1", "type": "statement", "intent": "一句话主旨"}],
            },
        ],
    }
)
_BY_PURPOSE = {
    "plan:skeleton": _SKELETON,
    "block:hero": json.dumps({"type": "hero", "title": ["示例讲义", "副标题"]}),
    "block:statement": json.dumps({"type": "statement", "statement": "梯度下降沿负梯度迭代。"}),
    "notes": json.dumps({"note": "本页备注。"}),
}


async def test_progress_event_stream_shape() -> None:
    events: list[dict] = []
    llm = FakeClient(by_purpose=_BY_PURPOSE)
    result = await generate_lecture(
        llm,
        topic="梯度下降",
        pages=2,
        theme="cartesian",
        options=GeneratorOptions(plan_perspectives=1, absolute_frames=False),
        progress=events.append,
    )
    assert result.errors == []

    # 每个事件都带 type（契约基线）
    assert all("type" in e for e in events)
    types = [e["type"] for e in events]

    # 阶段序:plan → fanout → assemble → validate → notes 都出现,且 plan 最先、done 最后
    assert types[0] == "stage" and events[0]["stage"] == "plan" and events[0]["status"] == "start"
    assert types[-1] == "done"
    stage_names = [e["stage"] for e in events if e["type"] == "stage"]
    for st in ("plan", "fanout", "assemble", "validate", "notes"):
        assert st in stage_names, f"缺阶段 {st}"

    # 骨架事件:带 scenes,每 scene 有 id + blocks(供进度视图搭骨架)
    skel = next(e for e in events if e["type"] == "skeleton")
    assert len(skel["doc"]["scenes"]) == 2
    assert {s["id"] for s in skel["doc"]["scenes"]} == {"cover", "p1"}

    # fanout 起点带 total = block 数
    fan = next(e for e in events if e["type"] == "stage" and e["stage"] == "fanout")
    assert fan["total"] == 2

    # 每块:先 active,后 docUpdated done(用 blockId keying)
    active_ids = {e["blockId"] for e in events if e["type"] == "block" and e["status"] == "active"}
    done_ids = {
        e["blockId"]
        for e in events
        if e["type"] == "docUpdated" and e.get("status") == "done" and e.get("blockId")
    }
    assert {"b0", "b1"} <= active_ids
    assert {"b0", "b1"} <= done_ids

    # done 事件带最终 doc,无错
    done = events[-1]
    assert done["errors"] == 0
    assert len(done["doc"]["scenes"]) == 2
