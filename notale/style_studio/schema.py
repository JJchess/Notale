"""Validate StylePack dicts against the frozen JSON Schema (lightweight).

Ported from deckbase: checks required keys, enums, and basic shapes without a
jsonschema dependency. Extended with the notale-side checks that deckbase has no
equivalent for — the eleven executable tokens, offline font IDs, CSS value
safety, WCAG text contrast, and composition uniqueness.

Contrast is reported here rather than raised, so callers can choose between
failing (an explicit user patch) and falling back to the parent pack (the
generated from-topic path). Nothing in notale should lose a whole run to a
palette the model got slightly wrong.
"""

from __future__ import annotations

import copy
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Mapping

from notale.core.models import CompositionSpec, TypeScale
from notale.style_studio.paths import schema_path
from notale.utils.skill_catalog import (
    REQUIRED_COLOR_STYLE_TOKEN_KEYS,
    _contrast_ratio,
    is_safe_style_value,
)
from notale.web.font_catalog import NEW_FONT_TOKEN_KEYS, validate_font_tokens

_STATUS = frozenset({"draft", "preview_ok", "published", "deprecated"})
_PROVENANCE = frozenset(
    {"preset", "from_images", "from_pptx", "from_pdf", "from_text", "from_topic", "hybrid"}
)
_AUDIENCE = frozenset({"elementary", "academic", "general"})
_RADIUS = frozenset({"sharp", "soft", "round"})
_ROLES = ("cover", "section", "content", "closing")
_LAYOUT_FAMILIES = frozenset(
    {
        "window_focus",
        "left_action_right_material",
        "full_width_material",
        "observe_split",
    }
)
_MASCOT_MODES = frozenset({"none", "corner_accent", "side_character"})
_MASCOT_SELECTION = frozenset({"all", "rotate_by_page"})

REQUIRED_NOTALE_TOKEN_KEYS = REQUIRED_COLOR_STYLE_TOKEN_KEYS | set(NEW_FONT_TOKEN_KEYS)
CONTRAST_MINIMUM = 4.5


@lru_cache(maxsize=1)
def load_schema() -> Dict[str, Any]:
    return json.loads(schema_path().read_text(encoding="utf-8"))


def contrast_failures(tokens: Mapping[str, Any]) -> List[str]:
    """Return WCAG failures for bg/ink and surface/ink, as deckbase never did.

    Only hex values can be measured; anything else is skipped rather than
    guessed at.
    """
    failures: List[str] = []
    ink = str(tokens.get("ink") or "")
    for field in ("bg", "surface"):
        ratio = _contrast_ratio(str(tokens.get(field) or ""), ink)
        if ratio is not None and ratio < CONTRAST_MINIMUM:
            failures.append(f"{field}/ink={ratio:.2f}:1")
    return failures


def validate_notale_tokens(tokens: Mapping[str, Any]) -> List[str]:
    """Validate the eleven executable tokens. Returns human-readable errors."""
    errors: List[str] = []
    keys = set(tokens)
    missing = sorted(REQUIRED_NOTALE_TOKEN_KEYS - keys)
    unknown = sorted(keys - REQUIRED_NOTALE_TOKEN_KEYS)
    if missing:
        errors.append(f"identity.notale_tokens is missing: {missing}")
    if unknown:
        errors.append(f"identity.notale_tokens has unknown keys: {unknown}")
    if missing:
        return errors
    try:
        validate_font_tokens({k: v for k, v in tokens.items() if k in NEW_FONT_TOKEN_KEYS})
    except ValueError as exc:
        errors.append(f"identity.notale_tokens font: {exc}")
    unsafe = sorted(key for key, value in tokens.items() if not is_safe_style_value(value))
    if unsafe:
        errors.append(f"identity.notale_tokens has unsafe values: {unsafe}")
    for failure in contrast_failures(tokens):
        errors.append(f"identity.notale_tokens insufficient contrast: {failure}")
    return errors


def validate_type_scale(raw: Any) -> List[str]:
    """Validate the pack's type bands. Absent is legal; malformed is not."""
    if raw is None:
        return []
    try:
        TypeScale.model_validate(raw)
    except Exception as exc:  # noqa: BLE001 — collect for the CLI report
        return [f"type_scale invalid: {exc}"]
    return []


