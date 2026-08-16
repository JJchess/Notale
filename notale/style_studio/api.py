"""Public facade for StylePack consumers.

Ported from deckbase's `style_studio/api.py`, whose docstring states the rule
this file exists to enforce: keep the surface small and stable, and prefer these
entry points over reaching into submodules or pack.json field layouts.

Anything outside `style_studio` should import from here.
"""

from __future__ import annotations

from typing import Union

from notale.style_studio.backplate import ImageChannel, SafeArea, backplate_prompt
from notale.style_studio.bench import run_bench, run_bench_sync
from notale.style_studio.compile_style import compile_style, effective_hard_negatives
from notale.style_studio.defaults import default_style_pack_id
from notale.style_studio.decoration import (
    DecorationAsset,
    DecorationChannel,
    materialize_decorations,
    page_role_for,
    render_page_decorations,
    select_for_page,
)
from notale.style_studio.materialize import (
    build_design_skill,
    materialize_to_run,
    write_image_channel,
)
from notale.style_studio.models import StyleBundle, StylePack
from notale.style_studio.paths import style_packs_root, user_packs_root
from notale.style_studio.preview import check_pack
from notale.style_studio.registry import (
    get_pack,
    list_packs,
    pack_exists,
    reload_registry,
    resolve_alias,
    validate_all_packs,
)
from notale.style_studio.scrub import ScrubResult, scrub_topic_for_content

__all__ = [
    "ImageChannel",
    "DecorationAsset",
    "DecorationChannel",
    "SafeArea",
    "ScrubResult",
    "StyleBundle",
    "StylePack",
    "backplate_prompt",
    "build_design_skill",
    "check_pack",
    "compile_page_style",
    "compile_style",
    "default_style_pack_id",
    "effective_hard_negatives",
    "get_pack",
    "list_packs",
    "materialize_to_run",
    "materialize_decorations",
    "page_role_for",
    "pack_exists",
    "reload_registry",
    "resolve_alias",
    "render_page_decorations",
    "run_bench",
    "run_bench_sync",
    "scrub_topic_for_content",
    "select_for_page",
    "style_packs_root",
    "user_packs_root",
    "validate_all_packs",
    "write_image_channel",
]


def compile_page_style(
    pack: Union[str, StylePack], page_role: str = "content"
) -> StyleBundle:
    """Convenience wrapper mirroring deckbase's entry point of the same name."""
    return compile_style(pack, page_role=page_role)
