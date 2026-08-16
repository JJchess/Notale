import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from notale.agents.style import _provider_style_schema, generate_style_output
from notale.core.models import StyleOutput
from notale.core.observability import EventLog
from notale.core.stages.contract import SKILL_CATALOG, STYLE_STUDIO
from notale.style_studio.build.from_topic import build_from_topic
from notale.style_studio.registry import get_pack
from notale.tests.fake_llm import (
    ScriptedClient,
    _default_style,
    _final_plan_to_root,
    text_msg,
)
from notale.tools.agent_tools import PlanInput, PlanTool, PlannerRootState
from notale.tools.base import ToolContext
from notale.utils.skill_catalog import create_generated_style


def test_style_studio_requires_builder_executable_design_guidance():
    assert "### Scale and spacing recipe" in STYLE_STUDIO.body
    assert "recommended CSS-pixel ranges" in STYLE_STUDIO.body
    assert "### Component grammar" in STYLE_STUDIO.body
    assert "hard acceptance rules" in STYLE_STUDIO.body


@pytest.mark.asyncio
async def test_style_is_one_strict_tool_free_structured_call(tmp_path: Path):
    payload = _default_style()
    client = ScriptedClient([text_msg(json.dumps(payload, ensure_ascii=False))])

    style = await generate_style_output(
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
    system_text = body["messages"][0]["content"]
    assert "Installed offline font catalog" in system_text
    assert "`smiley-sans`" in system_text
    assert "`jetbrains-mono`" in system_text
    assert (tmp_path / "llm-responses" / "style" / "turn-0001.json").is_file()
    # Generation no longer persists: turning the output into a pack, and the run
    # skill, is style_studio.build.from_topic's job.
    assert not (tmp_path / "skills").exists()


def test_style_schema_requires_every_token_and_forbids_extras():
    missing = _default_style()
    del missing["tokens"]["font-display"]
    with pytest.raises(ValidationError):
        StyleOutput.model_validate(missing)

    extra = _default_style()
    extra["tokens"]["shadow"] = "none"
    with pytest.raises(ValidationError):
        StyleOutput.model_validate(extra)

    assert "minItems" not in json.dumps(_provider_style_schema())
    assert "maxItems" not in json.dumps(_provider_style_schema())
    assert "sized to the learning request" in json.dumps(_provider_style_schema())


@pytest.mark.parametrize(
    "name",
    ["single", "two-words-2026", "Too-Words", "one_two", "five-word-style-name-is-long"],
)
def test_style_name_is_two_to_four_lowercase_alphabetic_words(name):
    payload = _default_style()
    payload["name"] = name
    with pytest.raises(ValidationError):
        StyleOutput.model_validate(payload)


@pytest.mark.parametrize("name", ["paper-ledger", "quiet-civic-field", "ink-path-study-system"])
def test_valid_style_names_follow_the_library_slug_contract(name):
    payload = _default_style()
    payload["name"] = name
    assert StyleOutput.model_validate(payload).name == name


def test_style_schema_exposes_role_specific_offline_font_enums():
    schema = StyleOutput.model_json_schema()
    properties = schema["$defs"]["StyleTokens"]["properties"]
    assert set(properties) >= {"font-display", "font-body", "font-mono"}
    assert len(schema["$defs"]["FontDisplayId"]["enum"]) == 18
    assert set(schema["$defs"]["FontBodyId"]["enum"]) == {
        "noto-sans-sc", "noto-serif-sc", "lxgw-wenkai", "zhuque-fangsong",
        "inter", "source-serif-4", "space-grotesk",
    }
    assert set(schema["$defs"]["FontMonoId"]["enum"]) == {
        "jetbrains-mono", "ibm-plex-mono",
    }

    invalid = _default_style()
    invalid["tokens"]["font-body"] = "smiley-sans"
    with pytest.raises(ValidationError):
        StyleOutput.model_validate(invalid)


def test_style_schema_exposes_composition_id_slug_contract():
    schema = _provider_style_schema()
    composition = schema["$defs"]["CompositionSpec"]
    identifier = composition["properties"]["id"]

    assert identifier["pattern"] == r"^[a-z0-9][a-z0-9-]*$"
    assert "localized label" in identifier["description"]

    invalid = _default_style()
    invalid["compositions"][0]["id"] = "双缝初见"
    with pytest.raises(ValidationError):
        StyleOutput.model_validate(invalid)


@pytest.mark.asyncio
async def test_style_catalog_count_is_not_hard_capped(tmp_path: Path):
    payload = _default_style()
    common = {
        "page_types": ["narrative-scene"],
        "use_when": "The claim needs this carrier.",
        "spatial_logic": "Use one deliberate reading path.",
        "dominant_carrier": "One subject-specific visual object.",
        "text_role": "Concise labels support the carrier.",
        "variation": "Scale may change while the carrier stays dominant.",
        "avoid": "Do not use generic presentation furniture.",
    }
    payload["compositions"].extend([
        {
            "id": "matrix-grid", "name": "Matrix Grid", "primary": "matrix",
            "secondary": None, **common,
        },
        {
            "id": "statement-field", "name": "Statement Field",
            "primary": "typographic-statement", "secondary": "full-bleed-evidence",
            **common,
        },
    ])
    client = ScriptedClient([text_msg(json.dumps(payload, ensure_ascii=False))])

    style = await generate_style_output(
        client,
        "topic",
        run_dir=tmp_path,
        logger=EventLog(tmp_path),
        skill_text=STYLE_STUDIO.body,
    )

    assert len(client.requests) == 1
    assert len(style.compositions) == 8
    assert style.compositions[-1].id == "statement-field"
    raw = json.loads((tmp_path / "llm-responses" / "style" / "turn-0001.json").read_text())
    assert len(raw["compositions"]) == 8


@pytest.mark.asyncio
async def test_unreadable_generated_palette_falls_back_instead_of_failing(tmp_path: Path):
    """An unreadable palette used to end the run. Now it costs only the palette."""
    payload = _default_style()
    payload["tokens"] = {**payload["tokens"], "bg": "#111111", "ink": "#222222"}
    client = ScriptedClient([text_msg(json.dumps(payload))])

    pack = await build_from_topic(
        client,
        "topic",
        run_dir=tmp_path,
        logger=EventLog(tmp_path),
        skill_text=STYLE_STUDIO.body,
        parent_id="swiss-modern",
    )

    assert len(client.requests) == 1
    tokens = pack.notale_tokens()
    assert tokens["bg"] != "#111111"
    assert tokens == get_pack("swiss-modern").notale_tokens()
    # Everything the model got right is still its own.
    assert pack.skill_body() == payload["body"]
    assert [item.id for item in pack.compositions()] == [
        item["id"] for item in payload["compositions"]
    ]
    report = json.loads((pack.pack_dir / "merge_report.json").read_text())
    rejected = [
        field for field in report["fields"] if "rejected" in str(field.get("note") or "")
    ]
    assert rejected and rejected[0]["path"] == "identity.notale_tokens"
    assert rejected[0]["source"] == "parent"


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
