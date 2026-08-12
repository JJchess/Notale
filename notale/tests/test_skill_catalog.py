from copy import deepcopy

import pytest

from notale.core.models import LecturePlan, SkillAssignment
from notale.core.stages.contract import PLANNER_SKILL_CATALOG, SKILL_CATALOG, STYLE_STUDIO
from notale.tools.agent_tools import OPTIONAL_PAGE_TOOLS
from notale.utils.skill_catalog import (
    create_generated_style,
    load_generated_style,
    write_generated_style,
)
from notale.tests.fake_llm import _default_compositions


def test_catalog_validates_and_renders_selected_skills(plan_data):
    plan = LecturePlan.model_validate(plan_data)
    assert SKILL_CATALOG.validate_plan(plan, OPTIONAL_PAGE_TOOLS) is plan
    rendered = SKILL_CATALOG.render(plan.pages[2].skills)
    assert "Skill: create-sim" in rendered
    assert "narrative-keynote" not in SKILL_CATALOG.skills
    assert "pudding-playable-visual-essay" not in SKILL_CATALOG.skills
    assert "style-studio" not in PLANNER_SKILL_CATALOG.skills
    assert "profile" not in SkillAssignment.model_json_schema()["properties"]


def test_style_studio_preserves_builder_page_and_media_contract():
    body = STYLE_STUDIO.body
    for required in (
        "1280×720",
        "data-notale-page",
        "--notale-*",
        "real algorithm, equation, rule, dataset, or state machine",
        "Treat assigned tools as a hard capability boundary",
        "never allocate tools or providers",
        "identifiable people, documents, places, and historical events",
        "Create exactly 5–7 structurally distinct, topic-specific families",
        "focal-object",
        "interactive-workbench",
        "Collectively support all page types",
    ):
        assert required in body


def test_generated_style_round_trips_and_detects_tampering(tmp_path):
    style = create_generated_style(
        name="revolutionary-broadsheet",
        description="A changing broadsheet system.",
        body="# Revolutionary Broadsheet\n\nInk, rupture, and accumulated evidence.",
        tokens={
            "bg": "#f4eedf", "surface": "#fffaf0", "ink": "#201a17",
            "muted": "#756b63", "accent": "#a52a2a", "accent-2": "#1f5d73",
            "line": "#b7aa99", "font": "Georgia, serif",
        },
        compositions=_default_compositions(),
    )
    write_generated_style(tmp_path, style)
    assert load_generated_style(tmp_path, style.reference) == style
    assert (tmp_path / style.name / "compositions.json").is_file()
    token_path = tmp_path / style.name / "tokens.json"
    token_path.write_text(token_path.read_text().replace("#a52a2a", "#000000"))
    with pytest.raises(ValueError, match="hash mismatch"):
        load_generated_style(tmp_path, style.reference)


def test_generated_style_rejects_weak_composition_catalogs():
    base = {
        "name": "composition-test",
        "description": "A composition validation fixture.",
        "body": "# Composition test\n\nA complete shared visual law.",
        "tokens": {
            "bg": "#f4eedf", "surface": "#fffaf0", "ink": "#201a17",
            "muted": "#756b63", "accent": "#a52a2a", "accent-2": "#1f5d73",
            "line": "#b7aa99", "font": "Georgia, serif",
        },
        "compositions": _default_compositions(),
    }

    too_few = deepcopy(base)
    too_few["compositions"] = too_few["compositions"][:4]
    with pytest.raises(ValueError, match="5 to 7"):
        create_generated_style(**too_few)

    repeated = deepcopy(base)
    repeated["compositions"][1]["primary"] = "focal-object"
    repeated["compositions"][1]["secondary"] = "process-path"
    with pytest.raises(ValueError, match="signatures"):
        create_generated_style(**repeated)

    uncovered = deepcopy(base)
    for item in uncovered["compositions"]:
        item["page_types"] = ["narrative-scene"]
    with pytest.raises(ValueError, match="do not cover page types"):
        create_generated_style(**uncovered)


def test_plan_rejects_unassigned_tools(plan_data):
    plan_data["pages"][0]["tools"] = ["bash"]
    plan = LecturePlan.model_validate(plan_data)
    with pytest.raises(ValueError, match="unknown tools"):
        SKILL_CATALOG.validate_plan(plan, OPTIONAL_PAGE_TOOLS)


def test_plan_rejects_page_use_of_design_skill(plan_data):
    plan_data["pages"][0]["skills"] = [{"name": "narrative-keynote"}]
    plan = LecturePlan.model_validate(plan_data)
    with pytest.raises(ValueError, match="allowed capability"):
        SKILL_CATALOG.validate_plan(plan, OPTIONAL_PAGE_TOOLS)
