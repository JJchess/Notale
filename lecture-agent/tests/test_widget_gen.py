"""sim.widget 生成子配方（plan→build→repair）+ 骨架 engine:widget 路由到子配方。

用 FakeClient 按 purpose 给罐装两阶段回复，无 I/O、无真 key、无浏览器。
"""

from __future__ import annotations

import asyncio
import json

import lecture_agent.domain.generation.widget as widget_module
from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.domain.generation import (
    compile_interaction_brief,
    generate_widget,
    load_widget_guidelines,
    repair_widget,
)
from lecture_agent.engine import GeneratorOptions, generate_lecture
from lecture_agent.schema import validate_doc
from lecture_agent.schema.validate import validate_block

# 合法片段：片段（无 doctype）、含 canvas/style、有动效(rAF)、读 --token 上色、零 machine-tell。
_GOOD_HTML = (
    "<style>.w{color:var(--ink);background:var(--bg2)}</style>"
    "<div class=w><canvas id=cv width=320 height=180></canvas>"
    "<button id=go>播放</button></div>"
    "<script>const c=document.getElementById('cv').getContext('2d');"
    "const ink=getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();"
    "let t=0;function u(){c.clearRect(0,0,320,180);c.fillStyle=ink;c.fillRect(t%320,80,8,8);t+=2;"
    "requestAnimationFrame(u)}requestAnimationFrame(u);</script>"
)
# 带 machine-tell（<h1> 自我介绍标题）——校验器给 warning，非末轮应触发回炉。
_H1_HTML = "<style>.w{color:var(--ink)}</style><h1>正弦波交互式演示</h1>" + _GOOD_HTML
# 硬错误：写了整页文档结构（doctype/html/head/body）——校验器给 error。
_DOCTYPE_HTML = "<!doctype html><html><body><canvas></canvas></body></html>"


def test_legacy_widget_guidance_is_not_double_injected() -> None:
    assert load_widget_guidelines("skills/create-sim") == ""


def _genui_response(html: str) -> str:
    return (
        '{"title":"阻尼演示","widget_type":"interactive",'
        '"loading_messages":["准备交互"],"assistant_text":"拖动滑块观察变化。"}'
        f"\n<widget_code>{html}</widget_code>"
    )

_CONTRACT = json.dumps(
    {
        "core_insight": "阻尼越大，摆幅衰减越快",
        "render_medium": "canvas",
        "state_model": [{"name": "damp", "type": "float", "range": "0..0.2", "init": "0.05"}],
        "interactions": [{"trigger": "range#damp input", "effect": "改 damp、摆动衰减变快"}],
        "update": "单一 update() 按 damp 重推 theta/omega 并重绘摆",
        "initial_paint": "摆已从 60° 释放、正摆动中",
        "visible_encodings": [{"quantity": "摆角", "mark": "摆杆", "where": "主画布"}],
        "comparison_states": [],
        "interaction_loop": {
            "action": "拖动阻尼滑块",
            "model_update": "更新 damp 后重算 theta/omega",
            "visible_change": "摆幅衰减速度立即变化",
            "history": "保留上一周期包络线",
            "reset": "恢复 damp=0.05 与相同初始角",
        },
        "math_model": {"formula": "none", "screen_mapping": "not applicable", "invariants": []},
        "verification_cases": [
            {"input": "首帧 damp=0.05", "expected": "摆已离开初始角"},
            {"input": "reset", "expected": "恢复同一初态"},
        ],
    },
    ensure_ascii=False,
)


async def test_two_stage_produces_valid_widget() -> None:
    llm = FakeClient(by_purpose={"widget:plan": _CONTRACT, "widget:build": _genui_response(_GOOD_HTML)})
    r = await generate_widget(llm, intent="演示阻尼单摆", theme="lab", topic="振动")
    assert r.err is None
    assert r.block is not None
    assert r.block["type"] == "sim" and r.block["engine"] == "widget"
    assert r.block["spec"]["core_insight"] == "阻尼越大，摆幅衰减越快"
    assert validate_block(r.block, "sim").errors == []
    # 恰好一次 plan + 一次 build（首轮就干净，不该触发 repair）。
    purposes = [p for p, _ in llm.calls]
    assert purposes == ["widget:plan", "widget:build"]


