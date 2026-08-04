from __future__ import annotations

from copy import deepcopy

import pytest
from lecture_agent.domain.design import (
    compile_scene_composition,
    compile_visual_system,
    validate_scene_composition,
)
from lecture_agent.domain.design.compiler import composition_signature

FAMILIES = [
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
]


def _scene(*types: str) -> dict:
    return {
        "id": "scene-a",
        "kind": "content",
        "notes": "test",
        "headline": "One clear claim",
        "blocks": [
            {"id": f"block-{index}", "type": block_type, "size": "l" if index == 0 else "s"}
            for index, block_type in enumerate(types)
        ],
    }


def test_compile_visual_system_closes_prose_design_dna_into_tokens() -> None:
    result = compile_visual_system(
        {
            "audience": {"stage": "university"},
            "density": "dense",
            "designDNA": {
                "palette": {"base": "#101820", "accent": "#FEE715"},
                "typography": {"display": "editorial serif", "body": "humanist"},
                "shapeLanguage": "sharp technical outline",
                "texture": "fine grid",
                "motifs": ["corner brackets", "grid trace"],
                "compositionRhythm": "progressive",
            },
        }
    )

    assert result["palette"]["background"] == "#101820"
    assert result["palette"]["accent"] == "#FEE715"
    assert all(value.startswith("#") for value in result["palette"].values())
    assert result["typography"] == {
        "display": "editorial-serif",
        "body": "humanist-sans",
        "mono": "technical-mono",
        "displayWeight": 700,
        "bodyWeight": 400,
        "scale": "compact",
    }
    assert result["shape"] == {"radius": 2, "borderWidth": 2, "shadow": "none"}
    assert result["texture"] == "grid"
    assert result["rhythm"] == "progressive"
    assert [motif["type"] for motif in result["motifs"]] == ["corner", "grid"]


def test_all_composition_families_have_distinct_executable_signatures() -> None:
    scene = _scene("chart", "callout")
    signatures: dict[str, str] = {}
    for family in FAMILIES:
        layout = compile_scene_composition(
            deepcopy(scene), {"compositionFamily": family}, {"density": "medium"}, []
        )
        assert layout["kind"] == "artboard"
        assert (layout["columns"], layout["rows"]) == (12, 12)
        assert not validate_scene_composition(scene, layout)
        signatures[family] = composition_signature(layout)

    assert len(set(signatures.values())) == len(FAMILIES), {
        family: signature for family, signature in signatures.items()
    }


def test_interactive_stage_is_the_largest_uninterrupted_area() -> None:
    scene = _scene("sim", "formula")
    layout = compile_scene_composition(
        scene, {"compositionFamily": "interactive-stage"}, {"density": "dense"}, []
    )
    stage = next(area for area in layout["areas"] if area["blockIds"] == ["block-0"])
    width = stage["col"][1] - stage["col"][0]
    height = stage["row"][1] - stage["row"][0]

    assert width * height == 81
    assert stage["styleRole"] == "stage"
    assert stage["clip"] is False
    assert not validate_scene_composition(scene, layout)


def test_stage_evidence_overrides_incompatible_requested_family() -> None:
    scene = _scene("sim", "statement")
    layout = compile_scene_composition(
        scene, {"compositionFamily": "comparison"}, {"density": "medium"}, []
    )
    stage = next(area for area in layout["areas"] if area["blockIds"] == ["block-0"])

    assert scene["compositionFamily"] == "interactive-stage"
    assert stage["col"] == [1, 10]
    assert stage["row"] == [4, 13]
    assert stage["styleRole"] == "stage"


def test_wide_evidence_never_enters_annotated_caption_rail() -> None:
    scene = _scene("table", "formula", "statement")
    layout = compile_scene_composition(
        scene, {"compositionFamily": "annotated-specimen"}, {"density": "medium"}, []
    )
    by_id = {
        block_id: area
        for area in layout["areas"]
        for block_id in area["blockIds"]
    }

    for block_id in ("block-0", "block-1"):
        width = by_id[block_id]["col"][1] - by_id[block_id]["col"][0]
        assert width >= 6
        assert by_id[block_id]["styleRole"] == "evidence"


