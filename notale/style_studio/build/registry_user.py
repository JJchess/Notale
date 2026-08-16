"""Register / list user StylePacks under styles/packs/user/."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

from notale.style_studio.paths import user_packs_root, user_registry_path
from notale.style_studio.registry import reload_registry
from notale.style_studio.schema import assert_valid


def user_pack_dir(pack_id: str) -> Path:
    return user_packs_root() / pack_id


def _read_user_registry() -> Dict[str, Any]:
    path = user_registry_path()
    if not path.is_file():
        return {"_note": "User StylePacks. Presets ship with the package.", "packs": []}
    return json.loads(path.read_text(encoding="utf-8"))


def _write_user_registry(registry: Dict[str, Any]) -> None:
    path = user_registry_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    reload_registry()


def write_pack_json(
    pack_id: str,
    data: Dict[str, Any],
    *,
    exemplars_from: Optional[Path] = None,
    check_contrast: bool = True,
) -> Path:
    """Write pack.json (+ optional exemplar tree) and upsert the registry entry."""
    if str(data.get("id") or "") != pack_id:
        data = dict(data)
        data["id"] = pack_id
    destination = user_pack_dir(pack_id)
    destination.mkdir(parents=True, exist_ok=True)
    if exemplars_from and exemplars_from.is_dir():
        exemplar_destination = destination / "exemplars"
        if exemplars_from.resolve() != exemplar_destination.resolve():
            if exemplar_destination.exists():
                shutil.rmtree(exemplar_destination)
            shutil.copytree(exemplars_from, exemplar_destination)
    assert_valid(data, pack_dir=destination, check_contrast=check_contrast)
    path = destination / "pack.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    upsert_registry_entry(pack_id, status=str(data.get("status") or "draft"))
    reload_registry()
    return path


def upsert_registry_entry(
    pack_id: str,
    *,
    status: str = "draft",
    aliases: Optional[List[str]] = None,
) -> None:
    registry = _read_user_registry()
    packs: List[Dict[str, Any]] = list(registry.get("packs") or [])
    relative = f"{pack_id}/pack.json"
    for entry in packs:
        if str(entry.get("id") or "") == pack_id:
            entry["path"] = relative
            entry["status"] = status
            if aliases is not None:
                entry["aliases"] = list(aliases)
            break
    else:
        packs.append(
            {
                "id": pack_id,
                "path": relative,
                "status": status,
                "aliases": list(aliases or []),
            }
        )
    registry["packs"] = packs
    _write_user_registry(registry)


def set_pack_status(pack_id: str, status: str) -> None:
    path = user_pack_dir(pack_id) / "pack.json"
    if not path.is_file():
        raise FileNotFoundError(f"user pack not found: {pack_id}")
    data = json.loads(path.read_text(encoding="utf-8"))
    data["status"] = status
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    upsert_registry_entry(pack_id, status=status)
    reload_registry()


def remove_user_pack(pack_id: str) -> None:
    """Drop a user pack directory and its registry entry."""
    directory = user_pack_dir(pack_id)
    if directory.is_dir():
        shutil.rmtree(directory)
    registry = _read_user_registry()
    registry["packs"] = [
        entry
        for entry in (registry.get("packs") or [])
        if str(entry.get("id") or "") != pack_id
    ]
    _write_user_registry(registry)


def list_user_pack_ids() -> List[str]:
    root = user_packs_root()
    if not root.is_dir():
        return []
    return [
        path.name
        for path in sorted(root.iterdir())
        if path.is_dir() and (path / "pack.json").is_file()
    ]