async def test_complete_interaction_brief_skips_widget_plan() -> None:
    interaction_brief = {
        "stateModel": [{"name": "step", "type": "int", "range_or_values": "0..3", "initial": 1}],
        "controls": [
            {"trigger": "button#step click", "effect": "advance step and recompute the tree"},
            {"trigger": "button#reset click", "effect": "restore the same initial tree"},
        ],
        "update": "single update() derives previous/current tree and changed edges from step",
        "initialPaint": "the first AVL rotation step is already applied",
        "visibleEncodings": [
            {"quantity": "balance factor", "mark": "node label", "where": "each tree node"},
            {"quantity": "changed edge", "mark": "accent arrow", "where": "tree stage"},
        ],
        "history": "previous and current trees remain side by side",
        "reset": "restore step=1 and the same insertion sequence",
        "verificationCases": [
            {"input": "initial step=1", "expected": "first imbalance is highlighted"},
            {"input": "one step", "expected": "rotation changes the root and preserves order"},
            {"input": "reset", "expected": "same initial tree and highlight return"},
        ],
        "aestheticDirection": "blueprint",
        "signatureDetail": "the rotating edge keeps a faint previous-position trace",
    }
    contract, problem = compile_interaction_brief(
        interaction_brief,
        profile="state",
        core_insight="逐步追踪 AVL 旋转中的结构变化",
    )
    assert problem == "" and contract is not None
    llm = FakeClient(by_purpose={"widget:build": _genui_response(_GOOD_HTML)})
    result = await generate_widget(
        llm,
        intent="逐步追踪 AVL 旋转",
        theme="lab",
        preplanned_contract=contract,
    )
    assert result.err is None and result.block is not None
    assert [purpose for purpose, _messages in llm.calls] == ["widget:build"]
    assert result.block["spec"]["aesthetic_direction"] == "blueprint"
    assert result.block["spec"]["source_aesthetic_direction"] == "blueprint"
    assert result.block["spec"]["host_integration"]["mode"] == "scoped-role-map"
    build_messages = next(messages for purpose, messages in llm.calls if purpose == "widget:build")
    build_prompt = build_messages[-1]["content"]
    assert "aesthetic_direction: blueprint" in build_prompt
    assert "lever_balance_blueprint" in build_prompt


def test_incomplete_geometry_brief_requires_slow_plan() -> None:
    contract, problem = compile_interaction_brief(
        {"stateModel": []},
        profile="geometry",
        core_insight="拖动点观察约束",
    )
    assert contract is None and "interactionBrief 缺" in problem


def test_compact_brief_rows_compile_without_slow_plan() -> None:
    brief = {
        "stateModel": ["step: 0..2, initial=1"],
        "controls": ["单步", "复位"],
        "update": "single update() applies one deterministic tree transition",
        "initialPaint": "step 1 is visible",
        "visibleEncodings": ["变化的边以强调色显示", "平衡因子显示在节点旁"],
        "history": "before and after remain side by side",
        "reset": "restore step 1",
        "verificationCases": ["初态→失衡节点高亮", "单步→根节点改变", "复位→恢复同一初态"],
        "aestheticDirection": "blueprint",
        "signatureDetail": "旧边保留淡色轨迹",
    }
    contract, problem = compile_interaction_brief(
        brief, profile="state", core_insight="追踪树旋转的结构变化"
    )
    assert problem == "" and contract is not None
    assert contract["visible_encodings"][0]["quantity"] == "变化的边以强调色显示"
    assert contract["verification_cases"][1] == {"input": "单步", "expected": "根节点改变"}


