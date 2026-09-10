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
    expression = "!CodeLab.getState().running"
    if expect_frames:
        expression += " && CodeLab.getState().frameCount > 0"
    await page.wait_for_function(expression, timeout=15_000)
    return await page.evaluate("CodeLab.getState()")


async def native_view_frame(page: Page):
    iframe = page.locator("#visualizer iframe.native-view-frame")
    assert await iframe.count() == 1
    handle = await iframe.element_handle()
    assert handle is not None
    frame = await handle.content_frame()
    assert frame is not None
    return iframe, frame


async def native_view_coverage(page: Page):
    iframe, frame = await native_view_frame(page)
    assert await iframe.get_attribute("sandbox") == "allow-scripts"
    assert await iframe.get_attribute("title") == "算法状态可视化"
    assert await frame.locator("body > *").count() > 0
    assert await frame.locator("html").get_attribute("data-reason") in {"initial", "reset"}
    packet_meta = await frame.locator("html").evaluate(
        "element => ({index: element.dataset.frameIndex, count: element.dataset.frameCount, playing: element.dataset.playing, speed: element.dataset.speed, reduced: element.dataset.reducedMotion})"
    )
    assert packet_meta["index"] == "-1"
    assert packet_meta["count"] == "0"
    assert packet_meta["playing"] == "false"
    assert packet_meta["speed"] == "1"
    assert packet_meta["reduced"] in {"true", "false"}
    assert await page.evaluate("() => { window.__nativeViewFrame = document.querySelector('#visualizer iframe'); return true; }")

    denied_parent = await frame.evaluate(
        """() => { try { void parent.document; return "allowed"; } catch (error) { return error.name; } }"""
    )
    assert denied_parent == "SecurityError", denied_parent
    denied_fetch = await frame.evaluate(
        """() => { try { fetch("./forbidden.json"); return "allowed"; } catch (error) { return error.message; } }"""
    )
    assert "不允许使用 fetch" in denied_fetch, denied_fetch

    mode = await page.evaluate(
        """() => {
          const step = structuredClone(CodeLab.getState().currentStep);
          step.sequence = Number(step.sequence || 0) + 1;
          return CodeLab.previewStep(step);
        }"""
    )
    assert mode == "native-html"
    await frame.wait_for_function("document.documentElement.dataset.reason === 'preview'")
    assert await frame.locator("html").get_attribute("data-previous-sequence") != ""
    assert await page.evaluate("() => window.__nativeViewFrame === document.querySelector('#visualizer iframe')")

    await frame.evaluate("window.__savedRenderNotaleView = window.renderNotaleView; window.renderNotaleView = () => { throw new Error('contract-probe'); }; null")
    await page.evaluate("CodeLab.previewStep(CodeLab.getState().currentStep)")
    await page.locator("#visualizerError").wait_for(state="visible")
    assert "contract-probe" in await page.locator("#visualizerError").inner_text()
    await frame.evaluate("window.renderNotaleView = window.__savedRenderNotaleView; null")
    await page.evaluate("CodeLab.previewStep(CodeLab.getState().currentStep)")
    await page.locator("#visualizerError").wait_for(state="hidden")

    await frame.evaluate("window.renderNotaleView = undefined")
    await page.evaluate("CodeLab.previewStep(CodeLab.getState().currentStep)")
    await page.locator("#visualizerError").wait_for(state="visible")
    assert "必须定义 window.renderNotaleView" in await page.locator("#visualizerError").inner_text()
    await frame.evaluate("window.renderNotaleView = window.__savedRenderNotaleView; null")
    await page.evaluate("CodeLab.previewStep(CodeLab.getState().currentStep)")
    await page.locator("#visualizerError").wait_for(state="hidden")

    await page.evaluate("CodeLab.reset()")
    await frame.wait_for_function("document.documentElement.dataset.reason === 'reset'")
    assert await frame.locator("html").get_attribute("data-previous-sequence") == ""
    assert await page.evaluate("() => window.__nativeViewFrame === document.querySelector('#visualizer iframe')")


