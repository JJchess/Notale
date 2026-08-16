"""StylePack registry: list / resolve alias / load packs.

Two registries are merged: the packaged preset registry and a writable user
registry. A user pack shadows a preset with the same id, so a fork can iterate
on a preset's name without editing anything that ships with the package.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from notale.style_studio.models import StylePack
from notale.style_studio.paths import (
    registry_path,
    style_packs_root,
    user_packs_root,
    user_registry_path,
)
from notale.style_studio.schema import assert_valid, validate_pack_dict

DEFAULT_PACK_ID = "notale-default"

# Cached per resolved (preset, user) root pair so redirecting the user root -
# which tests do constantly - cannot serve a stale registry.
_CACHE: Dict[Tuple[str, str], Dict[str, Any]] = {}


def _cache_key() -> Tuple[str, str]:
    return (str(registry_path()), str(user_registry_path()))


def _read(path: Path) -> Dict[str, Any]:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _load_registry() -> Dict[str, Any]:
    key = _cache_key()
    cached = _CACHE.get(key)
    if cached is not None:
        return cached

    presets = _read(registry_path())
    users = _read(user_registry_path())

    merged: Dict[str, Dict[str, Any]] = {}
    for entry in presets.get("packs") or []:
        entry = dict(entry)
        entry["root"] = "preset"
        merged[str(entry.get("id") or "")] = entry
    for entry in users.get("packs") or []:
        entry = dict(entry)
        entry["root"] = "user"
        merged[str(entry.get("id") or "")] = entry

    registry = {
        "default_pack_id": str(presets.get("default_pack_id") or DEFAULT_PACK_ID),
        "packs": [entry for entry in merged.values() if entry.get("id")],
    }
    _CACHE[key] = registry
    return registry


def reload_registry() -> None:
    _CACHE.clear()


def list_packs(*, include_draft: bool = False) -> List[Dict[str, Any]]:
    """Return registry entries (id, path, status, aliases, root)."""
    out: List[Dict[str, Any]] = []
    for entry in _load_registry().get("packs") or []:
        status = str(entry.get("status") or "")
        if not include_draft and status in {"draft", "deprecated"}:
            continue
        out.append(
            {
                "id": str(entry.get("id") or ""),
                "path": str(entry.get("path") or ""),
                "status": status,
                "aliases": list(entry.get("aliases") or []),
                "root": str(entry.get("root") or "preset"),
            }
        )
    return out


def resolve_alias(name: str) -> str:
    """Map a pack id or alias onto the canonical pack id."""
    key = str(name or "").strip()
    registry = _load_registry()
    if not key:
        return str(registry.get("default_pack_id") or DEFAULT_PACK_ID)
    for entry in registry.get("packs") or []:
        pack_id = str(entry.get("id") or "")
        if key == pack_id or key in [str(a) for a in (entry.get("aliases") or [])]:
            return pack_id
    # Unknown: return as-is so get_pack fails with a clear message.
    return key


def _entry_for_id(pack_id: str) -> Optional[Dict[str, Any]]:
    for entry in _load_registry().get("packs") or []:
        if str(entry.get("id") or "") == pack_id:
            return dict(entry)
    return None


def pack_json_path(pack_id: str) -> Path:
    canonical = resolve_alias(pack_id)
    entry = _entry_for_id(canonical)
    if not entry:
        raise KeyError(f"unknown StylePack id or alias: {pack_id!r}")
    root = user_packs_root() if entry.get("root") == "user" else style_packs_root()
    path = root / str(entry.get("path") or "")
    if not path.is_file():
        raise FileNotFoundError(f"StylePack file missing: {path}")
    return path


def get_pack(pack_id: str, *, validate: bool = True) -> StylePack:
    path = pack_json_path(pack_id)
    data = json.loads(path.read_text(encoding="utf-8"))
    pack_dir = path.parent
    if validate:
        assert_valid(data, pack_dir=pack_dir)
    canonical = resolve_alias(pack_id)
    if str(data.get("id") or "") != canonical:
        raise ValueError(
            f"pack.json id {data.get('id')!r} does not match registry id {canonical!r}"
        )
    return StylePack(data=data, pack_dir=pack_dir)


def pack_exists(pack_id: str) -> bool:
    try:
        pack_json_path(pack_id)
    except (KeyError, FileNotFoundError):
        return False
    return True


def validate_all_packs() -> List[Tuple[str, List[str]]]:
    """Validate every registry pack. Returns [(id, errors)]."""
    results: List[Tuple[str, List[str]]] = []
    for entry in list_packs(include_draft=True):
        pack_id = entry["id"]
        try:
            root = user_packs_root() if entry["root"] == "user" else style_packs_root()
            path = root / entry["path"]
            data = json.loads(path.read_text(encoding="utf-8"))
            errors = validate_pack_dict(data, pack_dir=path.parent)
            if str(data.get("id") or "") != pack_id:
                errors.append(f"pack.json id {data.get('id')!r} != registry id {pack_id!r}")
        except Exception as exc:  # noqa: BLE001 — collect for the CLI report
            errors = [f"{type(exc).__name__}: {exc}"]
        results.append((pack_id, errors))
    return results