def test_host_palette_integration_preserves_distinct_direction_colors() -> None:
    html = """<style>
    .x { color:#fff; background:var(--bg, #F3F1FA); stroke:#E24B4A }
    </style><svg><circle id='n'/></svg><script>
    const a=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7C3AED';
    document.getElementById('n').setAttribute('stroke', '#E24B4A');
    </script>"""
    compiled = widget_module._compile_host_palette_html(html, render_medium="svg")
    assert compiled == html
    assert "#F3F1FA" in compiled and "#E24B4A" in compiled


async def test_contract_threaded_into_build_prompt() -> None:
    llm = FakeClient(by_purpose={"widget:plan": _CONTRACT, "widget:build": _genui_response(_GOOD_HTML)})
    await generate_widget(llm, intent="演示阻尼单摆", theme="lab", topic="振动")
    build_msgs = next(msgs for purpose, msgs in llm.calls if purpose == "widget:build")
    user_content = build_msgs[-1]["content"]
    # 契约的 core_insight / update 都应被拼进 build 提示，供实现忠实落地。
    assert "阻尼越大，摆幅衰减越快" in user_content
    assert "单一 update()" in user_content
    assert "Aesthetic directions" in user_content
    assert "signature_detail" in user_content
    assert "LectureDoc host adapter" in user_content
    assert "var(--bg)" in user_content and "固定高度" in user_content

    plan_msgs = next(msgs for purpose, msgs in llm.calls if purpose == "widget:plan")
    plan_prompt = plan_msgs[-1]["content"]
    assert "layout_pattern" in plan_prompt and "aesthetic_direction" in plan_prompt
    assert "visible_encodings" in plan_prompt and "verification_cases" in plan_prompt
    assert "interaction_loop" in plan_prompt and "前态/当前态" in user_content
    assert "最小/最大边界" in plan_prompt and "把主图压成一条线" in plan_prompt
    assert "不得无故混用另一种语言" in user_content


async def test_repair_fires_on_machine_tell_warning() -> None:
    # 首轮 build 出带 <h1> 的片段（warning），repair 轮返回干净片段。
    llm = FakeClient(
        by_purpose={
            "widget:plan": _CONTRACT,
            "widget:build": _genui_response(_H1_HTML),
            "widget:repair": _genui_response(_GOOD_HTML),
        }
    )
    r = await generate_widget(llm, intent="x", theme="lab", topic="t", rounds=3)
    assert r.block is not None
    assert "<h1" not in r.block["html"].lower()
    purposes = [p for p, _ in llm.calls]
    assert "widget:repair" in purposes  # 确实回炉过


async def test_repair_fires_on_hard_error() -> None:
    llm = FakeClient(
        by_purpose={
            "widget:plan": _CONTRACT,
            "widget:build": _genui_response(_DOCTYPE_HTML),
            "widget:repair": _genui_response(_GOOD_HTML),
        }
    )
    r = await generate_widget(llm, intent="x", theme="lab", topic="t", rounds=3)
    assert r.err is None and r.block is not None
    assert validate_block(r.block, "sim").errors == []


async def test_quality_repair_reuses_existing_widget_without_replanning() -> None:
    current = {
        "type": "sim",
        "engine": "widget",
        "html": _GOOD_HTML.replace("fillRect(t%320,80,8,8)", "fillRect(t%320,20,8,8)"),
        "spec": json.loads(_CONTRACT),
    }
    llm = FakeClient(by_purpose={"widget:quality-repair": _GOOD_HTML})
    result = await repair_widget(
        llm,
        current=current,
        issues="屏幕 y 轴映射方向相反",
        theme="lab",
        topic="振动",
    )
    assert result.err is None and result.block is not None
    assert result.block["spec"] == current["spec"]
    assert [purpose for purpose, _messages in llm.calls] == ["widget:quality-repair"]


