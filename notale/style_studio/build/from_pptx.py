"""PPTX/POTX -> theme tokens + embedded media exemplars (no LibreOffice)."""

from __future__ import annotations

import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from xml.etree import ElementTree as ET

from notale.style_studio.build.from_images import extract_from_images
from notale.style_studio.schema import deep_merge
from notale.style_studio.tokens_bridge import deckbase_to_notale

_NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

_SCHEME_TO_TOKEN = {
    "dk1": "text",
    "dk2": "secondary",
    "lt1": "background",
    "lt2": "background",
    "accent1": "primary",
    "accent2": "accent",
    "accent3": "secondary",
    "accent4": "accent",
    "accent5": "secondary",
    "accent6": "accent",
}

_RASTER_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}


def _norm_hex(raw: str) -> Optional[str]:
    value = (raw or "").strip().lstrip("#")
    if len(value) == 3 and re.fullmatch(r"[0-9a-fA-F]{3}", value):
        value = "".join(char * 2 for char in value)
    if len(value) == 6 and re.fullmatch(r"[0-9a-fA-F]{6}", value):
        return f"#{value.upper()}"
    if len(value) == 8 and re.fullmatch(r"[0-9a-fA-F]{8}", value):
        return f"#{value[2:].upper()}"  # AARRGGBB -> drop alpha
    return None


def _srgb_from_elem(elem: ET.Element) -> Optional[str]:
    for srgb in elem.findall(".//a:srgbClr", _NS):
        value = _norm_hex(srgb.get("val") or "")
        if value:
            return value
    for system in elem.findall(".//a:sysClr", _NS):
        value = _norm_hex(system.get("lastClr") or "")
        if value:
            return value
    return None


def extract_theme_tokens_from_pptx(pptx_path: Path) -> Dict[str, str]:
    """Read ppt/theme/theme*.xml scheme colours into style_tokens."""
    tokens: Dict[str, str] = {}
    with zipfile.ZipFile(pptx_path, "r") as archive:
        themes = sorted(
            name
            for name in archive.namelist()
            if name.startswith("ppt/theme/theme") and name.endswith(".xml")
        )
        if not themes:
            return tokens
        scheme = ET.fromstring(archive.read(themes[0])).find(".//a:clrScheme", _NS)
        if scheme is None:
            return tokens
        for child in list(scheme):
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            key = _SCHEME_TO_TOKEN.get(tag)
            if not key or key in tokens:
                continue
            value = _srgb_from_elem(child)
            if value:
                tokens[key] = value
    if "primary" not in tokens and tokens.get("accent"):
        tokens["primary"] = tokens["accent"]
    return tokens


def extract_media_images(
    pptx_path: Path,
    dest_dir: Path,
    *,
    max_images: int = 2,
) -> List[Path]:
    """Copy the largest raster files out of ppt/media/."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    out: List[Path] = []
    with zipfile.ZipFile(pptx_path, "r") as archive:
        candidates: List[Tuple[int, str]] = [
            (archive.getinfo(name).file_size, name)
            for name in archive.namelist()
            if name.startswith("ppt/media/") and Path(name).suffix.lower() in _RASTER_EXT
        ]
        candidates.sort(key=lambda item: -item[0])
        for index, (_, name) in enumerate(candidates[:max_images]):
            suffix = Path(name).suffix.lower() or ".png"
            destination = dest_dir / f"pptx_media_{index + 1:02d}{suffix}"
            with archive.open(name) as source, destination.open("wb") as handle:
                shutil.copyfileobj(source, handle)
            out.append(destination)
    return out


def extract_from_pptx(
    pptx_path: Path,
    *,
    dest_exemplars_dir: Path,
    max_media: int = 2,
) -> Tuple[Dict[str, Any], Set[str]]:
    """Return (pack patch, adapter_paths) from a .pptx/.potx file."""
    pptx_path = Path(pptx_path)
    if not pptx_path.is_file():
        raise FileNotFoundError(f"pptx not found: {pptx_path}")
    if pptx_path.suffix.lower() not in {".pptx", ".potx"}:
        raise ValueError(f"expected .pptx/.potx, got {pptx_path.suffix}")

    paths: Set[str] = {"provenance"}
    patch: Dict[str, Any] = {"provenance": "from_pptx"}

    tokens = extract_theme_tokens_from_pptx(pptx_path)
    if tokens:
        patch["identity"] = {"style_tokens": tokens}
        paths.add("identity.style_tokens")

    staging = Path(tempfile.mkdtemp(prefix="stylebuild_pptx_"))
    try:
        media = extract_media_images(pptx_path, staging, max_images=max_media)
        if media:
            image_patch, image_paths = extract_from_images(
                media,
                dest_exemplars_dir=dest_exemplars_dir,
                max_exemplars=max_media,
            )
            # Declared theme colours beat colours guessed off a screenshot.
            if tokens and "identity" in image_patch:
                identity = dict(image_patch.get("identity") or {})
                identity["style_tokens"] = tokens
                identity.pop("notale_tokens", None)
                image_patch["identity"] = identity
            patch = deep_merge(image_patch, patch)
            paths |= image_paths
            patch["provenance"] = "from_pptx"
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    if tokens:
        projected = deckbase_to_notale(tokens, include_fonts=False)
        if projected:
            patch.setdefault("identity", {})["notale_tokens"] = projected
            paths.add("identity.notale_tokens")
        summary = ", ".join(f"{key}={value}" for key, value in list(tokens.items())[:5])
        patch.setdefault("chrome_rules", {})["dialect"] = (
            f"Colours taken from the source PPT theme ({summary}); follow the "
            "exemplars for spatial rhythm and never copy their text."
        )
        paths.add("chrome_rules.dialect")
        patch.setdefault("prompt_compile", {})["style_prose"] = (
            f"Style derived from a PowerPoint theme: {summary}."
        )
        paths.add("prompt_compile.style_prose")

    return patch, paths
