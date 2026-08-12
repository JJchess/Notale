import json
from copy import deepcopy
from pathlib import Path

import pytest

from notale.agents.loop import AgentLoop, ConversationMessage, ToolUseBlock
from notale.core.observability import EventLog
from notale.core.stages.contract import SKILL_CATALOG
from notale.roles.profiles import PLANNER
from notale.tests.fake_llm import (
    ScriptedClient,
    _default_style,
    _final_plan_to_root,
    tool_call_msg,
)
from notale.tools.agent_tools import (
    PlanInput,
    PlanTool,
    PlannerRootState,
    StyleInput,
    StyleTool,
    root_planner_tools,
)
from notale.tools.base import ToolContext


@pytest.mark.asyncio
async def test_style_and_plan_in_one_message_still_require_a_later_turn(
    tmp_path: Path, plan_data
):
    state = PlannerRootState(tmp_path, SKILL_CATALOG, EventLog(tmp_path))
    plan_input = _final_plan_to_root(plan_data)
    same_turn = ConversationMessage(
        role="assistant",
        content=[
            ToolUseBlock(name="style", input=_default_style()),
            ToolUseBlock(name="plan", input=plan_input),
        ],
    )
    client = ScriptedClient([same_turn, tool_call_msg("plan", plan_input)])
    agent = AgentLoop(
        role=PLANNER,
        state=state,
        tools=root_planner_tools(state),
        terminal_tool="plan",
        llm=client,
        logger=state.logger,
        agent_id="planner",
    )

    assert await agent.run("plan") == state.submission
    assert len(client.requests) == 2
    events = [
        json.loads(line)
        for line in (tmp_path / "events.jsonl").read_text().splitlines()
    ]
    plans = [
        event for event in events
        if event["kind"] == "tool.completed"
        and event["payload"]["tool"] == "plan"
    ]
    assert [event["payload"]["is_error"] for event in plans] == [True, False]


@pytest.mark.asyncio
async def test_style_rejects_unsafe_tokens_and_packaged_name_collisions(tmp_path: Path):
    state = PlannerRootState(tmp_path, SKILL_CATALOG, EventLog(tmp_path))
    tool = StyleTool(state)
    context = ToolContext(state.workspace, {"turn": 1})
    unsafe = _default_style()
    unsafe["tokens"] = {**unsafe["tokens"], "accent": "url(https://example.com/x)"}
    result = await tool.execute(StyleInput.model_validate(unsafe), context)
    assert result.is_error
    assert state.style is None

    low_contrast = _default_style()
    low_contrast["tokens"] = {
        **low_contrast["tokens"], "bg": "#111111", "ink": "#222222"
    }
    result = await tool.execute(StyleInput.model_validate(low_contrast), context)
    assert result.is_error
    assert "contrast" in result.output
    assert state.style is None

    collision = {**_default_style(), "name": "style-studio"}
    result = await tool.execute(StyleInput.model_validate(collision), context)
    assert result.is_error
    assert "packaged Skill" in result.output
    assert state.style is None


@pytest.mark.asyncio
async def test_plan_rejects_unknown_incompatible_and_repeated_compositions(
    tmp_path: Path, plan_data
):
    state = PlannerRootState(tmp_path, SKILL_CATALOG, EventLog(tmp_path))
    style_context = ToolContext(state.workspace, {"turn": 1})
    styled = await StyleTool(state).execute(
        StyleInput.model_validate(_default_style()), style_context
    )
    assert not styled.is_error
    base = _final_plan_to_root(plan_data)

    unknown = deepcopy(base)
    unknown["chapter_pages"][0]["pages"][0]["composition"] = "not-in-catalog"
    result = await PlanTool(state).execute(
        PlanInput.model_validate(unknown), ToolContext(state.workspace, {"turn": 2})
    )
    assert result.is_error
    assert "unknown composition" in result.output

    repeated = deepcopy(base)
    repeated["chapter_pages"][0]["pages"][1]["composition"] = "route-field"
    result = await PlanTool(state).execute(
        PlanInput.model_validate(repeated), ToolContext(state.workspace, {"turn": 2})
    )
    assert result.is_error
    assert "adjacent pages" in result.output

    incompatible_style = _default_style()
    incompatible_style["name"] = "incompatible-style"
    for item in incompatible_style["compositions"]:
        if item["id"] == "route-field":
            item["page_types"].remove("section-break")
    other_state = PlannerRootState(
        tmp_path / "other", SKILL_CATALOG, EventLog(tmp_path / "other")
    )
    styled = await StyleTool(other_state).execute(
        StyleInput.model_validate(incompatible_style),
        ToolContext(other_state.workspace, {"turn": 1}),
    )
    assert not styled.is_error
    result = await PlanTool(other_state).execute(
        PlanInput.model_validate(base), ToolContext(other_state.workspace, {"turn": 2})
    )
    assert result.is_error
    assert "does not support section-break" in result.output
