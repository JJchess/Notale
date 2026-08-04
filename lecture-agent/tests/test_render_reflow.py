"""真机渲染验收 → 溢出页回炉精简的闭环测试（注入 fake verifier，不启浏览器）。

守的是这条曾经断掉的链：SPEC 写着「溢出页 → 拆页或精简，而不是缩字号」，但流水线里
一度**没有任何东西在执行**——RenderVerifier 的唯一实现只是重跑 schema 校验，且根本没被
generate_lecture 调用。这里断言：verifier 报溢出 → 对应页真的被回炉重写 → 再验收转绿。
"""

from __future__ import annotations

import json

from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.domain.generation import condense_scene
from lecture_agent.engine import GeneratorOptions, generate_lecture
from lecture_agent.ports.renderer import RenderReport

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
                "kind": "content",
                "notes": "要点。",
                "blocks": [{"id": "b1", "type": "list", "intent": "三个要点"}],
            },
        ],
    }
)

_LONG_LIST = json.dumps(
    {"type": "list", "items": [{"text": f"要点 {i}：" + "很长的解释文字。" * 6} for i in range(9)]}
)
_SHORT_SCENE = json.dumps(
    {
        "id": "p1",
        "kind": "content",
        "notes": "要点。",
        "blocks": [{"id": "b1", "type": "list", "items": [{"text": f"要点 {i}"} for i in range(3)]}],
    }
)

_BY_PURPOSE = {
    "plan:skeleton": _SKELETON,
    "block:hero": json.dumps({"type": "hero", "title": ["示例讲义", "副标题"]}),
    "block:list": _LONG_LIST,
    "notes": json.dumps({"note": "本页备注，讲清主线、展开核心直觉与常见误区。"}),
    "reflow": _SHORT_SCENE,
}


class _FlakyVerifier:
    """第一次报第 1 页溢出，之后报干净——模拟「回炉后真的放下了」。"""

    def __init__(self) -> None:
        self.calls = 0

    async def verify(self, html: str) -> RenderReport:
        self.calls += 1
        if self.calls == 1:
            return RenderReport(
                ok=False,
                errors=["F: 1 页纵向溢出(内容被裁) → #1(320px)"],
                overflow_pages=[{"page": 1, "overflowY": 320, "overflowX": 0, "layoutClip": 0}],
            )
        return RenderReport(ok=True)


async def test_overflow_page_is_reflowed_until_clean() -> None:
    verifier = _FlakyVerifier()
    result = await generate_lecture(
        FakeClient(by_purpose=_BY_PURPOSE),
        topic="数据结构",
        pages=2,
        options=GeneratorOptions(sections=False, render_rounds=2),
        render_verifier=verifier,
    )
    assert verifier.calls == 2, "应在回炉后再验收一次"
    items = result.doc["scenes"][1]["blocks"][0]["items"]
    assert len(items) == 3, f"溢出页应已被精简，实得 {len(items)} 条"
    assert not result.errors
    assert not any("仍有" in w and "溢出" in w for w in result.warnings)


async def test_no_verifier_means_stage_skipped() -> None:
    """不注入 verifier 时流水线行为不变（离线/CI 默认路径）。"""
    result = await generate_lecture(
        FakeClient(by_purpose=_BY_PURPOSE),
        topic="数据结构",
        pages=2,
        options=GeneratorOptions(sections=False),
    )
    assert len(result.doc["scenes"][1]["blocks"][0]["items"]) == 9, "未注入 verifier 不应触发回炉"


