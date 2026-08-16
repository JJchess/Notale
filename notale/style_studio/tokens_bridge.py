"""Deterministic projection between deckbase ``style_tokens`` and notale tokens.

deckbase packs describe identity with an abstract palette
(``primary/secondary/accent/background/text`` plus optional ``window/frame``).
notale renders eleven concrete CSS custom properties. Neither vocabulary is a
superset of the other, so a pack carries both and this module keeps them
consistent: whichever side is missing is derived from the other, and the fill is
reported as ``inferred``/``source=bridge`` rather than silently invented.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Mapping

# deckbase key -> notale key, for the five that map one-to-one.
DECKBASE_TO_NOTALE = {
    "background": "bg",
    "text": "ink",
    "primary": "accent",
    "secondary": "accent-2",
    "accent": "accent-3",
}
NOTALE_TO_DECKBASE = {value: key for key, value in DECKBASE_TO_NOTALE.items()}

# Derived notale keys that deckbase has no equivalent for.
DERIVED_NOTALE_KEYS = ("surface", "muted", "line")

# Catalog fonts used when importing a deckbase pack, which carries only prose
# ``identity.type_hints`` and no font IDs at all.
_DEFAULT_DISPLAY_FONT = "noto-sans-sc"
_DEFAULT_BODY_FONT = "noto-sans-sc"
_DEFAULT_MONO_FONT = "jetbrains-mono"
_SERIF_HINTS = ("衬线", "serif", "宋", "楷", "仿宋", "明朝")
_MONO_HINTS = ("等宽", "mono", "code", "terminal")

_HEX = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def _rgb(value: str) -> tuple[int, int, int] | None:
    match = _HEX.fullmatch(str(value).strip())
    if match is None:
        return None
    digits = match.group(1)
    if len(digits) == 3:
        digits = "".join(char * 2 for char in digits)
    return tuple(int(digits[index : index + 2], 16) for index in (0, 2, 4))  # type: ignore[return-value]


def _hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*(max(0, min(255, round(c))) for c in rgb))


def _blend(base: str, toward: str, ratio: float) -> str | None:
    """Mix ``base`` toward ``toward`` by ``ratio`` (0 = base, 1 = toward)."""
    left, right = _rgb(base), _rgb(toward)
    if left is None or right is None:
        return None
    return _hex(tuple(l + (r - l) * ratio for l, r in zip(left, right)))  # type: ignore[arg-type]


def _contrast(left: str, right: str) -> float | None:
    first, second = _relative_luminance(left), _relative_luminance(right)
    if first is None or second is None:
        return None
    lighter, darker = max(first, second), min(first, second)
    return (lighter + 0.05) / (darker + 0.05)


def _relative_luminance(value: str) -> float | None:
    rgb = _rgb(value)
    if rgb is None:
        return None
    channels = []
    for raw in rgb:
        channel = raw / 255
        channels.append(
            channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4
        )
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def _font_for_type_hints(type_hints: str) -> tuple[str, str, str]:
    """Pick catalog font IDs from deckbase's free-text typography dialect."""
    text = str(type_hints or "").strip().lower()
    display = _DEFAULT_DISPLAY_FONT
    body = _DEFAULT_BODY_FONT
    if any(hint in text for hint in _SERIF_HINTS):
        display = "noto-serif-sc"
        body = "noto-serif-sc"
    mono = _DEFAULT_MONO_FONT
    return display, body, mono


def deckbase_to_notale(
    style_tokens: Mapping[str, Any],
    *,
    type_hints: str = "",
    include_fonts: bool = True,
) -> Dict[str, str]:
    """Project a deckbase palette onto the eleven notale tokens.

    ``surface``/``muted``/``line`` are derived from background and text so the
    result is renderable; fonts fall back to catalog defaults because deckbase
    stores typography only as prose.

    Only the keys that can actually be derived are returned, so a partial
    palette yields a partial patch and the caller's fallback chain fills the
    rest. Pass ``include_fonts=False`` when the source said nothing about
    typography — otherwise the catalog defaults would silently displace a
    parent pack's deliberate font choices.
    """
    tokens: Dict[str, str] = {}
    for source, target in DECKBASE_TO_NOTALE.items():
        value = str(style_tokens.get(source) or "").strip()
        if value:
            tokens[target] = value

    background = tokens.get("bg", "")
    text = tokens.get("ink", "")

    # deckbase's optional `window` is the closest thing to a raised surface, but
    # only if text is actually readable on it. A `window` inherited from a pack
    # of the opposite polarity would otherwise produce a surface nothing can be
    # read against.
    window = str(style_tokens.get("window") or "").strip()
    if window and (not text or (_contrast(window, text) or 0) >= 4.5):
        tokens["surface"] = window
    elif background and text:
        # Lift the surface a little away from the page toward the ink.
        surface = _blend(background, text, 0.06)
        if surface:
            tokens["surface"] = surface

    if background and text:
        muted = _blend(text, background, 0.45)
        if muted:
            tokens["muted"] = muted
        line = _blend(background, text, 0.18)
        if line:
            tokens["line"] = line

    if include_fonts:
        display, body, mono = _font_for_type_hints(type_hints)
        tokens.setdefault("font-display", display)
        tokens.setdefault("font-body", body)
        tokens.setdefault("font-mono", mono)
    return tokens


def notale_to_deckbase(notale_tokens: Mapping[str, Any]) -> Dict[str, str]:
    """Project notale's eleven tokens back onto a deckbase palette.

    ``window``/``frame`` are deliberately left out: notale has no equivalent and
    inventing them would corrupt a round trip.
    """
    tokens: Dict[str, str] = {}
    for source, target in NOTALE_TO_DECKBASE.items():
        value = str(notale_tokens.get(source) or "").strip()
        if value:
            tokens[target] = value
    surface = str(notale_tokens.get("surface") or "").strip()
    if surface:
        tokens["window"] = surface
    return tokens


def type_hints_for(notale_tokens: Mapping[str, Any]) -> str:
    """Describe notale font choices as a deckbase-style typography dialect."""
    display = str(notale_tokens.get("font-display") or "").strip()
    body = str(notale_tokens.get("font-body") or "").strip()
    if not display and not body:
        return ""
    return f"display={display or '-'}; body={body or '-'}"


def prefers_dark(notale_tokens: Mapping[str, Any]) -> bool:
    """True when the pack's background is darker than its ink."""
    background = _relative_luminance(str(notale_tokens.get("bg") or ""))
    ink = _relative_luminance(str(notale_tokens.get("ink") or ""))
    if background is None or ink is None:
        return True
    return background < ink
