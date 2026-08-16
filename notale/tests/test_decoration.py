"""StylePack decorations are immutable, role-gated, and deterministic."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from notale.style_studio.decoration import (
    DecorationChannel,
    materialize_decorations,
    page_role_for,
    render_page_decorations,
    select_for_page,
)
from notale.style_studio.models import StylePack
from notale.web.deck import render_slide_document


_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="48" fill="#e54"/></svg>'


def _pack(tmp_path: Path, *, escape: bool = False) -> StylePack:
    pack_dir = tmp_path / "pack"
    (pack_dir / "art").mkdir(parents=True)
    for name in ("fox-a.svg", "fox-b.svg", "owl.svg", "spark.svg"):
        (pack_dir / "art" / name).write_text(_SVG, encoding="utf-8")
    assets = [
        {"id": "fox-a", "path": "art/fox-a.svg", "family_id": "fox"},
        {"id": "fox-b", "path": "art/fox-b.svg", "family_id": "fox"},
        {"id": "owl", "path": "art/owl.svg", "family_id": "owl"},
        {
            "id": "spark",
            "path": "../outside.svg" if escape else "art/spark.svg",
            "tags": ["chrome_icon"],
            "placement_hint": "top_left",
        },
    ]
    return StylePack(
        data={
            "id": "test-characters",
            "mascot_policy": {
                "mode": "side_character",
                "assets": assets,
                "selection": "rotate_by_page",
                "max_area_ratio": 0.12,
                "roles_allowed": ["cover", "content"],
            },
        },
        pack_dir=pack_dir,
    )


def test_rotation_stays_with_largest_family_and_keeps_chrome(tmp_path: Path):
    pack = _pack(tmp_path)
    first = select_for_page(pack, page_role="content", deck_pos=1)
    second = select_for_page(pack, page_role="content", deck_pos=2)
    third = select_for_page(pack, page_role="content", deck_pos=3)

    assert [item.id for item in first] == ["fox-a", "spark"]
    assert [item.id for item in second] == ["fox-b", "spark"]
    assert [item.id for item in third] == ["fox-a", "spark"]
    assert select_for_page(pack, page_role="section", deck_pos=2) == []


def test_materialization_is_content_addressed_and_runtime_html_uses_channel(
    tmp_path: Path,
):
    pack = _pack(tmp_path)
    run_dir = tmp_path / "run"
    run_dir.mkdir()
    channel = materialize_decorations(pack, run_dir)

    assert len(channel.assets) == 4
    assert all(asset.sha256 for asset in channel.assets)
    assert all(asset.path.startswith("decorations/") for asset in channel.assets)
    assert all((run_dir / "style_refs" / asset.path).is_file() for asset in channel.assets)
    stored = json.loads((run_dir / "style_refs" / "decorations.json").read_text())
    assert stored["schema_version"] == "notale_decorations.v1"
    assert DecorationChannel.load(run_dir) == channel

    rendered = render_page_decorations(run_dir, page=2, page_role="content")
    assert "fox-b" in rendered and "spark" in rendered
    assert "../style_refs/decorations/" in rendered
    assert "alt=\"\" aria-hidden=\"true\"" in rendered

    document = render_slide_document(
        '<section data-notale-page><h1>Topic</h1></section>',
        page=2,
        run_dir=run_dir,
        page_role="content",
    )
    assert "data-notale-decoration-template" in document
    assert "data-notale-decoration-id=\"fox-b\"" in document
    assert "appendChild(decorationTemplate.content.cloneNode(true))" in document


def test_asset_path_cannot_escape_the_pack(tmp_path: Path):
    (tmp_path / "outside.svg").write_text(_SVG, encoding="utf-8")
    with pytest.raises(ValueError, match="escapes pack directory"):
        materialize_decorations(_pack(tmp_path, escape=True), tmp_path)


def test_page_type_mapping_keeps_inspection_and_final_render_in_sync():
    assert page_role_for("worked-example", 1) == "cover"
    assert page_role_for("section-break", 3) == "section"
    assert page_role_for("worked-example", 3) == "content"


def test_zero_area_policy_renders_nothing(tmp_path: Path):
    pack = _pack(tmp_path)
    channel = materialize_decorations(pack, tmp_path)
    channel = DecorationChannel(
        pack_id=channel.pack_id,
        mode=channel.mode,
        selection=channel.selection,
        max_area_ratio=0,
        roles_allowed=channel.roles_allowed,
        assets=channel.assets,
    )
    assert select_for_page(channel, page_role="content", deck_pos=1) == []
