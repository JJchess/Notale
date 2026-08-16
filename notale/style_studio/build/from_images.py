"""Pillow palette -> style tokens; copy 1-2 images as chrome exemplars.

Ported from deckbase. In deckbase the copied images become reference frames for
the image model; in notale they are the visual baseline the page inspector
compares a rendered slide against.
"""

from __future__ import annotations

import colorsys
import shutil
from pathlib import Path
from typing import Any, Dict, List, Sequence, Set, Tuple

from notale.style_studio.tokens_bridge import deckbase_to_notale


def _rgb_to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02X}{g:02X}{b:02X}"


def _extract_palette(image_path: Path, count: int = 5) -> List[str]:
    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover - depends on optional extra
        raise RuntimeError("Pillow is required for from-images") from exc

    image = Image.open(image_path).convert("RGB").resize((96, 96))
    median = getattr(getattr(Image, "Quantize", Image), "MEDIANCUT", Image.MEDIANCUT)
    quantized = image.quantize(colors=max(count, 8), method=median)
    palette = quantized.getpalette() or []
    counts: Dict[Tuple[int, int, int], int] = {}
    pixels = quantized.load()
    width, height = quantized.size
    for y in range(height):
        for x in range(width):
            index = int(pixels[x, y]) * 3
            if index + 2 >= len(palette):
                continue
            rgb = (palette[index], palette[index + 1], palette[index + 2])
            counts[rgb] = counts.get(rgb, 0) + 1
    ranked = sorted(counts.items(), key=lambda item: -item[1])
    return [_rgb_to_hex(*rgb) for rgb, _ in ranked[:count]]


def _pick_tokens(hexes: List[str]) -> Dict[str, str]:
    """Darkest -> text, lightest -> background, most saturated -> primary/accent."""
    if not hexes:
        return {}

    def luminance(value: str) -> float:
        r, g, b = (int(value[i : i + 2], 16) / 255 for i in (1, 3, 5))
        return 0.2126 * r + 0.7152 * g + 0.0722 * b

    def saturation(value: str) -> float:
        r, g, b = (int(value[i : i + 2], 16) / 255 for i in (1, 3, 5))
        return colorsys.rgb_to_hsv(r, g, b)[1]

    by_luminance = sorted(hexes, key=luminance)
    by_saturation = sorted(hexes, key=saturation, reverse=True)
    primary = by_saturation[0]
    return {
        "primary": primary,
        "secondary": by_saturation[2] if len(by_saturation) > 2 else primary,
        "accent": by_saturation[1] if len(by_saturation) > 1 else primary,
        "background": by_luminance[-1],
        "text": by_luminance[0],
    }


def extract_from_images(
    image_paths: Sequence[Path],
    *,
    dest_exemplars_dir: Path,
    max_exemplars: int = 2,
) -> Tuple[Dict[str, Any], Set[str]]:
    """Copy up to max_exemplars into dest; return a pack patch + adapter paths."""
    existing = [Path(path) for path in image_paths if Path(path).is_file()]
    if not existing:
        return {}, set()

    paths: Set[str] = {"provenance"}
    patch: Dict[str, Any] = {"provenance": "from_images"}

    tokens = _pick_tokens(_extract_palette(existing[0]))
    if tokens:
        patch["identity"] = {"style_tokens": tokens}
        paths.add("identity.style_tokens")
        projected = deckbase_to_notale(tokens, include_fonts=False)
        if projected:
            patch["identity"]["notale_tokens"] = projected
            paths.add("identity.notale_tokens")

    dest_exemplars_dir.mkdir(parents=True, exist_ok=True)
    relatives: List[str] = []
    for index, source in enumerate(existing[:max_exemplars]):
        name = f"user_ref_{index + 1:02d}{source.suffix.lower() or '.png'}"
        destination = dest_exemplars_dir / name
        if source.resolve() != destination.resolve():
            shutil.copy2(source, destination)
        relatives.append(f"exemplars/{name}")

    if relatives:
        patch["role_exemplars"] = {
            "cover": relatives[:1],
            "section": relatives[:1],
            "content": relatives,
            "closing": relatives[:1],
        }
        paths.add("role_exemplars")
        patch.setdefault("chrome_rules", {})["dialect"] = (
            "Follow the reference images for colour blocking and spatial rhythm; "
            "never copy text off them."
        )
        paths.add("chrome_rules.dialect")

    return patch, paths