async def runtime_protocol_coverage(page: Page):
    result = await page.evaluate(
        """async () => {
          const worker = new Worker('./runtime/python-worker.js', {type: 'module'});
          const source = `from helper import graph

queue = ["a"]
visited = []
while queue:
    node = queue.pop(0)
    if node in visited:
        continue
    visited.append(node)
    queue.extend(next_node for next_node in graph[node] if next_node not in visited)
`;
          const helper = `graph = {"a": ["b", "c"], "b": ["d"], "c": ["d"], "d": []}\n`;
          const trace = `def capture(frame, event, previous_state):
    graph = frame.f_globals.get("graph")
    if not isinstance(graph, dict):
        return None
    queue = list(frame.f_globals.get("queue", []))
    visited = list(frame.f_globals.get("visited", []))
    nodes = [{"id": key, "label": key, "state": "visited" if key in visited else ""} for key in graph]
    edges = [{"source": source, "target": target} for source, targets in graph.items() for target in targets]
    return {"kind": "network", "state": {"nodes": nodes, "edges": edges, "queue": queue}, "focus": ([{"id": queue[0], "role": "frontier"}] if queue else []), "changes": [], "metrics": {"visited": len(visited)}}
`;
          const tests = `def run_tests(namespace):
    return [{"name": "visits all nodes", "passed": set(namespace.get("visited", [])) == {"a", "b", "c", "d"}}]
`;
          return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { worker.terminate(); reject(new Error('protocol worker timeout')); }, 15000);
            worker.addEventListener('error', event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); });
            worker.addEventListener('message', event => {
              const data = event.data || {};
              if (data.type === 'fatal') {
                clearTimeout(timer); worker.terminate(); reject(new Error(data.message));
              } else if (data.type === 'ready') {
                worker.postMessage({
                  type: 'run', id: 91, entry: 'starter.py',
                  files: [{filename: 'starter.py', source}, {filename: 'helper.py', source: helper}],
                  traceSource: trace, testsSource: tests, seed: 3,
                  limits: {maxFrames: 300, maxPayloadBytes: 1000000}
                });
              } else if (data.id === 91) {
                clearTimeout(timer); worker.terminate(); resolve(data);
              }
            });
          });
        }"""
    )
    assert result["type"] == "result", result
    assert len(result["frames"]) > 2, result
    assert all(frame["kind"] == "network" for frame in result["frames"])
    assert result["frames"][-1]["state"]["nodes"]
    assert result["tests"] == [
        {"name": "visits all nodes", "passed": True, "message": "", "expected": None, "observed": None}
    ]


async def lesson_files_coverage(page: Page):
    lesson = await page.evaluate("CodeLab.getLesson()")
    runnable = [
        row
        for row in lesson["files"]
        if row.get("runnable", True)
    ]
    assert runnable
    for file_spec in runnable:
        filename = file_spec["filename"]
        await page.evaluate("filename => CodeLab.switchFile(filename, {focus: false})", filename)
        if lesson.get("entryMode") == "active":
            switched = await page.evaluate("CodeLab.getState()")
            assert switched["activeFile"] == filename
            assert switched["entry"] == filename
            assert switched["frameCount"] == 0
        await page.click("#runButton")
        state = await wait_for_run(page)
        expected_entry = filename if lesson.get("entryMode") == "active" else lesson["entry"]
        assert state["entry"] == expected_entry
        assert state["frameCount"] > 2, (filename, state)
        assert state["outputKind"] == "success", (filename, state["output"])
        assert "✓ " in state["output"], (filename, state["output"])
    await page.evaluate("CodeLab.reset()")


