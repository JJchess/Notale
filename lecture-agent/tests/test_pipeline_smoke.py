"""端到端冒烟：用 FakeClient 驱动 generate_lecture 跑通 plan→fanout→assemble→validate。

证明 agent/domain 只依赖 ports.LLMClient——不需真 key、不启浏览器，注入 fake 即可端到端跑。
"""

from __future__ import annotations

import json

from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.adapters.media.fake import FakeMediaProvider
from lecture_agent.agent import GeneratorOptions, generate_lecture
from lecture_agent.ports.media import ImageAsset
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
    # 逐页并行 notes：每页一次调用，返回单条 {"note": ...}
    "notes": json.dumps({"note": "本页备注，讲清主线、展开核心直觉与常见误区。"}),
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


async def test_media_off_by_default_no_hero_image() -> None:
    llm = FakeClient(by_purpose=_BY_PURPOSE)
    finder = FakeMediaProvider(found=ImageAsset(data_uri="data:image/png;base64,AAAA"))
    result = await generate_lecture(
        llm,
        topic="梯度下降",
        pages=2,
        theme="cartesian",
        options=GeneratorOptions(plan_perspectives=1, media=False),
        image_finder=finder,
    )
    hero = result.doc["scenes"][0]["blocks"][0]
    assert "image" not in hero
    assert finder.find_calls == []  # media=False：连 provider 都不该被调


async def test_media_on_attaches_hero_image_via_finder() -> None:
    llm = FakeClient(by_purpose=_BY_PURPOSE)
    finder = FakeMediaProvider(found=ImageAsset(data_uri="data:image/png;base64,AAAA"))
    result = await generate_lecture(
        llm,
        topic="梯度下降",
        pages=2,
        theme="cartesian",
        options=GeneratorOptions(plan_perspectives=1, media=True),
        image_finder=finder,
    )
    hero = result.doc["scenes"][0]["blocks"][0]
    assert hero["image"] == "data:image/png;base64,AAAA"
    assert len(finder.find_calls) == 1
    assert validate_doc(result.doc).errors == []


async def test_media_falls_back_to_generator_when_finder_misses() -> None:
    llm = FakeClient(by_purpose=_BY_PURPOSE)
    finder = FakeMediaProvider(found=None)
    generator = FakeMediaProvider(generated=ImageAsset(data_uri="data:image/png;base64,BBBB"))
    result = await generate_lecture(
        llm,
        topic="梯度下降",
        pages=2,
        theme="cartesian",
        options=GeneratorOptions(plan_perspectives=1, media=True),
        image_finder=finder,
        image_generator=generator,
    )
    hero = result.doc["scenes"][0]["blocks"][0]
    assert hero["image"] == "data:image/png;base64,BBBB"
    assert len(generator.generate_calls) == 1
