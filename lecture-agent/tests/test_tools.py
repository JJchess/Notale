"""tool 抽象测试：calc 安全求值 · tool-loop 真执行 · 录制盒记录工具调用 · sim 生成走 tool-loop。

全用 FakeClient，不联网、不启浏览器——证明 domain/agent 只依赖 ports（Tool + ToolCallingLLM）。
"""

from __future__ import annotations

import json

from lecture_agent.adapters.llm.cassette import CassetteClient
from lecture_agent.adapters.llm.fake import FakeClient
from lecture_agent.domain.generation import generate_block
from lecture_agent.domain.tool_loop import run_tool_loop
from lecture_agent.domain.tools import CalcTool
from lecture_agent.ports.llm import ToolInvocation, Turn


async def test_calc_valid_and_safe() -> None:
    t = CalcTool()
    assert await t.run({"expr": "c + a*(1-c)", "vars": {"c": 0.0, "a": 0.5}}) == "0.5"
    assert (await t.run({"expr": "1/0"})).startswith("ERROR")  # 除零
    assert "ERROR" in await t.run({"expr": "evilFn(3)"})  # 非白名单函数
    assert "ERROR" in await t.run({"expr": "__import__('os')"})  # 危险调用被挡
    assert "ERROR" in await t.run({"expr": "log(-1)"})  # 数学域错误


async def test_tool_loop_executes_tool_then_answers() -> None:
    fake = FakeClient(
        tool_turns=[
            Turn(tool_calls=[ToolInvocation("1", "calc", {"expr": "1+1"})]),  # 先调工具
            Turn(content='{"ok": true}'),  # 再给最终答复
        ]
    )
    out = await run_tool_loop(fake, [{"role": "user", "content": "验证一下"}], {"calc": CalcTool()})
    assert out == '{"ok": true}'
    assert len(fake.tool_calls) == 2  # think→call→observe→answer：两回合


async def test_cassette_records_and_replays_tool_calls(tmp_path) -> None:
    spec = CalcTool().spec
    msgs = [{"role": "user", "content": "hi"}]
    inner = FakeClient(tool_turns=[Turn(content='{"x": 1}')])
    live = CassetteClient(mode="live", fixtures_dir=tmp_path, inner=inner, namespace="t")
    turn = await live.complete_tools(msgs, [spec], purpose="p")
    assert turn.content == '{"x": 1}'
    # 无 inner 的 replay 仍命中同一 tool-fixture → 零 API 复现
    replay = CassetteClient(mode="replay", fixtures_dir=tmp_path, namespace="t")
    assert (await replay.complete_tools(msgs, [spec], purpose="p")).content == '{"x": 1}'


async def test_generate_sim_block_via_tool_loop() -> None:
    sim = json.dumps(
        {
            "type": "sim",
            "engine": "dynamics1d",
            "params": [{"name": "a", "label": "α", "min": 0, "max": 2, "step": 0.1, "default": 1}],
            "model": {"stateVar": "c", "init": 0.0, "steps": 50, "update": "c + a*(1-c)"},
            "regimes": [{"when": "a < 1", "label": "收敛", "desc": "单调"}],
        }
    )
    fake = FakeClient(
        tool_turns=[
            Turn(
                tool_calls=[
                    ToolInvocation("1", "calc", {"expr": "c + a*(1-c)", "vars": {"c": 0, "a": 0.5}})
                ]
            ),
            Turn(content=sim),
        ]
    )
    r = await generate_block(
        fake,
        type="sim",
        intent="演示收敛",
        scene_ctx="",
        contract="（契约略）",
        tools={"calc": CalcTool()},
    )
    assert r.block is not None and r.block["type"] == "sim"
    assert fake.tool_calls, "sim 块应走 tool-loop（模型调了 calc）"
