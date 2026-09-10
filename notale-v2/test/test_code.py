"""Code behavior contracts; historical versions live in outer legacy."""
from __future__ import annotations

import asyncio
import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from playwright.async_api import async_playwright
from tools.check import code as code_check
from tools.code_scaffold import tool as code_runtime
from playwright.async_api import Browser, Page

class CodeRuntimeTests(unittest.TestCase):

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.pages = Path(temporary.name) / 'pages'
        code_runtime.scaffold(self.pages, 'page-01', 'Platform regression', 1)
        self.lesson = code_runtime.lesson_root(self.pages, 'page-01')

    def test_numpy_asset_matches_lock_and_missing_package_fails_preparation(self):
        package_root = code_runtime.VENDOR_ROOT / 'pyodide'
        package = json.loads((package_root / 'pyodide-lock.json').read_text())['packages']['numpy']
        wheel = package_root / package['file_name']
        self.assertEqual(hashlib.sha256(wheel.read_bytes()).hexdigest(), package['sha256'])
        original = Path.is_file
        with patch.object(Path, 'is_file', lambda path: False if path == wheel else original(path)):
            with self.assertRaisesRegex(FileNotFoundError, 'NumPy wheel'):
                code_runtime._ensure_shared_runtime(self.pages)

    def test_numpy_cold_start_restart_and_error_locations(self):
        spec = importlib.util.spec_from_file_location('workbench_check', self.lesson / 'check.py')
        check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(check)
        server, url = check.serve()

        async def run():
            async with async_playwright() as pw:
                browser = await pw.chromium.launch()
                try:
                    context = await browser.new_context()
                    await context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(url.rsplit('/', 1)[0]) else route.abort())
                    page = await context.new_page()
                    await page.route('**/probe.html', lambda route: route.fulfill(content_type='text/html', body='<!doctype html><title>Runtime test</title>'))
                    await page.goto(url + 'probe.html')
                    return await page.evaluate('async () => {\n                      const {WorkerRuntimeAdapter} = await import(\'./core/runtime-client.js\');\n                      const runtime = new WorkerRuntimeAdapter({workerUrl:\'./runtime/python-worker.js\'});\n                      const trace = \'import numpy as np\\ndef capture(frame, event, previous_state):\\n    return None\\ndef finalize(namespace, previous_state):\\n    return {"state":{"sum":int(np.sum(namespace["values"]))}}\';\n                      const tests = \'import numpy as np\\ndef run_tests(namespace):\\n    return [{"name":"numpy-sum","passed":bool(np.sum(namespace["values"]) == 6)}]\';\n                      const request = (source, traceSource=trace, testsSource=tests) => ({\n                        entry:\'starter.py\', files:[{filename:\'starter.py\',source}], traceSource, testsSource,\n                        seed:1, limits:{}});\n                      const source = \'import numpy as np\\nvalues = np.array([1,2,3])\';\n                      try {\n                        const cold = await runtime.run(request(source));\n                        const repeated = await runtime.run(request(source));\n                        runtime.restart(\'test\');\n                        const restarted = await runtime.run(request(source));\n                        const errors = [];\n                        const noop = \'def capture(frame,event,previous_state):\\n    return None\';\n                        for (const req of [\n                          request(\'x = 1\\nraise ValueError("learner")\', noop, \'\'),\n                          request(source, \'import numpy\\nraise ValueError("init")\', \'\'),\n                          request(source, noop+\'\\ndef before_execution(namespace):\\n    raise ValueError("before")\', \'\'),\n                          request(source, \'def capture(frame,event,previous_state):\\n    raise KeyError("__name__")\', \'\'),\n                          request(source, noop+\'\\ndef finalize(namespace,previous_state):\\n    raise ValueError("finalize")\', \'\'),\n                          request(source, noop, \'def run_tests(namespace):\\n    raise ValueError("tests")\'),\n                        ]) errors.push(await runtime.run(req));\n                        return {cold,repeated,restarted,errors};\n                      } finally { runtime.dispose(); }\n                    }')
                finally:
                    await browser.close()
        try:
            result = asyncio.run(asyncio.wait_for(run(), 45))
        finally:
            server.shutdown()
            server.server_close()
        for name in ('cold', 'repeated', 'restarted'):
            self.assertEqual(result[name]['type'], 'result', result[name])
            self.assertEqual(result[name]['frames'][-1]['state']['sum'], 6)
            self.assertTrue(result[name]['tests'][0]['passed'])
        expected = [('runtime', 'starter.py', 2), ('trace', 'lesson/trace.py', 2), ('trace', 'lesson/trace.py', 4), ('trace', 'lesson/trace.py', 2), ('trace', 'lesson/trace.py', 4), ('tests', 'lesson/tests.py', 2)]
        for actual, (kind, filename, line) in zip(result['errors'], expected):
            self.assertEqual(actual['error']['kind'], kind, actual)
            self.assertEqual(actual['error']['source']['file'], filename, actual)
            self.assertEqual(actual['error']['source']['line'], line, actual)
        self.assertIn('direct cause', result['errors'][3]['error']['traceback'])

    def test_lesson_check_accepts_trace_that_would_hit_frame_limit_before_timeout(self):
        trace = self.lesson / 'lesson/trace.py'
        trace.write_text(trace.read_text() + '\n_lesson_capture = capture\ndef capture(frame, event, previous_state):\n    result = _lesson_capture(frame, event, previous_state)\n    return result if result is not None else {"state": {"items": []}}\n')
        result, _ = code_check.run_browser_check(self.pages, 'page-01')
        self.assertTrue(result.startswith('✓ 代码工作台自检通过'), result)
        self.assertNotIn('timeout recovery', result)

    def test_single_frame_lesson_without_tests_is_valid(self):
        root = self.lesson / 'lesson'
        (root / 'starter.py').write_text('value = 42\n')
        (root / 'trace.py').write_text('def capture(frame, event, previous_state):\n    return None\ndef finalize(namespace, previous_state):\n    return {"state": {"items": [namespace["value"]]}}\n')
        lesson = root / 'lesson.js'
        lesson.write_text(lesson.read_text().replace('testsUrl: "./lesson/tests.py"', 'testsUrl: null'))
        result, _ = code_check.run_browser_check(self.pages, 'page-01')
        self.assertTrue(result.startswith('✓ 代码工作台自检通过'), result)

    def test_lesson_errors_are_not_hidden_by_platform_split(self):
        root = self.lesson / 'lesson'
        for path, source, expected in (('tests.py', 'def run_tests(namespace):\n    return [{"name":"lesson-sentinel", "passed":False}]\n', 'lesson-sentinel'), ('view/render.js', 'window.renderNotaleView = () => { throw new Error("view-sentinel"); };', 'view')):
            target = root / path
            original = target.read_text()
            with self.subTest(path=path):
                try:
                    target.write_text(source)
                    result, _ = code_check.run_browser_check(self.pages, 'page-01')
                    self.assertTrue(result.startswith('✗'), result)
                    self.assertIn(expected, result.lower())
                finally:
                    target.write_text(original)

    def test_platform_probes_are_not_shipped_to_lessons(self):
        source = (self.lesson / 'check.py').read_text()
        for platform_only in ('runtime_protocol_coverage', 'native_view_coverage', 'getRawOptions', 'panelSash', 'SecurityError', 'contract-probe', 'def broken('):
            self.assertNotIn(platform_only, source)

    def protection(self, capture):
        spec = importlib.util.spec_from_file_location('workbench_check', self.lesson / 'check.py')
        check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(check)
        server, url = check.serve()

        async def run():
            async with async_playwright() as pw:
                browser = await pw.chromium.launch()
                try:
                    page = await browser.new_page()
                    await page.route('**/probe.html', lambda route: route.fulfill(content_type='text/html', body='<!doctype html><title>Runtime test</title>'))
                    await page.goto(url + 'probe.html')
                    return await asyncio.wait_for(page.evaluate("async capture => {\n                      const {WorkerRuntimeAdapter} = await import('./core/runtime-client.js');\n                      const runtime = new WorkerRuntimeAdapter({\n                        workerUrl: './runtime/python-worker.js', timeoutMs: 1000\n                      });\n                      const request = source => ({entry:'starter.py',\n                        files:[{filename:'starter.py', source}], traceSource:capture,\n                        testsSource:'', seed:1, limits:{maxFrames:16}});\n                      try {\n                        await runtime.start();\n                        const before = runtime.generation;\n                        let failure;\n                        try { failure = await runtime.run(request('while True:\\n    pass')); }\n                        catch (error) { failure = {error:{kind:error.kind}}; }\n                        await runtime.start();\n                        const after = runtime.generation;\n                        const recovered = await runtime.run(request('value = 42'));\n                        return {before, after, failure, recovered};\n                      } finally { runtime.dispose(); }\n                    }", capture), timeout=30)
                finally:
                    await browser.close()
        try:
            return asyncio.run(run())
        finally:
            server.shutdown()
            server.server_close()

    def test_timeout_without_trace_rebuilds_worker_and_recovers(self):
        result = self.protection('def capture(frame, event, previous_state):\n    return None\n')
        self.assertEqual(result['failure']['error']['kind'], 'timeout')
        self.assertGreater(result['after'], result['before'])
        self.assertEqual(result['recovered']['type'], 'result')

    def test_trace_limit_stops_execution_without_requiring_restart(self):
        result = self.protection('def capture(frame, event, previous_state):\n    return {"state": {}}\n')
        self.assertEqual(result['failure']['error']['kind'], 'limit')
        self.assertEqual(len(result['failure']['frames']), 16)
        self.assertEqual(result['after'], result['before'])
        self.assertEqual(result['recovered']['type'], 'result')
