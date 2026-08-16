"""Filesystem roots for style_studio (no circular imports).

deckbase keeps presets and user packs under one mutable registry inside the
repo. notale splits them: presets ship with the package and are read-only, while
user packs — including the draft every generated run produces — live under a
root that ``NOTALE_STYLE_PACKS_USER_ROOT`` can redirect. Without that split every
run would rewrite a tracked file, and tests would leak packs into each other.
"""

from __future__ import annotations

import os
from pathlib import Path

USER_ROOT_ENV = "NOTALE_STYLE_PACKS_USER_ROOT"


def notale_root() -> Path:
    return Path(__file__).resolve().parent.parent


def style_packs_root() -> Path:
    """Packaged presets, schema, and the preset registry."""
    return notale_root() / "styles" / "packs"


def registry_path() -> Path:
    return style_packs_root() / "registry.json"


def schema_path() -> Path:
    return style_packs_root() / "schema" / "style_pack.schema.json"


def preset_packs_root() -> Path:
    return style_packs_root() / "presets"


def user_packs_root() -> Path:
    """Writable root for user and run-generated packs."""
    override = os.environ.get(USER_ROOT_ENV, "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return style_packs_root() / "user"


def user_registry_path() -> Path:
    return user_packs_root() / "registry.json"


def style_build_gallery_root() -> Path:
    return user_packs_root() / "_build"