async def test_quality_repair_keeps_selected_direction_guidance() -> None:
    current = {
        "type": "sim",
        "engine": "widget",
        "html": _GOOD_HTML,
        "spec": {**json.loads(_CONTRACT), "aesthetic_direction": "soft-organic", "signature_detail": "seed reveal"},
    }
    llm = FakeClient(by_purpose={"widget:quality-repair": _GOOD_HTML})
    result = await repair_widget(llm, current=current, issues="视觉层级不足", theme="forest")
    assert result.err is None
    messages = llm.calls[0][1]
    prompt = messages[-1]["content"]
    assert "soft-organic" in prompt and "field notebook" in prompt
    assert "不得把不同状态全部改成 --accent" in prompt


async def test_quality_repair_uses_second_round_for_new_static_gate_error() -> None:
    too_small = _GOOD_HTML.replace(
        "<style>.w{", "<style>.meta{font-size:10px}.w{"
    )
    llm = FakeClient(
        by_purpose={
            "widget:quality-repair": too_small,
            "widget:repair": _GOOD_HTML,
        }
    )
    result = await repair_widget(
        llm,
        current={"type": "sim", "engine": "widget", "html": _GOOD_HTML},
        issues="首帧为空",
        theme="slate",
        rounds=2,
    )
    assert result.err is None and result.block is not None
    assert result.block["html"] == _GOOD_HTML
    assert [purpose for purpose, _messages in llm.calls] == [
        "widget:quality-repair",
        "widget:repair",
    ]


async def test_all_rounds_bad_returns_error_not_block() -> None:
    # 每轮都返回硬错误片段 → 末轮应干净失败（block=None + err），不硬塞坏块。
    llm = FakeClient(
        by_purpose={
            "widget:plan": _CONTRACT,
            "widget:build": _genui_response(_DOCTYPE_HTML),
            "widget:repair": _genui_response(_DOCTYPE_HTML),
        }
    )
    r = await generate_widget(llm, intent="x", theme="lab", topic="t", rounds=2)
    assert r.block is None
    assert r.err is not None


async def test_genui_aesthetic_error_is_not_kept_on_last_round() -> None:
    # GenUI 把 <h1> machine-tell 升为硬审美错误；修不掉就拒绝，不能以 best-effort 混入讲义。
    llm = FakeClient(
        by_purpose={
            "widget:plan": _CONTRACT,
            "widget:build": _genui_response(_H1_HTML),
            "widget:repair": _genui_response(_H1_HTML),
        }
    )
    r = await generate_widget(llm, intent="x", theme="lab", topic="t", rounds=2)
    assert r.block is None and r.err and "<h1>" in r.err


async def test_invalid_widget_contract_blocks_unaudited_build() -> None:
    llm = FakeClient(
        by_purpose={"widget:plan": '{"core_insight":"只有一句"}', "widget:build": _genui_response(_GOOD_HTML)}
    )
    result = await generate_widget(llm, intent="比较三种轨迹", theme="lab", topic="优化")
    assert result.block is None and result.err and "设计契约失败" in result.err
    assert [purpose for purpose, _messages in llm.calls] == ["widget:plan", "widget:plan"]


async def test_widget_build_has_own_timeout(monkeypatch) -> None:
    class SlowBuild(FakeClient):
        async def complete(self, messages, *, json_mode=True, purpose="chat"):
            if purpose == "widget:build":
                await asyncio.sleep(1)
            return await super().complete(messages, json_mode=json_mode, purpose=purpose)

    monkeypatch.setattr(widget_module, "_WIDGET_BUILD_TIMEOUT_S", 0.01)
    llm = SlowBuild(by_purpose={"widget:plan": _CONTRACT, "widget:build": _genui_response(_GOOD_HTML)})
    r = await generate_widget(llm, intent="x", theme="lab", topic="t")
    assert r.block is None and r.err and "超时" in r.err