workbench_platform_spec = importlib.util.spec_from_file_location('lesson_check', code_runtime.TEMPLATE_ROOT / 'check.py')
workbench_platform_lesson_check = importlib.util.module_from_spec(workbench_platform_spec)
workbench_platform_spec.loader.exec_module(workbench_platform_lesson_check)
workbench_platform_open_lab = workbench_platform_lesson_check.open_lab
workbench_platform_native_view_frame = workbench_platform_lesson_check.native_view_frame
workbench_platform_lesson_files_coverage = workbench_platform_lesson_check.lesson_files_coverage

async def wait_for_run(page, expect_frames=True):
    await page.wait_for_function('!CodeLab.getState().running', timeout=15000)
    state = await page.evaluate('CodeLab.getState()')
    if expect_frames:
        assert state['frameCount'] > 0, state
    return state

async def native_view_coverage(page: Page):
    iframe, frame = await workbench_platform_native_view_frame(page)
    assert await iframe.get_attribute('sandbox') == 'allow-scripts'
    assert await iframe.get_attribute('title') == '算法状态可视化'
    assert await frame.locator('body > *').count() > 0
    assert await frame.locator('html').get_attribute('data-reason') in {'initial', 'reset'}
    packet_meta = await frame.locator('html').evaluate('element => ({index: element.dataset.frameIndex, count: element.dataset.frameCount, playing: element.dataset.playing, speed: element.dataset.speed, reduced: element.dataset.reducedMotion})')
    assert packet_meta['index'] == '-1'
    assert packet_meta['count'] == '0'
    assert packet_meta['playing'] == 'false'
    assert packet_meta['speed'] == '1'
    assert packet_meta['reduced'] in {'true', 'false'}
    assert await page.evaluate("() => { window.__nativeViewFrame = document.querySelector('#visualizer iframe'); return true; }")
    denied_parent = await frame.evaluate('() => { try { void parent.document; return "allowed"; } catch (error) { return error.name; } }')
    assert denied_parent == 'SecurityError', denied_parent
    denied_fetch = await frame.evaluate('() => { try { fetch("./forbidden.json"); return "allowed"; } catch (error) { return error.message; } }')
    assert '不允许使用 fetch' in denied_fetch, denied_fetch
    mode = await page.evaluate('() => {\n          const step = structuredClone(CodeLab.getState().currentStep);\n          step.sequence = Number(step.sequence || 0) + 1;\n          return CodeLab.previewStep(step);\n        }')
    assert mode == 'native-html'
    await frame.wait_for_function("document.documentElement.dataset.reason === 'preview'")
    assert await frame.locator('html').get_attribute('data-previous-sequence') != ''
    assert await page.evaluate("() => window.__nativeViewFrame === document.querySelector('#visualizer iframe')")
    await frame.evaluate("window.__savedRenderNotaleView = window.renderNotaleView; window.renderNotaleView = () => { throw new Error('contract-probe'); }; null")
    await page.evaluate('CodeLab.previewStep(CodeLab.getState().currentStep)')
    await page.locator('#visualizerError').wait_for(state='visible')
    assert 'contract-probe' in await page.locator('#visualizerError').inner_text()
    await frame.evaluate('window.renderNotaleView = window.__savedRenderNotaleView; null')
    await page.evaluate('CodeLab.previewStep(CodeLab.getState().currentStep)')
    await page.locator('#visualizerError').wait_for(state='hidden')
    await frame.evaluate('window.renderNotaleView = undefined')
    await page.evaluate('CodeLab.previewStep(CodeLab.getState().currentStep)')
    await page.locator('#visualizerError').wait_for(state='visible')
    assert '必须定义 window.renderNotaleView' in await page.locator('#visualizerError').inner_text()
    await frame.evaluate('window.renderNotaleView = window.__savedRenderNotaleView; null')
    await page.evaluate('CodeLab.previewStep(CodeLab.getState().currentStep)')
    await page.locator('#visualizerError').wait_for(state='hidden')
    await page.evaluate('CodeLab.reset()')
    await frame.wait_for_function("document.documentElement.dataset.reason === 'reset'")
    assert await frame.locator('html').get_attribute('data-previous-sequence') == ''
    assert await page.evaluate("() => window.__nativeViewFrame === document.querySelector('#visualizer iframe')")