def test_text_only_poster_centers_claim_instead_of_reserving_fake_media_space() -> None:
    scene = _scene("statement", "callout")
    layout = compile_scene_composition(
        scene, {"compositionFamily": "poster"}, {"density": "light"}, []
    )

    assert layout["titleRegion"]["align"] == "center"
    assert layout["titleRegion"]["col"] == [2, 12]
    assert all(area["col"] == [2, 12] for area in layout["areas"])


def test_dense_text_only_poster_reconciles_to_research_figure() -> None:
    scene = _scene("code", "callout", "quiz")
    compile_scene_composition(
        scene, {"compositionFamily": "poster"}, {"density": "dense"}, []
    )
    assert scene["compositionFamily"] == "research-figure"


def test_cutout_split_uses_asset_dimensions_focal_point_and_text_density() -> None:
    scene = _scene("media", "list")
    scene["blocks"][0]["assetId"] = "portrait"
    portrait = {
        "id": "portrait",
        "width": 800,
        "height": 1400,
        "focalPoint": {"x": 0.2, "y": 0.75},
    }
    portrait_layout = compile_scene_composition(
        scene, {"compositionFamily": "cutout-split"}, {"density": "medium"}, [portrait]
    )
    media_area = portrait_layout["areas"][0]
    assert media_area["col"] == [1, 6]
    assert media_area["align"] == "end"
    assert media_area["justify"] == "start"

    landscape = {**portrait, "width": 1800, "height": 900}
    landscape_layout = compile_scene_composition(
        scene, {"compositionFamily": "cutout-split"}, {"density": "medium"}, [landscape]
    )
    assert landscape_layout["areas"][0]["col"] == [1, 8]

    dense_scene = deepcopy(scene)
    dense_scene["blocks"][1]["items"] = ["A long explanation " * 40]
    dense_layout = compile_scene_composition(
        dense_scene,
        {"compositionFamily": "cutout-split"},
        {"density": "dense"},
        [landscape],
    )
    assert dense_layout["areas"][0]["col"] == [1, 6]
    assert dense_layout["gap"] == 12


@pytest.mark.parametrize("family", ["text-over-image", "cutout-split"])
def test_media_families_do_not_treat_text_blocks_as_fake_images(family: str) -> None:
    scene = _scene("list", "callout")
    layout = compile_scene_composition(scene, {"compositionFamily": family}, {}, [])

    assert len(layout["areas"]) == 2
    assert all(not area["bleed"] for area in layout["areas"])
    assert {block_id for area in layout["areas"] for block_id in area["blockIds"]} == {
        "block-0",
        "block-1",
    }


def test_unsafe_complex_family_uses_its_safe_variant_not_flow() -> None:
    scene = _scene("diagram", "callout", "list", "formula", "table", "stats")
    layout = compile_scene_composition(
        scene, {"compositionFamily": "annotated-specimen"}, {"density": "dense"}, []
    )

    assert layout["kind"] == "artboard"
    assert set(layout) == {"kind", "columns", "rows", "gap", "titleRegion", "areas"}
    assert len(layout["areas"]) == len(scene["blocks"])
    assert not validate_scene_composition(scene, layout)


@pytest.mark.parametrize(
    "blocks",
    [[], [{"id": "same", "type": "list"}, {"id": "same", "type": "callout"}]],
)
def test_malformed_scene_fails_before_emitting_dangling_references(blocks: list[dict]) -> None:
    scene = {"id": "bad", "blocks": blocks}
    with pytest.raises(ValueError):
        compile_scene_composition(scene, {"compositionFamily": "poster"}, {}, [])
