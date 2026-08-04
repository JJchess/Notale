"""Compile page visual briefs into deterministic, asset-aware 12×12 artboards."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from .validation import validate_scene_composition

Rect = tuple[int, int, int, int]

_FAMILIES = {
    "full-bleed-hero",
    "text-over-image",
    "cutout-split",
    "annotated-specimen",
    "focal-object",
    "process-path",
    "before-after",
    "comparison",
    "experiment-setup",
    "proof-equation-stage",
    "data-evidence",
    "collage",
    "poster",
    "research-figure",
    "interactive-stage",
}
_STAGE_TYPES = {"sim", "runnable"}
_MEDIA_TYPES = {"media", "video"}
_DATA_TYPES = {"chart", "table", "stats"}
_VISUAL_TYPES = _MEDIA_TYPES | _DATA_TYPES | {"diagram", "graph", "flow", "timeline"}


def _text_length(value: Any) -> int:
    if isinstance(value, str):
        return len(value)
    if isinstance(value, list):
        return sum(_text_length(item) for item in value)
    if isinstance(value, dict):
        return sum(_text_length(item) for key, item in value.items() if key not in {"html", "source"})
    return 0


def _assets_by_id(assets: Any) -> dict[str, dict[str, Any]]:
    if isinstance(assets, dict):
        return {str(key): value for key, value in assets.items() if isinstance(value, dict)}
    if isinstance(assets, list):
        return {str(item.get("id")): item for item in assets if isinstance(item, dict) and item.get("id")}
    return {}


def _asset_for(block: dict[str, Any], assets: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return assets.get(str(block.get("assetId") or ""), {})


def _aspect(asset: dict[str, Any]) -> float:
    width, height = asset.get("width"), asset.get("height")
    if isinstance(width, (int, float)) and isinstance(height, (int, float)) and height > 0:
        return float(width) / float(height)
    return 1.0


def _focal_alignment(asset: dict[str, Any]) -> tuple[str, str]:
    focal_value = asset.get("focalPoint")
    focal: dict[str, Any] = focal_value if isinstance(focal_value, dict) else {}
    x, y = focal.get("x", 0.5), focal.get("y", 0.5)
    align = "start" if isinstance(y, (int, float)) and y < 0.35 else "end" if isinstance(y, (int, float)) and y > 0.65 else "center"
    justify = "start" if isinstance(x, (int, float)) and x < 0.35 else "end" if isinstance(x, (int, float)) and x > 0.65 else "center"
    return align, justify


def _area(
    block: dict[str, Any],
    rect: Rect,
    *,
    role: str = "main",
    z: int = 1,
    bleed: bool = False,
    clip: bool = False,
    align: str = "stretch",
    justify: str = "stretch",
) -> dict[str, Any]:
    return {
        "blockIds": [str(block["id"])],
        "col": [rect[0], rect[1]],
        "row": [rect[2], rect[3]],
        "z": z,
        "align": align,
        "justify": justify,
        "bleed": bleed,
        "clip": clip,
        "styleRole": role,
    }


def _title(rect: Rect, *, align: str = "start", justify: str = "start", width: float = 100) -> dict[str, Any]:
    return {"col": [rect[0], rect[1]], "row": [rect[2], rect[3]], "align": align, "justify": justify, "maxWidth": width, "z": 3}


def _rank_blocks(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def rank(block: dict[str, Any]) -> tuple[int, int]:
        block_type = str(block.get("type") or "")
        priority = 0 if block_type in _STAGE_TYPES else 1 if block_type in _VISUAL_TYPES else 2
        size = {"xl": 0, "l": 1, "m": 2, "s": 3}.get(str(block.get("size") or "m"), 2)
        return priority, size

    return sorted(blocks, key=rank)


def _remaining_stack(blocks: list[dict[str, Any]], rect: Rect, *, role: str = "aside") -> list[dict[str, Any]]:
    if not blocks:
        return []
    height = rect[3] - rect[2]
    areas: list[dict[str, Any]] = []
    for index, block in enumerate(blocks):
        start = rect[2] + round(height * index / len(blocks))
        end = rect[2] + round(height * (index + 1) / len(blocks))
        areas.append(_area(block, (rect[0], rect[1], start, max(start + 1, end)), role=role, clip=True))
    return areas


def _hero(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], _dense: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    media = next((block for block in blocks if block.get("type") in _MEDIA_TYPES), None)
    areas: list[dict[str, Any]] = []
    if media:
        align, justify = _focal_alignment(_asset_for(media, assets))
        areas.append(_area(media, (1, 13, 1, 13), role="feature", z=0, bleed=True, clip=True, align=align, justify=justify))
    rest = [block for block in blocks if block is not media]
    areas.extend(_remaining_stack(rest, (7, 13, 7, 13), role="aside"))
    return _title((1, 8, 2, 6), width=72), areas


def _text_over_image(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], dense: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    media = next((block for block in blocks if block.get("type") in _MEDIA_TYPES), None)
    if media is None:
        return _title((1, 8, 1, 4), width=76), _remaining_stack(
            blocks, (1, 13, 4, 13), role="feature"
        )
    align, justify = _focal_alignment(_asset_for(media, assets))
    title_left = justify != "start"
    title = _title((1, 7, 2, 5) if title_left else (7, 13, 2, 5), width=66)
    areas = [_area(media, (1, 13, 1, 13), role="feature", z=0, bleed=True, clip=True, align=align, justify=justify)]
    rest = [block for block in blocks if block is not media]
    side = (1, 7, 6, 12) if title_left else (7, 13, 6, 12)
    areas.extend(_remaining_stack(rest, side, role="aside"))
    return title, areas


def _cutout_split(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], dense: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    media = next((block for block in blocks if block.get("type") in _MEDIA_TYPES), None)
    if media is None:
        areas = [
            _area(
                block,
                (1, 7, 4, 11) if index == 0 else (7, 13, 5, 10),
                role="evidence" if index == 0 else "aside",
                clip=True,
                align="center",
                justify="center",
            )
            for index, block in enumerate(blocks[:2])
        ]
        areas.extend(_remaining_stack(blocks[2:], (8, 13, 9, 13), role="caption"))
        return _title((7, 13, 1, 4), width=92), areas
    asset = _asset_for(media, assets)
    split = 8 if _aspect(asset) >= 1.35 else 6
    if dense or sum(_text_length(block) for block in blocks if block is not media) > 520:
        split = min(split, 6)
    align, justify = _focal_alignment(asset)
    areas = [_area(media, (1, split, 3, 13), role="feature", clip=True, align=align, justify=justify)]
    areas.extend(_remaining_stack([block for block in blocks if block is not media], (split, 13, 4, 13), role="aside"))
    return _title((split, 13, 1, 4), width=94), areas


def _annotated(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], _dense: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    main = _rank_blocks(blocks)[0]
    areas = [_area(main, (4, 10, 4, 12), role="feature", clip=True)]
    rest = [block for block in blocks if block is not main]
    for index, block in enumerate(rest):
        side = (1, 4) if index % 2 == 0 else (10, 13)
        tier = index // 2
        rect = (side[0], side[1], 4 + tier * 4, min(12, 8 + tier * 4))
        areas.append(_area(block, rect, role="caption", z=2, clip=True))
    return _title((1, 10, 1, 4), width=88), areas


def _focal(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], _dense: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    main = _rank_blocks(blocks)[0]
    areas = [_area(main, (4, 11, 4, 12), role="feature", clip=True)]
    areas.extend(_remaining_stack([block for block in blocks if block is not main], (1, 4, 5, 12), role="aside"))
    return _title((2, 12, 1, 4), align="center", justify="center", width=80), areas


def _process(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], _dense: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    areas: list[dict[str, Any]] = []
    for index, block in enumerate(blocks):
        start = 1 + round(12 * index / len(blocks))
        end = 1 + round(12 * (index + 1) / len(blocks))
        row_shift = index % 2
        areas.append(_area(block, (start, max(start + 1, end), 4 + row_shift, 11 + row_shift), role="evidence", clip=True))
    return _title((1, 9, 1, 4), width=82), areas


def _paired(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], _dense: bool, *, stagger: bool = False) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    areas: list[dict[str, Any]] = []
    for index, block in enumerate(blocks[:2]):
        c1, c2 = (1, 7) if index == 0 else (7, 13)
        r1, r2 = ((4, 11) if index == 0 or not stagger else (5, 12))
        areas.append(_area(block, (c1, c2, r1, r2), role="evidence", clip=True))
    areas.extend(_remaining_stack(blocks[2:], (3, 11, 11, 13), role="caption"))
    return _title((2, 12, 1, 4), align="center", justify="center", width=86), areas


def _experiment(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], _dense: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    ranked = _rank_blocks(blocks)
    areas = [_area(ranked[0], (1, 9, 4, 12), role="feature", clip=True)]
    areas.extend(_remaining_stack(ranked[1:], (9, 13, 4, 12), role="aside"))
    return _title((1, 9, 1, 4), width=84), areas


def _proof(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], _dense: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    formula = next((block for block in blocks if block.get("type") == "formula"), _rank_blocks(blocks)[0])
    areas = [_area(formula, (2, 13, 4, 10), role="feature", clip=True)]
    areas.extend(_remaining_stack([block for block in blocks if block is not formula], (6, 13, 10, 13), role="caption"))
    return _title((1, 8, 1, 4), width=78), areas


def _data(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], _dense: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    datum = next((block for block in blocks if block.get("type") in _DATA_TYPES), _rank_blocks(blocks)[0])
    areas = [_area(datum, (1, 10, 4, 12), role="evidence", clip=True)]
    areas.extend(_remaining_stack([block for block in blocks if block is not datum], (10, 13, 4, 12), role="aside"))
    return _title((1, 9, 1, 4), width=84), areas


def _collage(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], _dense: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rects: list[Rect] = [(1, 7, 4, 9), (7, 13, 3, 8), (2, 8, 9, 13), (8, 13, 8, 13)]
    areas = [_area(block, rects[index % len(rects)], role="feature" if index < 2 else "caption", clip=True) for index, block in enumerate(blocks)]
    return _title((1, 7, 1, 4), width=72), areas


def _poster(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], _dense: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    media = next((block for block in blocks if block.get("type") in _MEDIA_TYPES), None)
    areas: list[dict[str, Any]] = []
    if media:
        align, justify = _focal_alignment(_asset_for(media, assets))
        areas.append(_area(media, (5, 13, 1, 13), role="feature", z=0, bleed=True, clip=True, align=align, justify=justify))
    areas.extend(_remaining_stack([block for block in blocks if block is not media], (1, 6, 8, 13), role="aside"))
    return _title((1, 8, 2, 8), width=58), areas


def _research(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], _dense: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    ranked = _rank_blocks(blocks)
    areas = [_area(ranked[0], (1, 9, 4, 11), role="evidence", clip=True)]
    areas.extend(_remaining_stack(ranked[1:], (9, 13, 3, 11), role="aside"))
    return _title((1, 8, 1, 4), width=76), areas


def _interactive(blocks: list[dict[str, Any]], assets: dict[str, dict[str, Any]], _dense: bool) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    stage = next((block for block in blocks if block.get("type") in _STAGE_TYPES), _rank_blocks(blocks)[0])
    areas = [_area(stage, (1, 10, 4, 13), role="feature", clip=True)]
    areas.extend(_remaining_stack([block for block in blocks if block is not stage], (10, 13, 4, 13), role="aside"))
    return _title((1, 9, 1, 4), width=88), areas


_BUILDERS: dict[str, Callable[[list[dict[str, Any]], dict[str, dict[str, Any]], bool], tuple[dict[str, Any], list[dict[str, Any]]]]] = {
    "full-bleed-hero": _hero,
    "text-over-image": _text_over_image,
    "cutout-split": _cutout_split,
    "annotated-specimen": _annotated,
    "focal-object": _focal,
    "process-path": _process,
    "before-after": lambda b, a, d: (
        _title((1, 7, 1, 4), width=70),
        [
            _area(block, (1, 7, 3, 10) if index == 0 else (7, 13, 5, 12), role="evidence", clip=True)
            for index, block in enumerate(b[:2])
        ]
        + _remaining_stack(b[2:], (3, 11, 10, 13), role="caption"),
    ),
    "comparison": _paired,
    "experiment-setup": _experiment,
    "proof-equation-stage": _proof,
    "data-evidence": _data,
    "collage": _collage,
    "poster": _poster,
    "research-figure": _research,
    "interactive-stage": _interactive,
}


def _safe_family_layout(family: str, blocks: list[dict[str, Any]]) -> dict[str, Any]:
    """Keep the selected family's spatial axis while removing overlap and fragile ornament."""
    stage = next((block for block in blocks if block.get("type") in _STAGE_TYPES), None)
    if stage:
        title = _title((1, 9, 1, 4), width=86)
        areas = [_area(stage, (1, 10, 4, 13), role="feature", clip=True)]
        areas.extend(_remaining_stack([block for block in blocks if block is not stage], (10, 13, 4, 13)))
    elif family in {"comparison", "before-after", "process-path"}:
        title, areas = _paired(blocks, {}, False, stagger=family == "before-after")
    elif family in {"full-bleed-hero", "poster", "text-over-image"}:
        title = _title((1, 8, 1, 4), width=76)
        areas = _remaining_stack(blocks, (1, 13, 4, 13), role="feature")
    else:
        title = _title((1, 9, 1, 4), width=84)
        main = _rank_blocks(blocks)[0]
        areas = [_area(main, (1, 9, 4, 13), role="feature", clip=True)]
        areas.extend(_remaining_stack([block for block in blocks if block is not main], (9, 13, 4, 13)))
    return {
        "kind": "artboard",
        "columns": 12,
        "rows": 12,
        "gap": 16,
        "titleRegion": title,
        "areas": areas,
    }