async def runtime_protocol_coverage(page: Page):
    result = await page.evaluate('async () => {\n          const worker = new Worker(\'./runtime/python-worker.js\', {type: \'module\'});\n          const source = `from helper import graph\n\nqueue = ["a"]\nvisited = []\nwhile queue:\n    node = queue.pop(0)\n    if node in visited:\n        continue\n    visited.append(node)\n    queue.extend(next_node for next_node in graph[node] if next_node not in visited)\n`;\n          const helper = `graph = {"a": ["b", "c"], "b": ["d"], "c": ["d"], "d": []}\n`;\n          const trace = `def capture(frame, event, previous_state):\n    graph = frame.f_globals.get("graph")\n    if not isinstance(graph, dict):\n        return None\n    queue = list(frame.f_globals.get("queue", []))\n    visited = list(frame.f_globals.get("visited", []))\n    nodes = [{"id": key, "label": key, "state": "visited" if key in visited else ""} for key in graph]\n    edges = [{"source": source, "target": target} for source, targets in graph.items() for target in targets]\n    return {"kind": "network", "state": {"nodes": nodes, "edges": edges, "queue": queue}, "focus": ([{"id": queue[0], "role": "frontier"}] if queue else []), "changes": [], "metrics": {"visited": len(visited)}}\n`;\n          const tests = `def run_tests(namespace):\n    return [{"name": "visits all nodes", "passed": set(namespace.get("visited", [])) == {"a", "b", "c", "d"}}]\n`;\n          return await new Promise((resolve, reject) => {\n            const timer = setTimeout(() => { worker.terminate(); reject(new Error(\'protocol worker timeout\')); }, 15000);\n            worker.addEventListener(\'error\', event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); });\n            worker.addEventListener(\'message\', event => {\n              const data = event.data || {};\n              if (data.type === \'fatal\') {\n                clearTimeout(timer); worker.terminate(); reject(new Error(data.message));\n              } else if (data.type === \'ready\') {\n                worker.postMessage({\n                  type: \'run\', id: 91, entry: \'starter.py\',\n                  files: [{filename: \'starter.py\', source}, {filename: \'helper.py\', source: helper}],\n                  traceSource: trace, testsSource: tests, seed: 3,\n                  limits: {maxFrames: 300, maxPayloadBytes: 1000000}\n                });\n              } else if (data.id === 91) {\n                clearTimeout(timer); worker.terminate(); resolve(data);\n              }\n            });\n          });\n        }')
    assert result['type'] == 'result', result
    assert len(result['frames']) > 2, result
    assert all((frame['kind'] == 'network' for frame in result['frames']))
    assert result['frames'][-1]['state']['nodes']
    assert result['tests'] == [{'name': 'visits all nodes', 'passed': True, 'message': '', 'expected': None, 'observed': None}]

