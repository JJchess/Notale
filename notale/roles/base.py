"""Runtime representation of one Markdown role."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from notale.utils.config import get_config


@dataclass(frozen=True)
class RoleSkillPolicy:
    shared: tuple[str, ...] = ()
    page: tuple[str, ...] = ()

    @property
    def authorized(self) -> list[str]:
        return list(dict.fromkeys((*self.shared, *self.page)))

    def metadata(self) -> dict[str, list[str]]:
        return {"shared": list(self.shared), "page": list(self.page)}


@dataclass(frozen=True)
class RoleSpec:
    name: str
    system_prompt: str
    allowed_tools: list[str] = field(default_factory=list)
    skill_policy: RoleSkillPolicy = field(default_factory=RoleSkillPolicy)
    document_path: Path | None = None
    document_sha256: str = ""

    @property
    def settings(self):
        return get_config().agents.role_for(self.name)

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
