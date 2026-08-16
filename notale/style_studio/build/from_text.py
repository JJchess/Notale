"""Rule-based sparse text -> StylePack field patch (no LLM required).

Ported from deckbase. Deliberately deterministic: describing a style in prose is
a cheap, repeatable operation and should not cost a model call. The generated
run path (``from_topic``) is the one place an LLM is involved.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Set, Tuple

from notale.style_studio.tokens_bridge import deckbase_to_notale

_HEX = re.compile(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")
# deckbase orders captured hexes primary, accent, secondary, background, text.
_TOKEN_ORDER = ("primary", "accent", "secondary", "background", "text")


def extract_from_text(text: str) -> Tuple[Dict[str, Any], Set[str]]:
    """Return (partial_patch, adapter_paths). Near-empty text yields an empty patch."""
    text = (text or "").strip()
    patch: Dict[str, Any] = {}
    paths: Set[str] = set()
    if not text:
        return patch, paths

    lower = text.lower()

    hexes = _HEX.findall(text)
    if hexes:
        tokens: Dict[str, str] = {}
        for index, value in enumerate(hexes[: len(_TOKEN_ORDER)]):
            if len(value) == 4:
                value = "#" + "".join(char * 2 for char in value[1:])
            tokens[_TOKEN_ORDER[index]] = value.upper()
        patch.setdefault("identity", {})["style_tokens"] = tokens
        paths.add("identity.style_tokens")
        # Project onto the executable vocabulary so a colour the user named
        # actually renders. A partial palette yields a partial patch; whatever
        # the prose left unsaid is filled from the parent by defaults_fill.
        projected = deckbase_to_notale(tokens, include_fonts=False)
        if projected:
            patch["identity"]["notale_tokens"] = projected
            paths.add("identity.notale_tokens")

    if any(word in text for word in ("小学", "课堂", "儿童", "低年级")) or "elementary" in lower:
        patch["audience_hint"] = "elementary"
        paths.add("audience_hint")
        patch["density_default"] = "classroom_sparse"
        paths.add("density_default")
    elif any(word in text for word in ("学术", "论文", "科研", "信息图")) or "academic" in lower:
        patch["audience_hint"] = "academic"
        paths.add("audience_hint")
        if "dense" in lower or "高密" in text or "密集" in text:
            patch["density_default"] = "academic_high"
            paths.add("density_default")

    if any(word in text for word in ("大圆角", "圆润", "软萌")) or "round" in lower:
        patch.setdefault("identity", {})["radius_scale"] = "round"
        paths.add("identity.radius_scale")
    elif "直角" in text or "sharp" in lower:
        patch.setdefault("identity", {})["radius_scale"] = "sharp"
        paths.add("identity.radius_scale")
    elif "柔和" in text or "soft" in lower:
        patch.setdefault("identity", {})["radius_scale"] = "soft"
        paths.add("identity.radius_scale")

    if "稀疏" in text or "大字" in text or "classroom_sparse" in lower:
        patch["density_default"] = "classroom_sparse"
        paths.add("density_default")

    negatives = [
        token
        for token in ("霓虹", "3D", "仪表盘", "电路板", "neon", "dashboard", "glassmorphism")
        if token.lower() in lower or token in text
    ]
    match = re.search(r"(?:禁止|不要|avoid)[：:\s]*([^\n。；;]{2,40})", text, re.I)
    if match:
        negatives.append(match.group(1).strip())
    if negatives:
        patch["hard_negatives"] = list(dict.fromkeys(negatives))
        paths.add("hard_negatives")

    if "窗框" in text or "window" in lower:
        patch["layout_policy"] = {"default_family": "window_focus"}
        paths.add("layout_policy")
    elif "观察" in text or "observe" in lower:
        patch.setdefault("info_form_bias", {})["prefer"] = ["observe_figure", "short_bullets"]
        paths.add("info_form_bias")

    prose = text.replace("\n", " ").strip()
    if len(prose) >= 8:
        patch.setdefault("prompt_compile", {})["style_prose"] = prose[:280]
        paths.add("prompt_compile.style_prose")
        patch["prompt_compile"]["style_anchor"] = f"[style anchor] {prose[:180]}"
        paths.add("prompt_compile.style_anchor")

    patch["provenance"] = "from_text"
    paths.add("provenance")
    return patch, paths