def compile_scene_composition(
    scene: dict[str, Any],
    visual_brief: dict[str, Any] | None = None,
    design_brief: dict[str, Any] | None = None,
    assets: list[dict[str, Any]] | dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Compile a page into an asset-aware artboard and deterministically repair unsafe layouts."""
    blocks_value = scene.get("blocks")
    blocks = [block for block in blocks_value if isinstance(block, dict)] if isinstance(blocks_value, list) else []
    if not blocks:
        raise ValueError("scene must contain at least one block")
    ids = [str(block.get("id") or "") for block in blocks]
    if any(not block_id for block_id in ids) or len(set(ids)) != len(ids):
        raise ValueError("every scene block requires a unique id before composition")

    brief = visual_brief if isinstance(visual_brief, dict) else {}
    family = str(brief.get("compositionFamily") or scene.get("compositionFamily") or "annotated-specimen")
    family = family if family in _FAMILIES else "annotated-specimen"
    design = design_brief if isinstance(design_brief, dict) else {}
    dense = str(design.get("density") or "medium") == "dense" or _text_length(scene) > 1100
    # background media 已在 lowering 阶段移到 scene.background，不再是 block。
    # 这类页不得把第一个文字 block 误当全幅图片层。
    has_background = isinstance(scene.get("background"), dict)
    has_media_block = any(block.get("type") in _MEDIA_TYPES for block in blocks)
    if has_background and not has_media_block and family in {
        "full-bleed-hero", "text-over-image", "poster"
    }:
        title = _title((1, 8, 2, 6), width=68)
        areas = _remaining_stack(blocks, (1, 7, 7, 13), role="aside")
    else:
        title, areas = _BUILDERS[family](blocks, _assets_by_id(assets), dense)
    layout = {
        "kind": "artboard",
        "columns": 12,
        "rows": 12,
        "gap": 12 if dense else 16,
        "titleRegion": title,
        "areas": areas,
    }
    if validate_scene_composition(scene, layout):
        layout = _safe_family_layout(family, blocks)
    remaining = validate_scene_composition(scene, layout)
    if remaining:
        details = "; ".join(issue.message for issue in remaining)
        raise ValueError(f"unable to compile a safe {family} artboard: {details}")
    return layout


def composition_signature(layout: dict[str, Any]) -> str:
    """Stable spatial signature useful for diversity checks and diagnostics."""
    payload = {
        "title": layout.get("titleRegion"),
        "areas": [
            {key: area.get(key) for key in ("col", "row", "z", "bleed", "styleRole")}
            for area in layout.get("areas") or []
        ],
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)
