import json
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

    collision = {**_default_style(), "name": "style-studio"}
    result = await tool.execute(StyleInput.model_validate(collision), context)
    assert result.is_error
    assert "packaged Skill" in result.output
    assert state.style is None
