"""Declarative role contracts consumed by the agent runtime."""

from __future__ import annotations

from dataclasses import dataclass, field

from notale.utils.config import get_config
from notale.roles.authoring import SystemProfile


_CONFIG = get_config()
_MODEL = _CONFIG.model
_CAPABILITIES = _CONFIG.model_capabilities
_EMERGENCY = _CONFIG.governance.emergency_limits


@dataclass(frozen=True)
class RoleSpec:
    name: str
    system_prompt: str
    allowed_tools: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    system_profiles: tuple[SystemProfile, ...] = ()
    max_turns: int = _EMERGENCY.query_max_turns
    max_tokens: int = _CAPABILITIES.max_output_tokens
    base_url: str = _MODEL.base_url
    model: str = _MODEL.name
    api_key_env: str = _MODEL.api_key_env
    context_window_tokens: int = _CAPABILITIES.context_window_tokens
    auto_compact_threshold_tokens: int = _CONFIG.agents.defaults.auto_compact_threshold_tokens
    max_total_turns: int = _EMERGENCY.worker_max_turns
    max_duration_sec: float = _EMERGENCY.worker_max_duration_sec
    max_total_tokens: int = _EMERGENCY.worker_max_total_tokens
    # One provider stream and one QueryEngine invocation have separate hard walls.
    # The latter may contain several provider streams separated by tool execution.
    request_timeout_sec: float = _EMERGENCY.provider_timeout_sec
    max_query_duration_sec: float = _EMERGENCY.query_max_duration_sec
    max_provider_attempts: int = _EMERGENCY.provider_max_attempts
    version: str = _CONFIG.versions.agent_protocol

    def rendered_system_prompt(self) -> str:
        blocks = [profile.content.strip() for profile in self.system_profiles]
        blocks.append(self.system_prompt.strip())
        return "\n\n".join(block for block in blocks if block)

    def system_profile_metadata(self) -> list[dict[str, str]]:
        return [profile.metadata() for profile in self.system_profiles]
