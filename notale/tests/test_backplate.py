"""Backplate channel, prompt assembly, and page grammar."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from notale.core.stages.page_check import page_delivery_failures
from notale.core.models import PageArtifact
from notale.style_studio.backplate import (
    ImageChannel,
    SafeArea,
    backplate_prompt,
    validate_safe_areas,
)
from notale.style_studio.materialize import materialize_to_run
from notale.tools.media import ensure_asset_manifest, _record_asset


def test_materialize_writes_the_image_channel(tmp_path: Path):
    materialize_to_run("swiss-modern", tmp_path)
    channel = ImageChannel.load(tmp_path)
    assert channel is not None
    assert channel.pack_id == "swiss-modern"
    assert channel.palette["bg"]
    # hard_negatives union chrome forbidden_effects, ready as a negative prompt
    assert channel.forbidden


def test_channel_is_absent_without_materialization(tmp_path: Path):
    assert ImageChannel.load(tmp_path) is None


def test_prompt_forbids_text_and_reserves_the_declared_regions():
    channel = ImageChannel(
        pack_id="p", style_prose="quiet parchment", chrome_dialect="thin rules",
        palette={"bg": "#F2EBDD", "ink": "#211C19", "accent": "#8C2530"},
        forbidden=["dashboard chrome"],
    )
    prompt, negative = backplate_prompt(
        channel=channel,
        subject="a fiscal ledger splitting along a fault line",
        safe_areas=[SafeArea("title", 0.06, 0.08, 0.5, 0.2)],
    )
    assert "NO readable text" in prompt
    assert "#F2EBDD" in prompt and "quiet parchment" in prompt
    assert "upper left" in prompt and "carrying title type" in prompt
    assert "dashboard chrome" in negative
    assert "watermark" in negative


def test_prompt_survives_a_missing_channel():
    prompt, negative = backplate_prompt(channel=None, subject="a plain ground")
    assert "NO readable text" in prompt
    assert "watermark" in negative


@pytest.mark.parametrize(
    "area,expected",
    [
        (SafeArea("title", 0.9, 0.1, 0.5, 0.2), "extends past the frame"),
        (SafeArea("title", 0.0, 0.0, 1.0, 0.95), "makes a backplate pointless"),
    ],
)
def test_unusable_safe_areas_are_rejected(area, expected):
    assert any(expected in error for error in validate_safe_areas([area]))


def test_reasonable_safe_areas_pass():
    assert validate_safe_areas([SafeArea("title", 0.06, 0.08, 0.5, 0.2)]) == []


def _manifest(tmp_path: Path, *, kind: str) -> str:
    ensure_asset_manifest(tmp_path)
    relative = "assets/p1-backplate-abc.png"
    (tmp_path / relative).parent.mkdir(parents=True, exist_ok=True)
    (tmp_path / relative).write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 64)
    _record_asset(tmp_path, {
        "asset_id": "p1-backplate-abc", "page": 1, "kind": kind, "alt": "",
        "source_type": "generated-backplate", "local_path": relative,
    })
    return "../" + relative


async def _failures(tmp_path: Path, html: str) -> list[str]:
    return await page_delivery_failures(
        PageArtifact(html=html), page=1, run_dir=tmp_path, page_plan=None
    )


@pytest.mark.asyncio
async def test_decorative_backplate_is_allowed_without_an_alt(tmp_path: Path):
    src = _manifest(tmp_path, kind="backplate")
    html = (
        f'<section data-notale-page><img data-notale-backplate src="{src}" alt="" '
        f'aria-hidden="true"><h1>标题</h1></section>'
    )
    failures = await _failures(tmp_path, html)
    assert not [f for f in failures if "alt" in f], failures


@pytest.mark.asyncio
async def test_backplate_still_needs_aria_hidden(tmp_path: Path):
    src = _manifest(tmp_path, kind="backplate")
    html = f'<section data-notale-page><img data-notale-backplate src="{src}" alt=""><h1>标题</h1></section>'
    assert any("aria-hidden" in f for f in await _failures(tmp_path, html))


@pytest.mark.asyncio
async def test_a_meaningful_alt_on_a_backplate_is_a_defect(tmp_path: Path):
    """A text-free ground carries nothing, so an alt would lie to a screen reader."""
    src = _manifest(tmp_path, kind="backplate")
    html = (
        f'<section data-notale-page><img data-notale-backplate src="{src}" '
        f'alt="a ledger" aria-hidden="true"><h1>标题</h1></section>'
    )
    assert any("empty alt" in f for f in await _failures(tmp_path, html))


@pytest.mark.asyncio
async def test_a_documentary_image_cannot_pose_as_a_backplate(tmp_path: Path):
    src = _manifest(tmp_path, kind="documentary")
    html = (
        f'<section data-notale-page><img data-notale-backplate src="{src}" alt="" '
        f'aria-hidden="true"><h1>标题</h1></section>'
    )
    assert any("not produced by make_backplate" in f for f in await _failures(tmp_path, html))


@pytest.mark.asyncio
async def test_two_backplates_are_rejected(tmp_path: Path):
    src = _manifest(tmp_path, kind="backplate")
    html = (
        f'<section data-notale-page>'
        f'<img data-notale-backplate src="{src}" alt="" aria-hidden="true">'
        f'<img data-notale-backplate src="{src}" alt="" aria-hidden="true">'
        f'<h1>标题</h1></section>'
    )
    assert any("at most one" in f for f in await _failures(tmp_path, html))
