"""Fixed workbench regression; never copied to or run by generated-lesson Check."""
import asyncio
import importlib.util
from pathlib import Path
import tempfile
import unittest

from playwright.async_api import Browser, Page, async_playwright
from core import code_runtime

spec = importlib.util.spec_from_file_location("lesson_check", code_runtime.TEMPLATE_ROOT / "check.py")
lesson_check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lesson_check)
open_lab = lesson_check.open_lab
native_view_frame = lesson_check.native_view_frame
lesson_files_coverage = lesson_check.lesson_files_coverage


async def wait_for_run(page, expect_frames=True):
    # Platform probes deliberately exercise invalid source as well as normal runs.
    await page.wait_for_function("!CodeLab.getState().running", timeout=15000)
    state = await page.evaluate("CodeLab.getState()")
    if expect_frames:
        assert state["frameCount"] > 0, state
    return state


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
    assert await page.locator("#playButton .codicon").count() == 1
    assert await page.locator("#playButtonIcon").evaluate("element => element.classList.contains('codicon-play')")
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

    await page.click("#runButton")
    state = await wait_for_run(page)
    assert state["frameCount"] > 3, state
    assert state["outputKind"] == "success", state["output"]
    assert "✓ " in state["output"]
    assert state["playing"] is True, state
    assert await page.locator("#playButtonIcon").evaluate("element => element.classList.contains('codicon-debug-pause')")
    assert not await page.locator("#playButtonIcon").evaluate("element => element.classList.contains('codicon-play')")
    autoplay_start = state["frameIndex"]
    await page.wait_for_function(
        "start => CodeLab.getState().frameIndex > start || !CodeLab.getState().playing",
        arg=autoplay_start,
        timeout=2_000,
    )
    autoplay_state = await page.evaluate("CodeLab.getState()")
    assert autoplay_state["frameIndex"] > autoplay_start, autoplay_state
    if autoplay_state["playing"]:
        await page.click("#playButton")
    assert await page.locator("#playButtonIcon").evaluate("element => element.classList.contains('codicon-play')")
    assert not await page.locator("#playButtonIcon").evaluate("element => element.classList.contains('codicon-debug-pause')")
    assert await page.locator(".trace-current-line").count() == 1
    first_index = await page.evaluate("CodeLab.getState().frameIndex")
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
    print("  ok  execution, errors, reset, native view sandbox, fixed layout")


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
    assert state["frameIndex"] == state["frameCount"] - 1
    _, frame = await native_view_frame(page)
    assert await frame.locator("html").get_attribute("data-reduced-motion") == "true"
    await page.focus("#panelSash")
    before = state["outputHeight"]
    await page.keyboard.press("ArrowUp")
    assert (await page.evaluate("CodeLab.getState().outputHeight")) == before + 8
    assert not errors, errors
    await context.close()
    print("  ok  scaled stage, keyboard sash, reduced motion")


class WorkbenchPlatformTests(unittest.TestCase):
    def test_fixed_editor_runtime_sandbox_playback_and_layout(self):
        with tempfile.TemporaryDirectory() as tmp:
            pages = Path(tmp) / "pages"
            code_runtime.scaffold(pages, "page-01", "Fixed platform fixture", 1)
            original = lesson_check.PAGES
            lesson_check.PAGES = code_runtime.lesson_root(pages, "page-01")
            server, url = lesson_check.serve()
            async def run():
                async with async_playwright() as pw:
                    browser = await pw.chromium.launch()
                    try:
                        await desktop_flow(browser, url)
                        await scaled_and_reduced_flow(browser, url)
                    finally:
                        await browser.close()
            try:
                asyncio.run(run())
            finally:
                server.shutdown()
                server.server_close()
                lesson_check.PAGES = original


if __name__ == "__main__":
    unittest.main()
