"""In-browser measurement against real renders. Skipped without Chromium."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

import pytest

from notale.core.stages.page_qa import evaluate_page_qa
from notale.style_studio.decoration import DecorationAsset, DecorationChannel
from notale.style_studio.registry import get_pack
from notale.web.browser import BrowserPageRenderer, BrowserUnavailable, browser_candidates
from notale.web.deck import prepare_deck_runtime, render_slide_document

pytestmark = pytest.mark.skipif(
    not browser_candidates(), reason="no Chromium available for measurement"
)


def _solid_png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


async def _measure(tmp_path: Path, fragment: str, *, plate: tuple[int, int, int] | None = None):
    prepare_deck_runtime(tmp_path, get_pack("swiss-modern").notale_tokens())
    if plate is not None:
        (tmp_path / "assets").mkdir(parents=True, exist_ok=True)
        (tmp_path / "assets" / "plate.png").write_bytes(_solid_png(64, 36, plate))
    document = tmp_path / "slides" / "p1.html"
    document.write_text(
        render_slide_document(fragment, page=1, run_dir=tmp_path), encoding="utf-8"
    )
    try:
        async with BrowserPageRenderer() as renderer:
            return (await renderer.render(document, measure=True)).measurements
    except BrowserUnavailable as exc:  # pragma: no cover - environment dependent
        pytest.skip(str(exc))


_PLATE_IMG = (
    '<img data-notale-backplate src="../assets/plate.png" alt="" aria-hidden="true">'
)


async def test_render_without_measure_stays_empty(tmp_path: Path):
    prepare_deck_runtime(tmp_path, get_pack("swiss-modern").notale_tokens())
    document = tmp_path / "slides" / "p1.html"
    document.write_text(
        render_slide_document(
            "<section data-notale-page><h1>x</h1></section>", page=1, run_dir=tmp_path
        ),
        encoding="utf-8",
    )
    async with BrowserPageRenderer() as renderer:
        page = await renderer.render(document)
    assert page.measurements == {}
    assert page.screenshot


async def test_declared_roles_and_computed_type_are_reported(tmp_path: Path):
    measurements = await _measure(
        tmp_path,
        """<section data-notale-page style="padding:64px">
          <h1 data-notale-role="title" style="font-size:88px;line-height:1.15;margin:0">标题</h1>
          <p style="font-size:19px">正文</p>
        </section>""",
    )
    elements = {item["role"]: item for item in measurements["elements"]}
    assert elements["title"]["role_source"] == "declared"
    assert elements["title"]["font_size_px"] == pytest.approx(88, abs=0.5)
    assert elements["title"]["line_height_px"] == pytest.approx(101.2, abs=1.0)
    # A <p> gets a role from the tag table, and must be marked as a guess.
    assert elements["lede"]["role_source"] == "inferred"


async def test_visible_overflow_is_not_reported_as_clipping(tmp_path: Path):
    """Large CJK glyphs paint outside a tight line box without being cut."""
    measurements = await _measure(
        tmp_path,
        """<section data-notale-page style="padding:64px">
          <h1 data-notale-role="title" style="font-size:88px;line-height:1.15;margin:0">标题 Title</h1>
        </section>""",
    )
    assert measurements["overflow"] == []
    assert all(not item["clipped"] for item in measurements["elements"])


async def test_real_clipping_is_reported(tmp_path: Path):
    measurements = await _measure(
        tmp_path,
        """<section data-notale-page style="padding:64px">
          <div style="width:180px;height:36px;overflow:hidden;white-space:nowrap;font-size:20px">
            这一行真的被容器裁掉了因为它非常长</div>
        </section>""",
    )
    assert [item["reason"] for item in measurements["overflow"]] == ["clipped"]


async def test_escaping_the_frame_is_reported(tmp_path: Path):
    measurements = await _measure(
        tmp_path,
        """<section data-notale-page>
          <div style="position:absolute;left:1200px;top:40px;width:400px;height:60px">出框</div>
        </section>""",
    )
    assert any(item["reason"] == "escapes-frame" for item in measurements["overflow"])


async def test_backplate_pixels_are_sampled_under_text(tmp_path: Path):
    measurements = await _measure(
        tmp_path,
        f"""<section data-notale-page style="padding:64px">
          {_PLATE_IMG}
          <h1 data-notale-role="title" style="font-size:88px;line-height:1.15;margin:0;color:#000">标题</h1>
        </section>""",
        plate=(20, 24, 32),
    )
    assert measurements["backplate"]["src"].endswith("plate.png")
    assert "error" not in measurements["backplate"]
    ground = measurements["elements"][0]["ground"]
    assert ground is not None
    assert ground["fill"].upper() == "#141820"
    assert ground["luminance"] < 0.02


async def test_dark_ink_over_dark_plate_is_caught_end_to_end(tmp_path: Path):
    """The whole point of A+C: measure the real ground, judge the real ink."""
    measurements = await _measure(
        tmp_path,
        f"""<section data-notale-page style="padding:64px">
          {_PLATE_IMG}
          <h1 data-notale-role="title" style="font-size:88px;line-height:1.15;margin:0;color:#111111">标题</h1>
        </section>""",
        plate=(20, 24, 32),
    )
    checks = evaluate_page_qa(measurements, tokens=get_pack("swiss-modern").notale_tokens())
    contrast = [c for c in checks if c.check_id == "backplate_contrast"]
    assert contrast[0].status == "fail"
    assert "#FFFFFF" in contrast[0].detail


async def test_light_ink_over_dark_plate_passes_end_to_end(tmp_path: Path):
    measurements = await _measure(
        tmp_path,
        f"""<section data-notale-page style="padding:64px">
          {_PLATE_IMG}
          <h1 data-notale-role="title" style="font-size:88px;line-height:1.15;margin:0;color:#FFFFFF">标题</h1>
        </section>""",
        plate=(20, 24, 32),
    )
    checks = evaluate_page_qa(measurements, tokens=get_pack("swiss-modern").notale_tokens())
    contrast = [c for c in checks if c.check_id == "backplate_contrast"]
    assert contrast[0].status == "pass"


async def test_backplate_is_not_counted_as_a_decoration(tmp_path: Path):
    """Otherwise every backplate would 'cover' every line of text."""
    measurements = await _measure(
        tmp_path,
        f"""<section data-notale-page style="padding:64px">
          {_PLATE_IMG}
          <h1 data-notale-role="title" style="font-size:88px;margin:0">标题</h1>
        </section>""",
        plate=(240, 240, 240),
    )
    assert measurements["decorations"] == []
    checks = evaluate_page_qa(measurements, tokens=get_pack("swiss-modern").notale_tokens())
    overlap = [c for c in checks if c.check_id == "bbox_overlap"]
    assert overlap[0].status == "pending"


async def test_inline_css_is_not_read_as_rendered_text(tmp_path: Path):
    """textContent would swallow <style> bodies and report CSS as page copy."""
    measurements = await _measure(
        tmp_path,
        """<section data-notale-page style="padding:64px">
          <style>.k{box-sizing:border-box;margin:7px}</style>
          <h1 data-notale-role="title" style="font-size:88px">标题</h1>
          <p class="k">正文</p>
        </section>""",
    )
    assert "box-sizing" not in measurements["text"]
    assert "标题" in measurements["text"] and "正文" in measurements["text"]

    checks = evaluate_page_qa(
        measurements,
        tokens=get_pack("swiss-modern").notale_tokens(),
        source_text="标题 正文",
    )
    text_check = [c for c in checks if c.check_id == "rendered_text_matches_source"]
    assert text_check[0].status == "pass"


async def test_backplate_sits_under_text_via_the_runtime_stylesheet(tmp_path: Path):
    """The runtime owns the plate geometry, so the Builder cannot misplace it."""
    measurements = await _measure(
        tmp_path,
        f"""<section data-notale-page style="padding:64px">
          {_PLATE_IMG}
          <h1 data-notale-role="title" style="font-size:88px;margin:0;color:#FFFFFF">标题</h1>
        </section>""",
        plate=(20, 24, 32),
    )
    # The Builder wrote no positioning at all; global.css placed it full-bleed.
    plate = measurements["backplate"]
    assert plate is not None and "error" not in plate
    ground = measurements["elements"][0]["ground"]
    assert ground["fill"].upper() == "#141820"
    # Text is above the plate, so it is measurable rather than hidden behind it.
    assert measurements["elements"][0]["rect"]["w"] > 0


async def test_materialized_decoration_is_injected_inside_page_and_measured(tmp_path: Path):
    refs = tmp_path / "style_refs"
    (refs / "decorations").mkdir(parents=True)
    (refs / "decorations" / "dot.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
        '<circle cx="50" cy="50" r="48" fill="#e54"/></svg>',
        encoding="utf-8",
    )
    channel = DecorationChannel(
        pack_id="test",
        mode="corner_accent",
        selection="all",
        max_area_ratio=0.03,
        roles_allowed=("content",),
        assets=(DecorationAsset(id="dot", path="decorations/dot.svg"),),
    )
    (refs / "decorations.json").write_text(
        __import__("json").dumps(channel.to_dict()), encoding="utf-8"
    )
    prepare_deck_runtime(tmp_path, get_pack("swiss-modern").notale_tokens())
    document = tmp_path / "slides" / "p1.html"
    document.write_text(
        render_slide_document(
            '<section data-notale-page style="padding:64px">'
            '<h1 style="font-size:72px;width:500px">Measured</h1></section>',
            page=2,
            run_dir=tmp_path,
            page_role="content",
        ),
        encoding="utf-8",
    )
    try:
        async with BrowserPageRenderer() as renderer:
            measured = (await renderer.render(document, measure=True)).measurements
    except BrowserUnavailable as exc:  # pragma: no cover - environment dependent
        pytest.skip(str(exc))

    assert len(measured["decorations"]) == 1
    rect = measured["decorations"][0]["rect"]
    assert rect["x"] >= 0 and rect["y"] >= 0
    assert rect["x"] + rect["w"] <= 1280
    assert rect["y"] + rect["h"] <= 720
    checks = evaluate_page_qa(
        measured, tokens=get_pack("swiss-modern").notale_tokens()
    )
    assert next(check for check in checks if check.check_id == "bbox_overlap").status == "pass"
