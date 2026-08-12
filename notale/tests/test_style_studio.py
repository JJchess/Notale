import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from notale.agents.style import _provider_style_schema, generate_run_style
from notale.core.models import StyleOutput
from notale.core.observability import EventLog
from notale.core.stages.contract import SKILL_CATALOG, STYLE_STUDIO
from notale.tests.fake_llm import (
    ScriptedClient,
    _default_style,
    _final_plan_to_root,
    text_msg,
)
from notale.tools.agent_tools import PlanInput, PlanTool, PlannerRootState
from notale.tools.base import ToolContext
from notale.utils.skill_catalog import create_generated_style


@pytest.mark.asyncio
async def test_style_is_one_strict_tool_free_structured_call(tmp_path: Path):
    payload = _default_style()
    client = ScriptedClient([text_msg(json.dumps(payload, ensure_ascii=False))])

    style = await generate_run_style(
        client,
        "法国大革命，面向高中生",
        run_dir=tmp_path,
        logger=EventLog(tmp_path),
        skill_text=STYLE_STUDIO.body,
    )

    assert style.name == payload["name"]
    assert len(client.requests) == 1
    request = client.requests[0]
    body = request.to_openai_body()
    assert request.tools == []
    assert "tools" not in body
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["strict"] is True
    assert body["extra_body"]["provider"] == {"require_parameters": True}
    assert [item["role"] for item in body["messages"]] == ["system", "user"]
    assert (tmp_path / "llm-responses" / "style" / "turn-0001.json").is_file()
    assert (tmp_path / "skills" / style.name / "SKILL.md").is_file()


def test_style_schema_requires_every_token_and_forbids_extras():
    missing = _default_style()
    del missing["tokens"]["font"]
    with pytest.raises(ValidationError):
        StyleOutput.model_validate(missing)

    extra = _default_style()
    extra["tokens"]["shadow"] = "none"
    with pytest.raises(ValidationError):
        StyleOutput.model_validate(extra)

    assert "minItems" not in json.dumps(_provider_style_schema())
    assert "maxItems" not in json.dumps(_provider_style_schema())
    assert "exactly 5 to 7" in json.dumps(_provider_style_schema())


@pytest.mark.asyncio
async def test_invalid_style_fails_without_content_retry(tmp_path: Path):
    payload = _default_style()
    payload["tokens"] = {
        **payload["tokens"], "bg": "#111111", "ink": "#222222"
    }
    client = ScriptedClient([text_msg(json.dumps(payload))])

    with pytest.raises(ValueError, match="contrast"):
        await generate_run_style(
            client,
            "topic",
            run_dir=tmp_path,
            logger=EventLog(tmp_path),
            skill_text=STYLE_STUDIO.body,
        )

    assert len(client.requests) == 1
    assert not (tmp_path / "skills" / payload["name"]).exists()


@pytest.mark.asyncio
async def test_plan_rejects_unknown_incompatible_and_repeated_compositions(
    tmp_path: Path, plan_data
):
    style = create_generated_style(**_default_style())
    state = PlannerRootState(tmp_path, SKILL_CATALOG, EventLog(tmp_path), style)
    base = _final_plan_to_root(plan_data)

    unknown = deepcopy(base)
    unknown["chapter_pages"][0]["pages"][0]["composition"] = "not-in-catalog"
    result = await PlanTool(state).execute(
        PlanInput.model_validate(unknown), ToolContext(state.workspace, {"turn": 1})
    )
    assert result.is_error
    assert "unknown composition" in result.output

    repeated = deepcopy(base)
    repeated["chapter_pages"][0]["pages"][1]["composition"] = "route-field"
    result = await PlanTool(state).execute(
        PlanInput.model_validate(repeated), ToolContext(state.workspace, {"turn": 1})
    )
    assert result.is_error
    assert "adjacent pages" in result.output

    incompatible_style = _default_style()
    incompatible_style["name"] = "incompatible-style"
    for item in incompatible_style["compositions"]:
        if item["id"] == "route-field":
            item["page_types"].remove("section-break")
    other_style = create_generated_style(**incompatible_style)
    other_state = PlannerRootState(
        tmp_path / "other", SKILL_CATALOG, EventLog(tmp_path / "other"), other_style
    )
    result = await PlanTool(other_state).execute(
        PlanInput.model_validate(base), ToolContext(other_state.workspace, {"turn": 1})
    )
    assert result.is_error
    assert "does not support section-break" in result.output
