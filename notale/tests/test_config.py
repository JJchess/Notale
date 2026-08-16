from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from notale.utils.config import CONFIG_PATH, load_config


def test_config_contains_only_live_sections():
    config = load_config()
    assert set(config.model_dump()) == {
        "model", "agents", "pipeline", "tools", "media", "components", "inspection",
        "preview", "style",
    }
    assert set(config.style.model_dump()) == {
        "default_pack", "allow_generation", "exemplar_pages",
    }
    assert set(config.agents.model_dump()) == {"planner", "builder"}
    assert "maximum_page_count" not in config.pipeline.model_dump()
    assert set(config.model.model_dump()) == {
        "base_url", "name", "api_key_env", "wire_api", "http_timeout_sec",
        "max_output_tokens", "reasoning_effort",
    }
    assert set(config.agents.builder.model_dump()) == {"max_turns", "max_duration_sec"}


def test_active_providers_are_configured():
    config = load_config()
    assert config.model.base_url == "https://api.999555999.com"
    assert config.model.name == "gpt-5.6-sol"
    assert config.model.api_key_env == "API_KEY"
    assert config.model.wire_api == "responses"
    assert config.model.reasoning_effort == "medium"
    assert config.pipeline.page_concurrency == 4
    assert config.media.generation_endpoint == "https://llmapi.paratera.com/v1/images/generations"
    assert config.media.generation_api_key_env == "PARATERA_API_KEY"
    assert config.media.generation_model == "Doubao-Seedream-4.0"
    assert config.components.maximum_repair_calls == 1
    assert config.components.min_width_px < config.components.max_width_px
    assert config.tools.node_process_concurrency == 4
    assert config.tools.node_timeout_retries == 1
    assert config.inspection.browser_concurrency == 4
    assert config.inspection.browser_path_env == "NOTALE_BROWSER_PATH"
    assert config.inspection.maximum_revisions == 4


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
