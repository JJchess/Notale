"""Fork an existing StylePack into styles/packs/user/<id>/."""

from __future__ import annotations

import copy
import json
import shutil
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from notale.style_studio.build.models import MergeReport
from notale.style_studio.build.registry_user import user_pack_dir, write_pack_json
from notale.style_studio.build.report import write_build_report
from notale.style_studio.exemplars import SPECIMEN_PREFIX
from notale.style_studio.registry import get_pack

_INHERITED_PATHS = (
    "identity",
    "skill_body",
    "compositions",
    "chrome_rules",
    "role_exemplars",
    "density_default",
    "prompt_compile",
    "hard_negatives",
    "layout_policy",
    "mascot_policy",
    "info_form_bias",
    "audience_hint",
)


def fork_pack(
    parent_id: str,
    new_id: str,
    *,
    label: Optional[str] = None,
    status: str = "draft",
) -> Path:
    """Deep-copy a parent pack and its exemplars into user/<new_id>/ as a draft."""
    parent = get_pack(parent_id)
    data: Dict[str, Any] = copy.deepcopy(dict(parent.data))
    data["id"] = new_id
    data["label"] = label or f"{parent.label} (fork)"
    data["status"] = status
    data["provenance"] = "hybrid"
    lineage = dict(data.get("lineage") or {})
    lineage["parent_preset_id"] = parent.id
    data["lineage"] = lineage

    report = MergeReport(pack_id=new_id, parent_id=parent.id, adapters=["fork"])
    report.notes.append(f"forked from {parent.id}@{parent.version}")
    for path in _INHERITED_PATHS:
        report.mark(path, "inferred", source="parent", note=f"copied from {parent.id}")

    # Authored reference images describe an intent and are worth inheriting.
    # Rendered specimens are only true of the palette that produced them, so a
    # fork that repalettes would otherwise carry a baseline contradicting its own
    # tokens — worse than having none. Those are dropped and must be re-rendered.
    data["role_exemplars"] = {
        role: [
            rel
            for rel in (data.get("role_exemplars") or {}).get(role, [])
            if SPECIMEN_PREFIX not in str(rel)
        ]
        for role in ("cover", "section", "content", "closing")
    }
    if any(data["role_exemplars"].values()) is False:
        report.notes.append("parent specimens dropped; re-render exemplars for this pack")

    exemplars = parent.pack_dir / "exemplars"
    destination_root = user_pack_dir(new_id)
    destination_root.mkdir(parents=True, exist_ok=True)
    parent_root = parent.pack_dir.resolve()
    for item in parent.mascot_policy().get("assets") or []:
        if isinstance(item, str):
            relative = item
        elif isinstance(item, Mapping):
            relative = str(item.get("path") or "")
        else:
            continue
        if not relative:
            continue
        source = (parent_root / relative).resolve()
        try:
            source.relative_to(parent_root)
        except ValueError as exc:
            raise ValueError(f"mascot asset escapes parent pack: {relative}") from exc
        target = (destination_root / relative).resolve()
        try:
            target.relative_to(destination_root.resolve())
        except ValueError as exc:
            raise ValueError(f"mascot asset escapes child pack: {relative}") from exc
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    destination = write_pack_json(
        new_id,
        data,
        exemplars_from=exemplars if exemplars.is_dir() else None,
    )
    # The tree copy brings the parent's specimen files along; remove the ones
    # this pack no longer claims so validation and disk agree.
    for stale in (user_pack_dir(new_id) / "exemplars").glob(f"{SPECIMEN_PREFIX}*"):
        stale.unlink()
    write_build_report(user_pack_dir(new_id), report)
    (user_pack_dir(new_id) / "BUILD_BRIEF.json").write_text(
        json.dumps(
            {"pack_id": new_id, "parent_id": parent.id, "provenance": "hybrid"},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return destination
