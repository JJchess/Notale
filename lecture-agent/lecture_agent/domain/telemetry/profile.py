"""能力画像：走一遍 doc 数出「哪些能力被用了几次」（纯函数，零 I/O）。

热力图的心脏——记录 hook 与历史回填脚本都调这一个函数，保证口径一致。
只存计数，不存整份 deck；变体级键格式为 `"<block-type>:<discriminant>"`
（呼应 sim.engine / chart.chartType / diagram.diagramType 等"一个 BlockType + 判别子字段"模式）。
"""

from __future__ import annotations

from typing import Any

from ...schema import CapabilityProfile

# 每种 block type 若带判别子字段，对应的字段名（有则拼进 variants 键）。
_VARIANT_FIELD: dict[str, str] = {
    "chart": "chartType",
    "diagram": "diagramType",
    "sim": "engine",
    "quiz": "kind",
    "code": "language",
    "embed": "product",
}


def _variant_key(block: dict[str, Any]) -> str | None:
    btype = block.get("type")
    field = _VARIANT_FIELD.get(str(btype))
    if not field:
        return None
    value = block.get(field)
    if not value:
        return None
    return f"{btype}:{value}"


def _count(d: dict[str, int], key: str) -> None:
    d[key] = d.get(key, 0) + 1


def _count_fragment(profile: CapabilityProfile, fragment: Any) -> None:
    """block 自身或 list item / agenda row 都能带 fragment（AUTHORING_RULES 里两种都教了模型），
    两者都算一次"确实用了动效"，热力图不区分粒度。"""
    if not fragment:
        return
    profile.fragment_blocks += 1
    if isinstance(fragment, str):
        _count(profile.fragment_names, fragment)


def profile_deck(doc: dict[str, Any]) -> CapabilityProfile:
    """遍历 `doc["scenes"][].blocks[]`，产出一份能力画像。容忍缺字段（`.get`/`or []` 兜底）。"""
    profile = CapabilityProfile(theme=doc.get("theme"))
    scenes = doc.get("scenes") or []
    profile.pages = len(scenes)

    for scene in scenes:
        _count(profile.scene_kinds, str(scene.get("kind", "")))
        if scene.get("transition"):
            profile.transition_scenes += 1
        if scene.get("autoAnimate"):
            profile.autoanimate_scenes += 1
        layout = scene.get("layout") or {}
        layout_kind = layout.get("kind") or "flow"  # flow 是隐式默认（从不被显式指派）
        _count(profile.layouts, str(layout_kind))

        for block in scene.get("blocks") or []:
            _profile_block(profile, block)

    return profile


def _profile_block(profile: CapabilityProfile, block: dict[str, Any]) -> None:
    profile.blocks_total += 1
    btype = str(block.get("type", ""))
    _count(profile.block_types, btype)

    variant = _variant_key(block)
    if variant:
        _count(profile.variants, variant)
    if btype == "runnable":
        env_kind = (block.get("env") or {}).get("kind")
        if env_kind:
            _count(profile.variants, f"runnable:{env_kind}")

    _count_fragment(profile, block.get("fragment"))

    if btype == "hero" and block.get("image"):
        profile.hero_image += 1
    if btype == "list":
        for item in block.get("items") or []:
            if item.get("icon"):
                profile.list_icons += 1
            _count_fragment(profile, item.get("fragment"))
    if btype == "agenda":
        for row in block.get("rows") or []:
            _count_fragment(profile, row.get("fragment"))
    if btype == "video":
        profile.video_blocks += 1

    # 容器块（compare/grid）递归到内层 block，让内嵌的 chart/sim/... 也计入画像。
    if btype == "compare":
        for side_key in ("left", "right"):
            side = block.get(side_key) or {}
            inner = side.get("block")
            if isinstance(inner, dict):
                _profile_block(profile, inner)
    if btype == "grid":
        for item in block.get("items") or []:
            inner = item.get("block")
            if isinstance(inner, dict):
                _profile_block(profile, inner)
