"""Compile prose-like Design DNA into the closed LectureDoc visual token vocabulary."""

from __future__ import annotations

import re
from typing import Any

_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def _hex(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    return text.upper() if _HEX.fullmatch(text) else fallback


def _rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[i : i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def _mix(a: str, b: str, amount: float) -> str:
    left, right = _rgb(a), _rgb(b)
    channels = [round(x + (y - x) * amount) for x, y in zip(left, right, strict=True)]
    return "#" + "".join(f"{channel:02X}" for channel in channels)


def _luminance(value: str) -> float:
    red, green, blue = _rgb(value)
    return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255


def _contains(value: Any, *signals: str) -> bool:
    text = str(value or "").lower()
    return any(signal in text for signal in signals)


def _font_token(value: Any, *, display: bool) -> str:
    if _contains(value, "serif", "宋", "明朝", "editorial", "literary"):
        return "editorial-serif"
    if _contains(value, "mono", "code", "terminal", "等宽"):
        return "technical-mono"
    if _contains(value, "rounded", "playful", "圆", "friendly"):
        return "rounded-sans"
    if _contains(value, "humanist", "warm", "人文"):
        return "humanist-sans"
    return "display-sans" if display else "system-sans"


def compile_visual_system(design_brief: dict[str, Any] | None) -> dict[str, Any]:
    """Return a schema-safe visual system; never pass Design DNA through as unbound prose."""
    brief = design_brief if isinstance(design_brief, dict) else {}
    dna_value = brief.get("designDNA")
    dna = dna_value if isinstance(dna_value, dict) else {}
    palette_value = dna.get("palette")
    raw_palette = palette_value if isinstance(palette_value, dict) else {}

    base = _hex(raw_palette.get("background") or raw_palette.get("base"), "#F4F1E8")
    accent = _hex(raw_palette.get("accent"), "#E4572E")
    dark = _luminance(base) < 0.42
    ink_default = "#F5F7FA" if dark else "#182026"
    surface_default = _mix(base, "#FFFFFF" if dark else "#FFFFFF", 0.08 if dark else 0.66)
    surface_alt_default = _mix(base, accent, 0.12)
    line_default = _mix(base, ink_default, 0.22)
    muted_default = _mix(ink_default, base, 0.46)
    accent2_default = _mix(accent, "#4D7CFE", 0.48)

    typography_value = dna.get("typography")
    typography = typography_value if isinstance(typography_value, dict) else {}
    audience_value = brief.get("audience")
    audience: dict[str, Any] = audience_value if isinstance(audience_value, dict) else {}
    stage = str(audience.get("stage") or "")
    density = str(brief.get("density") or "medium")
    scale = "compact" if density == "dense" else "poster" if density == "light" and stage in {"primary", "middle"} else "balanced"
    rhythm_text = str(dna.get("compositionRhythm") or "").lower()
    rhythm = next(
        (name for name in ("quiet", "alternating", "progressive", "editorial") if name in rhythm_text),
        "alternating",
    )

    shape_text = str(dna.get("shapeLanguage") or "").lower()
    radius = 2 if _contains(shape_text, "sharp", "technical", "geometric", "硬朗", "工程") else 18 if _contains(shape_text, "organic", "soft", "rounded", "自然", "柔和") else 8
    border_width = 2 if _contains(shape_text, "outline", "stroke", "线框", "描边") else 1
    shadow = "hard" if _contains(shape_text, "brutal", "poster", "硬阴影") else "soft" if _contains(shape_text, "soft", "editorial", "柔和") else "none"

    texture_text = str(dna.get("texture") or "").lower()
    texture = next(
        (name for name in ("paper", "grid", "grain", "soft-gradient") if name in texture_text),
        "none",
    )
    motif_values_raw = dna.get("motifs")
    motif_values: list[Any] = motif_values_raw if isinstance(motif_values_raw, list) else []
    motif_types = ("orb", "wave", "rule", "grid", "corner", "blob")
    motifs: list[dict[str, Any]] = []
    for index, raw in enumerate(motif_values[:4]):
        raw_text = str(raw).lower()
        motif_type = next((name for name in motif_types if name in raw_text), None)
        if motif_type is None:
            motif_type = motif_types[index % len(motif_types)]
        motifs.append(
            {
                "type": motif_type,
                "colorRole": "accent2" if index % 2 else "accent",
                "opacity": 0.12 if index else 0.16,
            }
        )

    return {
        "palette": {
            "background": base,
            "surface": _hex(raw_palette.get("surface"), surface_default),
            "surfaceAlt": _hex(raw_palette.get("surfaceAlt"), surface_alt_default),
            "ink": _hex(raw_palette.get("ink"), ink_default),
            "muted": _hex(raw_palette.get("muted"), muted_default),
            "accent": accent,
            "accent2": _hex(raw_palette.get("accent2"), accent2_default),
            "line": _hex(raw_palette.get("line"), line_default),
        },
        "typography": {
            "display": _font_token(typography.get("display"), display=True),
            "body": _font_token(typography.get("body"), display=False),
            "mono": "technical-mono",
            "displayWeight": 800 if scale == "poster" else 700,
            "bodyWeight": 400,
            "scale": scale,
        },
        "shape": {
            "radius": radius,
            "borderWidth": border_width,
            "shadow": shadow,
        },
        "texture": texture,
        "motifs": motifs,
        "rhythm": rhythm,
    }
