"""端到端冒烟：用 FakeClient 驱动 generate_lecture 跑通 plan→fanout→assemble→validate。

证明 agent/domain 只依赖 ports.LLMClient——不需真 key、不启浏览器，注入 fake 即可端到端跑。
"""

from __future__ import annotations

import asyncio
import json

import lecture_agent.domain.generation.blocks as blocks_module
import lecture_agent.engine.pipeline as pipeline_module
import pytest
from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.adapters.media.fake import FakeMediaProvider
from lecture_agent.domain.assemble import fill_blocks
from lecture_agent.engine import GeneratorOptions, generate_lecture
from lecture_agent.engine.pipeline import _block_scene_context, _generate_media_block
from lecture_agent.ports.media import ImageAsset
from lecture_agent.ports.renderer import RenderReport
from lecture_agent.schema import LectureDoc, validate_doc

# 规划器返回的骨架（两页：hero + statement 内容页）
_SKELETON = json.dumps(
    {
        "id": "demo",
        "title": "示例讲义",
        "language": "zh-CN",
        "theme": "cartesian",
        "designBrief": {"audience": {"stage": "university"}, "purpose": "explanation", "density": "medium", "designDNA": {}},
        "scenes": [
            {
                "id": "cover",
                "kind": "hero",
                "notes": "开场。",
                "brief": {"objective": "进入主题", "learningAction": "orient", "requiredEvidence": "主题", "keyClaim": "主题", "misconception": "", "visualTask": "建立主题", "evidencePolicy": "none"},
                "visualBrief": {"designIntent": "封面", "selectedCapabilities": ["hero"], "compositionFamily": "full-bleed-hero"},
                "layout": {"kind": "frames", "canvas": {"width": 1280, "height": 720}, "titleFrame": None, "frames": [{"blockId": "b0", "x": 64, "y": 48, "w": 1152, "h": 624, "z": 1, "role": "primary", "clip": False}]},
                "blocks": [{"id": "b0", "type": "hero", "role": "claim", "intent": "封面"}],
            },
            {
                "id": "p1",
                "kind": "statement",
                "headline": "主旨",
                "notes": "主旨。",
                "brief": {"objective": "解释主旨", "learningAction": "explain", "requiredEvidence": "一句可见结论", "keyClaim": "结论", "misconception": "", "visualTask": "突出结论", "evidencePolicy": "derived"},
                "visualBrief": {"designIntent": "聚焦结论", "selectedCapabilities": ["statement"], "compositionFamily": "poster"},
                "layout": {"kind": "frames", "canvas": {"width": 1280, "height": 720}, "titleFrame": {"x": 64, "y": 32, "w": 1152, "h": 112, "z": 5}, "frames": [{"blockId": "b1", "x": 160, "y": 176, "w": 960, "h": 440, "z": 1, "role": "primary", "clip": False}]},
                "blocks": [{"id": "b1", "type": "statement", "role": "claim", "intent": "一句话主旨"}],
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

_MEDIA_SKELETON = json.dumps(
    {
        "id": "media-demo",
        "title": "豌豆遗传",
        "language": "zh-CN",
        "theme": "slate",
        "designBrief": {
            "audience": {"stage": "high", "readingLevel": "高中", "formality": "instructional"},
            "purpose": "concept-teaching",
            "density": "medium",
            "designDNA": {"mediaLanguage": "botanical editorial", "motifs": ["pea flower"]},
        },
        "scenes": [
            {"id": "cover", "kind": "hero", "notes": "开场。", "brief": {"objective": "进入主题", "learningAction": "orient", "requiredEvidence": "主题", "keyClaim": "主题", "misconception": "", "visualTask": "建立主题", "evidencePolicy": "none"}, "visualBrief": {"designIntent": "封面", "selectedCapabilities": ["hero"], "compositionFamily": "full-bleed-hero"}, "layout": {"kind": "frames", "canvas": {"width": 1280, "height": 720}, "titleFrame": None, "frames": [{"blockId": "b0", "x": 64, "y": 48, "w": 1152, "h": 624, "z": 1, "role": "primary", "clip": False}]}, "blocks": [{"id": "b0", "type": "hero", "role": "claim", "intent": "封面"}]},
            {
                "id": "trait",
                "kind": "content",
                "headline": "先观察性状",
                "notes": "建立观察情境。",
                "brief": {"objective": "辨认高茎与矮茎", "learningAction": "inspect", "requiredEvidence": "真实外观差异", "keyClaim": "性状可观察", "misconception": "", "visualTask": "看清植株高度差异", "evidencePolicy": "provided"},
                "visualBrief": {"designIntent": "用植物背景建立情境，原生文字解释", "selectedCapabilities": ["statement", "media"], "compositionFamily": "text-over-image"},
                "layout": {"kind": "frames", "canvas": {"width": 1280, "height": 720}, "titleFrame": {"x": 64, "y": 32, "w": 1152, "h": 112, "z": 5}, "frames": [{"blockId": "bg", "x": 0, "y": 0, "w": 1280, "h": 720, "z": 0, "role": "decoration", "clip": True}, {"blockId": "claim", "x": 96, "y": 184, "w": 560, "h": 400, "z": 2, "role": "primary", "clip": False}]},
                "blocks": [
                    {"id": "claim", "type": "statement", "role": "claim", "intent": "性状是可观察差异"},
                    {"id": "bg", "type": "media", "role": "visualization", "intent": "豌豆植株背景", "purpose": "atmospheric", "placement": "background", "subject": "高茎与矮茎豌豆植株", "relationshipToContent": "建立真实观察情境", "fidelity": "scientific", "required": False, "safeZone": "left", "overlay": "scrim", "sourceStrategy": "generate-first"},
                ],
            },
        ],
    },
    ensure_ascii=False,
)


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
    statement_prompt = next(msgs[1]["content"] for purpose, msgs in llm.calls if purpose == "block:statement")
    assert "页级共享契约" in statement_prompt
    assert "siblingPlan" in statement_prompt
    assert "不得虚构论文年份" in statement_prompt
    statement_system = next(msgs[0]["content"] for purpose, msgs in llm.calls if purpose == "block:statement")
    assert "不得臆测兄弟块会采用的具体衰减因子" in statement_system


async def test_frame_block_browser_loop_repairs_inside_without_changing_frame() -> None:
    skeleton = json.loads(_SKELETON)
    skeleton["scenes"][0]["layout"] = {
        "kind": "frames", "canvas": {"width": 1280, "height": 720}, "titleFrame": None,
        "frames": [{"blockId": "b0", "x": 64, "y": 48, "w": 1152, "h": 624, "z": 1, "role": "primary", "clip": False}],
    }
    skeleton["scenes"][1]["kind"] = "content"
    skeleton["scenes"][1]["headline"] = "主旨"
    skeleton["scenes"][1]["layout"] = {
        "kind": "frames", "canvas": {"width": 1280, "height": 720},
        "titleFrame": {"x": 64, "y": 32, "w": 1152, "h": 112, "z": 5},
        "frames": [{"blockId": "b1", "x": 64, "y": 168, "w": 760, "h": 472, "z": 1, "role": "primary", "clip": False}],
    }
    responses = dict(_BY_PURPOSE)
    responses["plan:skeleton"] = json.dumps(skeleton, ensure_ascii=False)
    responses["viewport-fit:block:statement"] = json.dumps(
        {"type": "statement", "statement": "梯度方向决定局部最速上升，负梯度给出局部最速下降。"},
        ensure_ascii=False,
    )

    class ViewportVerifier:
        def __init__(self) -> None:
            self.calls = 0

        async def verify(self, _html: str) -> RenderReport:
            self.calls += 1
            utilization = 0.12 if self.calls == 1 else 0.52
            top_only = self.calls == 1
            return RenderReport(ok=True, page_metrics=[
                {"i": 0, "scaleFloor": 1, "blockMeasurements": [], "frameMeasurements": []},
                {
                    "i": 1, "scaleFloor": 1, "overlapCount": 0, "hiddenContentCount": 0,
                    "layoutClip": 0, "overflowX": 0, "overflowY": 0, "titleFit": True,
                    "widgetViewportFit": True,
                    "blockMeasurements": [{
                        "blockIds": ["b1"], "overflowX": 0, "overflowY": 0,
                        "hiddenContentCount": 0, "minTextPx": 18, "stageFit": True,
                        "contentUtilization": utilization, "topOnly": top_only,
                    }],
                    "frameMeasurements": [{
                        "kind": "block", "blockId": "b1",
                        "delta": {"x": 0, "y": 0, "w": 0, "h": 0},
                    }],
                },
            ])

    verifier = ViewportVerifier()
    result = await generate_lecture(
        FakeClient(by_purpose=responses),
        topic="梯度下降",
        pages=2,
        options=GeneratorOptions(plan_perspectives=1, render_rounds=1),
        render_verifier=verifier,
    )
    frame = result.doc["scenes"][1]["layout"]["frames"][0]
    assert {key: frame[key] for key in ("x", "y", "w", "h")} == {"x": 64, "y": 168, "w": 760, "h": 472}
    assert result.viewport_failures == []
    assert verifier.calls >= 3


async def test_duplicate_planner_block_ids_are_rejected_by_planner_loop() -> None:
    skeleton = json.loads(_SKELETON)
    skeleton["scenes"][1]["blocks"][0]["id"] = "b0"
    responses = dict(_BY_PURPOSE)
    responses["plan:skeleton"] = json.dumps(skeleton, ensure_ascii=False)
    llm = FakeClient(by_purpose=responses)
    with pytest.raises(RuntimeError, match="block id.*全局重复"):
        await generate_lecture(
            llm,
            topic="梯度下降",
            pages=2,
            options=GeneratorOptions(plan_perspectives=1),
        )
    assert [purpose for purpose, _messages in llm.calls].count("plan:skeleton") == 3


async def test_fanout_retries_one_timed_out_block_once(monkeypatch) -> None:
    class SlowFirstStatement(FakeClient):
        statement_calls = 0

        async def complete(self, messages, *, json_mode=True, purpose="chat"):
            if purpose == "block:statement":
                self.statement_calls += 1
                if self.statement_calls == 1:
                    await asyncio.sleep(0.05)
            return await super().complete(messages, json_mode=json_mode, purpose=purpose)

    monkeypatch.setattr(blocks_module, "_BLOCK_INITIAL_TIMEOUT_S", 0.01)
    llm = SlowFirstStatement(by_purpose=_BY_PURPOSE)
    result = await generate_lecture(
        llm,
        topic="梯度下降",
        pages=2,
        options=GeneratorOptions(plan_perspectives=1),
    )
    assert llm.statement_calls == 2
    assert result.dropped == [] and result.errors == []


def test_fill_blocks_clears_layout_that_references_dropped_block() -> None:
    doc = {
        "scenes": [
            {
                "id": "p1",
                "layout": {"kind": "split", "anchor": ["gone"]},
                "blocks": [
                    {"id": "kept", "type": "statement"},
                    {"id": "gone", "type": "agenda"},
                ],
            }
        ]
    }
    dropped = fill_blocks(
        doc,
        {"kept": {"type": "statement", "statement": "保留"}, "gone": None},
    )
    assert dropped == ["gone(agenda)"]
    assert "layout" not in doc["scenes"][0]


def test_fill_blocks_preserves_frames_and_exposes_generation_failure() -> None:
    doc = {
        "scenes": [{
            "id": "p1",
            "layout": {
                "kind": "frames", "canvas": {"width": 1280, "height": 720},
                "titleFrame": {"x": 64, "y": 40, "w": 1152, "h": 100, "z": 5},
                "frames": [{"blockId": "gone", "x": 64, "y": 160, "w": 1152, "h": 496, "z": 1, "role": "primary", "clip": False}],
            },
            "blocks": [{"id": "gone", "type": "sim"}],
        }]
    }
    dropped = fill_blocks(doc, {"gone": None})
    assert dropped == ["gone(sim)"]
    assert doc["scenes"][0]["layout"]["kind"] == "frames"
    assert doc["scenes"][0]["blocks"][0]["id"] == "gone"
    assert doc["scenes"][0]["blocks"][0]["type"] == "callout"


def test_multi_block_frame_context_identifies_current_viewport() -> None:
    scene = {
        "id": "p1",
        "kind": "content",
        "headline": "精确尺寸",
        "layout": {
            "kind": "frames",
            "frames": [
                {"blockId": "left", "x": 64, "y": 160, "w": 760, "h": 472, "z": 1, "role": "primary", "clip": False},
                {"blockId": "right", "x": 848, "y": 160, "w": 368, "h": 220, "z": 2, "role": "support", "clip": False},
            ],
        },
        "blocks": [
            {"id": "left", "type": "sim", "role": "primary"},
            {"id": "right", "type": "formula", "role": "support"},
        ],
    }
    raw = _block_scene_context(
        scene,
        {"objective": "观察状态", "visualTask": "显示变化"},
        scene["blocks"],
        current_block_id="left",
    )
    payload = json.loads(raw.split("\n", 1)[1].rsplit("\n证据纪律", 1)[0])
    assert payload["currentBlockId"] == "left"
    assert payload["viewport"] == {"width": 760.0, "height": 472.0, "aspectRatio": 1.6102}
    assert payload["constraints"] == {
        "fillWidth": True, "fillHeight": True, "allowScroll": False,
        "allowClip": False, "minTextPx": 14,
    }
    assert [frame["blockId"] for frame in payload["siblingFrames"]] == ["right"]


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


async def test_media_auto_does_not_call_provider_without_planner_selection() -> None:
    finder = FakeMediaProvider(found=ImageAsset(data_uri="data:image/png;base64,AAAA"))
    result = await generate_lecture(
        FakeClient(by_purpose=_BY_PURPOSE),
        topic="梯度下降",
        pages=2,
        options=GeneratorOptions(plan_perspectives=1, media="auto"),
        image_finder=finder,
    )
    assert result.errors == []
    assert finder.find_calls == []


async def test_planner_selected_background_media_resolves_before_final_composition() -> None:
    responses = dict(_BY_PURPOSE)
    responses["plan:skeleton"] = _MEDIA_SKELETON
    generator = FakeMediaProvider(generated=ImageAsset(data_uri="data:image/png;base64,PEAS"))
    result = await generate_lecture(
        FakeClient(by_purpose=responses),
        topic="孟德尔遗传",
        pages=2,
        options=GeneratorOptions(plan_perspectives=1, media="auto"),
        image_generator=generator,
    )
    scene = result.doc["scenes"][1]
    assert result.errors == [] and result.dropped == []
    background_block = next(block for block in scene["blocks"] if block.get("id") == "bg")
    assert background_block["assetId"] == "asset-bg"
    assert background_block["placement"] == "illustration"
    assert [block["type"] for block in scene["blocks"]] == ["statement", "media"]
    assert result.doc["assets"][0]["src"] == "data:image/png;base64,PEAS"
    assert "不要字母、汉字、数字、公式" in generator.generate_calls[0]
    assert validate_doc(result.doc).errors == []


async def test_evidence_media_never_falls_back_to_generated_pseudo_evidence() -> None:
    finder = FakeMediaProvider(found=None)
    generator = FakeMediaProvider(generated=ImageAsset(data_uri="data:image/png;base64,FAKE"))
    assets: dict[str, dict] = {}

    result = await _generate_media_block(
        {
            "id": "specimen",
            "type": "media",
            "purpose": "evidence",
            "placement": "illustration",
            "subject": "真实标本的可观察形态",
            "relationshipToContent": "用于辨认外观差异",
            "fidelity": "documentary",
            "sourceStrategy": "generate-first",
        },
        design_brief={},
        image_finder=finder,
        image_generator=generator,
        assets=assets,
    )

    assert result.block is None
    assert "可追溯搜索资产" in str(result.err)
    assert len(finder.find_calls) == 1
    assert generator.generate_calls == []
    assert assets == {}


async def test_page_quality_cannot_replace_planner_frames(monkeypatch) -> None:
    skeleton = json.loads(_SKELETON)
    page = skeleton["scenes"][1]
    page.update({"kind": "content", "headline": "比较两条证据"})
    page["visualBrief"] = {
        "designIntent": "首帧并排比较",
        "selectedCapabilities": ["list", "callout"],
        "compositionFamily": "comparison",
    }
    page["blocks"] = [
        {"id": "l", "type": "list", "role": "evidence", "intent": "左侧证据"},
        {"id": "c", "type": "callout", "role": "support", "intent": "右侧结论"},
    ]
    page["layout"]["frames"] = [
        {"blockId": "l", "x": 64, "y": 176, "w": 720, "h": 440, "z": 1, "role": "primary", "clip": False},
        {"blockId": "c", "x": 816, "y": 176, "w": 400, "h": 220, "z": 1, "role": "support", "clip": False},
    ]
    responses = {
        **_BY_PURPOSE,
        "plan:skeleton": json.dumps(skeleton, ensure_ascii=False),
        "block:list": json.dumps({"type": "list", "items": [{"text": "证据 A"}]}),
        "block:callout": json.dumps({"type": "callout", "label": "结论", "text": "证据 B"}),
    }

    async def replace_layout(_llm, doc, **_kwargs):
        doc["scenes"][1]["layout"] = {"kind": "flow", "centered": True}
        return [], []

    monkeypatch.setattr(pipeline_module, "_quality_repair", replace_layout)
    result = await generate_lecture(
        FakeClient(by_purpose=responses),
        topic="证据比较",
        pages=2,
        options=GeneratorOptions(
            plan_perspectives=1,
            quality_rounds=1,
            revise=False,
            render_rounds=0,
        ),
    )

    assert any("Absolute frames 结构硬错误" in error for error in result.errors)
    assert result.doc["scenes"][1]["layout"]["kind"] == "flow"
