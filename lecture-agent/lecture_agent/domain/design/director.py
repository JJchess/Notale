"""Browser-informed deterministic full-page layout and pagination.

The director owns final geometry.  Language-model output may choose a composition family and
content priority, but it never decides pixels, clipping, shrinking, or whether a page must split.
"""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass
from typing import Any

_STAGE_TYPES = {"sim", "runnable"}
_PRIMARY_TYPES = _STAGE_TYPES | {"chart", "diagram", "graph", "flow", "timeline", "media", "video", "table", "formula"}


@dataclass(frozen=True)
class LayoutDecision:
    scene_id: str
    candidate: str
    score: float
    reason: str
    decision_signature: str
    feasible: bool = True
    required_height: float = 0.0
    available_height: float = 0.0


def layout_signature(layout: dict[str, Any] | None) -> str:
    """Stable geometry-only signature used to prove the Director still owns final layout."""
    payload = json.dumps(layout or {}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def frame_layout_signature(layout: dict[str, Any] | None) -> str:
    """Stable signature of planner-owned absolute geometry (diagnostic fields excluded)."""
    raw = layout if isinstance(layout, dict) else {}
    payload = {
        "kind": raw.get("kind"),
        "canvas": raw.get("canvas"),
        "titleFrame": raw.get("titleFrame"),
        "frames": sorted(
            [
                {key: frame.get(key) for key in ("blockId", "x", "y", "w", "h", "z", "role", "clip")}
                for frame in (raw.get("frames") or []) if isinstance(frame, dict)
            ],
            key=lambda item: str(item.get("blockId") or ""),
        ),
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:16]


def _title(rows: int = 3) -> dict[str, Any]:
    return {
        "col": [1, 13], "row": [1, rows + 1], "z": 5,
        "align": "start", "justify": "start", "maxWidth": 94,
    }


def _area(block: dict[str, Any], col: tuple[int, int], row: tuple[int, int], role: str) -> dict[str, Any]:
    block_type = str(block.get("type") or "")
    return {
        "blockIds": [str(block["id"])],
        "col": list(col), "row": list(row), "z": 1,
        "align": "stretch", "justify": "stretch",
        "bleed": False,
        "clip": block_type in {"media", "video"},
        "styleRole": role,
    }


def _layout(title_rows: int, areas: list[dict[str, Any]], *, gap: int = 14) -> dict[str, Any]:
    return {
        "kind": "artboard", "columns": 12, "rows": 12, "gap": gap,
        "titleRegion": _title(title_rows), "areas": areas,
    }


def _measurement_map(metric: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for item in (metric or {}).get("blockMeasurements") or []:
        if not isinstance(item, dict):
            continue
        for block_id in item.get("blockIds") or []:
            result[str(block_id)] = item
    return result


def _height(block: dict[str, Any], cols: int, measured: dict[str, dict[str, Any]]) -> float:
    item = measured.get(str(block.get("id") or ""), {})
    raw_profiles = item.get("widthProfiles")
    profiles: dict[str, Any] = raw_profiles if isinstance(raw_profiles, dict) else {}
    if not item.get("measurementInvalid"):
        value = profiles.get(str(cols))
        if isinstance(value, (int, float)) and value > 0:
            return float(value)
    natural = item.get("naturalHeight")
    if isinstance(natural, (int, float)) and natural > 0:
        current_cols = max(1, int(item.get("colSpan") or cols))
        return float(natural) * max(0.7, current_cols / max(1, cols))
    block_type = str(block.get("type") or "")
    base = {"sim": 470, "runnable": 470, "chart": 360, "diagram": 340, "graph": 340,
            "table": 320, "formula": 190, "quiz": 260, "code": 330,
            "media": 330, "video": 330, "callout": 130, "statement": 150}.get(block_type, 220)
    text = len(str(block))
    return float(base + min(190, text // 5))


def _rank(block: dict[str, Any]) -> tuple[int, int]:
    block_type = str(block.get("type") or "")
    return (0 if block_type in _STAGE_TYPES else 1 if block_type in _PRIMARY_TYPES else 2,
            {"xl": 0, "l": 1, "m": 2, "s": 3}.get(str(block.get("size") or "m"), 2))


def _viewport(metric: dict[str, Any] | None) -> tuple[float, float, float]:
    raw = (metric or {}).get("layoutViewport")
    viewport = raw if isinstance(raw, dict) else {}
    width = float(viewport.get("width") or 1152)
    height = float(viewport.get("height") or 590)
    gap = float(viewport.get("gap") or 14)
    return width, height, gap


def _grid_extent(span: int, total: float, gap: float) -> float:
    unit = max(1.0, (total - gap * 11) / 12)
    return unit * span + gap * max(0, span - 1)


def _single_candidates(
    block: dict[str, Any],
    measured: dict[str, dict[str, Any]],
    metric: dict[str, Any] | None,
    title_rows: int,
) -> list[tuple[str, dict[str, Any], float, str, bool, float, float]]:
    """Solve a one-block page instead of treating it as an automatic full-page success."""
    body_width, body_height, gap = _viewport(metric)
    block_type = str(block.get("type") or "")
    title_options = sorted({title_rows, min(4, title_rows + 1), max(2, title_rows - 1)})
    width_options = [(12, 1, 13), (9, 2, 11), (8, 3, 11)]
    candidates: list[tuple[str, dict[str, Any], float, str, bool, float, float]] = []
    for rows in title_options:
        start = rows + 1
        row_span = 13 - start
        available_h = _grid_extent(row_span, body_height, gap)
        title_available = _grid_extent(rows, body_height, gap)
        title_required = float((metric or {}).get("titleNaturalHeight") or 0)
        for cols, left, right in width_options:
            # Interactive stages need the complete authoring width. A narrow centered widget is
            # never an acceptable way to manufacture whitespace.
            if block_type in _STAGE_TYPES and cols < 12:
                continue
            required_h = _height(block, cols, measured)
            scale = min(1.0, available_h / max(1.0, required_h))
            title_fit = not title_required or title_required <= title_available + 1
            subject_ratio = (cols / 12) * (row_span / 12)
            feasible = scale >= 0.90 and title_fit and subject_ratio >= 0.35
            utilization = min(1.0, required_h / max(1.0, available_h))
            # Prefer useful 45–85% occupancy. Overflow/title failures dominate every aesthetic
            # preference, while modest width keeps genuinely compact evidence from being stretched.
            density_penalty = abs(utilization - 0.65) * 90
            overflow_penalty = max(0.0, required_h - available_h) * 20
            title_penalty = 10000 if not title_fit else 0
            feasibility_penalty = 5000 if not feasible else 0
            width_penalty = 8 if cols == 12 and block_type not in _STAGE_TYPES and utilization < 0.45 else 0
            score = overflow_penalty + title_penalty + feasibility_penalty + density_penalty + width_penalty
            name = f"single-{cols}col-title{rows}"
            layout = _layout(rows, [_area(
                block, (left, right), (start, 13),
                "stage" if block_type in _STAGE_TYPES else "feature",
            )])
            reason = (
                f"one-block measured candidate: required={required_h:.0f}px, "
                f"available={available_h:.0f}px, scale={scale:.3f}, subject={subject_ratio:.3f}"
            )
            candidates.append((name, layout, score, reason, feasible, required_h, available_h))
    return candidates


def solve_scene_layout(scene: dict[str, Any], metric: dict[str, Any] | None = None) -> tuple[dict[str, Any], LayoutDecision]:
    """Choose the lowest-risk whole-page candidate using measured intrinsic dimensions."""
    blocks = [block for block in (scene.get("blocks") or []) if isinstance(block, dict)]
    if not blocks:
        raise ValueError("layout director requires at least one block")
    sid = str(scene.get("id") or "?")
    measured = _measurement_map(metric)
    title_rows = 3 if float((metric or {}).get("titleNaturalHeight") or 0) <= 118 else 4
    start = title_rows + 1
    candidates: list[tuple[str, dict[str, Any], float, str, bool, float, float]] = []

    if len(blocks) == 1:
        candidates.extend(_single_candidates(blocks[0], measured, metric, title_rows))
    else:
        ranked = sorted(blocks, key=_rank)
        first, second = ranked[0], ranked[1]
        rest = ranked[2:]
        # Side-by-side: suitable when both blocks have moderate intrinsic height.
        h1, h2 = _height(first, 6, measured), _height(second, 6, measured)
        side_over = max(0.0, h1 - 430) + max(0.0, h2 - 430) + len(rest) * 500
        if not rest:
            layout = _layout(title_rows, [
                _area(first, (1, 7), (start, 13), "evidence"),
                _area(second, (7, 13), (start, 13), "evidence"),
            ])
            candidates.append(("balanced-columns", layout, side_over + abs(h1 - h2) * 0.08, "two comparable evidence surfaces", side_over <= 0, max(h1, h2), 430.0))

        # Vertical evidence stack: formula/callout support keeps full line measure.
        h_full = [_height(block, 12, measured) for block in ranked]
        total = max(1.0, sum(h_full))
        usable_rows = 13 - start
        cursor = start
        areas: list[dict[str, Any]] = []
        for index, block in enumerate(ranked):
            remaining = len(ranked) - index - 1
            rows = max(2, round(usable_rows * h_full[index] / total))
            end = 13 if index == len(ranked) - 1 else min(13 - remaining * 2, cursor + rows)
            areas.append(_area(block, (1, 13), (cursor, max(cursor + 1, end)), "evidence" if index == 0 else "caption"))
            cursor = end
        vertical_over = max(0.0, total - 500) + max(0, len(blocks) - 3) * 400
        stack_layout = _layout(title_rows, areas, gap=12)
        candidates.append(("measured-stack", stack_layout, vertical_over, "full-width proportional intrinsic-height stack", vertical_over <= 0, total, 500.0))

        # Dominant stage plus a compact rail. Never place dense support in that rail.
        if first.get("type") not in _STAGE_TYPES and len(blocks) == 2:
            main_h, rail_h = _height(first, 9, measured), _height(second, 3, measured)
            rail_over = max(0.0, main_h - 430) + max(0.0, rail_h - 430) + (200 if rail_h > 300 else 0)
            rail_layout = _layout(title_rows, [
                _area(first, (1, 10), (start, 13), "feature"),
                _area(second, (10, 13), (start, 13), "aside"),
            ])
            candidates.append(("dominant-with-rail", rail_layout, rail_over, "primary evidence with compact supporting rail", rail_over <= 0, max(main_h, rail_h), 430.0))

    feasible_candidates = [item for item in candidates if item[4]]
    name, layout, score, reason, feasible, required, available = min(
        feasible_candidates or candidates, key=lambda item: item[2]
    )
    signature = layout_signature(layout)
    return layout, LayoutDecision(
        sid, name, round(score, 2), reason, signature, feasible,
        round(required, 2), round(available, 2),
    )


def solve_document_layouts(doc: dict[str, Any], page_metrics: list[dict[str, Any]]) -> list[LayoutDecision]:
    by_index = {int(item.get("i", -1)): item for item in page_metrics if isinstance(item, dict)}
    decisions: list[LayoutDecision] = []
    used_ids: set[str] = set()
    for index, scene in enumerate(doc.get("scenes") or []):
        if not isinstance(scene, dict) or scene.get("kind") in {"hero", "section"} or not scene.get("blocks"):
            continue
        if isinstance(scene.get("layout"), dict) and scene["layout"].get("kind") == "frames":
            continue
        sid = str(scene.get("id") or f"scene-{index + 1}")
        for block_index, block in enumerate(scene.get("blocks") or []):
            if not isinstance(block, dict):
                continue
            raw_id = str(block.get("id") or "").strip()
            if not raw_id or raw_id in used_ids:
                base = f"{sid}-layout-b{block_index + 1}"
                block_id = base
                suffix = 2
                while block_id in used_ids:
                    block_id = f"{base}-{suffix}"
                    suffix += 1
                block["id"] = block_id
                raw_id = block_id
            used_ids.add(raw_id)
        layout, decision = solve_scene_layout(scene, by_index.get(index))
        scene["layout"] = layout
        decisions.append(decision)
    return decisions


def split_failed_scenes(doc: dict[str, Any], failed_pages: set[int]) -> list[dict[str, Any]]:
    """Split infeasible multi-block pages without rewriting any generated block content."""
    scenes = list(doc.get("scenes") or [])
    inserted: list[dict[str, Any]] = []
    for index in sorted(failed_pages, reverse=True):
        if index < 0 or index >= len(scenes):
            continue
        scene = scenes[index]
        if isinstance(scene.get("layout"), dict) and scene["layout"].get("kind") == "frames":
            continue
        blocks = [block for block in (scene.get("blocks") or []) if isinstance(block, dict)]
        if len(blocks) < 2 or scene.get("kind") in {"hero", "section"}:
            continue
        ranked = sorted(blocks, key=_rank)
        primary = ranked[0]
        supports = [block for block in blocks if block is not primary]
        scene["blocks"] = [primary]
        scene["kind"] = "quiz" if primary.get("type") == "quiz" else "content"
        scene.pop("layout", None)
        base_id = str(scene.get("id") or f"scene-{index + 1}")
        for offset, support in enumerate(supports, start=2):
            continuation = deepcopy(scene)
            continuation["id"] = f"{base_id}-layout-{offset}"
            continuation["eyebrow"] = scene.get("eyebrow") or "继续"
            continuation["headline"] = f"{scene.get('headline') or '继续'} · {offset - 1}"
            continuation["blocks"] = [support]
            continuation["kind"] = "quiz" if support.get("type") == "quiz" else "content"
            continuation["compositionFamily"] = "interactive-stage" if support.get("type") in _STAGE_TYPES else "focal-object"
            continuation["visualBrief"] = {
                "designIntent": "为上一页的辅助证据提供完整、可读的独立舞台",
                "selectedCapabilities": [str(support.get("type") or "")],
                "compositionFamily": continuation["compositionFamily"],
            }
            continuation.pop("layout", None)
            scenes.insert(index + offset - 1, continuation)
            inserted.append({"sourceSceneId": base_id, "sceneId": continuation["id"], "reason": "no feasible zero-clip whole-page candidate"})
    doc["scenes"] = scenes
    return inserted


def hard_layout_failures(page_metrics: list[dict[str, Any]]) -> set[int]:
    def number(metric: dict[str, Any], key: str, default: float) -> float:
        value = metric.get(key)
        return float(value) if isinstance(value, (int, float)) else default

    failed: set[int] = set()
    for metric in page_metrics:
        if not isinstance(metric, dict):
            continue
        if any([
            int(metric.get("overlapCount") or 0) > 0,
            int(metric.get("titleOverlapCount") or 0) > 0,
            int(metric.get("outOfBoundsCount") or 0) > 0,
            int(metric.get("hiddenContentCount") or 0) > 0,
            int(metric.get("layoutClip") or 0) > 0,
            int(metric.get("overflowX") or 0) > 0,
            int(metric.get("overflowY") or 0) > 0,
            number(metric, "scaleFloor", 1.0) < 0.9,
            number(metric, "minTextPx", 14.0) < 14.0,
            number(metric, "minBodyTextPx", 16.0) < 16.0,
            number(metric, "minAuxTextPx", 14.0) < 14.0,
            metric.get("titleFit") is False,
            metric.get("widgetViewportFit") is False,
        ]):
            failed.add(int(metric.get("i", -1)))
    return {index for index in failed if index >= 0}


def pagination_failures(page_metrics: list[dict[str, Any]]) -> set[int]:
    """Failures that can actually improve by allocating another page.

    A component whose native token is 12px remains 12px on an otherwise empty page.  Such a
    typography violation must still block release, but splitting it would only create page
    inflation.  Geometry, clipping, overlap and viewport fit are the pagination triggers.
    """
    failed: set[int] = set()
    for metric in page_metrics:
        if not isinstance(metric, dict):
            continue
        scale = metric.get("scaleFloor")
        if any([
            int(metric.get("overlapCount") or 0) > 0,
            int(metric.get("titleOverlapCount") or 0) > 0,
            int(metric.get("outOfBoundsCount") or 0) > 0,
            int(metric.get("hiddenContentCount") or 0) > 0,
            int(metric.get("layoutClip") or 0) > 0,
            int(metric.get("overflowX") or 0) > 0,
            int(metric.get("overflowY") or 0) > 0,
            isinstance(scale, (int, float)) and float(scale) < 0.9,
            metric.get("titleFit") is False,
            metric.get("widgetViewportFit") is False,
        ]):
            failed.add(int(metric.get("i", -1)))
    return {index for index in failed if index >= 0}