def validate_compositions(raw: Any) -> List[str]:
    """Validate the composition catalog with notale's own model + uniqueness."""
    errors: List[str] = []
    if not isinstance(raw, list) or not raw:
        return ["compositions must be a non-empty array"]
    parsed: List[CompositionSpec] = []
    for index, item in enumerate(raw):
        try:
            parsed.append(
                item
                if isinstance(item, CompositionSpec)
                else CompositionSpec.model_validate(item)
            )
        except Exception as exc:  # noqa: BLE001 — collect for the CLI report
            errors.append(f"compositions[{index}] invalid: {exc}")
    if errors:
        return errors
    ids = [item.id for item in parsed]
    names = [item.name.casefold() for item in parsed]
    signatures = [(item.primary, item.secondary) for item in parsed]
    if len(ids) != len(set(ids)):
        errors.append("composition ids must be unique")
    if len(names) != len(set(names)):
        errors.append("composition names must be unique")
    if len(signatures) != len(set(signatures)):
        errors.append("composition primitive signatures must be unique")
    return errors


def validate_pack_dict(  # noqa: C901 — a flat field-by-field check, as in deckbase
    data: Mapping[str, Any],
    *,
    pack_dir: Path | None = None,
    check_contrast: bool = True,
) -> List[str]:
    """Return a list of human-readable errors (empty = ok)."""
    errors: List[str] = []
    schema = load_schema()
    for key in schema.get("required") or []:
        if key not in data:
            errors.append(f"missing required field: {key}")

    pid = data.get("id")
    if pid is not None and not isinstance(pid, str):
        errors.append("id must be a string")
    elif isinstance(pid, str) and not pid:
        errors.append("id must be non-empty")

    version = data.get("version")
    if version is not None and not isinstance(version, str):
        errors.append("version must be a string")
    elif isinstance(version, str) and version.count(".") != 2:
        errors.append(f"version must look like N.N.N, got {version!r}")

    status = data.get("status")
    if status is not None and status not in _STATUS:
        errors.append(f"status must be one of {sorted(_STATUS)}, got {status!r}")

    provenance = data.get("provenance")
    if provenance is not None and provenance not in _PROVENANCE:
        errors.append(f"provenance invalid: {provenance!r}")

    audience = data.get("audience_hint")
    if audience is not None and audience not in _AUDIENCE:
        errors.append(f"audience_hint invalid: {audience!r}")

    identity = data.get("identity")
    if identity is not None:
        if not isinstance(identity, Mapping):
            errors.append("identity must be an object")
        else:
            tokens = identity.get("style_tokens")
            if not isinstance(tokens, Mapping) or not tokens:
                errors.append("identity.style_tokens must be a non-empty object")
            notale_tokens = identity.get("notale_tokens")
            if not isinstance(notale_tokens, Mapping) or not notale_tokens:
                errors.append("identity.notale_tokens must be a non-empty object")
            else:
                for error in validate_notale_tokens(notale_tokens):
                    if not check_contrast and "insufficient contrast" in error:
                        continue
                    errors.append(error)
            radius = identity.get("radius_scale")
            if radius is not None and radius not in _RADIUS:
                errors.append(f"identity.radius_scale invalid: {radius!r}")

    body = data.get("skill_body")
    if body is not None and (not isinstance(body, str) or not body.strip()):
        errors.append("skill_body must be a non-empty string")

    if "compositions" in data:
        errors.extend(validate_compositions(data.get("compositions")))

    errors.extend(validate_type_scale(data.get("type_scale")))

    chrome = data.get("chrome_rules")
    if chrome is not None:
        if not isinstance(chrome, Mapping):
            errors.append("chrome_rules must be an object")
        else:
            if "dialect" not in chrome:
                errors.append("chrome_rules.dialect required")
            fe = chrome.get("forbidden_effects")
            if fe is not None and not isinstance(fe, list):
                errors.append("chrome_rules.forbidden_effects must be an array")

    roles = data.get("role_exemplars")
    if roles is not None:
        if not isinstance(roles, Mapping):
            errors.append("role_exemplars must be an object")
        else:
            for role in _ROLES:
                if role not in roles:
                    errors.append(f"role_exemplars.{role} required")
                elif not isinstance(roles.get(role), list):
                    errors.append(f"role_exemplars.{role} must be an array")

    pc = data.get("prompt_compile")
    if pc is not None:
        if not isinstance(pc, Mapping):
            errors.append("prompt_compile must be an object")
        else:
            for key in ("style_prose", "style_anchor"):
                value = pc.get(key)
                if key not in pc or not isinstance(value, str) or not str(value).strip():
                    errors.append(f"prompt_compile.{key} must be a non-empty string")

    density = data.get("density_default")
    if density is not None and not isinstance(density, str):
        errors.append("density_default must be a string")
    elif isinstance(density, str) and not density.strip():
        errors.append("density_default must be non-empty")

    for arr_key in ("hard_negatives", "acceptance_hooks"):
        value = data.get(arr_key)
        if value is not None and not isinstance(value, list):
            errors.append(f"{arr_key} must be an array")

    layout = data.get("layout_policy")
    if layout is not None:
        if not isinstance(layout, Mapping):
            errors.append("layout_policy must be an object")
        else:
            family = layout.get("default_family")
            if family is not None and family not in _LAYOUT_FAMILIES:
                errors.append(f"layout_policy.default_family invalid: {family!r}")
            by_role = layout.get("by_page_role")
            if by_role is not None:
                if not isinstance(by_role, Mapping):
                    errors.append("layout_policy.by_page_role must be an object")
                else:
                    for key, value in by_role.items():
                        if key not in _ROLES:
                            errors.append(f"layout_policy.by_page_role unknown role: {key!r}")
                        elif value not in _LAYOUT_FAMILIES:
                            errors.append(
                                f"layout_policy.by_page_role.{key} invalid family: {value!r}"
                            )

    mascot = data.get("mascot_policy")
    if mascot is not None:
        if not isinstance(mascot, Mapping):
            errors.append("mascot_policy must be an object")
        else:
            mode = mascot.get("mode")
            if mode is not None and mode not in _MASCOT_MODES:
                errors.append(f"mascot_policy.mode invalid: {mode!r}")
            selection = mascot.get("selection")
            if selection is not None and selection not in _MASCOT_SELECTION:
                errors.append(f"mascot_policy.selection invalid: {selection!r}")
            assets = mascot.get("assets")
            if assets is not None:
                if not isinstance(assets, list):
                    errors.append("mascot_policy.assets must be an array")
                else:
                    for index, item in enumerate(assets):
                        if isinstance(item, str):
                            if not item.strip():
                                errors.append(f"mascot_policy.assets[{index}] empty path string")
                        elif isinstance(item, Mapping):
                            path = item.get("path")
                            if not isinstance(path, str) or not path.strip():
                                errors.append(f"mascot_policy.assets[{index}].path required")
                            tags = item.get("tags")
                            if tags is not None and not isinstance(tags, list):
                                errors.append(f"mascot_policy.assets[{index}].tags must be an array")
                        else:
                            errors.append(
                                f"mascot_policy.assets[{index}] must be string or object"
                            )
            ratio = mascot.get("max_area_ratio")
            if ratio is not None:
                if not isinstance(ratio, (int, float)) or not (0 <= float(ratio) <= 0.5):
                    errors.append("mascot_policy.max_area_ratio must be in [0, 0.5]")
            allowed = mascot.get("roles_allowed")
            if allowed is not None:
                if not isinstance(allowed, list):
                    errors.append("mascot_policy.roles_allowed must be an array")
                else:
                    for role in allowed:
                        if role not in _ROLES:
                            errors.append(f"mascot_policy.roles_allowed invalid role: {role!r}")

    info_form = data.get("info_form_bias")
    if info_form is not None:
        if not isinstance(info_form, Mapping):
            errors.append("info_form_bias must be an object")
        else:
            for key in ("prefer", "avoid"):
                value = info_form.get(key)
                if value is not None and not isinstance(value, list):
                    errors.append(f"info_form_bias.{key} must be an array")

    if pack_dir is not None and isinstance(roles, Mapping):
        for role in _ROLES:
            for rel in roles.get(role) or []:
                if not (pack_dir / str(rel)).resolve().is_file():
                    errors.append(f"missing exemplar file for {role}: {rel}")

    if pack_dir is not None and isinstance(mascot, Mapping):
        resolved_pack_dir = pack_dir.resolve()
        for item in mascot.get("assets") or []:
            if isinstance(item, str):
                rel = item
            elif isinstance(item, Mapping):
                rel = str(item.get("path") or "")
            else:
                continue
            if rel:
                resolved = (pack_dir / rel).resolve()
                try:
                    resolved.relative_to(resolved_pack_dir)
                except ValueError:
                    errors.append(f"mascot asset escapes pack directory: {rel}")
                    continue
                if not resolved.is_file():
                    errors.append(f"missing mascot asset: {rel}")

    return errors


def assert_valid(
    data: Mapping[str, Any],
    *,
    pack_dir: Path | None = None,
    check_contrast: bool = True,
) -> None:
    errors = validate_pack_dict(data, pack_dir=pack_dir, check_contrast=check_contrast)
    if errors:
        raise ValueError("StylePack validation failed:\n- " + "\n- ".join(errors))


def deep_merge(base: Mapping[str, Any], overlay: Mapping[str, Any]) -> Dict[str, Any]:
    """Recursive dict merge; overlay wins. Lists/scalars replaced wholesale."""
    out: Dict[str, Any] = dict(base)
    for key, value in overlay.items():
        if key in out and isinstance(out[key], Mapping) and isinstance(value, Mapping):
            out[key] = deep_merge(out[key], value)  # type: ignore[arg-type]
        else:
            out[key] = copy.deepcopy(value) if isinstance(value, (dict, list)) else value
    return out
