"""Contract-driven backplates: a styled, text-free ground under real HTML text.

deckbase generates a slide as a raster with empty labelled containers, then uses
CV to find those containers, read their badges, erase the digits, and lay PPTX
text boxes into the recovered coordinates. All of that exists because PPTX has no
layout engine, so deckbase must reverse-engineer a layout it did not author.

notale owns the layout. So the image model is asked for one thing only — a
text-free ground that reserves calm regions where type will sit — and HTML/CSS
still does the composition. No detection, no badges, no inpainting.

What survives from deckbase is the part that is still true: text set over a
generated image has a readability problem the palette alone cannot answer. That
is handled after rendering, by measuring the actual pixels under each line
(`web/measure.py`) and judging them (`core/stages/page_qa.py`).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

CHANNEL_FILENAME = "image_channel.json"


@dataclass(frozen=True)
class SafeArea:
    """A region of the 1280x720 frame that must stay calm enough to carry type."""

    role: str
    x: float
    y: float
    w: float
    h: float

    def describe(self) -> str:
        horizontal = "left" if self.x + self.w / 2 < 0.4 else (
            "right" if self.x + self.w / 2 > 0.6 else "centre"
        )
        vertical = "upper" if self.y + self.h / 2 < 0.4 else (
            "lower" if self.y + self.h / 2 > 0.6 else "middle"
        )
        span = "full-width " if self.w > 0.8 else ""
        return (
            f"{vertical} {horizontal} {span}region "
            f"(x {self.x:.0%}-{self.x + self.w:.0%}, y {self.y:.0%}-{self.y + self.h:.0%}), "
            f"carrying {self.role} type"
        )


@dataclass(frozen=True)
class ImageChannel:
    """The pack's style, projected for an image model. Written at materialize time."""

    pack_id: str
    style_prose: str = ""
    style_anchor: str = ""
    chrome_dialect: str = ""
    radius_scale: str = ""
    density_default: str = ""
    palette: dict[str, str] | None = None
    forbidden: list[str] | None = None

    @classmethod
    def load(cls, run_dir: Path) -> "ImageChannel | None":
        path = Path(run_dir) / "style_refs" / CHANNEL_FILENAME
        if not path.is_file():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        return cls(
            pack_id=str(data.get("pack_id") or ""),
            style_prose=str(data.get("style_prose") or ""),
            style_anchor=str(data.get("style_anchor") or ""),
            chrome_dialect=str(data.get("chrome_dialect") or ""),
            radius_scale=str(data.get("radius_scale") or ""),
            density_default=str(data.get("density_default") or ""),
            palette=dict(data.get("palette") or {}),
            forbidden=[str(x) for x in (data.get("forbidden") or [])],
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "pack_id": self.pack_id,
            "style_prose": self.style_prose,
            "style_anchor": self.style_anchor,
            "chrome_dialect": self.chrome_dialect,
            "radius_scale": self.radius_scale,
            "density_default": self.density_default,
            "palette": dict(self.palette or {}),
            "forbidden": list(self.forbidden or []),
        }


_TEXT_FREE = (
    "Produce a text-free background plate for one 1280x720 presentation slide. "
    "It must contain NO readable text, letters, numerals, logos, watermarks, "
    "captions, labels, or UI chrome of any kind: every word on this slide is set "
    "as real HTML on top of your image. Do not draw boxes, cards, panels, or "
    "frames intended to hold text — the layout already exists."
)


def backplate_prompt(
    *,
    channel: ImageChannel | None,
    subject: str,
    safe_areas: Sequence[SafeArea] = (),
    composition: Any = None,
) -> tuple[str, str]:
    """Assemble (prompt, negative_prompt) for one page's ground."""
    blocks: list[str] = [_TEXT_FREE, f"Subject: {subject.strip()}"]

    if channel is not None:
        style: list[str] = []
        if channel.style_prose:
            style.append(channel.style_prose)
        if channel.chrome_dialect:
            style.append(f"Surface language: {channel.chrome_dialect}")
        palette = channel.palette or {}
        named = ", ".join(
            f"{key} {palette[key]}"
            for key in ("bg", "surface", "ink", "accent", "accent-2", "accent-3")
            if palette.get(key)
        )
        if named:
            style.append(
                f"Hold to this palette ({named}); the plate must sit behind the "
                "page background rather than fight it."
            )
        if channel.radius_scale:
            style.append(f"Corner language: {channel.radius_scale}.")
        if style:
            blocks.append("Style: " + " ".join(style))

    if composition is not None:
        spatial = getattr(composition, "spatial_logic", "")
        carrier = getattr(composition, "dominant_carrier", "")
        if spatial:
            blocks.append(f"The page is composed as: {spatial}")
        if carrier:
            blocks.append(f"Its dominant carrier is: {carrier}")

    if safe_areas:
        reserved = "; ".join(area.describe() for area in safe_areas)
        blocks.append(
            "Keep these regions calm and close to uniform — no focal subject, no "
            "high-frequency detail, no strong edge or hard value break inside them, "
            f"because set type will sit over them: {reserved}. "
            "Put visual interest outside them."
        )

    negatives = list((channel.forbidden if channel else None) or [])
    negatives = [item for item in negatives if item]
    negative_prompt = ", ".join(
        ["text", "letters", "numbers", "watermark", "logo", "caption", "UI panel"]
        + negatives[:10]
    )
    return "\n\n".join(blocks), negative_prompt


def validate_safe_areas(areas: Sequence[SafeArea]) -> list[str]:
    """Reject rectangles that cannot be honoured. Returns human-readable errors."""
    errors: list[str] = []
    total = 0.0
    for index, area in enumerate(areas):
        if not (0.0 <= area.x < 1.0 and 0.0 <= area.y < 1.0):
            errors.append(f"safe_areas[{index}] starts outside the frame")
        if area.x + area.w > 1.001 or area.y + area.h > 1.001:
            errors.append(f"safe_areas[{index}] extends past the frame")
        if area.w <= 0 or area.h <= 0:
            errors.append(f"safe_areas[{index}] has no area")
        total += max(0.0, area.w) * max(0.0, area.h)
    if total > 0.85:
        errors.append(
            f"safe areas cover {total:.0%} of the frame; leaving almost nothing for "
            "the image makes a backplate pointless"
        )
    return errors