async def test_invalid_document_still_gets_one_read_only_browser_diagnostic() -> None:
    """结构错误不能吞掉截图/像素证据，也不能在非法文档上自动回炉。"""

    invalid_skeleton = json.dumps(
        {
            "id": "invalid-render-diagnostic",
            "title": "诊断",
            "language": "zh-CN",
            "theme": "cartesian",
            "scenes": [
                {
                    "id": "section",
                    "kind": "section",
                    "notes": "分隔。",
                    "blocks": [{"id": "b0", "type": "hero", "intent": "错误的分隔页"}],
                }
            ],
        },
        ensure_ascii=False,
    )

    class _DiagnosticVerifier:
        def __init__(self) -> None:
            self.calls = 0

        async def verify(self, html: str) -> RenderReport:
            self.calls += 1
            return RenderReport(
                ok=False,
                overflow_pages=[{"page": 0, "overflowY": 200, "overflowX": 0}],
                page_metrics=[{"i": 0, "overflowY": 200}],
                shots=["contact-sheet.png", "page0.png"],
            )

    verifier = _DiagnosticVerifier()
    result = await generate_lecture(
        FakeClient(
            by_purpose={
                **_BY_PURPOSE,
                "plan:skeleton": invalid_skeleton,
                "block:hero": json.dumps({"type": "hero", "title": ["诊断", ""]}),
            }
        ),
        topic="诊断",
        pages=1,
        options=GeneratorOptions(sections=False, revise=False, render_rounds=2),
        render_verifier=verifier,
    )

    assert verifier.calls == 1
    assert any("section" in error for error in result.errors)


async def test_persistent_overflow_is_reported_not_hidden() -> None:
    """精简到极限仍溢出时必须如实报 warning，不能假装修好。"""

    class _AlwaysBad:
        async def verify(self, html: str) -> RenderReport:
            return RenderReport(
                ok=False,
                errors=["F: 1 页纵向溢出"],
                overflow_pages=[{"page": 1, "overflowY": 500, "overflowX": 0, "layoutClip": 0}],
            )

    result = await generate_lecture(
        FakeClient(by_purpose=_BY_PURPOSE),
        topic="数据结构",
        pages=2,
        options=GeneratorOptions(sections=False, render_rounds=2),
        render_verifier=_AlwaysBad(),
    )
    assert any("溢出" in w for w in result.warnings), "残留溢出必须出现在 warnings 里"


async def test_formula_clip_is_routed_to_reflow() -> None:
    """公式横向裁切属于可见内容丢失，必须像纵向溢出一样定点回炉。"""

    class _FormulaClipVerifier:
        def __init__(self) -> None:
            self.calls = 0

        async def verify(self, html: str) -> RenderReport:
            self.calls += 1
            if self.calls == 1:
                return RenderReport(
                    ok=False,
                    errors=["G: 1 页公式被裁 → #1(383px)"],
                    overflow_pages=[
                        {
                            "page": 1,
                            "overflowY": 0,
                            "overflowX": 0,
                            "layoutClip": 0,
                            "mblockClip": 383,
                        }
                    ],
                )
            return RenderReport(ok=True)

    verifier = _FormulaClipVerifier()
    result = await generate_lecture(
        FakeClient(by_purpose=_BY_PURPOSE),
        topic="数据结构",
        pages=2,
        options=GeneratorOptions(sections=False, render_rounds=2),
        render_verifier=verifier,
    )
    assert verifier.calls == 2
    assert len(result.doc["scenes"][1]["blocks"][0]["items"]) == 3
    assert not result.errors


