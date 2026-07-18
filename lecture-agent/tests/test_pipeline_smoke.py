"""端到端冒烟：用 FakeClient 驱动 generate_lecture 跑通 plan→fanout→assemble→validate。

证明 agent/domain 只依赖 ports.LLMClient——不需真 key、不启浏览器，注入 fake 即可端到端跑。
"""

from __future__ import annotations

import json

from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.agent import GeneratorOptions, generate_lecture
from lecture_agent.schema import LectureDoc, validate_doc

# 规划器返回的骨架（两页：hero + statement 内容页）
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

# 逐块生成按 purpose 返回合法 block
_BY_PURPOSE = {
    "plan:skeleton": _SKELETON,
    "block:hero": json.dumps({"type": "hero", "title": ["示例讲义", "副标题"]}),
    "block:statement": json.dumps({"type": "statement", "statement": "梯度下降沿负梯度方向迭代。"}),
    "notes": json.dumps(
        {"notes": ["封面备注，讲清本课主线与结构安排。", "主旨备注，展开核心直觉与常见误区。"]}
    ),
}


async def test_end_to_end_with_fake_llm() -> None:
    llm = FakeClient(by_purpose=_BY_PURPOSE)
    result = await generate_lecture(
        llm,
        topic="梯度下降",
        pages=2,
        theme="cartesian",
        options=GeneratorOptions(plan_perspectives=1),
    )
    assert len(result.doc["scenes"]) == 2
    assert result.errors == []
    # 产物应能过结构 + 语义
    LectureDoc.model_validate(result.doc)
    assert validate_doc(result.doc).errors == []
    # notes 被增强
    assert "备注" in result.doc["scenes"][0]["notes"]
