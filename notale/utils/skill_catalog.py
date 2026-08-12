"""Load, validate, and compile the Skills selected by Planner."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from notale.core.models import (
    CompositionSpec,
    DesignSkillRef,
    LecturePlan,
    PageType,
    SkillAssignment,
)
from notale.roles.base import RoleSpec


REQUIRED_STYLE_TOKEN_KEYS = {
    "bg", "surface", "ink", "muted", "accent", "accent-2", "line", "font",
}
STYLE_TOKEN_KEYS = REQUIRED_STYLE_TOKEN_KEYS | {"mono"}
_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")
_UNSAFE_CSS_VALUE = re.compile(
    r"[{};<>\r\n]|url\s*\(|@import|expression\s*\(|javascript:|/\*|\*/",
    re.I,
)


def _hex_rgb(value: str) -> tuple[int, int, int] | None:
    match = re.fullmatch(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})", value.strip())
    if match is None:
        return None
    digits = match.group(1)
    if len(digits) == 3:
        digits = "".join(char * 2 for char in digits)
    return tuple(int(digits[index : index + 2], 16) for index in (0, 2, 4))


def _contrast_ratio(left: str, right: str) -> float | None:
    colors = (_hex_rgb(left), _hex_rgb(right))
    if None in colors:
        return None

    def luminance(rgb: tuple[int, int, int]) -> float:
        channels = []
        for value in rgb:
            channel = value / 255
            channels.append(
                channel / 12.92
                if channel <= 0.04045
                else ((channel + 0.055) / 1.055) ** 2.4
            )
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]

    first, second = (luminance(color) for color in colors if color is not None)
    lighter, darker = max(first, second), min(first, second)
    return (lighter + 0.05) / (darker + 0.05)


@dataclass(frozen=True)
class SkillDescriptor:
    name: str
    description: str
    body: str
    sha256: str


@dataclass(frozen=True)
class GeneratedDesignSkill:
    """A concrete, self-contained design Skill created for a single run."""

    name: str
    description: str
    body: str
    tokens: dict[str, str]
    compositions: tuple[CompositionSpec, ...]
    sha256: str

    def render(self, composition: str | None = None) -> str:
        text = f"# Run design Skill: {self.name}\n\n{self.body}"
        if composition is None:
            payload = [item.model_dump(mode="json") for item in self.compositions]
            label = "Available composition catalog"
        else:
            matches = [item for item in self.compositions if item.id == composition]
            if not matches:
                raise ValueError(f"unknown run composition: {composition}")
            payload = matches[0].model_dump(mode="json")
            label = "Assigned page composition"
        return text + f"\n\n## {label}\n\n```json\n" + json.dumps(
            payload, ensure_ascii=False, indent=2
        ) + "\n```"

    def composition(self, composition: str) -> CompositionSpec:
        for item in self.compositions:
            if item.id == composition:
                return item
        raise ValueError(f"unknown run composition: {composition}")

    def validate_plan(self, plan: LecturePlan) -> LecturePlan:
        catalog = {item.id: item for item in self.compositions}
        cursor = 0
        all_ids: list[str] = []
        for chapter in plan.chapters:
            pages = plan.pages[cursor : cursor + chapter.pages]
            ids: list[str] = []
            for offset, page in enumerate(pages, 1):
                composition = catalog.get(page.composition)
                if composition is None:
                    raise ValueError(
                        f"page {chapter.id}:{offset} has unknown composition: "
                        f"{page.composition}"
                    )
                if page.type not in composition.page_types:
                    raise ValueError(
                        f"page {chapter.id}:{offset} composition {page.composition} "
                        f"does not support {page.type.value}"
                    )
                ids.append(page.composition)
            if any(left == right for left, right in zip(ids, ids[1:])):
                raise ValueError(f"chapter {chapter.id} has adjacent repeated compositions")
            if len(ids) >= 3 and len(set(ids)) < 3:
                raise ValueError(f"chapter {chapter.id} needs at least three compositions")
            all_ids.extend(ids)
            cursor += chapter.pages
        if len(all_ids) >= 6 and len(set(all_ids)) < 4:
            raise ValueError("a plan with at least six pages needs at least four compositions")
        return plan

    @property
    def reference(self) -> DesignSkillRef:
        return DesignSkillRef(name=self.name, sha256=self.sha256)


@dataclass(frozen=True)
class SkillCatalog:
    role: RoleSpec
    skills: dict[str, SkillDescriptor]
    sha256: str

    def planner_menu(self, optional_tools: set[str]) -> str:
        def item(name: str) -> dict[str, Any]:
            descriptor = self.skills[name]
            return {
                "name": name,
                "description": descriptor.description,
            }

        return json.dumps(
            {
                "page_skills": [item(name) for name in self.role.skill_policy.page],
                "tools": sorted(optional_tools),
            },
            ensure_ascii=False,
            indent=2,
        )

    def validate_assignment(self, value: SkillAssignment) -> None:
        if value.name not in self.skills:
            raise ValueError(f"unknown skill: {value.name}")

    def validate_plan(self, plan: LecturePlan, optional_tools: set[str]) -> LecturePlan:
        for number, page in enumerate(plan.pages, 1):
            for assignment in page.skills:
                if assignment.name not in self.role.skill_policy.page:
                    raise ValueError(
                        f"page {number} skill is not an allowed capability: {assignment.name}"
                    )
                self.validate_assignment(assignment)
            unknown = sorted(set(page.tools) - optional_tools)
            if unknown:
                raise ValueError(f"page {number} has unknown tools: {unknown}")
        return plan

    def render(self, assignments: list[SkillAssignment]) -> str:
        sections: list[str] = []
        for assignment in assignments:
            self.validate_assignment(assignment)
            descriptor = self.skills[assignment.name]
            text = f"# Skill: {assignment.name}\n\n{descriptor.body}"
            if assignment.instruction:
                text += f"\n\n## Planner instruction\n\n{assignment.instruction}"
            sections.append(text)
        return "\n\n---\n\n".join(sections)

    def snapshot(self) -> dict[str, Any]:
        return {
            name: {
                "sha256": value.sha256,
                "description": value.description,
            }
            for name, value in self.skills.items()
        }


def is_safe_style_value(value: Any) -> bool:
    text = str(value).strip()
    return bool(text) and _UNSAFE_CSS_VALUE.search(text) is None


def _parse_skill_document(path: Path) -> tuple[dict[str, Any], str, bytes]:
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"skill is missing YAML frontmatter: {path}")
    parts = text.split("---", 2)
    if len(parts) != 3:
        raise ValueError(f"skill frontmatter is not closed: {path}")
    metadata = yaml.safe_load(parts[1]) or {}
    if not isinstance(metadata, dict):
        raise ValueError(f"skill frontmatter must be a mapping: {path}")
    return metadata, parts[2].strip(), raw


def _validate_generated_style(
    name: str,
    description: str,
    body: str,
    tokens: dict[str, str],
    compositions: list[CompositionSpec] | tuple[CompositionSpec, ...],
) -> tuple[str, str, str, dict[str, str], tuple[CompositionSpec, ...]]:
    name = name.strip()
    description = description.strip()
    body = body.strip()
    if _SLUG.fullmatch(name) is None:
        raise ValueError(f"invalid generated style name: {name!r}")
    if not description:
        raise ValueError("generated style description must not be blank")
    if not body:
        raise ValueError("generated style body must not be blank")
    missing = sorted(REQUIRED_STYLE_TOKEN_KEYS - set(tokens))
    unknown = sorted(set(tokens) - STYLE_TOKEN_KEYS)
    if missing:
        raise ValueError(f"generated style is missing tokens: {missing}")
    if unknown:
        raise ValueError(f"generated style has unknown tokens: {unknown}")
    normalized = {key: str(value).strip() for key, value in tokens.items()}
    unsafe = sorted(
        key
        for key, value in normalized.items()
        if not is_safe_style_value(value)
    )
    if unsafe:
        raise ValueError(f"generated style has unsafe tokens: {unsafe}")
    low_contrast = []
    for field in ("bg", "surface"):
        ratio = _contrast_ratio(normalized[field], normalized["ink"])
        if ratio is not None and ratio < 4.5:
            low_contrast.append(f"{field}/ink={ratio:.2f}:1")
    if low_contrast:
        raise ValueError(
            "generated style has insufficient primary text contrast: "
            + ", ".join(low_contrast)
        )
    normalized_compositions = tuple(
        item if isinstance(item, CompositionSpec) else CompositionSpec.model_validate(item)
        for item in compositions
    )
    if not 5 <= len(normalized_compositions) <= 7:
        raise ValueError("generated style must define 5 to 7 compositions")
    ids = [item.id for item in normalized_compositions]
    names = [item.name.casefold() for item in normalized_compositions]
    signatures = [(item.primary, item.secondary) for item in normalized_compositions]
    if len(ids) != len(set(ids)):
        raise ValueError("generated style composition ids must be unique")
    if len(names) != len(set(names)):
        raise ValueError("generated style composition names must be unique")
    if len(signatures) != len(set(signatures)):
        raise ValueError("generated style composition primitive signatures must be unique")
    if len({item.primary for item in normalized_compositions}) < 4:
        raise ValueError("generated style compositions need at least four primary primitives")
    covered = {page_type for item in normalized_compositions for page_type in item.page_types}
    missing_types = sorted(item.value for item in set(PageType) - covered)
    if missing_types:
        raise ValueError(
            f"generated style compositions do not cover page types: {missing_types}"
        )
    return name, description, body, normalized, normalized_compositions


def _generated_style_bytes(
    name: str,
    description: str,
    body: str,
    tokens: dict[str, str],
    compositions: tuple[CompositionSpec, ...],
) -> tuple[bytes, bytes, bytes]:
    frontmatter = yaml.safe_dump(
        {"name": name, "description": description},
        allow_unicode=True,
        sort_keys=False,
    ).strip()
    skill_raw = f"---\n{frontmatter}\n---\n\n{body}\n".encode("utf-8")
    token_raw = (
        json.dumps(tokens, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
    composition_raw = (
        json.dumps(
            [item.model_dump(mode="json") for item in compositions],
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    ).encode("utf-8")
    return skill_raw, token_raw, composition_raw


def create_generated_style(
    *,
    name: str,
    description: str,
    body: str,
    tokens: dict[str, str],
    compositions: list[CompositionSpec] | tuple[CompositionSpec, ...],
) -> GeneratedDesignSkill:
    name, description, body, tokens, compositions = _validate_generated_style(
        name, description, body, tokens, compositions
    )
    skill_raw, token_raw, composition_raw = _generated_style_bytes(
        name, description, body, tokens, compositions
    )
    digest = hashlib.sha256(
        skill_raw + b"\0" + token_raw + b"\0" + composition_raw
    ).hexdigest()
    return GeneratedDesignSkill(name, description, body, tokens, compositions, digest)


def write_generated_style(root: Path, style: GeneratedDesignSkill) -> Path:
    """Materialize a generated Skill under ``root/<name>`` without overwriting."""

    skill_raw, token_raw, composition_raw = _generated_style_bytes(
        style.name, style.description, style.body, style.tokens, style.compositions
    )
    actual = hashlib.sha256(
        skill_raw + b"\0" + token_raw + b"\0" + composition_raw
    ).hexdigest()
    if actual != style.sha256:
        raise ValueError(
            f"generated style object hash mismatch: expected {style.sha256}, got {actual}"
        )
    directory = Path(root) / style.name
    if directory.exists():
        raise ValueError(f"generated style destination already exists: {directory}")
    directory.mkdir(parents=True)
    (directory / "SKILL.md").write_bytes(skill_raw)
    (directory / "tokens.json").write_bytes(token_raw)
    (directory / "compositions.json").write_bytes(composition_raw)
    return directory


def load_generated_style(root: Path, expected: DesignSkillRef) -> GeneratedDesignSkill:
    directory = Path(root) / expected.name
    skill_path = directory / "SKILL.md"
    token_path = directory / "tokens.json"
    composition_path = directory / "compositions.json"
    if not skill_path.is_file() or not token_path.is_file() or not composition_path.is_file():
        raise ValueError(f"generated style artifacts are incomplete: {directory}")
    metadata, body, skill_raw = _parse_skill_document(skill_path)
    if metadata.get("name") != expected.name:
        raise ValueError(f"generated style directory/name mismatch: {expected.name}")
    description = str(metadata.get("description") or "")
    try:
        token_raw = token_path.read_bytes()
        tokens = json.loads(token_raw.decode("utf-8"))
        composition_raw = composition_path.read_bytes()
        compositions = json.loads(composition_raw.decode("utf-8"))
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as exc:
        raise ValueError(f"invalid generated style tokens: {token_path}") from exc
    if not isinstance(tokens, dict):
        raise ValueError(f"generated style tokens must be an object: {token_path}")
    if not isinstance(compositions, list):
        raise ValueError(
            f"generated style compositions must be an array: {composition_path}"
        )
    validated = create_generated_style(
        name=expected.name,
        description=description,
        body=body,
        tokens=tokens,
        compositions=compositions,
    )
    actual = hashlib.sha256(
        skill_raw + b"\0" + token_raw + b"\0" + composition_raw
    ).hexdigest()
    if actual != expected.sha256:
        raise ValueError(
            f"generated style hash mismatch: expected {expected.sha256}, got {actual}"
        )
    return GeneratedDesignSkill(
        name=validated.name,
        description=validated.description,
        body=validated.body,
        tokens=validated.tokens,
        compositions=validated.compositions,
        sha256=actual,
    )


def load_skill_descriptor(skills_root: Path, name: str) -> SkillDescriptor:
    path = Path(skills_root) / name / "SKILL.md"
    if not path.is_file():
        raise ValueError(f"skill does not exist: {name}")
    metadata, body, raw = _parse_skill_document(path)
    if metadata.get("name") != name:
        raise ValueError(f"skill directory/name mismatch: {name}")
    description = str(metadata.get("description") or "").strip()
    if not description or not body:
        raise ValueError(f"skill description and body must not be blank: {name}")

    return SkillDescriptor(
        name=name,
        description=description,
        body=body,
        sha256=hashlib.sha256(raw).hexdigest(),
    )


def load_skill_catalog(role: RoleSpec, skills_root: Path) -> SkillCatalog:
    skills: dict[str, SkillDescriptor] = {}
    digest = hashlib.sha256()
    for name in role.authorized_skills:
        descriptor = load_skill_descriptor(Path(skills_root), name)
        skills[name] = descriptor
        digest.update(name.encode())
        digest.update(descriptor.sha256.encode())
    return SkillCatalog(role=role, skills=skills, sha256=digest.hexdigest())
