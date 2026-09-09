#!/usr/bin/env python3
"""Browser smoke test for a generated code-interaction page."""

from __future__ import annotations

import asyncio
import argparse
import functools
import http.server
import mimetypes
import socketserver
import threading
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import Browser, Page, async_playwright


PAGES = Path(__file__).resolve().parent
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("application/wasm", ".wasm")


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class ReusableServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def serve() -> tuple[ReusableServer, str]:
    handler = functools.partial(QuietHandler, directory=str(PAGES))
    server = ReusableServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}/"


async def open_lab(browser: Browser, url: str, **page_options) -> tuple[Page, list[str], list[str]]:
    page = await browser.new_page(**page_options)
    errors: list[str] = []
    external: list[str] = []
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    page.on(
        "console",
        lambda message: errors.append(f"console: {message.text}")
        if message.type == "error"
        else None,
    )
    page.on("requestfailed", lambda request: errors.append(f"request failed: {request.url}"))
    page.on("response", lambda response: errors.append(f"HTTP {response.status}: {response.url}")
            if response.status >= 400 else None)

    def inspect_request(request):
        parsed = urlparse(request.url)
        if parsed.scheme in {"data", "blob", "about"}:
            return
        if parsed.hostname not in {"127.0.0.1", "localhost"}:
            external.append(request.url)

    page.on("request", inspect_request)
    await page.goto(url, wait_until="domcontentloaded")
    await page.wait_for_function("window.CodeLab && CodeLab.getState().editorReady", timeout=30_000)
    await page.wait_for_function("CodeLab.getState().runtimeReady", timeout=30_000)
    return page, errors, external


async def wait_for_run(page: Page, expect_frames: bool = True) -> dict:
    await page.wait_for_function("!CodeLab.getState().running", timeout=15_000)
    state = await page.evaluate("CodeLab.getState()")
    assert state["outputKind"] == "success", state["output"]
    if expect_frames:
        assert state["frameCount"] > 0, state
    return state


async def native_view_frame(page: Page):
    iframe = page.locator("#visualizer iframe.native-view-frame")
    assert await iframe.count() == 1
    handle = await iframe.element_handle()
    assert handle is not None
    frame = await handle.content_frame()
    assert frame is not None
    return iframe, frame


async def check_view(page: Page, expected_index: int):
    _, frame = await native_view_frame(page)
    await frame.wait_for_function(
        "index => document.documentElement.dataset.frameIndex === String(index)",
        arg=expected_index, timeout=5000,
    )
    assert await frame.locator("body > *").count() > 0, "lesson view is empty"
    assert not await page.locator("#visualizerError").is_visible(), await page.locator("#visualizerError").inner_text()


async def lesson_files_coverage(page: Page, shot_dir: Path | None = None):
    """Execute authored entries and inspect real trace/view states, without platform probes."""
    lesson = await page.evaluate("CodeLab.getLesson()")
    initial = await page.evaluate("CodeLab.getState()")
    sources = await page.evaluate("""() => Object.fromEntries(
        CodeLab.getLesson().files.map(file => [file.filename, CodeLab.getModel(file.filename).getValue()]))""")
    # Imported helper files are not separate entry points in fixed-entry lessons.
    entries = ([row["filename"] for row in lesson["files"] if row.get("runnable", True)]
               if lesson.get("entryMode") == "active" else [lesson["entry"]])
    assert entries, "lesson has no runnable entry"
    for filename in entries:
        await page.evaluate("name => CodeLab.switchFile(name, {focus:false})", filename)
        await page.click("#runButton")
        state = await wait_for_run(page)
        assert state["entry"] == filename, state
        if state["playing"]:
            await page.click("#playButton")
        # First / representative / final are actual execution frames, never fabricated packets.
        for index in sorted({0, state["frameCount"] // 2, state["frameCount"] - 1}):
            await page.evaluate("""index => {
              const from = CodeLab.getState().frameIndex;
              const button = document.querySelector(index < from ? '#previousButton' : '#nextButton');
              for (let n = 0; n < Math.abs(index - from); n++) button.click();
              if (CodeLab.getState().frameIndex !== index) throw new Error('无法选择课程执行帧 ' + index);
            }""", index)
            current = await page.evaluate("CodeLab.getState().currentStep")
            source = current["source"]
            assert source["file"] in sources, source
            assert 1 <= source["line"] <= len(sources[source["file"]].splitlines()) + 1, source
            await check_view(page, index)
            if shot_dir and index == state["frameCount"] // 2:
                await page.screenshot(path=str(shot_dir / "active.png"))
        if shot_dir:
            await page.screenshot(path=str(shot_dir / "final.png"))
        await page.evaluate("CodeLab.reset()")
        reset = await page.evaluate("CodeLab.getState()")
        for key in ("activeFile", "frameIndex", "frameCount", "currentStep", "output", "outputKind", "playing"):
            assert reset[key] == initial[key], (key, initial[key], reset[key])
        restored = await page.evaluate("""() => Object.fromEntries(
            CodeLab.getLesson().files.map(file => [file.filename, CodeLab.getModel(file.filename).getValue()]))""")
        assert restored == sources
        await check_view(page, -1)


async def desktop_flow(browser: Browser, url: str, shot_dir: Path | None = None):
    page, errors, external = await open_lab(browser, url, viewport={"width":1600, "height":900})
    try:
        await check_view(page, -1)
        if shot_dir:
            shot_dir.mkdir(parents=True, exist_ok=True)
            await page.screenshot(path=str(shot_dir / "initial.png"))
        await lesson_files_coverage(page, shot_dir)
        assert not external, external
        assert not errors, errors
    finally:
        await page.close()
    print("  ok  lesson execution, tests, trace, native view, reset")
    if shot_dir:
        print(f"  screenshots  {shot_dir / 'initial.png'}, active.png, final.png")


async def main(shot_dir: Path | None = None):
    server, url = serve()
    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch()
            try:
                await desktop_flow(browser, url, shot_dir)
            finally:
                await browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print("全部通过")


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description="Check the authored code lesson, not the fixed workbench platform.")
    cli.add_argument("--shot-dir", type=Path, help="Optional screenshot output directory")
    options = cli.parse_args()
    asyncio.run(main(options.shot_dir))