async def desktop_flow(browser: Browser, url: str, shot_dir: Path | None=None):
    page, errors, external = await workbench_platform_open_lab(browser, url, viewport={'width': 1600, 'height': 900})
    initial = await page.evaluate('CodeLab.getState()')
    lesson = await page.evaluate('CodeLab.getLesson()')
    expected_entry = lesson['files'][0]['filename'] if lesson.get('entryMode') == 'active' else lesson['entry']
    assert initial['activeFile'] == expected_entry
    assert initial['viewMode'] == 'native-html'
    assert initial['viewReady'] is True
    assert initial['frameCount'] == 0
    assert await page.locator('#visualizer > iframe.native-view-frame').count() == 1
    assert await page.locator('.statusbar').count() == 0
    assert await page.locator('#visualizationPane').get_attribute('style') is None
    assert await page.locator('.visualization-heading, .evidence-strip').count() == 0
    assert await page.locator('#visualizationTitle, #metrics, #sourceStep, #annotation').count() == 0
    assert await page.locator('.playback-panel').is_visible()
    assert await page.locator('#playButton .codicon').count() == 1
    assert await page.locator('#playButtonIcon').evaluate("element => element.classList.contains('codicon-play')")
    if shot_dir is not None:
        shot_dir.mkdir(parents=True, exist_ok=True)
        await page.screenshot(path=str(shot_dir / 'initial.png'))
    pane_box = await page.locator('#visualizationPane').bounding_box()
    visual_box = await page.locator('.visualizer-shell').bounding_box()
    playback_box = await page.locator('.playback-panel').bounding_box()
    assert pane_box and visual_box and playback_box
    assert abs(visual_box['y'] - pane_box['y']) <= 1
    assert abs(visual_box['height'] + playback_box['height'] - pane_box['height']) <= 1
    options = await page.evaluate('() => {\n          const value = CodeLab.getEditor().getRawOptions();\n          return {\n            minimap: value.minimap.enabled,\n            glyphMargin: value.glyphMargin,\n            folding: value.folding,\n            stickyScroll: value.stickyScroll.enabled,\n          };\n        }')
    assert options == {'minimap': True, 'glyphMargin': True, 'folding': True, 'stickyScroll': True}
    await native_view_coverage(page)
    await runtime_protocol_coverage(page)
    await workbench_platform_lesson_files_coverage(page)
    await page.click('#runButton')
    state = await wait_for_run(page)
    assert state['frameCount'] > 3, state
    assert state['outputKind'] == 'success', state['output']
    assert '✓ ' in state['output']
    assert state['playing'] is True, state
    assert await page.locator('#playButtonIcon').evaluate("element => element.classList.contains('codicon-debug-pause')")
    assert not await page.locator('#playButtonIcon').evaluate("element => element.classList.contains('codicon-play')")
    autoplay_start = state['frameIndex']
    await page.wait_for_function('start => CodeLab.getState().frameIndex > start || !CodeLab.getState().playing', arg=autoplay_start, timeout=2000)
    autoplay_state = await page.evaluate('CodeLab.getState()')
    assert autoplay_state['frameIndex'] > autoplay_start, autoplay_state
    if autoplay_state['playing']:
        await page.click('#playButton')
    assert await page.locator('#playButtonIcon').evaluate("element => element.classList.contains('codicon-play')")
    assert not await page.locator('#playButtonIcon').evaluate("element => element.classList.contains('codicon-debug-pause')")
    assert await page.locator('.trace-current-line').count() == 1
    first_index = await page.evaluate('CodeLab.getState().frameIndex')
    await page.click('#nextButton')
    assert await page.evaluate('CodeLab.getState().frameIndex') == first_index + 1
    if shot_dir is not None:
        await page.evaluate('() => {\n          const next = document.querySelector("#nextButton");\n          while (CodeLab.getState().frameIndex < CodeLab.getState().frameCount - 1) {\n            const step = CodeLab.getState().currentStep || {};\n            const focus = Array.isArray(step.focus) ? step.focus : [];\n            if ((step.changes || []).length || focus.some(item => !["frontier", "boundary"].includes(item.role))) break;\n            next.click();\n          }\n        }')
        await page.wait_for_timeout(120)
        await page.screenshot(path=str(shot_dir / 'active.png'))
    visual_before = await page.locator('#visualizationPane').evaluate('element => ({width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height})')
    sash_box = await page.locator('#panelSash').bounding_box()
    assert sash_box
    await page.mouse.move(sash_box['x'] + sash_box['width'] / 2, sash_box['y'] + 2)
    await page.mouse.down()
    await page.mouse.move(sash_box['x'] + sash_box['width'] / 2, sash_box['y'] - 90)
    await page.mouse.up()
    assert await page.evaluate('CodeLab.getState().outputHeight') > 180
    visual_after = await page.locator('#visualizationPane').evaluate('element => ({width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height})')
    assert visual_after == visual_before, (visual_before, visual_after)
    await page.evaluate("CodeLab.getModel().setValue('def broken(:\\n    pass')")
    await page.click('#runButton')
    broken = await wait_for_run(page, expect_frames=False)
    assert broken['outputKind'] == 'error', broken
    marker_count = await page.evaluate("monaco.editor.getModelMarkers({owner: 'notale-code-runtime', resource: CodeLab.getModel().uri}).length")
    assert marker_count == 1
    await page.evaluate('CodeLab.reset()')
    await page.click('#runButton')
    recovered = await wait_for_run(page)
    assert recovered['outputKind'] == 'success', recovered['output']
    if shot_dir is not None:
        await page.evaluate('() => {\n          const next = document.querySelector("#nextButton");\n          while (CodeLab.getState().frameIndex < CodeLab.getState().frameCount - 1) next.click();\n        }')
        await page.wait_for_timeout(180)
        await page.screenshot(path=str(shot_dir / 'final.png'))
        print(f"  screenshots  {shot_dir / 'initial.png'}, active.png, final.png")
    stage = await page.locator('#stage').evaluate('element => { const r=element.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; }')
    assert stage == {'x': 0, 'y': 0, 'width': 1600, 'height': 900}, stage
    assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    assert await page.evaluate('document.documentElement.scrollHeight <= innerHeight + 1')
    assert not external, external
    assert not errors, errors
    await page.close()
    print('  ok  execution, errors, reset, native view sandbox, fixed layout')

