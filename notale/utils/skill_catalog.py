"""Load, validate, and compile the Skills selected by Planner."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from notale.core.models import (
    DEFAULT_TYPE_SCALE,
    CompositionSpec,
    DesignSkillRef,
    LecturePlan,
    TypeScale,
)
from notale.roles.base import RoleSpec
from notale.web.font_catalog import (
    LEGACY_FONT_TOKEN_KEYS,
    NEW_FONT_TOKEN_KEYS,
    validate_font_tokens,
)


REQUIRED_COLOR_STYLE_TOKEN_KEYS = {
    "bg", "surface", "ink", "muted", "accent", "accent-2", "accent-3", "line",
}
REQUIRED_STYLE_TOKEN_KEYS = REQUIRED_COLOR_STYLE_TOKEN_KEYS | NEW_FONT_TOKEN_KEYS
STYLE_TOKEN_KEYS = REQUIRED_STYLE_TOKEN_KEYS | LEGACY_FONT_TOKEN_KEYS

# Type-scale customs are emitted into :root alongside the palette, but they are
# deliberately NOT part of STYLE_TOKEN_KEYS: that set is simultaneously the
# unknown-key gate for tokens.json and the emission filter in web/deck.py, so
# widening it would let type sizes be smuggled into a pack's colour tokens.
# Consumers union the two explicitly at each use site instead.
TYPE_SCALE_TOKEN_KEYS = frozenset(
    f"type-{role}{suffix}"
    for role in ("title", "lede", "banner", "card", "cell")
    for suffix in ("", "-leading", "-tracking", "-weight")
)
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
    type_scale: TypeScale = field(default_factory=lambda: DEFAULT_TYPE_SCALE)

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
        scale = {
            role.value: spec.model_dump(mode="json")
            for role, spec in self.type_scale.roles.items()
        }
        return (
            text
            + f"\n\n## {label}\n\n```json\n"
            + json.dumps(payload, ensure_ascii=False, indent=2)
            + "\n```"
            + "\n\n## Type scale\n\n"
            "Use `var(--notale-type-<role>)` for size, `-leading` for line-height, "
            "`-tracking` for letter-spacing, and `-weight` for font-weight. Mark the "
            "element with `data-notale-role=\"<role>\"` so the rendered page can be "
            "checked against the band it claims.\n\n```json\n"
            + json.dumps(scale, ensure_ascii=False, indent=2)
            + "\n```"
        )

    def render_for_planner(self) -> str:
        """Expose only the planning-relevant projection of this Style."""

        payload = [item.model_dump(mode="json") for item in self.compositions]
        return (
            f"# Accepted run Style: {self.name}\n\n{self.description}\n\n"
            "## Composition catalog\n\n```json\n"
            + json.dumps(payload, ensure_ascii=False, indent=2)
            + "\n```"
        )

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
        return json.dumps(
            {
                "tools": sorted(optional_tools),
            },
            ensure_ascii=False,
            indent=2,
        )

    def validate_plan(self, plan: LecturePlan, optional_tools: set[str]) -> LecturePlan:
        for number, page in enumerate(plan.pages, 1):
            unknown = sorted(set(page.tools) - optional_tools)
            if unknown:
                raise ValueError(f"page {number} has unknown tools: {unknown}")
        return plan

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
    missing = sorted(REQUIRED_COLOR_STYLE_TOKEN_KEYS - set(tokens))
    unknown = sorted(set(tokens) - STYLE_TOKEN_KEYS)
    if missing:
        raise ValueError(f"generated style is missing tokens: {missing}")
    if unknown:
        raise ValueError(f"generated style has unknown tokens: {unknown}")
    validate_font_tokens(tokens)
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
    ids = [item.id for item in normalized_compositions]
    names = [item.name.casefold() for item in normalized_compositions]
    signatures = [(item.primary, item.secondary) for item in normalized_compositions]
    if len(ids) != len(set(ids)):
        raise ValueError("generated style composition ids must be unique")
    if len(names) != len(set(names)):
        raise ValueError("generated style composition names must be unique")
    if len(signatures) != len(set(signatures)):
        raise ValueError("generated style composition primitive signatures must be unique")
    return name, description, body, normalized, normalized_compositions


def _coerce_type_scale(value: TypeScale | dict[str, Any] | None) -> TypeScale:
    """Never returns None: an absent scale is the default, not a missing segment."""
    if value is None:
        return DEFAULT_TYPE_SCALE
    if isinstance(value, TypeScale):
        return value
    return TypeScale.model_validate(value)


def _generated_style_bytes(
    name: str,
    description: str,
    body: str,
    tokens: dict[str, str],
    compositions: tuple[CompositionSpec, ...],
    type_scale: TypeScale,
) -> tuple[bytes, bytes, bytes, bytes]:
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
    type_scale_raw = (
        json.dumps(
            type_scale.model_dump(mode="json"), ensure_ascii=False, indent=2, sort_keys=True
        )
        + "\n"
    ).encode("utf-8")
    return skill_raw, token_raw, composition_raw, type_scale_raw


def create_generated_style(
    *,
    name: str,
    description: str,
    body: str,
    tokens: dict[str, str],
    compositions: list[CompositionSpec] | tuple[CompositionSpec, ...],
    type_scale: TypeScale | dict[str, Any] | None = None,
) -> GeneratedDesignSkill:
    name, description, body, tokens, compositions = _validate_generated_style(
        name, description, body, tokens, compositions
    )
    # Resolved before serialization so the byte stream is always four segments.
    # There is no legacy three-segment form to keep alive.
    scale = _coerce_type_scale(type_scale)
    skill_raw, token_raw, composition_raw, scale_raw = _generated_style_bytes(
        name, description, body, tokens, compositions, scale
    )
    digest = hashlib.sha256(
        skill_raw + b"\0" + token_raw + b"\0" + composition_raw + b"\0" + scale_raw
    ).hexdigest()
    return GeneratedDesignSkill(
        name, description, body, tokens, compositions, digest, scale
    )


def write_generated_style(root: Path, style: GeneratedDesignSkill) -> Path:
    """Materialize a generated Skill under ``root/<name>`` without overwriting."""

    skill_raw, token_raw, composition_raw, scale_raw = _generated_style_bytes(
        style.name, style.description, style.body, style.tokens, style.compositions,
        style.type_scale,
    )
    actual = hashlib.sha256(
        skill_raw + b"\0" + token_raw + b"\0" + composition_raw + b"\0" + scale_raw
    ).hexdigest()
    if actual != style.sha256:
        raise ValueError(
            f"generated style object hash mismatch: expected {style.sha256}, got {actual}"
        )
    root = Path(root)
    directory = root / style.name
    if directory.exists():
        raise ValueError(f"generated style destination already exists: {directory}")
    root.mkdir(parents=True, exist_ok=True)
    temporary = root / f".{style.name}.tmp-{uuid.uuid4().hex}"
    temporary.mkdir()
    try:
        (temporary / "SKILL.md").write_bytes(skill_raw)
        (temporary / "tokens.json").write_bytes(token_raw)
        (temporary / "compositions.json").write_bytes(composition_raw)
        (temporary / "type_scale.json").write_bytes(scale_raw)
        temporary.replace(directory)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return directory


def load_generated_style(root: Path, expected: DesignSkillRef) -> GeneratedDesignSkill:
    directory = Path(root) / expected.name
    skill_path = directory / "SKILL.md"
    token_path = directory / "tokens.json"
    composition_path = directory / "compositions.json"
    scale_path = directory / "type_scale.json"
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
        # A style written before the scale existed resolves to the default, so
        # the hash is computed over the same four segments either way.
        scale = (
            json.loads(scale_path.read_bytes().decode("utf-8"))
            if scale_path.is_file()
            else None
        )
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
        type_scale=scale,
    )
    _, _, _, scale_raw = _generated_style_bytes(
        validated.name, validated.description, validated.body, validated.tokens,
        validated.compositions, validated.type_scale,
    )
    actual = hashlib.sha256(
        skill_raw + b"\0" + token_raw + b"\0" + composition_raw + b"\0" + scale_raw
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
        type_scale=validated.type_scale,
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