async def test_widget_runtime_error_is_repaired_and_reverified() -> None:
    widget_html = (
        "<style>.w{height:100%;color:var(--ink);transition:opacity .2s}</style><div class=w>"
        "<canvas id=cv width=320 height=180></canvas></div>"
        "<script>const c=document.getElementById('cv').getContext('2d');"
        "function update(){c.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--ink');"
        "c.fillRect(0,0,10,10)}update();</script>"
    )
    fixed_html = widget_html.replace("fillRect(0,0,10,10)", "fillRect(20,20,20,20)")
    skeleton = json.dumps(
        {
            "id": "widget-runtime",
            "title": "运行时",
            "language": "zh-CN",
            "theme": "lab",
            "scenes": [
                {"id": "cover", "kind": "hero", "notes": "开场。", "blocks": [{"id": "h", "type": "hero", "intent": "封面"}]},
                {
                    "id": "p1",
                    "kind": "content",
                    "notes": "演示。",
                    "blocks": [{"id": "w", "type": "sim", "engine": "widget", "intent": "演示", "size": "xl"}],
                },
            ],
        },
        ensure_ascii=False,
    )
    contract = json.dumps(
        {
            "core_insight": "状态变化",
            "render_medium": "canvas",
            "state_model": [{"name": "step", "type": "int", "range": "0..1", "init": "1"}],
            "interactions": [{"trigger": "canvas click", "effect": "重画"}],
            "update": "update() 重画",
            "initial_paint": "首帧已有方块",
            "visible_encodings": [{"quantity": "状态", "mark": "方块", "where": "画布"}],
            "comparison_states": [],
            "interaction_loop": {
                "action": "点击画布",
                "model_update": "更新 step",
                "visible_change": "方块位置变化",
                "history": "保留前态轮廓",
                "reset": "恢复 step=1",
            },
            "math_model": {"formula": "none", "screen_mapping": "not applicable", "invariants": []},
            "verification_cases": [{"input": "step=1", "expected": "首帧已有方块"}],
        },
        ensure_ascii=False,
    )
    response = (
        '{"title":"状态","widget_type":"interactive",'
        '"loading_messages":["准备"],"assistant_text":"观察状态。"}'
        f"\n<widget_code>{widget_html}</widget_code>"
    )

    class RuntimeVerifier:
        def __init__(self) -> None:
            self.calls = 0

        async def verify(self, html: str) -> RenderReport:
            self.calls += 1
            if self.calls == 1:
                return RenderReport(
                    ok=False,
                    errors=["O: widget 运行时错误", "B: console error"],
                    page_metrics=[
                        {"i": 0, "widgetErrors": []},
                        {"i": 1, "widgetErrors": ["Assignment to constant variable"]},
                    ],
                )
            return RenderReport(ok=True, page_metrics=[{"i": 0}, {"i": 1}])

    verifier = RuntimeVerifier()
    fake = FakeClient(
        by_purpose={
            "plan:skeleton": skeleton,
            "block:hero": json.dumps({"type": "hero", "title": ["运行时", "测试"]}, ensure_ascii=False),
            "widget:plan": contract,
            "widget:build": response,
            "widget:quality-repair": fixed_html,
            "quality:page": '{"score":10,"pass":true,"blockIssues":[],"pageIssues":[]}',
            "notes": json.dumps({"note": "说明运行状态。"}, ensure_ascii=False),
        }
    )
    result = await generate_lecture(
        fake,
        topic="运行时",
        pages=2,
        options=GeneratorOptions(sections=False, render_rounds=2, quality_rounds=1),
        render_verifier=verifier,
    )
    assert verifier.calls == 2
    assert result.doc["scenes"][1]["blocks"][0]["html"] == fixed_html
    # 初审两页 + 浏览器修复后只复核变更的 widget 页；旧语义分数不能沿用。
    assert [purpose for purpose, _messages in fake.calls].count("quality:page") == 3
    assert not result.errors


async def test_condense_scene_rejects_block_id_tampering() -> None:
    """回炉不许改 block id/顺序——版式按 id 引用，动了会散架。"""
    scene = {"id": "p1", "kind": "content", "blocks": [{"id": "b1", "type": "statement", "statement": "原文。"}]}
    tampered = json.dumps({"id": "p1", "kind": "content", "blocks": [{"id": "ZZZ", "type": "statement", "statement": "短。"}]})
    r = await condense_scene(
        FakeClient(by_purpose={"reflow": tampered}), scene, overflow_px=200, rounds=1
    )
    assert r.scene is None and r.err and "id" in r.err
