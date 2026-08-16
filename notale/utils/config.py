"""Strict runtime configuration for the thin Notale harness."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, PositiveFloat, PositiveInt, model_validator


CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.yaml"
SKILLS_PATH = CONFIG_PATH.parent / "skills"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ModelConfig(StrictModel):
    base_url: str
    name: str
    api_key_env: str
    wire_api: Literal["chat_completions", "responses"]
    http_timeout_sec: PositiveFloat
    max_output_tokens: PositiveInt
    reasoning_effort: Literal["low", "medium", "high", "max", "xhigh"]


class AgentConfig(StrictModel):
    max_turns: PositiveInt
    max_duration_sec: PositiveFloat


class AgentsConfig(StrictModel):
    planner: AgentConfig
    builder: AgentConfig

    def role_for(self, role: str) -> AgentConfig:
        if role not in {"planner", "builder"}:
            raise KeyError(f"unknown agent role: {role}")
        return getattr(self, role)


class PipelineConfig(StrictModel):
    page_concurrency: PositiveInt
    run_timeout_sec: PositiveFloat
    fallback_title_max_chars: PositiveInt


class ToolsConfig(StrictModel):
    page_read_default_chars: PositiveInt
    page_read_max_chars: PositiveInt
    inline_js_check_timeout_sec: PositiveFloat
    inline_js_error_max_chars: PositiveInt
    block_reason_max_chars: PositiveInt
    run_js_timeout_sec: PositiveFloat
    run_js_max_source_chars: PositiveInt
    run_js_max_output_chars: PositiveInt
    run_js_max_calls: PositiveInt
    node_process_concurrency: PositiveInt
    node_timeout_retries: int = Field(ge=0, le=2)


class MediaConfig(StrictModel):
    wikimedia_api_url: str
    wikimedia_user_agent: str
    search_results: PositiveInt
    thumbnail_width_px: PositiveInt
    request_timeout_sec: PositiveFloat
    maximum_download_bytes: PositiveInt
    minimum_image_bytes: PositiveInt
    generation_endpoint: str
    generation_api_key_env: str
    generation_model: str
    backend: str = "seedream"
    maximum_find_per_page: PositiveInt
    maximum_make_per_page: PositiveInt
    maximum_find_per_run: PositiveInt
    maximum_make_per_run: PositiveInt


class ComponentsConfig(StrictModel):
    min_width_px: PositiveInt
    max_width_px: PositiveInt
    min_height_px: PositiveInt
    max_height_px: PositiveInt
    max_output_tokens: PositiveInt
    validation_timeout_sec: PositiveFloat
    validation_error_max_chars: PositiveInt
    maximum_repair_calls: int = Field(ge=0, le=1)


class InspectionConfig(StrictModel):
    browser_concurrency: PositiveInt
    browser_timeout_sec: PositiveFloat
    render_settle_ms: int = Field(ge=0, le=5000)
    browser_path_env: str = Field(min_length=1)
    maximum_revisions: int = Field(ge=0, le=10)


class PreviewConfig(StrictModel):
    host: str
    port: int = Field(ge=1, le=65535)


class StyleConfig(StrictModel):
    default_pack: str = Field(min_length=1)
    allow_generation: bool = True
    exemplar_pages: int = Field(ge=0, le=8)


class NotaleConfig(StrictModel):
    model: ModelConfig
    agents: AgentsConfig
    pipeline: PipelineConfig
    tools: ToolsConfig
    media: MediaConfig
    components: ComponentsConfig
    inspection: InspectionConfig
    preview: PreviewConfig
    style: StyleConfig

    @model_validator(mode="after")
    def validate_relationships(self) -> "NotaleConfig":
        if self.tools.page_read_default_chars > self.tools.page_read_max_chars:
            raise ValueError("page_read_default_chars exceeds page_read_max_chars")
        if self.media.maximum_find_per_page > self.media.maximum_find_per_run:
            raise ValueError("media find page budget exceeds run budget")
        if self.media.maximum_make_per_page > self.media.maximum_make_per_run:
            raise ValueError("media make page budget exceeds run budget")
        if self.components.min_width_px > self.components.max_width_px:
            raise ValueError("component minimum width exceeds maximum width")
        if self.components.min_height_px > self.components.max_height_px:
            raise ValueError("component minimum height exceeds maximum height")
        return self


def load_config(path: Path = CONFIG_PATH) -> NotaleConfig:
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"Notale config must be a YAML mapping: {path}")
    return NotaleConfig.model_validate(raw)


@lru_cache(maxsize=1)
def get_config() -> NotaleConfig:
    return load_config()
