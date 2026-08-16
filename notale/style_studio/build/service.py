"""High-level StyleBuild operations: ensure draft, merge adapters, publish."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Set

from notale.style_studio.build.defaults_fill import fill_defaults
from notale.style_studio.build.fork import fork_pack
from notale.style_studio.build.from_images import extract_from_images
from notale.style_studio.build.from_pdf import extract_from_pdf
from notale.style_studio.build.from_pptx import extract_from_pptx
from notale.style_studio.build.from_text import extract_from_text
from notale.style_studio.build.models import BuildBrief
from notale.style_studio.build.registry_user import (
    set_pack_status,
    user_pack_dir,
    write_pack_json,
)
from notale.style_studio.build.report import write_build_report
from notale.style_studio.defaults import default_style_pack_id
from notale.style_studio.schema import deep_merge


def pack_exists(pack_id: str) -> bool:
    return (user_pack_dir(pack_id) / "pack.json").is_file()


def ensure_user_draft(
    pack_id: str,
    *,
    parent_id: str = "",
    label: str = "",
    audience_hint: str = "",
) -> Path:
    """Fork the parent (or the audience default) into user/<id> if missing."""
    if pack_exists(pack_id):
        return user_pack_dir(pack_id) / "pack.json"
    parent = parent_id or default_style_pack_id(audience_level=audience_hint)
    return fork_pack(parent, pack_id, label=label or None)


def _load_user(pack_id: str) -> Dict[str, Any]:
    path = user_pack_dir(pack_id) / "pack.json"
    if not path.is_file():
        raise FileNotFoundError(f"user pack not found: {pack_id}")
    return json.loads(path.read_text(encoding="utf-8"))


def merge_and_fill(
    pack_id: str,
    overlay: Mapping[str, Any],
    *,
    adapter_paths: Optional[Set[str]] = None,
    explicit_paths: Optional[Set[str]] = None,
    adapters: Optional[List[str]] = None,
    notes: Optional[List[str]] = None,
) -> Path:
    """Merge an overlay onto a draft, backfill, validate, and report.

    Every build path lands here, so a pack is never written without a
    BUILD_REPORT recording where each field came from.
    """
    base = _load_user(pack_id)
    parent = str((base.get("lineage") or {}).get("parent_preset_id") or "")
    merged = deep_merge(base, dict(overlay))
    merged["id"] = pack_id
    filled, report = fill_defaults(
        merged,
        parent_id=parent,
        audience_hint=str(merged.get("audience_hint") or ""),
        explicit_paths=explicit_paths,
        adapter_paths=adapter_paths,
    )
    filled["id"] = pack_id
    if adapters:
        report.adapters.extend(adapters)
    if notes:
        report.notes.extend(notes)
    destination = write_pack_json(pack_id, filled)
    write_build_report(user_pack_dir(pack_id), report)
    brief = BuildBrief(
        pack_id=pack_id,
        label=str(filled.get("label") or ""),
        parent_id=parent,
        audience_hint=str(filled.get("audience_hint") or ""),
        provenance=str(filled.get("provenance") or "hybrid"),
        json_patch=dict(overlay),
    )
    (user_pack_dir(pack_id) / "BUILD_BRIEF.json").write_text(
        json.dumps(brief.to_dict(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return destination


def from_text(pack_id: str, text: str, *, parent_id: str = "", label: str = "") -> Path:
    ensure_user_draft(pack_id, parent_id=parent_id, label=label)
    patch, paths = extract_from_text(text)
    return merge_and_fill(
        pack_id,
        patch,
        adapter_paths=paths,
        adapters=["from-text"],
        notes=[f"text_len={len(text or '')}"],
    )


def from_images(
    pack_id: str,
    images: Sequence[Path],
    *,
    parent_id: str = "",
    label: str = "",
) -> Path:
    ensure_user_draft(pack_id, parent_id=parent_id, label=label)
    patch, paths = extract_from_images(
        images, dest_exemplars_dir=user_pack_dir(pack_id) / "exemplars"
    )
    return merge_and_fill(
        pack_id,
        patch,
        adapter_paths=paths,
        adapters=["from-images"],
        notes=[f"images={len(list(images))}"],
    )


def from_pptx(
    pack_id: str,
    pptx_path: Path,
    *,
    parent_id: str = "",
    label: str = "",
) -> Path:
    ensure_user_draft(pack_id, parent_id=parent_id, label=label)
    patch, paths = extract_from_pptx(
        Path(pptx_path), dest_exemplars_dir=user_pack_dir(pack_id) / "exemplars"
    )
    return merge_and_fill(
        pack_id,
        patch,
        adapter_paths=paths,
        adapters=["from-pptx"],
        notes=[f"pptx={Path(pptx_path).name}"],
    )


def from_pdf(
    pack_id: str,
    pdf_path: Path,
    *,
    parent_id: str = "",
    label: str = "",
) -> Path:
    ensure_user_draft(pack_id, parent_id=parent_id, label=label)
    patch, paths = extract_from_pdf(
        Path(pdf_path), dest_exemplars_dir=user_pack_dir(pack_id) / "exemplars"
    )
    return merge_and_fill(
        pack_id,
        patch,
        adapter_paths=paths,
        adapters=["from-pdf"],
        notes=[f"pdf={Path(pdf_path).name}"],
    )


def _explicit_paths(fragment: Mapping[str, Any]) -> Set[str]:
    explicit: Set[str] = set()
    for key, value in fragment.items():
        if key == "id":
            continue
        explicit.add(str(key))
        if isinstance(value, Mapping):
            for sub in value:
                explicit.add(f"{key}.{sub}")
    return explicit


def merge_json(pack_id: str, fragment: Mapping[str, Any], *, parent_id: str = "") -> Path:
    ensure_user_draft(pack_id, parent_id=parent_id)
    return merge_and_fill(
        pack_id,
        {key: value for key, value in fragment.items() if key != "id"},
        explicit_paths=_explicit_paths(fragment),
        adapters=["merge-json"],
    )


def apply_patch(pack_id: str, patch: Mapping[str, Any]) -> Path:
    """User patch (explicit) on an existing draft."""
    if not pack_exists(pack_id):
        raise FileNotFoundError(f"user pack not found: {pack_id} (fork first)")
    return merge_and_fill(
        pack_id,
        {key: value for key, value in patch.items() if key != "id"},
        explicit_paths=_explicit_paths(patch),
        adapters=["patch"],
        notes=["user patch"],
    )


def publish_pack(pack_id: str) -> Path:
    if not pack_exists(pack_id):
        raise FileNotFoundError(f"user pack not found: {pack_id}")
    set_pack_status(pack_id, "published")
    return user_pack_dir(pack_id) / "pack.json"


def mark_preview_ok(pack_id: str) -> None:
    set_pack_status(pack_id, "preview_ok")
