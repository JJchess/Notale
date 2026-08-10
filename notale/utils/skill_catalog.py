"""Discovery and validation for optional Builder skills."""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml
from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from notale.core.models import BuilderPlan, SkillAssignment
    from notale.roles.base import RoleSpec


STYLE_TOKEN_KEYS = {
    "bg", "surface", "ink", "muted", "accent", "accent-2", "line", "font", "mono",
}
_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_UNSAFE_CSS_VALUE = re.compile(r"[{};<>]|url\s*\(", re.I)


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SkillProfile(_StrictModel):
    description: str = Field(min_length=1)
    tokens: dict[str, str] = Field(default_factory=dict)


class SkillProfiles(_StrictModel):
    profiles: dict[str, SkillProfile]


@dataclass(frozen=True)
class SkillDescriptor:
    name: str
    description: str
    body: str
    profiles: dict[str, SkillProfile]
    profile_references: dict[str, str]
    sha256: str


@dataclass(frozen=True)
class SkillCatalog:
    role: "RoleSpec"
    skills: dict[str, SkillDescriptor]
    sha256: str

    def planner_menu(self) -> str:
        def item(name: str) -> dict[str, Any]:
            descriptor = self.skills[name]
            return {
                "name": name,
                "description": descriptor.description,
                "profiles": [
                    {"id": profile_id, "description": profile.description.strip()}
                    for profile_id, profile in descriptor.profiles.items()
                ],
            }

        return json.dumps(
            {
                "sharedSelectable": [
                    item(name) for name in self.role.skill_policy.shared
                ],
                "pageSelectable": [
                    item(name) for name in self.role.skill_policy.page
                ],
            },
            ensure_ascii=False,
            indent=2,
        )

    def validate_assignment(self, assignment: "SkillAssignment") -> None:
        descriptor = self.skills.get(assignment.name)
        if descriptor is None:
            raise ValueError(f"optional skill is not registered: {assignment.name}")
        if descriptor.profiles:
            if assignment.profile is None:
                raise ValueError(f"skill requires one profile: {assignment.name}")
            if assignment.profile not in descriptor.profiles:
                raise ValueError(
                    f"profile does not belong to skill: "
                    f"{assignment.name}:{assignment.profile}"
                )
        elif assignment.profile is not None:
            raise ValueError(f"skill does not define profiles: {assignment.name}")

    def normalize_plan(
        self, plan: "BuilderPlan", page_ids: set[str]
    ) -> "BuilderPlan":
        shared_allowed = set(self.role.skill_policy.shared)
        page_allowed = set(self.role.skill_policy.page)
        unknown_shared = sorted(
            {item.name for item in plan.sharedSkills} - shared_allowed
        )
        if unknown_shared:
            raise ValueError(f"Builder plan contains unauthorized shared skills: {unknown_shared}")
        unknown_pages = sorted(set(plan.pageSkills) - page_ids)
        if unknown_pages:
            raise ValueError(f"Builder plan targets unknown pages: {unknown_pages}")
        for assignment in plan.sharedSkills:
            self.validate_assignment(assignment)
        for page_id, assignments in plan.pageSkills.items():
            unknown = sorted({item.name for item in assignments} - page_allowed)
            if unknown:
                raise ValueError(
                    f"Builder plan page {page_id} contains unauthorized skills: {unknown}"
                )
            for assignment in assignments:
                self.validate_assignment(assignment)
        return plan

    def resolved_style_tokens(self, plan: "BuilderPlan") -> dict[str, str]:
        tokens: dict[str, str] = {}
        owners: dict[str, str] = {}
        for assignment in plan.sharedSkills:
            if assignment.profile is None:
                continue
            profile = self.skills[assignment.name].profiles[assignment.profile]
            for key, value in profile.tokens.items():
                if key in owners:
                    raise ValueError(
                        f"shared skill profiles both define token {key}: "
                        f"{owners[key]} and {assignment.name}"
                    )
                tokens[key] = value
                owners[key] = assignment.name
        return tokens