async def test_widget_quality_repair_timeout_does_not_retry(monkeypatch) -> None:
    class SlowRepair(FakeClient):
        async def complete(self, messages, *, json_mode=True, purpose="chat"):
            if purpose == "widget:quality-repair":
                await asyncio.sleep(1)
            return await super().complete(messages, json_mode=json_mode, purpose=purpose)

    monkeypatch.setattr(widget_module, "_WIDGET_BUILD_TIMEOUT_S", 0.01)
    llm = SlowRepair(by_purpose={"widget:quality-repair": _GOOD_HTML})
    result = await repair_widget(
        llm,
        current={"type": "sim", "engine": "widget", "html": _GOOD_HTML},
        issues="修正方向",
        theme="lab",
    )
    assert result.block is None and result.err and "质量修复超时" in result.err
    assert [purpose for purpose, _messages in llm.calls].count("widget:quality-repair") == 0


def test_widget_rejects_hard_coded_colors() -> None:
    bad = _GOOD_HTML.replace("background:var(--bg2)", "background:#3b82f6")
    block = {"type": "sim", "engine": "widget", "html": bad}
    errors = validate_block(block, "sim").errors
    assert any("硬编码颜色" in e for e in errors)


def test_widget_rejects_external_dependencies_that_iframe_cannot_load() -> None:
    for injection in (
        '<script src="https://cdn.example/chart.js"></script>',
        '<script>fetch("https://example.test/data")</script>',
        '<link rel="stylesheet" href="https://example.test/ui.css">',
    ):
        block = {"type": "sim", "engine": "widget", "html": _GOOD_HTML + injection}
        errors = validate_block(block, "sim").errors
        assert any("外部依赖" in error for error in errors)


def test_math_widget_contract_requires_runtime_invariant_assertion() -> None:
    block = {
        "type": "sim",
        "engine": "widget",
        "html": _GOOD_HTML,
        "spec": {"math_model": {"formula": "x_{t+1}=x_t-eta*grad"}},
    }
    errors = validate_block(block, "sim").errors
    assert any("console.assert" in error for error in errors)
    block["html"] = block["html"].replace(
        "requestAnimationFrame(u);</script>",
        "console.assert(1-0.1*2 < 1, 'descent');requestAnimationFrame(u);</script>",
    )
    assert not any("console.assert" in error for error in validate_block(block, "sim").errors)


# ---- 路由：骨架里 sim 占位符带 engine:widget → 编排器走 generate_widget 子配方而非 generate_block ----

_SKELETON_WIDGET = json.dumps(
    {
        "id": "demo",
        "title": "简谐振动",
        "language": "zh-CN",
        "theme": "lab",
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
                "headline": "阻尼单摆",
                "notes": "演示。",
                "blocks": [
                    {
                        "id": "bw",
                        "type": "sim",
                        "engine": "widget",
                        "intent": "演示阻尼单摆",
                        "size": "xl",
                    }
                ],
            },
        ],
    }
)


async def test_skeleton_engine_widget_routes_to_subrecipe() -> None:
    llm = FakeClient(
        by_purpose={
            "plan:skeleton": _SKELETON_WIDGET,
            "block:hero": json.dumps({"type": "hero", "title": ["简谐振动", "副题"]}),
            "widget:plan": _CONTRACT,
            "widget:build": _genui_response(_GOOD_HTML),
            "notes": json.dumps(
                {"note": "本页演示阻尼对摆幅衰减的影响，注意二阶系统需两个状态变量。"}
            ),
        }
    )
    result = await generate_lecture(
        llm, topic="简谐振动", pages=2, theme="lab", options=GeneratorOptions(plan_perspectives=1)
    )
    assert result.errors == []
    widget = result.doc["scenes"][1]["blocks"][0]
    assert widget["type"] == "sim" and widget["engine"] == "widget"
    assert widget["id"] == "bw"  # 回填保留占位符 id
    assert "requestanimationframe" in widget["html"].lower()
    assert validate_doc(result.doc).errors == []
    # 证明走了子配方（widget:build 被调），没走通用 block:sim。
    purposes = [p for p, _ in llm.calls]
    assert "widget:build" in purposes and "block:sim" not in purposes
    assert result.widget_routes == [{"blockId": "bw", "profile": "state", "route": "slow-plan"}]
