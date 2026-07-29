"""sim.widget 生成子配方（plan→build→repair）+ 骨架 engine:widget 路由到子配方。

用 FakeClient 按 purpose 给罐装两阶段回复，无 I/O、无真 key、无浏览器。
"""

from __future__ import annotations

import json

from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.engine import GeneratorOptions, generate_lecture
from lecture_agent.domain.generation import generate_widget
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

_CONTRACT = json.dumps(
    {
        "core_insight": "阻尼越大，摆幅衰减越快",
        "render_medium": "canvas",
        "state_model": [{"name": "damp", "type": "float", "range": "0..0.2", "init": "0.05"}],
        "interactions": [{"trigger": "range#damp input", "effect": "改 damp、摆动衰减变快"}],
        "update": "单一 update() 按 damp 重推 theta/omega 并重绘摆",
        "initial_paint": "摆已从 60° 释放、正摆动中",
    },
    ensure_ascii=False,
)


async def test_two_stage_produces_valid_widget() -> None:
    llm = FakeClient(by_purpose={"widget:plan": _CONTRACT, "widget:build": _GOOD_HTML})
    r = await generate_widget(llm, intent="演示阻尼单摆", theme="lab", topic="振动")
    assert r.err is None
    assert r.block is not None
    assert r.block["type"] == "sim" and r.block["engine"] == "widget"
    assert validate_block(r.block, "sim").errors == []
    # 恰好一次 plan + 一次 build（首轮就干净，不该触发 repair）。
    purposes = [p for p, _ in llm.calls]
    assert purposes == ["widget:plan", "widget:build"]


async def test_contract_threaded_into_build_prompt() -> None:
    llm = FakeClient(by_purpose={"widget:plan": _CONTRACT, "widget:build": _GOOD_HTML})
    await generate_widget(llm, intent="演示阻尼单摆", theme="lab", topic="振动")
    build_msgs = next(msgs for purpose, msgs in llm.calls if purpose == "widget:build")
    user_content = build_msgs[-1]["content"]
    # 契约的 core_insight / update 都应被拼进 build 提示，供实现忠实落地。
    assert "阻尼越大，摆幅衰减越快" in user_content
    assert "单一 update()" in user_content


async def test_repair_fires_on_machine_tell_warning() -> None:
    # 首轮 build 出带 <h1> 的片段（warning），repair 轮返回干净片段。
    llm = FakeClient(by_purpose={"widget:build": _H1_HTML, "widget:repair": _GOOD_HTML})
    r = await generate_widget(llm, intent="x", theme="lab", topic="t", rounds=3)
    assert r.block is not None
    assert "<h1" not in r.block["html"].lower()
    purposes = [p for p, _ in llm.calls]
    assert "widget:repair" in purposes  # 确实回炉过


async def test_repair_fires_on_hard_error() -> None:
    llm = FakeClient(by_purpose={"widget:build": _DOCTYPE_HTML, "widget:repair": _GOOD_HTML})
    r = await generate_widget(llm, intent="x", theme="lab", topic="t", rounds=3)
    assert r.err is None and r.block is not None
    assert validate_block(r.block, "sim").errors == []


async def test_all_rounds_bad_returns_error_not_block() -> None:
    # 每轮都返回硬错误片段 → 末轮应干净失败（block=None + err），不硬塞坏块。
    llm = FakeClient(by_purpose={"widget:build": _DOCTYPE_HTML, "widget:repair": _DOCTYPE_HTML})
    r = await generate_widget(llm, intent="x", theme="lab", topic="t", rounds=2)
    assert r.block is None
    assert r.err is not None


async def test_last_round_warning_only_is_best_effort_kept() -> None:
    # 每轮都只有 warning（<h1>）→ 末轮 best-effort 收下（不丢内容），warns 透出。
    llm = FakeClient(by_purpose={"widget:build": _H1_HTML, "widget:repair": _H1_HTML})
    r = await generate_widget(llm, intent="x", theme="lab", topic="t", rounds=2)
    assert r.block is not None  # 收下
    assert r.warns  # warning 透出


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
            "widget:build": _GOOD_HTML,
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