async def dijkstra_view_coverage(page: Page):
    _, frame = await native_view_frame(page)
    assert await frame.locator(".node[data-entity-id='A']").get_attribute("data-status") == "frontier"
    assert "A · 0" in await frame.locator("#queueItems").inner_text()
    await frame.evaluate("window.__stableNodeA = document.querySelector(\".node[data-entity-id='A']\"); null")

    await page.click("#runButton")
    state = await wait_for_run(page)
    for _ in range(state["frameCount"]):
        current = await page.evaluate("CodeLab.getState()")
        step = current.get("currentStep") or {}
        relax = (step.get("state") or {}).get("relax") or {}
        if step.get("changes") and relax.get("accepted"):
            break
        if current["frameIndex"] >= current["frameCount"] - 1:
            raise AssertionError("没有找到松弛成功的执行帧")
        await page.click("#nextButton")

    await frame.locator(".node[data-status='changed']").first.wait_for(state="attached")
    assert await frame.locator(".node[data-status='changed']").count() >= 1
    assert "写入 d(" in await frame.locator("#operationDetail").inner_text()
    assert await frame.evaluate("window.__stableNodeA === document.querySelector(\".node[data-entity-id='A']\")")

    for _ in range(state["frameCount"]):
        if await page.evaluate("CodeLab.getState().frameIndex >= CodeLab.getState().frameCount - 1"):
            break
        await page.click("#nextButton")
    await frame.locator(".edge[data-status='tree']").nth(4).wait_for(state="attached")

    assert await frame.locator(".node[data-status='settled']").count() == 6
    assert await frame.locator("#queueItems").inner_text() == "EMPTY"
    assert await frame.locator("#operationExpression").inner_text() == "6 NODES SETTLED"
    await page.evaluate("CodeLab.reset()")


async def desktop_flow(browser: Browser, url: str, shot_dir: Path | None = None):
    page, errors, external = await open_lab(browser, url, viewport={"width": 1600, "height": 900})
    initial = await page.evaluate("CodeLab.getState()")
    lesson = await page.evaluate("CodeLab.getLesson()")
    expected_entry = lesson["files"][0]["filename"] if lesson.get("entryMode") == "active" else lesson["entry"]
    assert initial["activeFile"] == expected_entry
    assert initial["viewMode"] == "native-html"
    assert initial["viewReady"] is True
    assert initial["frameCount"] == 0
    assert await page.locator("#visualizer > iframe.native-view-frame").count() == 1
    assert await page.locator(".statusbar").count() == 0
    assert await page.locator("#visualizationPane").get_attribute("style") is None
    assert await page.locator(".visualization-heading, .evidence-strip").count() == 0
    assert await page.locator("#visualizationTitle, #metrics, #sourceStep, #annotation").count() == 0
    assert await page.locator(".playback-panel").is_visible()
    if shot_dir is not None:
        shot_dir.mkdir(parents=True, exist_ok=True)
        await page.screenshot(path=str(shot_dir / "initial.png"))

    pane_box = await page.locator("#visualizationPane").bounding_box()
    visual_box = await page.locator(".visualizer-shell").bounding_box()
    playback_box = await page.locator(".playback-panel").bounding_box()
    assert pane_box and visual_box and playback_box
    assert abs(visual_box["y"] - pane_box["y"]) <= 1
    assert abs(visual_box["height"] + playback_box["height"] - pane_box["height"]) <= 1

    options = await page.evaluate(
        """() => {
          const value = CodeLab.getEditor().getRawOptions();
          return {
            minimap: value.minimap.enabled,
            glyphMargin: value.glyphMargin,
            folding: value.folding,
            stickyScroll: value.stickyScroll.enabled,
          };
        }"""
    )
    assert options == {"minimap": True, "glyphMargin": True, "folding": True, "stickyScroll": True}

    await native_view_coverage(page)
    await runtime_protocol_coverage(page)
    await lesson_files_coverage(page)
    await dijkstra_view_coverage(page)

    await page.click("#runButton")
    state = await wait_for_run(page)
    assert state["frameCount"] > 3, state
    assert state["outputKind"] == "success", state["output"]
    assert "✓ " in state["output"]
    assert await page.locator(".trace-current-line").count() == 1
    first_index = state["frameIndex"]
    await page.click("#nextButton")
    assert (await page.evaluate("CodeLab.getState().frameIndex")) == first_index + 1
    if shot_dir is not None:
        await page.evaluate("""() => {
          const next = document.querySelector("#nextButton");
          while (CodeLab.getState().frameIndex < CodeLab.getState().frameCount - 1) {
            const step = CodeLab.getState().currentStep || {};
            const focus = Array.isArray(step.focus) ? step.focus : [];
            if ((step.changes || []).length || focus.some(item => !["frontier", "boundary"].includes(item.role))) break;
            next.click();
          }
        }""")
        await page.wait_for_timeout(120)
        await page.screenshot(path=str(shot_dir / "active.png"))

    visual_before = await page.locator("#visualizationPane").evaluate(
        "element => ({width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height})"
    )
    sash_box = await page.locator("#panelSash").bounding_box()
    assert sash_box
    await page.mouse.move(sash_box["x"] + sash_box["width"] / 2, sash_box["y"] + 2)
    await page.mouse.down()
    await page.mouse.move(sash_box["x"] + sash_box["width"] / 2, sash_box["y"] - 90)
    await page.mouse.up()
    assert (await page.evaluate("CodeLab.getState().outputHeight")) > 180
    visual_after = await page.locator("#visualizationPane").evaluate(
        "element => ({width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height})"
    )
    assert visual_after == visual_before, (visual_before, visual_after)

    await page.evaluate("CodeLab.getModel().setValue('def broken(:\\n    pass')")
    await page.click("#runButton")
    broken = await wait_for_run(page, expect_frames=False)
    assert broken["outputKind"] == "error", broken
    marker_count = await page.evaluate(
        "monaco.editor.getModelMarkers({owner: 'notale-code-runtime', resource: CodeLab.getModel().uri}).length"
    )
    assert marker_count == 1

    await page.evaluate("CodeLab.reset()")
    generation = await page.evaluate("CodeLab.getState().runtimeGeneration")
    await page.evaluate("CodeLab.getModel().setValue('while True:\\n    pass')")
    await page.click("#runButton")
    await page.wait_for_function("CodeLab.getState().outputKind === 'error' && !CodeLab.getState().running", timeout=12_000)
    timeout_state = await page.evaluate("CodeLab.getState()")
    assert "已终止" in timeout_state["output"]
    await page.wait_for_function("CodeLab.getState().runtimeReady", timeout=30_000)
    assert (await page.evaluate("CodeLab.getState().runtimeGeneration")) > generation

    await page.evaluate("CodeLab.reset()")
    await page.click("#runButton")
    recovered = await wait_for_run(page)
    assert recovered["outputKind"] == "success", recovered["output"]
    if shot_dir is not None:
        await page.evaluate("""() => {
          const next = document.querySelector("#nextButton");
          while (CodeLab.getState().frameIndex < CodeLab.getState().frameCount - 1) next.click();
        }""")
        await page.wait_for_timeout(180)
        await page.screenshot(path=str(shot_dir / "final.png"))
        print(f"  screenshots  {shot_dir / 'initial.png'}, active.png, final.png")

    stage = await page.locator("#stage").evaluate(
        "element => { const r=element.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; }"
    )
    assert stage == {"x": 0, "y": 0, "width": 1600, "height": 900}, stage
    assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
    assert await page.evaluate("document.documentElement.scrollHeight <= innerHeight + 1")
    assert not external, external
    assert not errors, errors
    await page.close()
    print("  ok  execution, errors, timeout recovery, native view sandbox, fixed layout")


