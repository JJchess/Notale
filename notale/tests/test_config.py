"""The checked-in YAML is the validated source for every runtime budget."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from notale.utils.config import CONFIG_PATH, get_config, load_config


def test_checked_in_config_loads_and_covers_all_roles_and_page_types():
    config = get_config()
    assert CONFIG_PATH.name == "config.yaml" and config.schema_version == 13
    assert config.versions.agent_protocol == "12"
    assert config.versions.logging_schema == "9"
    assert set(config.agents.roles) == {"intake", "research", "planner", "builder"}
    assert config.model.base_url == "https://llmapi.paratera.com/v1"
    assert config.model.name == "Claude-Sonnet-5"
    assert config.model.api_key_env == "PARATERA_API_KEY"
    assert set(config.model.model_dump()) == {
        "base_url", "name", "api_key_env", "http_timeout_sec",
    }
    assert "version" not in config.agents.defaults.model_dump()
    assert "llm_error_preview_chars" not in config.runtime.model_dump()
    assert "scratch_read_default_chars" not in config.tools.model_dump()
    assert config.model_capabilities.context_window_tokens == 1_000_000
    assert config.model_capabilities.max_output_tokens == 128_000
    assert config.governance.emergency_limits.worker_max_turns == 128
    assert config.agents.role_for("planner").auto_compact_threshold_tokens == 240_000
    assert config.preview.port == 3002
    assert config.media.generation_endpoint == (
        "https://llmapi.paratera.com/v1/images/generations"
    )
    assert config.media.generation_api_key_env == "PARATERA_API_KEY"
    assert config.media.generation_model == "Doubao-Seedream-4.0"
    assert config.research.enabled is True
    assert [(branch.id, branch.focus) for branch in config.research.branches] == [
        ("r1", "教学序列"),
        ("r2", "例题与反例"),
        ("r3", "常见误解"),
        ("r4", "素材史料数据"),
    ]
    assert "interaction_probe" not in config.model_dump()
    assert "workflow" not in config.model_dump()
    assert all(branch.skills == ["web-access"] for branch in config.research.branches)


def test_config_rejects_unknown_fields(tmp_path: Path):
    raw = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    raw["model"]["max_ouput_typo"] = 1
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(raw, allow_unicode=True), encoding="utf-8")
    with pytest.raises(ValidationError, match="max_ouput_typo"):
        load_config(path)


def test_config_rejects_removed_workflow_block(tmp_path: Path):
    raw = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    raw["workflow"] = {"builder": {"required_skills": ["page-builder-core"]}}
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(raw, allow_unicode=True), encoding="utf-8")

    with pytest.raises(ValidationError, match="workflow"):
        load_config(path)


def test_config_accepts_arbitrary_research_specializations(tmp_path: Path):
    raw = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    raw["research"]["branches"] = [
        {
            "id": "case-library",
            "enabled": True,
            "focus": "寻找可用于课堂推演的真实案例",
            "skills": ["web-access"],
            "tools": ["web_search", "fetch_web"],
        },
        {
            "id": "disabled-history",
            "enabled": False,
            "focus": "历史脉络",
            "skills": [],
            "tools": [],
        },
    ]
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(raw, allow_unicode=True), encoding="utf-8")

    config = load_config(path)

    assert [branch.id for branch in config.research.branches] == [
        "case-library", "disabled-history"
    ]
    assert config.research.branches[1].enabled is False


def test_config_allows_research_stage_to_be_disabled(tmp_path: Path):
    raw = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    raw["research"]["enabled"] = False
    raw["research"]["branches"] = []
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(raw, allow_unicode=True), encoding="utf-8")

    config = load_config(path)

    assert config.research.enabled is False
    assert config.research.branches == []


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (
            lambda branches: branches.append(dict(branches[0])),
            "duplicate IDs",
        ),
        (
            lambda branches: branches[0].update({"tools": ["page_write"]}),
            "page_write",
        ),
        (
            lambda branches: branches[0].update({"skills": ["missing-skill"]}),
            "skill does not exist",
        ),
        (
            lambda branches: branches[0].update({"id": "../unsafe"}),
            "string_pattern_mismatch",
        ),
        (
            lambda branches: branches[0].update(
                {"skills": ["web-access", "web-access"]}
            ),
            "duplicate skills",
        ),
        (
            lambda branches: branches[0].update(
                {"tools": ["web_search", "web_search"]}
            ),
            "duplicate tools",
        ),
    ],
)
def test_config_rejects_invalid_research_plugins(tmp_path: Path, mutate, message: str):
    raw = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))
    mutate(raw["research"]["branches"])
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(raw, allow_unicode=True), encoding="utf-8")

    with pytest.raises((ValidationError, ValueError), match=message):
        load_config(path)
