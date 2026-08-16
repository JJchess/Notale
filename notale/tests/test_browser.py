from __future__ import annotations

import asyncio
import struct
from pathlib import Path

import pytest

from notale.web.browser import BrowserPageRenderer, BrowserUnavailable, browser_candidates
from notale.web.deck import prepare_deck_runtime, render_slide_document


@pytest.mark.asyncio
async def test_chromium_renders_exact_1280_by_720_final_slide_shell(tmp_path: Path):
    if not browser_candidates():
        pytest.skip("no local Chromium executable")
    prepare_deck_runtime(tmp_path, {"bg": "#ffffff", "ink": "#111111"})
    fragment = (
        '<section data-notale-page style="position:relative;width:1280px;height:720px">'
        '<h1 style="position:absolute;left:40px;top:30px">精确视口</h1>'
        '<div id="bottom-band" style="position:absolute;left:0;bottom:0;width:1280px;height:96px">底部内容</div>'
        "</section>"
    )
    document = render_slide_document(fragment, page=1, run_dir=tmp_path)
    path = tmp_path / "slides" / ".browser-test.html"
    path.write_text(document, encoding="utf-8")

    try:
        async with BrowserPageRenderer() as renderer:
            rendered = await renderer.render(path)
    except BrowserUnavailable as exc:
        pytest.skip(f"local Chromium cannot launch in this environment: {exc}")

    assert rendered.screenshot.startswith(b"\x89PNG\r\n\x1a\n")
    assert struct.unpack(">II", rendered.screenshot[16:24]) == (1280, 720)


@pytest.mark.asyncio
async def test_sandboxed_component_frame_does_not_stall_late_load_wait(tmp_path: Path):
    if not browser_candidates():
        pytest.skip("no local Chromium executable")
    prepare_deck_runtime(tmp_path, {"bg": "#ffffff", "ink": "#111111"})
    fragment = (
        '<section data-notale-page style="width:1280px;height:720px">'
        '<iframe sandbox="allow-scripts" '
        'srcdoc="&lt;main&gt;托管组件&lt;/main&gt;"></iframe>'
        "</section>"
    )
    document = render_slide_document(fragment, page=1, run_dir=tmp_path)
    path = tmp_path / "slides" / ".sandbox-frame-test.html"
    path.write_text(document, encoding="utf-8")

    try:
        async with BrowserPageRenderer() as renderer:
            async with asyncio.timeout(8):
                rendered = await renderer.render(path)
    except BrowserUnavailable as exc:
        pytest.skip(f"local Chromium cannot launch in this environment: {exc}")

    assert rendered.screenshot.startswith(b"\x89PNG\r\n\x1a\n")
