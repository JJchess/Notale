"""Optional Builder skill discovery, routing, and legacy-plan migration."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
import yaml

from notale.core.models import BuilderPlan, SkillAssignment
from notale.roles.profiles import BUILDER
from notale.utils.config import SKILLS_PATH
from notale.utils.skill_catalog import (
    STYLE_TOKEN_KEYS,
    load_skill_catalog,
    migrate_builder_plan,
)


def _copy_catalog(target: Path) -> None:
    for name in BUILDER.authorized_skills:
        shutil.copytree(SKILLS_PATH / name, target / name)


def test_checked_in_catalog_resolves_only_optional_skills_and_selected_profile():
    catalog = load_skill_catalog(BUILDER, SKILLS_PATH)
    narrative = catalog.skills["narrative-keynote"]

    assert set(catalog.skills) == {
        "narrative-keynote", "create-sim", "create-code-runtime",
    }
    assert set(narrative.profiles) == {
        "bold-signal", "electric-studio", "creative-voltage", "dark-botanical",
        "notebook-tabs", "pastel-geometry", "split-pastel", "vintage-editorial",
        "neon-cyber", "terminal-green", "swiss-modern", "paper-and-ink",
    }
    assert set(narrative.profiles["paper-and-ink"].tokens) <= STYLE_TOKEN_KEYS
    assert narrative.profiles["paper-and-ink"].tokens["accent"] == "#c41e3a"
    assert "Paper and Ink" in narrative.profile_references["paper-and-ink"]
    assert "Neon Cyber" not in narrative.profile_references["paper-and-ink"]
    assert "harnessInjectedRequired" not in catalog.planner_menu()


def test_plan_keeps_only_explicit_optional_assignments_and_allows_empty_pages():
    catalog = load_skill_catalog(BUILDER, SKILLS_PATH)
    plan = catalog.normalize_plan(
        BuilderPlan(
            sharedSkills=[SkillAssignment(
                name="narrative-keynote",
                profile="paper-and-ink",
                instruction="用纸面批注贯穿全书",
            )],
            pageSkills={"p2": [SkillAssignment(name="create-sim")]},
        ),
        {"p1", "p2"},
    )

    assert [item.name for item in plan.assignments_for("p1")] == [
        "narrative-keynote"
    ]
    assert [item.name for item in plan.assignments_for("p2")] == [
        "narrative-keynote", "create-sim",
    ]
    assert catalog.resolved_style_tokens(plan)["accent"] == "#c41e3a"
    assert catalog.normalize_plan(BuilderPlan(), {"p1"}).assignments_for("p1") == []


def test_v1_plan_migration_strips_core_and_preserves_optional_assignments():
    plan, migrated = migrate_builder_plan({
        "schemaVersion": 1,
        "sharedSkills": [
            {"name": "page-builder-core"},
            {
                "name": "narrative-keynote",
                "profile": "paper-and-ink",
                "instruction": "纸面",
            },
        ],
        "pageSkills": {
            "p2": [
                {"name": "page-builder-core"},
                {"name": "create-code-runtime", "instruction": "运行分区"},
            ]
        },
    })

    assert migrated is True and plan.schemaVersion == 2
    assert [item.name for item in plan.sharedSkills] == ["narrative-keynote"]
    assert [item.name for item in plan.pageSkills["p2"]] == ["create-code-runtime"]
    assert plan.pageSkills["p2"][0].instruction == "运行分区"


@pytest.mark.parametrize(
    ("plan", "message"),
    [
        (
            BuilderPlan(sharedSkills=[SkillAssignment(name="narrative-keynote")]),
            "requires one profile",
        ),
        (
            BuilderPlan(sharedSkills=[SkillAssignment(
                name="narrative-keynote", profile="missing-profile"
            )]),
            "does not belong",
        ),
        (
            BuilderPlan(pageSkills={"p1": [SkillAssignment(
                name="narrative-keynote", profile="paper-and-ink"
            )]}),
            "unauthorized skills",
        ),
        (
            BuilderPlan(pageSkills={"p9": [SkillAssignment(name="create-sim")]}),
            "unknown pages",
        ),
    ],
)
def test_plan_rejects_invalid_routing(plan: BuilderPlan, message: str):
    catalog = load_skill_catalog(BUILDER, SKILLS_PATH)
    with pytest.raises(ValueError, match=message):
        catalog.normalize_plan(plan, {"p1", "p2"})


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (
            lambda raw: raw["profiles"]["paper-and-ink"].update({"label": "Paper"}),
            "Extra inputs are not permitted",
        ),
        (
            lambda raw: raw["profiles"]["paper-and-ink"]["tokens"].update(
                {"shadow": "none"}
            ),
            "unknown style token",
        ),
        (
            lambda raw: raw["profiles"]["paper-and-ink"]["tokens"].update(
                {"accent": "url(remote)"}
            ),
            "unsafe style token",
        ),
    ],
)
def test_catalog_rejects_expanded_or_unsafe_profile_schema(
    tmp_path: Path, mutate, message: str
):
    _copy_catalog(tmp_path)
    path = tmp_path / "narrative-keynote" / "profiles.yaml"
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    mutate(raw)
    path.write_text(yaml.safe_dump(raw, allow_unicode=True), encoding="utf-8")

    with pytest.raises((ValueError, TypeError), match=message):
        load_skill_catalog(BUILDER, tmp_path)


def test_catalog_requires_profile_reference(tmp_path: Path):
    _copy_catalog(tmp_path)
    (tmp_path / "narrative-keynote" / "references" / "profile-paper-and-ink.md").unlink()

    with pytest.raises(ValueError, match="profile reference does not exist"):
        load_skill_catalog(BUILDER, tmp_path)