async def scaled_and_reduced_flow(browser: Browser, url: str):
    context = await browser.new_context(viewport={"width": 1200, "height": 760}, reduced_motion="reduce")
    page = await context.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    await page.goto(url, wait_until="domcontentloaded")
    await page.wait_for_function("window.CodeLab && CodeLab.getState().editorReady && CodeLab.getState().runtimeReady", timeout=30_000)
    stage = await page.locator("#stage").evaluate(
        "element => { const r=element.getBoundingClientRect(); return {width:r.width,height:r.height}; }"
    )
    assert stage["width"] <= 1200.1 and stage["height"] <= 760.1, stage
    await page.click("#runButton")
    state = await wait_for_run(page)
    assert state["playing"] is False
    _, frame = await native_view_frame(page)
    assert await frame.locator("html").get_attribute("data-reduced-motion") == "true"
    await page.focus("#panelSash")
    before = state["outputHeight"]
    await page.keyboard.press("ArrowUp")
    assert (await page.evaluate("CodeLab.getState().outputHeight")) == before + 8
    assert not errors, errors
    await context.close()
    print("  ok  scaled stage, keyboard sash, reduced motion")


async def main(shot_dir: Path | None = None):
    server, url = serve()
    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch()
            await desktop_flow(browser, url, shot_dir)
            await scaled_and_reduced_flow(browser, url)
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print("全部通过")


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description="Run the generated code-runtime browser checks.")
    cli.add_argument("--shot-dir", type=Path, help="Optional screenshot output directory")
    options = cli.parse_args()
    asyncio.run(main(options.shot_dir))
