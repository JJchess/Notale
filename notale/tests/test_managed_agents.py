import json
from pathlib import Path

import pytest

from notale.agents.loop import AgentLoop, ConversationMessage, ToolUseBlock
from notale.core.models import SkillAssignment
from notale.core.observability import EventLog
from notale.core.stages.contract import SKILL_CATALOG
from notale.roles.profiles import BUILDER, PLANNER
from notale.tests.fake_llm import (
    ScriptedClient,
    text_msg,
    tool_call_msg,
)
from notale.tests.fake_llm import _default_style
from notale.utils.skill_catalog import create_generated_style
from notale.tools.agent_tools import (
    PageToolState,
    builder_tools,
    PlannerRootState,
    root_planner_tools,
)
from notale.tests.fake_llm import _final_plan_to_root


@pytest.mark.asyncio
async def test_agent_loop_edits_then_submits(tmp_path: Path):
    client = ScriptedClient([
        tool_call_msg("edit_page", {
            "mode": "replace", "revision": 0,
            "html": "<section data-notale-page><h1>完成</h1></section>",
        }),
        tool_call_msg("submit_page", {"revision": 1, "notes": "notes"}),
    ])
    state = PageToolState(tmp_path, 1, EventLog(tmp_path))
    agent = AgentLoop(
        role=BUILDER,
        state=state,
        tools=builder_tools(state, set()),
        terminal_tool="submit_page",
        llm=client,
        logger=state.logger,
        agent_id="builder:p1",
        page=1,
    )
    artifact = await agent.run("build")
    assert artifact.notes == "notes"
    assert len(client.requests) == 2
    events = [json.loads(line) for line in (tmp_path / "events.jsonl").read_text().splitlines()]
    kinds = [event["kind"] for event in events]
    assert "agent.started" in kinds
    assert kinds.count("tool.completed") == 2

    first = json.loads(
        (tmp_path / "llm-requests" / "builder-p1" / "turn-0001.json").read_text()
    )
    second = json.loads(
        (tmp_path / "llm-requests" / "builder-p1" / "turn-0002.json").read_text()
    )
    assert [item["role"] for item in first["request"]["messages"]] == [
        "system", "user",
    ]
    assert [item["role"] for item in second["request"]["messages"]] == [
        "system", "user", "assistant", "tool",
    ]
    arguments = json.loads(
        second["request"]["messages"][2]["tool_calls"][0]["function"]["arguments"]
    )
    assert "完成" in arguments["html"]
    assert "api_key" not in json.dumps(second).lower()
    started = [event for event in events if event["kind"] == "llm.call.started"]
    assert started[0]["payload"]["request_path"] == "llm-requests/builder-p1/turn-0001.json"
    assert len(started[0]["payload"]["request_sha256"]) == 64
    assert started[0]["payload"]["request_bytes"] > 0


@pytest.mark.asyncio
async def test_agent_does_not_issue_recovery_query_without_terminal_tool(tmp_path: Path):
    client = ScriptedClient([text_msg("I am done")])
    state = PageToolState(tmp_path, 1, EventLog(tmp_path))
    agent = AgentLoop(
        role=BUILDER,
        state=state,
        tools=builder_tools(state, set()),
        terminal_tool="submit_page",
        llm=client,
        logger=state.logger,
        agent_id="builder:p1",
        page=1,
    )
    with pytest.raises(RuntimeError, match="without calling submit_page"):
        await agent.run("build")
    assert len(client.requests) == 1


@pytest.mark.asyncio
async def test_planner_finishes_with_plan_from_accepted_style(tmp_path: Path, plan_data):
    style = create_generated_style(**_default_style())
    state = PlannerRootState(tmp_path, SKILL_CATALOG, EventLog(tmp_path), style)
    client = ScriptedClient([
        tool_call_msg("plan", _final_plan_to_root(plan_data))
    ])
    agent = AgentLoop(
        role=PLANNER,
        state=state,
        tools=root_planner_tools(state),
        terminal_tool="plan",
        llm=client,
        logger=state.logger,
        agent_id="planner",
    )

    plan = await agent.run("plan")

    assert plan == state.submission
    assert len(client.requests) == 1
    events = [json.loads(line) for line in (tmp_path / "events.jsonl").read_text().splitlines()]
    completed = [event for event in events if event["kind"] == "tool.completed"][-1]
    assert completed["payload"]["tool"] == "plan"
    assert completed["payload"]["is_error"] is False
    assert state.style is not None


