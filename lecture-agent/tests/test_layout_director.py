from __future__ import annotations

import random

from lecture_agent.domain.design import (
    frame_layout_signature,
    hard_layout_failures,
    layout_signature,
    pagination_failures,
    solve_document_layouts,
    solve_scene_layout,
    split_failed_scenes,
    validate_scene_composition,
)


def _scene(*types: str) -> dict:
    return {
        "id": "page",
        "kind": "content",
        "headline": "Measured layout",
        "blocks": [
            {"id": f"b{index}", "type": block_type, "size": "xl" if index == 0 else "m"}
            for index, block_type in enumerate(types)
        ],
    }


def test_browser_width_profiles_change_candidate_selection() -> None:
    scene = _scene("diagram", "callout")
    metric = {
        "titleNaturalHeight": 90,
        "blockMeasurements": [
            {"blockIds": ["b0"], "colSpan": 6, "naturalHeight": 350, "widthProfiles": {"6": 360, "9": 280, "12": 240}},
            {"blockIds": ["b1"], "colSpan": 6, "naturalHeight": 160, "widthProfiles": {"3": 700, "6": 150, "12": 110}},
        ],
    }
    layout, decision = solve_scene_layout(scene, metric)
    assert decision.candidate != "dominant-with-rail", "narrow rail must be rejected by measured height"
    assert not validate_scene_composition(scene, layout)
    assert all(not area["clip"] for area in layout["areas"])


def test_single_block_is_measured_across_real_candidates_and_signed() -> None:
    scene = _scene("diagram")
    metric = {
        "titleNaturalHeight": 92,
        "layoutViewport": {"width": 1152, "height": 590, "gap": 14},
        "blockMeasurements": [
            {
                "blockIds": ["b0"], "colSpan": 6, "naturalHeight": 556,
                "widthProfiles": {str(cols): 556 for cols in (3, 4, 6, 8, 9, 12)},
                "measurementInvalid": True,
            }
        ],
    }
    layout, decision = solve_scene_layout(scene, metric)
    assert decision.candidate.startswith("single-")
    assert decision.score != 0
    assert decision.required_height != 556, "invalid identical width profiles must not be trusted"
    assert decision.decision_signature == layout_signature(layout)
    assert decision.available_height > 0


def test_single_block_rejects_infeasible_natural_height_without_silent_clip() -> None:
    scene = _scene("diagram")
    metric = {
        "layoutViewport": {"width": 1152, "height": 590, "gap": 14},
        "blockMeasurements": [
            {"blockIds": ["b0"], "colSpan": 12, "naturalHeight": 900, "widthProfiles": {"8": 1000, "9": 950, "12": 900}}
        ],
    }
    _layout, decision = solve_scene_layout(scene, metric)
    assert decision.feasible is False
    assert decision.required_height > decision.available_height


def test_document_director_repairs_missing_and_duplicate_block_ids_deterministically() -> None:
    doc = {
        "scenes": [
            {"id": "p1", "kind": "content", "blocks": [{"type": "diagram"}, {"id": "same", "type": "callout"}]},
            {"id": "p2", "kind": "content", "blocks": [{"id": "same", "type": "formula"}]},
        ]
    }
    decisions = solve_document_layouts(doc, [])
    ids = [block["id"] for scene in doc["scenes"] for block in scene["blocks"]]
    assert ids == ["p1-layout-b1", "same", "p2-layout-b1"]
    assert len(decisions) == 2


def test_absolute_frames_bypass_director_and_split_and_have_stable_signature() -> None:
    scene = _scene("diagram", "callout")
    scene["layout"] = {
        "kind": "frames", "canvas": {"width": 1280, "height": 720},
        "titleFrame": {"x": 64, "y": 40, "w": 1152, "h": 100, "z": 5},
        "frames": [
            {"blockId": "b0", "x": 64, "y": 160, "w": 760, "h": 496, "z": 1, "role": "primary", "clip": False},
            {"blockId": "b1", "x": 848, "y": 160, "w": 368, "h": 220, "z": 1, "role": "support", "clip": False},
        ],
    }
    before = frame_layout_signature(scene["layout"])
    doc = {"scenes": [scene]}
    assert solve_document_layouts(doc, []) == []
    assert split_failed_scenes(doc, {0}) == []
    assert frame_layout_signature(scene["layout"]) == before


def test_stage_and_support_split_into_contiguous_pages() -> None:
    doc = {"scenes": [_scene("sim", "quiz", "formula")]}
    inserted = split_failed_scenes(doc, {0})
    assert len(doc["scenes"]) == 3
    assert [scene["blocks"][0]["type"] for scene in doc["scenes"]] == ["sim", "quiz", "formula"]
    assert [scene["kind"] for scene in doc["scenes"]] == ["content", "quiz", "content"]
    assert [scene["id"] for scene in doc["scenes"]] == ["page", "page-layout-2", "page-layout-3"]
    assert len(inserted) == 2


def test_layout_release_gate_is_zero_tolerance() -> None:
    for field, value in [
        ("overlapCount", 1), ("hiddenContentCount", 1), ("layoutClip", 1),
        ("overflowX", 1), ("overflowY", 1), ("scaleFloor", 0.899),
        ("titleFit", False), ("widgetViewportFit", False),
        ("minTextPx", 13.9), ("minBodyTextPx", 15.9), ("minAuxTextPx", 13.9),
    ]:
        assert hard_layout_failures([{"i": 4, field: value}]) == {4}
    assert hard_layout_failures([{"i": 4, "scaleFloor": 0.9, "titleFit": True, "widgetViewportFit": True}]) == set()


def test_native_typography_violation_blocks_release_without_page_inflation() -> None:
    metric = {"i": 2, "minTextPx": 12, "scaleFloor": 1, "titleFit": True, "widgetViewportFit": True}
    assert hard_layout_failures([metric]) == {2}
    assert pagination_failures([metric]) == set()


def test_random_candidates_remain_inside_artboard_and_do_not_overlap() -> None:
    random.seed(7)
    types = ["statement", "callout", "formula", "diagram", "chart", "quiz", "table"]
    for _ in range(100):
        scene = _scene(*(random.choice(types) for _ in range(random.randint(1, 3))))
        metric = {
            "blockMeasurements": [
                {
                    "blockIds": [block["id"]],
                    "colSpan": 6,
                    "naturalHeight": random.randint(90, 620),
                    "widthProfiles": {str(cols): random.randint(80, 650) for cols in (3, 4, 6, 8, 9, 12)},
                }
                for block in scene["blocks"]
            ]
        }
        layout, _decision = solve_scene_layout(scene, metric)
        assert not validate_scene_composition(scene, layout)
        for area in layout["areas"]:
            assert 1 <= area["col"][0] < area["col"][1] <= 13
            assert 1 <= area["row"][0] < area["row"][1] <= 13