def _parse_skill_document(path: Path) -> tuple[dict[str, Any], str, bytes]:
    raw_bytes = path.read_bytes()
    text = raw_bytes.decode("utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"skill is missing YAML frontmatter: {path}")
    _, header, body = text.split("---", 2)
    metadata = yaml.safe_load(header) or {}
    if not isinstance(metadata, dict):
        raise ValueError(f"skill frontmatter must be a mapping: {path}")
    return metadata, body.strip(), raw_bytes


def load_skill_descriptor(skills_root: Path, name: str) -> SkillDescriptor:
    path = skills_root / name / "SKILL.md"
    if not path.is_file():
        raise ValueError(f"optional skill does not exist: {name}")
    metadata, body, raw_bytes = _parse_skill_document(path)
    if metadata.get("name") != name:
        raise ValueError(f"skill directory/name mismatch: {name}")
    description = str(metadata.get("description") or "").strip()
    if not description or not body:
        raise ValueError(f"skill description and body must not be blank: {name}")

    digest = hashlib.sha256(raw_bytes)
    profiles: dict[str, SkillProfile] = {}
    references: dict[str, str] = {}
    profile_path = path.parent / "profiles.yaml"
    if profile_path.is_file():
        raw_profile_bytes = profile_path.read_bytes()
        digest.update(raw_profile_bytes)
        parsed = SkillProfiles.model_validate(yaml.safe_load(raw_profile_bytes) or {})
        if not parsed.profiles:
            raise ValueError(f"skill profiles must not be empty: {name}")
        for profile_id, profile in parsed.profiles.items():
            if _SLUG.fullmatch(profile_id) is None:
                raise ValueError(f"skill contains invalid profile ID: {name}:{profile_id}")
            unknown = sorted(set(profile.tokens) - STYLE_TOKEN_KEYS)
            if unknown:
                raise ValueError(
                    f"{name}:{profile_id} contains unknown style token keys: {unknown}"
                )
            unsafe = sorted(
                key for key, value in profile.tokens.items()
                if not str(value).strip() or _UNSAFE_CSS_VALUE.search(str(value))
            )
            if unsafe:
                raise ValueError(
                    f"{name}:{profile_id} contains unsafe style token values: {unsafe}"
                )
            reference_path = path.parent / "references" / f"profile-{profile_id}.md"
            if not reference_path.is_file():
                raise ValueError(
                    f"skill profile reference does not exist: {name}:{profile_id}"
                )
            reference_bytes = reference_path.read_bytes()
            reference = reference_bytes.decode("utf-8").strip()
            if not reference:
                raise ValueError(f"skill profile reference is blank: {name}:{profile_id}")
            digest.update(reference_bytes)
            references[profile_id] = reference
        profiles = parsed.profiles

    return SkillDescriptor(
        name=name,
        description=description,
        body=body,
        profiles=profiles,
        profile_references=references,
        sha256=digest.hexdigest(),
    )


def migrate_builder_plan(
    value: Mapping[str, Any] | "BuilderPlan",
) -> tuple["BuilderPlan", bool]:
    """Read v2 or migrate a persisted v1 plan without mutating its artifact."""

    from notale.core.models import BuilderPlan

    raw = (
        value.model_dump(mode="json")
        if isinstance(value, BuilderPlan)
        else dict(value)
    )
    version = raw.get("schemaVersion", 1)
    if version == 2:
        return BuilderPlan.model_validate(raw), False
    if version != 1:
        raise ValueError(f"unsupported BuilderPlan schemaVersion: {version}")

    shared = [
        item for item in list(raw.get("sharedSkills") or [])
        if str(item.get("name", "")) != "page-builder-core"
    ]
    pages = {
        str(page_id): [
            item for item in list(assignments or [])
            if str(item.get("name", "")) != "page-builder-core"
        ]
        for page_id, assignments in dict(raw.get("pageSkills") or {}).items()
    }
    return BuilderPlan.model_validate({
        "schemaVersion": 2,
        "sharedSkills": shared,
        "pageSkills": pages,
    }), True


def load_skill_catalog(role: "RoleSpec", skills_root: Path) -> SkillCatalog:
    names = [*role.skill_policy.shared, *role.skill_policy.page]
    skills: dict[str, SkillDescriptor] = {}
    digest = hashlib.sha256()
    for name in names:
        if name in skills:
            continue
        descriptor = load_skill_descriptor(Path(skills_root), name)
        skills[name] = descriptor
        digest.update(name.encode("utf-8"))
        digest.update(descriptor.sha256.encode("ascii"))
    return SkillCatalog(role=role, skills=skills, sha256=digest.hexdigest())
