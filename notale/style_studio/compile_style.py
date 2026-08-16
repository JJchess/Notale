"""Compile a StylePack into what notale renders.

The notale counterpart of deckbase's ``compile_render``. deckbase compiles a
pack into an image-generation prompt with reference-image channels; notale
compiles it into executable CSS tokens, a Builder-facing Skill body, and the
composition catalog the Planner assigns from.

What carries over unchanged is the *discipline*: forbidden effects are the union
of ``hard_negatives`` and ``chrome_rules.forbidden_effects``, the pack's own
axes (density, radius, layout family, info-form bias) are appended as explicit
constraints rather than left implicit, and the pack id and version travel in
``meta`` so a rendered deck can always be traced back to the style that made it.
"""

from __future__ import annotations

from typing import Any, Dict, List, Union

from notale.style_studio.models import StyleBundle, StylePack, normalize_page_role
from notale.style_studio.registry import get_pack

_DENSITY_LINES = {
    "classroom_sparse": (
        "Density: sparse. Large type, few modules, generous whitespace. Never "
        "pack the canvas with an information strip."
    ),
    "elementary_sparse": (
        "Density: sparse. Large type, few modules, generous whitespace. Never "
        "pack the canvas with an information strip."
    ),
    "academic_high": (
        "Density: high. Dense information grids and multiple modules are "
        "allowed. Build hierarchy from structure, not from more words."
    ),
    "reference": "Density: medium. Clear modules with even whitespace.",
}

_RADIUS_LINES = {
    "sharp": "Corners: square or barely rounded. Edges stay crisp.",
    "soft": "Corners: moderate, softened radii on cards and regions.",
    "round": "Corners: pronounced radii and capsule shapes; friendly and round.",
}

_LAYOUT_LINES = {
    "window_focus": (
        "Layout bias: focal composition, with the main content held inside one "
        "dominant region."
    ),
    "left_action_right_material": (
        "Layout bias: statement or action on the left, material on the right."
    ),
    "full_width_material": (
        "Layout bias: material and diagrams run across the main area on a clear grid."
    ),
    "observe_split": (
        "Layout bias: observation split, pairing figure with text. Never compress "
        "it into a dashboard."
    ),
}


def effective_hard_negatives(pack: StylePack) -> List[str]:
    """hard_negatives union chrome_rules.forbidden_effects, order-preserving."""
    out: List[str] = []
    for value in pack.hard_negatives():
        if value and value not in out:
            out.append(value)
    for value in pack.chrome_rules().get("forbidden_effects") or []:
        text = str(value).strip()
        if text and text not in out:
            out.append(text)
    return out


def _axis_lines(pack: StylePack, page_role: str) -> List[str]:
    lines: List[str] = []
    density = pack.density_default.strip()
    if density:
        lines.append(
            _DENSITY_LINES.get(density, f"Density: {density}. Match the stated density.")
        )
    radius = pack.radius_scale()
    if radius:
        lines.append(_RADIUS_LINES.get(radius, f"Corners: {radius}."))
    type_hints = pack.type_hints()
    if type_hints:
        lines.append(f"Typography dialect: {type_hints}")

    policy = pack.layout_policy()
    by_role = policy.get("by_page_role") or {}
    family = str(
        (by_role.get(page_role) if isinstance(by_role, dict) else None)
        or policy.get("default_family")
        or ""
    )
    if family:
        lines.append(_LAYOUT_LINES.get(family, f"Layout bias: {family}."))

    info = pack.info_form_bias()
    prefer = [str(x) for x in (info.get("prefer") or [])]
    avoid = [str(x) for x in (info.get("avoid") or [])]
    if prefer:
        lines.append("Preferred information forms: " + ", ".join(prefer[:6]) + ".")
    if avoid:
        lines.append("Avoid these information forms: " + ", ".join(avoid[:6]) + ".")
    return lines


def compile_style(
    pack: Union[StylePack, str],
    *,
    page_role: str = "content",
    include_axes: bool = True,
) -> StyleBundle:
    """Project a pack onto the Skill body, tokens, and compositions notale uses."""
    if isinstance(pack, str):
        pack = get_pack(pack)
    role = normalize_page_role(page_role)

    body = pack.skill_body().strip()
    if include_axes:
        axes = _axis_lines(pack, role)
        forbidden = effective_hard_negatives(pack)
        sections: List[str] = []
        if axes:
            sections.append("## Style axes\n\n" + "\n".join(f"- {line}" for line in axes))
        if forbidden:
            sections.append(
                "## Never\n\n" + "\n".join(f"- {item}" for item in forbidden[:12])
            )
        if sections:
            body = body + "\n\n" + "\n\n".join(sections)

    meta: Dict[str, Any] = {
        "pack_id": pack.id,
        "version": pack.version,
        "status": pack.status,
        "provenance": pack.provenance,
        "page_role": role,
        "density_default": pack.density_default,
        "audience_hint": pack.audience_hint,
        "radius_scale": pack.radius_scale(),
        "layout_policy": pack.layout_policy(),
        "info_form_bias": pack.info_form_bias(),
        # Decoration rendering consumes mascot_policy from the separately
        # materialized channel. It stays in meta too so exports remain lossless.
        "mascot_policy": pack.mascot_policy(),
        "or_hints": pack.or_hints(),
        "style_anchor": pack.prompt_compile()["style_anchor"],
    }

    return StyleBundle(
        pack_id=pack.id,
        version=pack.version,
        name=pack.id,
        description=pack.description() or pack.label,
        body=body,
        tokens=pack.notale_tokens(),
        compositions=pack.compositions(),
        forbidden=effective_hard_negatives(pack),
        acceptance_hooks=pack.acceptance_hooks(),
        type_scale=pack.type_scale(),
        exemplar_paths=[str(path) for path in pack.role_exemplar_paths(role)],
        meta=meta,
    )
