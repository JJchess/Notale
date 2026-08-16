"""Offline font catalog, Style-facing choices, and per-run font packaging."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal


FONT_ROOT = Path(__file__).resolve().parent / "fonts"
CATALOG_PATH = FONT_ROOT / "catalog.json"
NEW_FONT_TOKEN_KEYS = frozenset({"font-display", "font-body", "font-mono"})
LEGACY_FONT_TOKEN_KEYS = frozenset({"font", "mono"})
_UNSAFE_FONT_VALUE = re.compile(
    r"[{};<>&\r\n]|url\s*\(|@import|expression\s*\(|javascript:|/\*|\*/",
    re.I,
)


@dataclass(frozen=True)
class FontFace:
    path: str
    weight: str
    style: str
    sha256: str
    bytes: int


@dataclass(frozen=True)
class FontFamily:
    id: str
    name: str
    css_family: str
    category: str
    scripts: tuple[str, ...]
    roles: tuple[str, ...]
    personality: str
    license_file: str
    license_sha256: str
    files: tuple[FontFace, ...]


@dataclass(frozen=True)
class FontCatalog:
    version: int
    fallback: str
    families: tuple[FontFamily, ...]

    @property
    def by_id(self) -> dict[str, FontFamily]:
        return {family.id: family for family in self.families}

    def ids_for_role(self, role: Literal["display", "body", "mono"]) -> tuple[str, ...]:
        return tuple(family.id for family in self.families if role in family.roles)


def _safe_child(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if root.resolve() not in path.parents:
        raise ValueError(f"font catalog path escapes its root: {relative}")
    return path


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@lru_cache(maxsize=1)
def load_font_catalog() -> FontCatalog:
    try:
        raw = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"offline font catalog is unreadable: {CATALOG_PATH}") from exc
    if raw.get("version") != 1 or not isinstance(raw.get("families"), list):
        raise RuntimeError("offline font catalog has an unsupported schema")
    families: list[FontFamily] = []
    for item in raw["families"]:
        files = tuple(
            FontFace(
                path=str(face["path"]),
                weight=str(face["weight"]),
                style=str(face["style"]),
                sha256=str(face["sha256"]),
                bytes=int(face["bytes"]),
            )
            for face in item["files"]
        )
        families.append(FontFamily(
            id=str(item["id"]),
            name=str(item["name"]),
            css_family=str(item["css_family"]),
            category=str(item["category"]),
            scripts=tuple(str(value) for value in item["scripts"]),
            roles=tuple(str(value) for value in item["roles"]),
            personality=str(item["personality"]),
            license_file=str(item["license_file"]),
            license_sha256=str(item["license_sha256"]),
            files=files,
        ))
    ids = [family.id for family in families]
    if len(families) != 20 or len(ids) != len(set(ids)):
        raise RuntimeError("offline font catalog must contain exactly 20 unique families")
    catalog = FontCatalog(
        version=1,
        fallback=str(raw["fallback"]),
        families=tuple(families),
    )
    if catalog.fallback not in catalog.by_id:
        raise RuntimeError(f"unknown offline font fallback: {catalog.fallback}")
    return catalog


def font_ids_for_role(role: Literal["display", "body", "mono"]) -> tuple[str, ...]:
    return load_font_catalog().ids_for_role(role)


def validate_font_tokens(tokens: dict[str, Any]) -> Literal["catalog", "legacy"]:
    keys = set(tokens)
    new = keys & NEW_FONT_TOKEN_KEYS
    legacy = keys & LEGACY_FONT_TOKEN_KEYS
    if new:
        missing = sorted(NEW_FONT_TOKEN_KEYS - keys)
        if missing:
            raise ValueError(f"generated style is missing font tokens: {missing}")
        if legacy:
            raise ValueError("generated style cannot mix catalog and legacy font tokens")
        catalog = load_font_catalog()
        by_id = catalog.by_id
        for token, role in (
            ("font-display", "display"),
            ("font-body", "body"),
            ("font-mono", "mono"),
        ):
            font_id = str(tokens[token]).strip()
            family = by_id.get(font_id)
            if family is None:
                raise ValueError(f"generated style has unknown {token}: {font_id}")
            if role not in family.roles:
                raise ValueError(f"font {font_id} is not available for role {role}")
        return "catalog"
    if "font" not in keys:
        raise ValueError("generated style is missing legacy font token: font")
    for token in LEGACY_FONT_TOKEN_KEYS & keys:
        value = str(tokens[token]).strip()
        if not value or _UNSAFE_FONT_VALUE.search(value):
            raise ValueError(f"generated style has unsafe legacy font token: {token}")
    return "legacy"


def font_catalog_prompt() -> str:
    lines = [
        "Choose font-display, font-body, and font-mono by exact ID from this installed catalog.",
        "Match the lecture language: a Latin-only family may lead a Latin title, but Chinese body "
        "copy needs a zh-Hans body family. Display-only faces must never be selected for body.",
    ]
    for family in load_font_catalog().families:
        lines.append(
            f"- `{family.id}` — {family.name}; roles={','.join(family.roles)}; "
            f"scripts={','.join(family.scripts)}; {family.personality}."
        )
    return "\n".join(lines)


def _quoted(family: FontFamily) -> str:
    return json.dumps(family.css_family, ensure_ascii=False)


def _stack(families: list[FontFamily], generic: str) -> str:
    names: list[str] = []
    for family in families:
        value = _quoted(family)
        if value not in names:
            names.append(value)
    names.append(generic)
    return ", ".join(names)


def font_variable_declarations(tokens: dict[str, Any] | None) -> dict[str, str]:
    values = dict(tokens or {})
    if NEW_FONT_TOKEN_KEYS & set(values):
        validate_font_tokens(values)
        catalog = load_font_catalog()
        by_id = catalog.by_id
        display = by_id[str(values["font-display"])]
        body = by_id[str(values["font-body"])]
        mono = by_id[str(values["font-mono"])]
        fallback = body if "zh-Hans" in body.scripts else by_id[catalog.fallback]
        return {
            "font-display": _stack([display, body, fallback], display.category),
            "font-body": _stack([body, fallback], body.category),
            "font-mono": _stack([mono, fallback], "monospace"),
            "font": "var(--notale-font-body)",
            "mono": "var(--notale-font-mono)",
        }
    if LEGACY_FONT_TOKEN_KEYS & set(values):
        validate_font_tokens(values)
    legacy_font = str(values.get("font") or 'Inter, "Noto Sans SC", system-ui, sans-serif')
    legacy_mono = str(
        values.get("mono") or '"JetBrains Mono", "SFMono-Regular", Consolas, monospace'
    )
    return {
        "font-display": legacy_font,
        "font-body": legacy_font,
        "font-mono": legacy_mono,
        "font": "var(--notale-font-body)",
        "mono": "var(--notale-font-mono)",
    }


def _selected_families(tokens: dict[str, Any] | None) -> tuple[FontFamily, ...]:
    values = dict(tokens or {})
    if not (NEW_FONT_TOKEN_KEYS & set(values)):
        return ()
    validate_font_tokens(values)
    catalog = load_font_catalog()
    by_id = catalog.by_id
    body = by_id[str(values["font-body"])]
    ids = [str(values[key]) for key in ("font-display", "font-body", "font-mono")]
    if "zh-Hans" not in body.scripts:
        ids.append(catalog.fallback)
    return tuple(by_id[font_id] for font_id in dict.fromkeys(ids))


def prepare_font_runtime(run_dir: Path, tokens: dict[str, Any] | None) -> Path:
    """Copy only the selected immutable fonts and emit their shared runtime stylesheet."""

    target = Path(run_dir) / "runtime"
    fonts_target = target / "fonts"
    if fonts_target.exists():
        shutil.rmtree(fonts_target)
    fonts_target.mkdir(parents=True, exist_ok=True)
    rules: list[str] = ["/* Generated from Notale's pinned offline font catalog. */"]
    for family in _selected_families(tokens):
        for face in family.files:
            source = _safe_child(FONT_ROOT, face.path)
            if not source.is_file():
                raise FileNotFoundError(f"offline font asset is missing: {source}")
            if source.stat().st_size != face.bytes or _sha256(source) != face.sha256:
                raise ValueError(f"offline font asset failed integrity validation: {source}")
            destination = fonts_target / Path(face.path).name
            shutil.copy2(source, destination)
            rules.extend([
                "@font-face {",
                f"  font-family: {_quoted(family)};",
                f'  src: url("./fonts/{destination.name}") format("woff2");',
                f"  font-style: {face.style};",
                f"  font-weight: {face.weight};",
                "  font-display: block;",
                "}",
            ])
    declarations = font_variable_declarations(tokens)
    rules.append(":root {")
    rules.extend(f"  --notale-{key}: {value};" for key, value in declarations.items())
    rules.append("}")
    path = target / "fonts.css"
    path.write_text("\n".join(rules) + "\n", encoding="utf-8")
    return path
