"""Brand PDF -> rasterized pages + weak text rules (no VLM)."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

from notale.style_studio.build.from_images import extract_from_images
from notale.style_studio.build.from_text import extract_from_text
from notale.style_studio.schema import deep_merge

_TEXT_KEYS = {
    "audience_hint",
    "density_default",
    "hard_negatives",
    "layout_policy",
    "info_form_bias",
    "identity",
}


def _render_pdf_pages(
    pdf_path: Path,
    dest_dir: Path,
    *,
    max_pages: int = 2,
    dpi: int = 120,
) -> List[Path]:
    try:
        import fitz  # pymupdf
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError("pymupdf is required for from-pdf; pip install pymupdf") from exc

    dest_dir.mkdir(parents=True, exist_ok=True)
    document = fitz.open(pdf_path)
    out: List[Path] = []
    try:
        matrix = fitz.Matrix(dpi / 72.0, dpi / 72.0)
        for index in range(min(max_pages, document.page_count)):
            destination = dest_dir / f"pdf_page_{index + 1:02d}.png"
            document.load_page(index).get_pixmap(matrix=matrix, alpha=False).save(
                str(destination)
            )
            out.append(destination)
    finally:
        document.close()
    return out


def _first_page_text(pdf_path: Path, *, max_chars: int = 400) -> str:
    try:
        import fitz
    except ImportError:  # pragma: no cover - optional dependency
        return ""
    document = fitz.open(pdf_path)
    try:
        if document.page_count < 1:
            return ""
        return (document.load_page(0).get_text("text") or "").strip()[:max_chars]
    finally:
        document.close()


def extract_from_pdf(
    pdf_path: Path,
    *,
    dest_exemplars_dir: Path,
    max_pages: int = 2,
) -> Tuple[Dict[str, Any], Set[str]]:
    """Return (pack patch, adapter_paths) from a brand PDF."""
    pdf_path = Path(pdf_path)
    if not pdf_path.is_file():
        raise FileNotFoundError(f"pdf not found: {pdf_path}")
    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError(f"expected .pdf, got {pdf_path.suffix}")

    paths: Set[str] = {"provenance"}
    patch: Dict[str, Any] = {"provenance": "from_pdf"}

    staging = Path(tempfile.mkdtemp(prefix="stylebuild_pdf_"))
    try:
        pages = _render_pdf_pages(pdf_path, staging, max_pages=max_pages)
        if not pages:
            raise ValueError(f"PDF has no pages: {pdf_path}")
        image_patch, image_paths = extract_from_images(
            pages,
            dest_exemplars_dir=dest_exemplars_dir,
            max_exemplars=max_pages,
        )
        patch = deep_merge(image_patch, patch)
        paths |= image_paths

        text = _first_page_text(pdf_path)
        if text:
            text_patch, text_paths = extract_from_text(text)
            # Measured colours beat hexes guessed out of prose, so keep only the
            # non-palette signals the text carried.
            clean = {key: value for key, value in text_patch.items() if key in _TEXT_KEYS}
            identity = dict(clean.get("identity") or {})
            identity.pop("style_tokens", None)
            identity.pop("notale_tokens", None)
            if identity:
                clean["identity"] = identity
            else:
                clean.pop("identity", None)
            if clean:
                patch = deep_merge(patch, clean)
                paths |= {
                    path
                    for path in text_paths
                    if not path.startswith("identity.style_tokens")
                    and not path.startswith("identity.notale_tokens")
                }
            patch.setdefault("prompt_compile", {})["style_prose"] = (
                "Style follows the brand PDF's first page. Excerpt: "
                + text[:160].replace("\n", " ")
            )
            paths.add("prompt_compile.style_prose")

        patch["provenance"] = "hybrid" if text else "from_pdf"
        patch.setdefault("chrome_rules", {})["dialect"] = (
            "Follow the brand PDF's page grid for colour blocking and spatial "
            "rhythm; never copy its body text."
        )
        paths.add("chrome_rules.dialect")
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    return patch, paths
