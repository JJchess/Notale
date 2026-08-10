"""Typed, single-source runtime configuration loaded from ``notale/config.yaml``."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, PositiveFloat, PositiveInt, model_validator


CONFIG_PATH = Path(__file__).resolve().parents[1] / "config.yaml"
SKILLS_PATH = CONFIG_PATH.parent / "skills"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class VersionsConfig(StrictModel):
    agent_protocol: str
    logging_schema: str


class ModelConfig(StrictModel):
    base_url: str
    name: str
    api_key_env: str
    http_timeout_sec: PositiveFloat


class ModelCapabilitiesConfig(StrictModel):
    context_window_tokens: PositiveInt
    max_output_tokens: PositiveInt


class AgentDefaultsConfig(StrictModel):
    auto_compact_threshold_tokens: PositiveInt


class AgentRoleConfig(StrictModel):
    auto_compact_threshold_tokens: PositiveInt


class ProgressGovernanceConfig(StrictModel):
    no_progress_turns: PositiveInt
    repeated_tool_error_limit: PositiveInt
    repeated_validation_error_limit: PositiveInt
    prose_only_turns: PositiveInt


class EmergencyLimitsConfig(StrictModel):
    provider_timeout_sec: PositiveFloat
    provider_max_attempts: PositiveInt
    query_max_turns: PositiveInt
    query_max_duration_sec: PositiveFloat
    worker_max_turns: PositiveInt
    worker_max_duration_sec: PositiveFloat
    worker_max_total_tokens: PositiveInt
    run_max_duration_sec: PositiveFloat
    run_max_total_tokens: PositiveInt


class GovernanceConfig(StrictModel):
    progress: ProgressGovernanceConfig
    emergency_limits: EmergencyLimitsConfig


class AgentsConfig(StrictModel):
    defaults: AgentDefaultsConfig
    roles: dict[str, AgentRoleConfig]

    def role_for(self, role: str) -> AgentRoleConfig:
        configured = self.roles.get(role)
        if configured is not None:
            return configured
        return AgentRoleConfig(
            auto_compact_threshold_tokens=self.defaults.auto_compact_threshold_tokens,
        )


class RuntimeConfig(StrictModel):
    context_token_safety_factor: PositiveFloat
    minimum_message_compact_threshold_tokens: PositiveInt
    tool_receipt_preview_chars: PositiveInt
    parsing_error_preview_chars: PositiveInt
    agent_failure_reason_max_chars: PositiveInt
    cli_message_preview_chars: PositiveInt
    run_id_suffix_chars: PositiveInt


class PipelineConfig(StrictModel):
    page_concurrency: PositiveInt
    default_duration_min: PositiveInt
    maximum_page_count: PositiveInt
    default_page_time_budget_sec: PositiveInt
    fallback_title_max_chars: PositiveInt


class ResearchBranchConfig(StrictModel):
    """One independently governed Research specialization."""

    id: str = Field(min_length=1, pattern=r"^[a-z0-9][a-z0-9-]*$")
    enabled: bool = True
    focus: str = Field(min_length=1)
    skills: list[str] = Field(default_factory=list)
    tools: list[Literal["web_search", "fetch_web"]] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_branch(self) -> "ResearchBranchConfig":
        if not self.focus.strip():
            raise ValueError("research branch focus must not be blank")
        invalid_skills = [
            skill for skill in self.skills
            if re.fullmatch(r"[a-z0-9][a-z0-9-]*", skill) is None
        ]
        if invalid_skills:
            raise ValueError(
                f"research branch {self.id} contains invalid skills: {invalid_skills}"
            )
        if len(self.skills) != len(set(self.skills)):
            raise ValueError(f"research branch {self.id} contains duplicate skills")
        if len(self.tools) != len(set(self.tools)):
            raise ValueError(f"research branch {self.id} contains duplicate tools")
        return self


class ResearchConfig(StrictModel):
    enabled: bool
    branches: list[ResearchBranchConfig]
    web_search_max_requests_per_branch: PositiveInt
    fetch_max_requests_per_branch: PositiveInt
    max_notes_per_branch: PositiveInt
    max_records_per_branch: PositiveInt
    max_pedagogy_per_branch: PositiveInt
    fetch_excerpt_chars: PositiveInt


class ToolsConfig(StrictModel):
    chunk_max_chars: PositiveInt
    skill_chunk_default_chars: PositiveInt
    skill_chunk_min_chars: PositiveInt
    artifact_chunk_default_chars: PositiveInt
    context_chunk_default_chars: PositiveInt
    context_chunk_min_chars: PositiveInt
    page_read_default_chars: PositiveInt
    search_default_results: PositiveInt
    search_max_results: PositiveInt
    web_search_default_results: PositiveInt
    web_search_max_results: PositiveInt
    inline_js_check_timeout_sec: PositiveFloat
    inline_js_error_max_chars: PositiveInt
    fetch_error_max_chars: PositiveInt
    blocker_reason_max_chars: PositiveInt
    blocker_evidence_max_chars: PositiveInt
    retriever_timeout_sec: PositiveFloat
    retriever_max_chars: PositiveInt
    retriever_max_redirects: PositiveInt
    retriever_html_detection_prefix_chars: PositiveInt
    fetch_query_term_min_chars: PositiveInt
    fetch_excerpt_lead_divisor: PositiveInt


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
    maximum_acquisitions_per_page: PositiveInt
    maximum_generations_per_page: PositiveInt
    maximum_acquisitions_per_run: PositiveInt
    maximum_generations_per_run: PositiveInt


class DurationModelConfig(StrictModel):
    page_count_minimum: PositiveInt
    page_count_low_per_minute: PositiveFloat
    page_count_high_per_minute: PositiveFloat
    chapter_count_minimum: PositiveInt
    chapter_count_maximum: PositiveInt
    pages_per_chapter: PositiveInt
    seconds_per_minute: PositiveInt
    page_type_minutes: dict[str, PositiveFloat]


class DeckConfig(StrictModel):
    duplicate_similarity_threshold: float = Field(ge=0.0, le=1.0)
    duplicate_shingle_size: PositiveInt


class PreviewConfig(StrictModel):
    host: str
    port: int = Field(ge=1, le=65535)


class NotaleConfig(StrictModel):
    schema_version: PositiveInt
    versions: VersionsConfig
    model: ModelConfig
    model_capabilities: ModelCapabilitiesConfig
    governance: GovernanceConfig
    agents: AgentsConfig
    runtime: RuntimeConfig
    pipeline: PipelineConfig
    research: ResearchConfig
    tools: ToolsConfig
    media: MediaConfig
    duration_model: DurationModelConfig
    deck: DeckConfig
    preview: PreviewConfig

    @model_validator(mode="after")
    def validate_relationships(self) -> "NotaleConfig":
        limits = self.governance.emergency_limits
        if limits.query_max_turns > limits.worker_max_turns:
            raise ValueError("governance query_max_turns exceeds worker_max_turns")
        if limits.query_max_duration_sec > limits.worker_max_duration_sec:
            raise ValueError("governance query duration exceeds worker duration")
        for name in set(self.agents.roles) | {"defaults"}:
            threshold = (
                self.agents.defaults.auto_compact_threshold_tokens
                if name == "defaults"
                else self.agents.role_for(name).auto_compact_threshold_tokens
            )
            if threshold >= self.model_capabilities.context_window_tokens:
                raise ValueError(
                    f"agents.{name}: auto_compact_threshold_tokens must be below context_window_tokens"
                )
        tools = self.tools
        chunk_defaults = (
            tools.skill_chunk_default_chars,
            tools.artifact_chunk_default_chars,
            tools.context_chunk_default_chars,
            tools.page_read_default_chars,
        )
        if any(value > tools.chunk_max_chars for value in chunk_defaults):
            raise ValueError("a tool chunk default exceeds tools.chunk_max_chars")
        if tools.search_default_results > tools.search_max_results:
            raise ValueError("tools.search_default_results exceeds search_max_results")
        if tools.web_search_default_results > tools.web_search_max_results:
            raise ValueError("tools.web_search_default_results exceeds web_search_max_results")
        branch_ids = [branch.id for branch in self.research.branches]
        if len(branch_ids) != len(set(branch_ids)):
            raise ValueError("research.branches contains duplicate IDs")
        if self.media.maximum_acquisitions_per_page > self.media.maximum_acquisitions_per_run:
            raise ValueError("media per-page acquisition budget exceeds the run budget")
        if self.media.maximum_generations_per_page > self.media.maximum_generations_per_run:
            raise ValueError("media per-page generation budget exceeds the run budget")
        duration = self.duration_model
        if duration.page_count_low_per_minute > duration.page_count_high_per_minute:
            raise ValueError("duration_model low page rate exceeds high page rate")
        if duration.chapter_count_minimum > duration.chapter_count_maximum:
            raise ValueError("duration_model chapter minimum exceeds maximum")
        return self


def load_config(path: Path = CONFIG_PATH) -> NotaleConfig:
    """Load and fail closed on missing, malformed, or unknown configuration fields."""
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"Notale config must be a YAML mapping: {path}")
    config = NotaleConfig.model_validate(raw)
    for branch in config.research.branches:
        for skill in branch.skills:
            skill_path = SKILLS_PATH / skill / "SKILL.md"
            if not skill_path.is_file():
                raise ValueError(
                    f"research branch {branch.id} skill does not exist: {skill}"
                )
    return config


@lru_cache(maxsize=1)
def get_config() -> NotaleConfig:
    return load_config()
