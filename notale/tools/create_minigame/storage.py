"""Standalone artifact storage for create_minigame — independent of managed_component.py.

Mini-games are not page-scoped managed components (no fixed iframe box, no Style-token
requirement, no shared manifest), so this module owns its own record type, its own manifest
file, and its own lock rather than reusing notale/tools/managed_component.py.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from notale.tools.create_minigame.models import MinigameMedium


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MinigameRecord(_StrictModel):
    minigame_id: str = Field(pattern=r"^m-[0-9a-f]{12}$")
    page: int | None = None
    title: str = Field(min_length=1)
    tag_name: str = Field(min_length=1)
    visual_medium: MinigameMedium
    local_dir: str = Field(pattern=r"^minigames/[A-Za-z0-9._-]+$")
    index_path: str
    component_path: str
    sha256_index: str = Field(pattern=r"^[0-9a-f]{64}$")
    sha256_component: str = Field(pattern=r"^[0-9a-f]{64}$")
    model_calls: int = Field(ge=1)
    repair_calls: int = Field(ge=0)
    provenance: str = Field(min_length=1)


class MinigameManifest(_StrictModel):
    version: int = 1
    minigames: list[MinigameRecord] = Field(default_factory=list)


_LOCK = threading.Lock()
_MINIGAME_ID = re.compile(r"^m-[0-9a-f]{12}$")


def make_minigame_id(seed: str) -> str:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:12]
    return f"m-{digest}"


def _atomic_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(value)
    temporary.replace(path)


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )
    temporary.replace(path)


def _manifest_path(run_dir: Path) -> Path:
    return Path(run_dir) / "minigames" / "manifest.json"


def ensure_minigame_manifest(run_dir: Path) -> Path:
    path = _manifest_path(run_dir)
    with _LOCK:
        if not path.exists():
            _atomic_json(path, MinigameManifest().model_dump(mode="json"))
    return path


def load_minigame_manifest(run_dir: Path, *, create: bool = False) -> MinigameManifest:
    path = ensure_minigame_manifest(run_dir) if create else _manifest_path(run_dir)
    if not path.is_file():
        raise ValueError("minigame manifest does not exist")
    try:
        return MinigameManifest.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError(f"minigame manifest is unreadable: {exc}") from exc


def page_minigames(run_dir: Path, page: int | None) -> list[MinigameRecord]:
    try:
        manifest = load_minigame_manifest(run_dir)
    except ValueError:
        return []
    if page is None:
        return []
    return [item for item in manifest.minigames if item.page == page]


def write_minigame(
    run_dir: Path,
    *,
    minigame_id: str,
    page: int | None,
    title: str,
    tag_name: str,
    visual_medium: MinigameMedium,
    index_html: str,
    game_component_js: str,
    model_calls: int,
    repair_calls: int,
    provenance: str,
) -> MinigameRecord:
    if _MINIGAME_ID.fullmatch(minigame_id) is None:
        raise ValueError(f"invalid minigame id: {minigame_id}")
    local_dir = f"minigames/{minigame_id}"
    index_path = f"{local_dir}/index.html"
    component_path = f"{local_dir}/game-component.js"
    index_bytes = index_html.encode("utf-8")
    component_bytes = game_component_js.encode("utf-8")
    _atomic_bytes(Path(run_dir) / index_path, index_bytes)
    _atomic_bytes(Path(run_dir) / component_path, component_bytes)
    record = MinigameRecord(
        minigame_id=minigame_id,
        page=page,
        title=title,
        tag_name=tag_name,
        visual_medium=visual_medium,
        local_dir=local_dir,
        index_path=index_path,
        component_path=component_path,
        sha256_index=hashlib.sha256(index_bytes).hexdigest(),
        sha256_component=hashlib.sha256(component_bytes).hexdigest(),
        model_calls=model_calls,
        repair_calls=repair_calls,
        provenance=provenance,
    )
    manifest_path = ensure_minigame_manifest(run_dir)
    with _LOCK:
        manifest = MinigameManifest.model_validate_json(
            manifest_path.read_text(encoding="utf-8")
        )
        manifest.minigames.append(record)
        _atomic_json(manifest_path, manifest.model_dump(mode="json"))
    return record
