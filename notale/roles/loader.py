"""Strict loader for auditable Markdown role contracts."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

from notale.roles.base import RoleSkillPolicy, RoleSpec
from notale.utils.config import SKILLS_PATH, get_config


_ROLE_NAME = re.compile(r"^[a-z][a-z0-9-]*$")
_TOOL_NAME = re.compile(r"^[a-z][a-z0-9_]*$")
_SKILL_NAME = re.compile(r"^[a-z0-9][a-z0-9-]*$")


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _SkillPolicyDocument(_StrictModel):
    assignable: list[str] = Field(default_factory=list)
    shared: list[str] = Field(default_factory=list)
    page: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_groups(self) -> "_SkillPolicyDocument":
        groups = {
            "assignable": self.assignable,
            "shared": self.shared,
            "page": self.page,
        }
        for label, names in groups.items():
            if len(names) != len(set(names)):
                raise ValueError(f"role skills.{label} contains duplicates")
            invalid = sorted(name for name in names if _SKILL_NAME.fullmatch(name) is None)
            if invalid:
                raise ValueError(f"role skills.{label} contains invalid names: {invalid}")
        overlap = (
            set(self.assignable) & set(self.shared)
            | set(self.assignable) & set(self.page)
            | set(self.shared) & set(self.page)
        )
        if overlap:
            raise ValueError(f"role skill groups overlap: {sorted(overlap)}")
        return self


class _RoleDocument(_StrictModel):
    name: str
    tools: list[str] = Field(default_factory=list)
    skills: _SkillPolicyDocument = Field(default_factory=_SkillPolicyDocument)

    @model_validator(mode="after")
    def validate_contract(self) -> "_RoleDocument":
        if _ROLE_NAME.fullmatch(self.name) is None:
            raise ValueError(f"invalid role name: {self.name!r}")
        if len(self.tools) != len(set(self.tools)):
            raise ValueError("role tools contain duplicates")
        invalid = sorted(tool for tool in self.tools if _TOOL_NAME.fullmatch(tool) is None)
        if invalid:
            raise ValueError(f"role contains invalid tool names: {invalid}")
        has_optional_skills = any(
            (self.skills.assignable, self.skills.shared, self.skills.page)
        )
        if has_optional_skills != ("skill_read" in self.tools):
            raise ValueError(
                "skill_read must be present exactly when the role authorizes optional skills"
            )
        return self


def _parse_role(path: Path) -> tuple[_RoleDocument, str, bytes]:
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"role is missing YAML frontmatter: {path}")
    parts = text.split("---", 2)
    if len(parts) != 3:
        raise ValueError(f"role frontmatter is not closed: {path}")
    header = yaml.safe_load(parts[1]) or {}
    if not isinstance(header, dict):
        raise ValueError(f"role frontmatter must be a mapping: {path}")
    body = parts[2].strip()
    if not body:
        raise ValueError(f"role body must not be blank: {path}")
    return _RoleDocument.model_validate(header), body, raw


def load_role(path: Path, *, skills_root: Path = SKILLS_PATH) -> RoleSpec:
    """Load one role, validate its authorization surface, and bind its content hash."""

    path = Path(path).resolve()
    document, body, raw = _parse_role(path)
    if path.stem != document.name:
        raise ValueError(
            f"role filename/name mismatch: {path.stem!r} != {document.name!r}"
        )
    policy = RoleSkillPolicy(
        assignable=tuple(document.skills.assignable),
        shared=tuple(document.skills.shared),
        page=tuple(document.skills.page),
    )
    for skill in policy.authorized:
        if not (Path(skills_root) / skill / "SKILL.md").is_file():
            raise ValueError(f"role {document.name} skill does not exist: {skill}")

    config = get_config()
    digest = hashlib.sha256(raw).hexdigest()
    return RoleSpec(
        name=document.name,
        system_prompt=body,
        allowed_tools=list(document.tools),
        skill_policy=policy,
        document_path=path,
        document_sha256=digest,
        auto_compact_threshold_tokens=(
            config.agents.role_for(document.name).auto_compact_threshold_tokens
        ),
        version=f"{config.versions.agent_protocol}:{digest[:16]}",
    )
