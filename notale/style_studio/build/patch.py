"""Deep-merge patch JSON onto a user StylePack."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping

from notale.style_studio.build.models import MergeReport
from notale.style_studio.build.registry_user import user_pack_dir, write_pack_json
from notale.style_studio.build.report import write_build_report
from notale.style_studio.schema import deep_merge


def _walk_filled(report: MergeReport, prefix: str, obj: Any) -> None:
    if isinstance(obj, Mapping):
        for key, value in obj.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            if isinstance(value, Mapping):
                _walk_filled(report, path, value)
            else:
                report.mark(path, "filled", source="patch")
    elif isinstance(obj, list):
        report.mark(prefix or "list", "filled", source="patch")


def patch_pack(pack_id: str, patch: Mapping[str, Any], *, report_note: str = "") -> Path:
    """Apply a nested patch onto user/<pack_id>/pack.json. Cannot change the id."""
    path = user_pack_dir(pack_id) / "pack.json"
    if not path.is_file():
        raise FileNotFoundError(f"user pack not found: {pack_id} (fork first)")
    base = json.loads(path.read_text(encoding="utf-8"))
    clean = {key: value for key, value in patch.items() if key != "id"}
    merged = deep_merge(base, dict(clean))
    merged["id"] = pack_id

    report = MergeReport(
        pack_id=pack_id,
        parent_id=str((base.get("lineage") or {}).get("parent_preset_id") or ""),
        adapters=["patch"],
    )
    if report_note:
        report.notes.append(report_note)
    _walk_filled(report, "", clean)

    destination = write_pack_json(pack_id, merged)
    write_build_report(user_pack_dir(pack_id), report)
    return destination


def patch_from_file(pack_id: str, patch_path: Path) -> Path:
    data = json.loads(Path(patch_path).read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("patch file must be a JSON object")
    return patch_pack(pack_id, data, report_note=f"patch from {patch_path}")