async def scaled_and_reduced_flow(browser: Browser, url: str):
    context = await browser.new_context(viewport={'width': 1200, 'height': 760}, reduced_motion='reduce')
    page = await context.new_page()
    errors: list[str] = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    await page.goto(url, wait_until='domcontentloaded')
    await page.wait_for_function('window.CodeLab && CodeLab.getState().editorReady && CodeLab.getState().runtimeReady', timeout=30000)
    stage = await page.locator('#stage').evaluate('element => { const r=element.getBoundingClientRect(); return {width:r.width,height:r.height}; }')
    assert stage['width'] <= 1200.1 and stage['height'] <= 760.1, stage
    await page.click('#runButton')
    state = await wait_for_run(page)
    assert state['playing'] is False
    assert state['frameIndex'] == state['frameCount'] - 1
    _, frame = await workbench_platform_native_view_frame(page)
    assert await frame.locator('html').get_attribute('data-reduced-motion') == 'true'
    await page.focus('#panelSash')
    before = state['outputHeight']
    await page.keyboard.press('ArrowUp')
    assert await page.evaluate('CodeLab.getState().outputHeight') == before + 8
    assert not errors, errors
    await context.close()
    print('  ok  scaled stage, keyboard sash, reduced motion')

class WorkbenchPlatformTests(unittest.TestCase):

    def test_fixed_editor_runtime_sandbox_playback_and_layout(self):
        with tempfile.TemporaryDirectory() as tmp:
            pages = Path(tmp) / 'pages'
            code_runtime.scaffold(pages, 'page-01', 'Fixed platform fixture', 1)
            original = workbench_platform_lesson_check.PAGES
            workbench_platform_lesson_check.PAGES = code_runtime.lesson_root(pages, 'page-01')
            server, url = workbench_platform_lesson_check.serve()

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
                workbench_platform_lesson_check.PAGES = original
