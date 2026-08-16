"""Materialize a StylePack into a run.

deckbase copies role exemplars onto a deck and writes ``style_pack_ref.json``.
notale does the same, and additionally produces the ``GeneratedDesignSkill``
that Planner, Builders, inspection, and widget generation already consume — so
introducing packs changes where a style comes from without changing the contract
anything downstream reads.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Dict, List, Union

from notale.style_studio.backplate import CHANNEL_FILENAME, ImageChannel
from notale.style_studio.compile_style import compile_style
from notale.style_studio.decoration import materialize_decorations
from notale.style_studio.models import StylePack
from notale.style_studio.registry import get_pack
from notale.utils.skill_catalog import GeneratedDesignSkill, create_generated_style, write_generated_style

_ROLES = ("cover", "section", "content", "closing")


def build_design_skill(pack: Union[StylePack, str]) -> GeneratedDesignSkill:
    """Compile a pack into the run-local design Skill, without writing anything."""
    if isinstance(pack, str):
        pack = get_pack(pack)
    bundle = compile_style(pack)
    return create_generated_style(
        name=bundle.name,
        description=bundle.description,
        body=bundle.body,
        tokens=dict(bundle.tokens),
        compositions=list(bundle.compositions),
        type_scale=bundle.type_scale,
    )


def write_image_channel(pack: StylePack, run_dir: Path) -> Path:
    """Project the pack for an image model, into the run.

    Kept inside the run on purpose: a Builder tool that needs the style channel
    then never has to reach back into the mutable pack registry, so resume stays
    safe and the tool has no dependency on global state.
    """
    bundle = compile_style(pack)
    channel = ImageChannel(
        pack_id=pack.id,
        style_prose=bundle.description,
        style_anchor=str(bundle.meta.get("style_anchor") or ""),
        chrome_dialect=str(pack.chrome_rules().get("dialect") or ""),
        radius_scale=pack.radius_scale(),
        density_default=pack.density_default,
        palette=dict(bundle.tokens),
        forbidden=list(bundle.forbidden),
    )
    destination = Path(run_dir) / "style_refs"
    destination.mkdir(parents=True, exist_ok=True)
    path = destination / CHANNEL_FILENAME
    path.write_text(
        json.dumps(channel.to_dict(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return path


def copy_exemplars(pack: StylePack, run_dir: Path) -> Dict[str, List[str]]:
    """Copy the pack's exemplars into ``run_dir/style_refs``."""
    destination = Path(run_dir) / "style_refs"
    destination.mkdir(parents=True, exist_ok=True)
    copied: Dict[str, List[str]] = {}
    seen: set[str] = set()
    for role in _ROLES:
        names: List[str] = []
        for source in pack.role_exemplar_paths(role):
            if source.name not in seen:
                shutil.copy2(source, destination / source.name)
                seen.add(source.name)
            names.append(source.name)
        copied[role] = names
    return copied


def materialize_to_run(
    pack: Union[StylePack, str],
    run_dir: Path,
    *,
    skills_dirname: str = "skills",
) -> GeneratedDesignSkill:
    """Write the design Skill and exemplars into a run directory.

    Returns the ``GeneratedDesignSkill`` whose ``.reference`` the run state
    records, exactly as the previous generate-only path did.
    """
    if isinstance(pack, str):
        pack = get_pack(pack)
    run_dir = Path(run_dir)
    if not run_dir.is_dir():
        raise FileNotFoundError(f"run_dir not found: {run_dir}")

    style = build_design_skill(pack)
    write_generated_style(run_dir / skills_dirname, style)
    copied = copy_exemplars(pack, run_dir)
    write_image_channel(pack, run_dir)
    decorations = materialize_decorations(pack, run_dir)

    (run_dir / "style_pack_ref.json").write_text(
        json.dumps(
            {
                "style_pack_id": pack.id,
                "version": pack.version,
                "status": pack.status,
                "provenance": pack.provenance,
                "parent_preset_id": pack.parent_id,
                "density_default": pack.density_default,
                "design_skill": {"name": style.name, "sha256": style.sha256},
                "materialized_roles": copied,
                "decorations": {
                    "mode": decorations.mode,
                    "assets": len(decorations.assets),
                    "channel": "style_refs/decorations.json",
                },
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return style
