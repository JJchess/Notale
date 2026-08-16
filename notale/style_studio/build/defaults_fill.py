"""Fill missing StylePack fields via explicit > adapter > parent > audience > safe.

Ported from deckbase, with one addition that matters more in notale than it did
there: deckbase could ship a palette the image model merely interpreted, while
notale writes tokens straight into `:root`, so an unreadable pair is a broken
deck. Rather than reject the pack — which used to fail the whole run — the token
block falls back to the parent's, then to the safe default, and the fallback is
recorded in the MergeReport.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, Mapping, Optional, Set, Tuple

from notale.style_studio.build.models import MergeReport
from notale.style_studio.defaults import default_style_pack_id
from notale.style_studio.registry import get_pack
from notale.style_studio.schema import deep_merge, validate_notale_tokens
from notale.style_studio.tokens_bridge import deckbase_to_notale, notale_to_deckbase

# Minimal hard-coded fallback when even the audience default pack fails to load.
_SAFE_DEFAULT: Dict[str, Any] = {
    "version": "0.1.0",
    "status": "draft",
    "provenance": "hybrid",
    "audience_hint": "general",
    "identity": {
        "style_tokens": {
            "primary": "#69A8FF",
            "secondary": "#F0B429",
            "accent": "#5FBF9A",
            "background": "#0B0E14",
            "text": "#F3F5F7",
        },
        "notale_tokens": {
            "bg": "#0B0E14",
            "surface": "#141923",
            "ink": "#F3F5F7",
            "muted": "#9BA6B5",
            "accent": "#69A8FF",
            "accent-2": "#F0B429",
            "accent-3": "#5FBF9A",
            "line": "#2A303C",
            "font-display": "inter",
            "font-body": "noto-sans-sc",
            "font-mono": "jetbrains-mono",
        },
        "radius_scale": "soft",
        "type_hints": "display=inter; body=noto-sans-sc; mono=jetbrains-mono",
    },
    "chrome_rules": {
        "dialect": "Neutral information-first surfaces with restrained separation.",
        "forbidden_effects": ["glassmorphism", "decorative_gradient_blobs"],
    },
    "role_exemplars": {"cover": [], "section": [], "content": [], "closing": []},
    "density_default": "reference",
    "prompt_compile": {
        "style_prose": "Neutral information-first direction with a quiet palette.",
        "style_anchor": "[style anchor] quiet neutral surfaces, one meaningful accent.",
    },
    "hard_negatives": ["dashboard chrome", "decoration without purpose"],
    "acceptance_hooks": ["identity_palette", "token_only_colors"],
    "layout_policy": {"default_family": "full_width_material", "by_page_role": {}},
    "mascot_policy": {
        "mode": "none",
        "assets": [],
        "max_area_ratio": 0.12,
        "roles_allowed": ["cover", "content"],
    },
    "info_form_bias": {"prefer": ["short_bullets"], "avoid": ["dashboard"]},
}

_AXIS_PATHS = (
    "label",
    "version",
    "status",
    "provenance",
    "audience_hint",
    "identity",
    "identity.style_tokens",
    "identity.notale_tokens",
    "identity.radius_scale",
    "identity.type_hints",
    "skill_body",
    "compositions",
    "type_scale",
    "chrome_rules",
    "chrome_rules.dialect",
    "chrome_rules.forbidden_effects",
    "role_exemplars",
    "density_default",
    "prompt_compile",
    "prompt_compile.style_prose",
    "prompt_compile.style_anchor",
    "hard_negatives",
    "acceptance_hooks",
    "layout_policy",
    "mascot_policy",
    "info_form_bias",
)


def _get_path(data: Mapping[str, Any], dotted: str) -> Any:
    current: Any = data
    for part in dotted.split("."):
        if not isinstance(current, Mapping) or part not in current:
            return None
        current = current[part]
    return current


def _is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and not value.strip():
        return True
    if isinstance(value, (list, dict)) and len(value) == 0:
        return True
    return False


def _set_path(data: Dict[str, Any], dotted: str, value: Any) -> None:
    parts = dotted.split(".")
    current: Dict[str, Any] = data
    for part in parts[:-1]:
        nxt = current.get(part)
        if not isinstance(nxt, dict):
            nxt = {}
            current[part] = nxt
        current = nxt
    current[parts[-1]] = copy.deepcopy(value)


def _reconcile_tokens(
    filled: Dict[str, Any],
    parent_data: Mapping[str, Any],
    report: MergeReport,
) -> None:
    """Make the two palettes consistent and guarantee a renderable token block.

    Order: derive whichever palette is missing, then validate the executable one.
    On failure fall back to the parent's block, then to the safe default, so a
    bad palette costs a style choice rather than the whole run.
    """
    identity = dict(filled.get("identity") or {})
    notale_tokens = dict(identity.get("notale_tokens") or {})
    style_tokens = dict(identity.get("style_tokens") or {})
    parent_identity = dict((parent_data or {}).get("identity") or {})
    parent_style = dict(parent_identity.get("style_tokens") or {})
    parent_notale = dict(parent_identity.get("notale_tokens") or {})

    if not notale_tokens and style_tokens:
        notale_tokens = deckbase_to_notale(
            style_tokens, type_hints=str(identity.get("type_hints") or "")
        )
        report.mark(
            "identity.notale_tokens",
            "inferred",
            source="bridge",
            note="projected from identity.style_tokens",
        )
    elif style_tokens and style_tokens != parent_style and notale_tokens == parent_notale:
        # The abstract palette moved but the executable one did not — the shape
        # of importing a deckbase pack, which has no notale_tokens to give. Left
        # alone the pack would describe one palette and render another, so the
        # changed side wins. Fonts stay inherited: a palette says nothing about
        # typography.
        derived = deckbase_to_notale(
            style_tokens,
            type_hints=str(identity.get("type_hints") or ""),
            include_fonts=False,
        )
        if derived:
            notale_tokens = {**notale_tokens, **derived}
            report.mark(
                "identity.notale_tokens",
                "inferred",
                source="bridge",
                note="re-projected from a changed identity.style_tokens",
            )

    errors = validate_notale_tokens(notale_tokens) if notale_tokens else ["missing"]
    if errors:
        parent_identity = dict((parent_data or {}).get("identity") or {})
        candidate = dict(parent_identity.get("notale_tokens") or {})
        if candidate and not validate_notale_tokens(candidate):
            report.mark(
                "identity.notale_tokens",
                "inferred",
                source="parent",
                note=f"rejected: {'; '.join(errors)}",
            )
            notale_tokens = candidate
        else:
            report.mark(
                "identity.notale_tokens",
                "inferred",
                source="safe_default",
                note=f"rejected: {'; '.join(errors)}",
            )
            notale_tokens = dict(_SAFE_DEFAULT["identity"]["notale_tokens"])

    identity["notale_tokens"] = notale_tokens
    if not style_tokens:
        identity["style_tokens"] = notale_to_deckbase(notale_tokens)
        report.mark(
            "identity.style_tokens",
            "inferred",
            source="bridge",
            note="projected from identity.notale_tokens",
        )
    else:
        identity["style_tokens"] = style_tokens
    filled["identity"] = identity


def fill_defaults(
    partial: Mapping[str, Any],
    *,
    parent_id: str = "",
    audience_hint: str = "",
    explicit_paths: Optional[Set[str]] = None,
    adapter_paths: Optional[Set[str]] = None,
    report: Optional[MergeReport] = None,
) -> Tuple[Dict[str, Any], MergeReport]:
    """Return a complete pack dict + MergeReport.

    Priority per field: explicit > adapter > already present > parent >
    audience default > safe default.
    """
    explicit_paths = set(explicit_paths or ())
    adapter_paths = set(adapter_paths or ())
    out = copy.deepcopy(dict(partial))
    pack_id = str(out.get("id") or "draft")
    audience = str(audience_hint or out.get("audience_hint") or "").strip()
    parent = str(
        parent_id or (out.get("lineage") or {}).get("parent_preset_id") or ""
    ).strip()
    if not parent:
        parent = default_style_pack_id(audience_level=audience)

    rep = report or MergeReport(pack_id=pack_id, parent_id=parent)
    if parent and not rep.parent_id:
        rep.parent_id = parent

    parent_data: Dict[str, Any] = {}
    try:
        parent_data = copy.deepcopy(dict(get_pack(parent, validate=False).data))
    except Exception:  # noqa: BLE001 — a missing parent must not block the build
        rep.notes.append(f"parent pack {parent!r} unavailable; using audience/safe")

    audience_pack_id = default_style_pack_id(audience_level=audience or "general")
    audience_data: Dict[str, Any] = {}
    try:
        audience_data = copy.deepcopy(dict(get_pack(audience_pack_id, validate=False).data))
    except Exception:  # noqa: BLE001
        pass

    base = deep_merge(_SAFE_DEFAULT, audience_data)
    if parent_data:
        base = deep_merge(base, parent_data)
    filled = deep_merge(base, out)
    filled["id"] = pack_id
    if not filled.get("label"):
        filled["label"] = pack_id
    filled.setdefault("status", "draft")
    lineage = dict(filled.get("lineage") or {})
    lineage.setdefault("parent_preset_id", parent)
    filled["lineage"] = lineage

    for path in _AXIS_PATHS:
        if path in explicit_paths:
            rep.mark(path, "filled", source="explicit")
            continue
        if path in adapter_paths:
            rep.mark(path, "filled", source="adapter")
            continue
        value = _get_path(out, path)
        if not _is_empty(value):
            # A draft is created by forking, so most fields arrive already
            # carrying the parent's value. Crediting those to "input" would make
            # the report useless for seeing what this build actually changed.
            if parent_data and value == _get_path(parent_data, path):
                rep.mark(path, "inferred", source="parent", note=f"unchanged from {parent}")
            else:
                rep.mark(path, "filled", source="input")
            continue
        if parent_data and not _is_empty(_get_path(parent_data, path)):
            rep.mark(path, "inferred", source="parent", note=f"from {parent}")
            continue
        if audience_data and not _is_empty(_get_path(audience_data, path)):
            rep.mark(
                path, "inferred", source="audience_default", note=f"from {audience_pack_id}"
            )
            continue
        if not _is_empty(_get_path(_SAFE_DEFAULT, path)):
            rep.mark(path, "inferred", source="safe_default")
        else:
            rep.mark(path, "missing", source="")

    for key, default in _SAFE_DEFAULT.items():
        if key not in filled or _is_empty(filled.get(key)):
            filled[key] = copy.deepcopy(default)
            rep.mark(key, "inferred", source="safe_default")

    _reconcile_tokens(filled, parent_data or audience_data, rep)
    return filled, rep
