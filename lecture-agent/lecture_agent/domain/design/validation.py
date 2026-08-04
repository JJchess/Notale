"""Deterministic artboard safety checks shared by compilation and tests."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CompositionIssue:
    code: str
    message: str


def _rect(value: Any) -> tuple[int, int, int, int] | None:
    if not isinstance(value, dict):
        return None
    col, row = value.get("col"), value.get("row")
    if not (
        isinstance(col, list)
        and len(col) == 2
        and isinstance(row, list)
        and len(row) == 2
        and all(isinstance(item, int) for item in (*col, *row))
    ):
        return None
    return col[0], col[1], row[0], row[1]


def _overlap(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    return a[0] < b[1] and b[0] < a[1] and a[2] < b[3] and b[2] < a[3]


def validate_scene_composition(
    scene: dict[str, Any], layout: dict[str, Any]
) -> list[CompositionIssue]:
    """Validate references, geometry, title safety, overlap, and interaction prominence."""
    issues: list[CompositionIssue] = []
    if layout.get("kind") != "artboard" or layout.get("columns") != 12 or layout.get("rows") != 12:
        issues.append(CompositionIssue("contract", "layout must be a 12×12 artboard"))
        return issues

    blocks_value = scene.get("blocks")
    blocks: list[Any] = blocks_value if isinstance(blocks_value, list) else []
    block_types = {str(block.get("id")): str(block.get("type")) for block in blocks if isinstance(block, dict) and block.get("id")}
    expected = set(block_types)
    seen: list[str] = []
    area_rects: list[tuple[dict[str, Any], tuple[int, int, int, int]]] = []
    areas_value = layout.get("areas")
    areas: list[Any] = areas_value if isinstance(areas_value, list) else []
    for index, area in enumerate(areas):
        rect = _rect(area)
        if rect is None:
            issues.append(CompositionIssue("coordinates", f"area {index} requires col and row spans"))
            continue
        if not (1 <= rect[0] < rect[1] <= 13 and 1 <= rect[2] < rect[3] <= 13):
            issues.append(CompositionIssue("coordinates", f"area {index} is outside the artboard"))
        ids = area.get("blockIds") if isinstance(area.get("blockIds"), list) else []
        for block_id in ids:
            if block_id not in expected:
                issues.append(CompositionIssue("reference", f"unknown block id: {block_id}"))
            seen.append(str(block_id))
        area_rects.append((area, rect))

    missing = expected - set(seen)
    duplicate = {block_id for block_id in seen if seen.count(block_id) > 1}
    if missing:
        issues.append(CompositionIssue("reference", f"unplaced blocks: {sorted(missing)}"))
    if duplicate:
        issues.append(CompositionIssue("reference", f"blocks placed more than once: {sorted(duplicate)}"))

    title = _rect(layout.get("titleRegion"))
    if title is None or not (1 <= title[0] < title[1] <= 13 and 1 <= title[2] < title[3] <= 13):
        issues.append(CompositionIssue("title", "titleRegion must be inside the artboard"))

    for index, (left, left_rect) in enumerate(area_rects):
        for right, right_rect in area_rects[index + 1 :]:
            if not _overlap(left_rect, right_rect):
                continue
            roles = {left.get("styleRole"), right.get("styleRole")}
            if "decoration" not in roles:
                issues.append(CompositionIssue("overlap", "content areas overlap without decoration layering"))
        if title and _overlap(left_rect, title):
            allowed_under_title = (
                left.get("styleRole") in {"decoration", "feature"}
                and bool(left.get("bleed"))
                and int(left.get("z", 1)) < int(layout.get("titleRegion", {}).get("z", 3))
            )
            if not allowed_under_title:
                issues.append(CompositionIssue("title", "content intrudes into the title safe region"))

    areas_by_id = {
        str(block_id): rect
        for area, rect in area_rects
        for block_id in area.get("blockIds", [])
    }
    content_areas = [
        (rect[1] - rect[0]) * (rect[3] - rect[2])
        for area, rect in area_rects
        if area.get("styleRole") != "decoration"
    ]
    largest = max(content_areas, default=0)
    for block_id, block_type in block_types.items():
        if block_type not in {"sim", "runnable"}:
            continue
        rect = areas_by_id.get(block_id)
        area_size = (rect[1] - rect[0]) * (rect[3] - rect[2]) if rect else 0
        if area_size < 48 or area_size < largest:
            issues.append(
                CompositionIssue(
                    "interactive-stage",
                    f"{block_type} block {block_id} must occupy the largest area and at least 48 cells",
                )
            )
    return issues
