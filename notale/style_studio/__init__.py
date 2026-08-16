"""StylePack management for notale.

Ported from deckbase ``style_studio``: versioned style assets, a registry with
aliases, fork/patch lineage, priority-based default fill with per-field
confidence, and a draft -> preview_ok -> published lifecycle.

deckbase compiles a pack into image-generation prompts; notale compiles it into
executable CSS tokens plus a Builder-facing design Skill. The pack field table
is kept 1:1 with deckbase so packs move between the two systems without loss.
``mascot_policy`` is materialized into deterministic HTML decorations;
``or_hints`` and ``prompt_compile.style_anchor`` remain interchange metadata.
"""

from __future__ import annotations
