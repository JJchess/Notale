"""Runtime representation of one Markdown-backed agent role contract."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from notale.utils.config import get_config


_CONFIG = get_config()
_MODEL = _CONFIG.model
_CAPABILITIES = _CONFIG.model_capabilities
_EMERGENCY = _CONFIG.governance.emergency_limits


@dataclass(frozen=True)
class RoleSkillPolicy:
    """Optional skill capabilities authorized by a role document."""

    assignable: tuple[str, ...] = ()
    shared: tuple[str, ...] = ()
    page: tuple[str, ...] = ()

    @property
    def authorized(self) -> list[str]:
        return list(dict.fromkeys((*self.assignable, *self.shared, *self.page)))

    def metadata(self) -> dict[str, list[str]]:
        return {
            "assignable": list(self.assignable),
            "shared": list(self.shared),
            "page": list(self.page),
        }


@dataclass(frozen=True)
class RoleSpec:
    name: str
    system_prompt: str
    allowed_tools: list[str] = field(default_factory=list)
    skill_policy: RoleSkillPolicy = field(default_factory=RoleSkillPolicy)
    document_path: Path | None = None
    document_sha256: str = ""
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
        return self.system_prompt.strip()

    @property
    def authorized_skills(self) -> list[str]:
        return self.skill_policy.authorized

    def document_metadata(self) -> dict[str, str]:
        return {
            "path": str(self.document_path) if self.document_path else "",
            "sha256": self.document_sha256,
        }