def test_selected_skill_is_injected_not_exposed_as_a_tool(tmp_path: Path):
    state = PageToolState(tmp_path, 1, EventLog(tmp_path))
    skill = SKILL_CATALOG.render([SkillAssignment(name="create-sim")])
    agent = AgentLoop(
        role=BUILDER,
        state=state,
        tools=builder_tools(state, {"run_js"}),
        terminal_tool="submit_page",
        llm=ScriptedClient([]),
        logger=state.logger,
        agent_id="builder:p1",
        page=1,
        skill_text=skill,
    )
    assert "Skill: create-sim" in agent.system_prompt
    assert "skill" not in [tool.name for tool in agent.tools]


@pytest.mark.asyncio
async def test_parallel_tool_results_are_replayed_as_separate_openai_messages(tmp_path: Path):
    two_reads = ConversationMessage(
        role="assistant",
        content=[
            ToolUseBlock(id="read-a", name="read_page", input={"find": "a"}),
            ToolUseBlock(id="read-b", name="read_page", input={"find": "b"}),
        ],
    )
    client = ScriptedClient([
        two_reads,
        tool_call_msg("edit_page", {
            "mode": "replace",
            "revision": 0,
            "html": "<section data-notale-page><h1>并发</h1></section>",
        }),
        tool_call_msg("submit_page", {"revision": 1, "notes": ""}),
    ])
    state = PageToolState(tmp_path, 1, EventLog(tmp_path))
    agent = AgentLoop(
        role=BUILDER,
        state=state,
        tools=builder_tools(state, set()),
        terminal_tool="submit_page",
        llm=client,
        logger=state.logger,
        agent_id="builder:p1",
        page=1,
    )

    await agent.run("build")

    followup = client.requests[1].to_openai_body()["messages"]
    assert [item["role"] for item in followup] == [
        "system", "user", "assistant", "tool", "tool",
    ]
    assert [item["tool_call_id"] for item in followup[-2:]] == ["read-a", "read-b"]


@pytest.mark.asyncio
async def test_unknown_tool_is_returned_to_model_as_an_error(tmp_path: Path):
    unknown = tool_call_msg("not_a_tool", {"value": 1})
    client = ScriptedClient([
        unknown,
        tool_call_msg("edit_page", {
            "mode": "replace",
            "revision": 0,
            "html": "<section data-notale-page><h1>恢复</h1></section>",
        }),
        tool_call_msg("submit_page", {"revision": 1, "notes": ""}),
    ])
    state = PageToolState(tmp_path, 1, EventLog(tmp_path))
    agent = AgentLoop(
        role=BUILDER,
        state=state,
        tools=builder_tools(state, set()),
        terminal_tool="submit_page",
        llm=client,
        logger=state.logger,
        agent_id="builder:p1",
        page=1,
    )

    await agent.run("build")

    followup = client.requests[1].to_openai_body()["messages"]
    assert followup[-1] == {
        "role": "tool",
        "tool_call_id": unknown.tool_uses[0].id,
        "content": "Unknown tool: not_a_tool",
    }


@pytest.mark.asyncio
async def test_max_turns_and_timeout_are_hard_boundaries(tmp_path: Path, monkeypatch):
    settings = BUILDER.settings
    monkeypatch.setattr(settings, "max_turns", 1)
    state = PageToolState(tmp_path / "turns", 1, EventLog(tmp_path / "turns"))
    agent = AgentLoop(
        role=BUILDER,
        state=state,
        tools=builder_tools(state, set()),
        terminal_tool="submit_page",
        llm=ScriptedClient([tool_call_msg("read_page", {})]),
        logger=state.logger,
        agent_id="builder:p1",
        page=1,
    )
    with pytest.raises(RuntimeError, match="exceeded max turns"):
        await agent.run("build")

    monkeypatch.setattr(settings, "max_turns", 64)
    monkeypatch.setattr(settings, "max_duration_sec", 0.001)
    state = PageToolState(tmp_path / "timeout", 1, EventLog(tmp_path / "timeout"))
    agent = AgentLoop(
        role=BUILDER,
        state=state,
        tools=builder_tools(state, set()),
        terminal_tool="submit_page",
        llm=ScriptedClient([tool_call_msg("read_page", {})], delay=0.02),
        logger=state.logger,
        agent_id="builder:p1",
        page=1,
    )
    with pytest.raises(RuntimeError, match="exceeded max duration"):
        await agent.run("build")
