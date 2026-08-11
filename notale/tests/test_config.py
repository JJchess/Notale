from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from notale.utils.config import CONFIG_PATH, load_config


def test_config_contains_only_live_sections():
    config = load_config()
    assert set(config.model_dump()) == {"model", "agents", "pipeline", "tools", "media", "preview"}
    assert set(config.agents.model_dump()) == {"planner", "builder"}
    assert "maximum_page_count" not in config.pipeline.model_dump()
    assert set(config.model.model_dump()) == {
        "base_url", "name", "api_key_env", "http_timeout_sec", "max_output_tokens",
        "reasoning_effort",
    }
    assert set(config.agents.builder.model_dump()) == {"max_turns", "max_duration_sec"}


def test_active_providers_are_configured():
    config = load_config()
    assert config.model.base_url == "https://openrouter.ai/api/v1"
    assert config.model.name == "anthropic/claude-sonnet-5"
    assert config.model.api_key_env == "OPENROUTER_API_KEY"
    assert config.model.reasoning_effort == "low"
    assert config.pipeline.page_concurrency == 25
    assert config.media.generation_endpoint == "https://llmapi.paratera.com/v1/images/generations"
    assert config.media.generation_api_key_env == "PARATERA_API_KEY"
    assert config.media.generation_model == "Doubao-Seedream-4.0"


def test_config_rejects_research_and_unknown_parameters(tmp_path: Path):
    raw = yaml.safe_load(CONFIG_PATH.read_text())
    raw["research"] = {"branches": []}
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(raw), encoding="utf-8")
    with pytest.raises(ValidationError, match="research"):
        load_config(path)


def test_every_config_value_is_structurally_valid():
    config = load_config()
    assert config.tools.page_read_default_chars <= config.tools.page_read_max_chars
    assert config.media.maximum_find_per_page <= config.media.maximum_find_per_run
