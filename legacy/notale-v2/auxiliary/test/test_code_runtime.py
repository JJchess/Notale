"""Offline platform protection tests, separate from generated-lesson Check."""
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
                    # No external package download can make this test pass.
                    await context.route('**/*', lambda route: route.continue_()
                                        if route.request.url.startswith(url.rsplit('/', 1)[0])
                                        else route.abort())
                    page = await context.new_page()
                    await page.route('**/probe.html', lambda route: route.fulfill(
                        content_type='text/html', body='<!doctype html><title>Runtime test</title>'))
                    await page.goto(url + 'probe.html')
                    return await page.evaluate('''async () => {
                      const {WorkerRuntimeAdapter} = await import('./core/runtime-client.js');
                      const runtime = new WorkerRuntimeAdapter({workerUrl:'./runtime/python-worker.js'});
                      const trace = 'import numpy as np\\ndef capture(frame, event, previous_state):\\n    return None\\ndef finalize(namespace, previous_state):\\n    return {"state":{"sum":int(np.sum(namespace["values"]))}}';
                      const tests = 'import numpy as np\\ndef run_tests(namespace):\\n    return [{"name":"numpy-sum","passed":bool(np.sum(namespace["values"]) == 6)}]';
                      const request = (source, traceSource=trace, testsSource=tests) => ({
                        entry:'starter.py', files:[{filename:'starter.py',source}], traceSource, testsSource,
                        seed:1, limits:{}});
                      const source = 'import numpy as np\\nvalues = np.array([1,2,3])';
                      try {
                        const cold = await runtime.run(request(source));
                        const repeated = await runtime.run(request(source));
                        runtime.restart('test');
                        const restarted = await runtime.run(request(source));
                        const errors = [];
                        const noop = 'def capture(frame,event,previous_state):\\n    return None';
                        for (const req of [
                          request('x = 1\\nraise ValueError("learner")', noop, ''),
                          request(source, 'import numpy\\nraise ValueError("init")', ''),
                          request(source, noop+'\\ndef before_execution(namespace):\\n    raise ValueError("before")', ''),
                          request(source, 'def capture(frame,event,previous_state):\\n    raise KeyError("__name__")', ''),
                          request(source, noop+'\\ndef finalize(namespace,previous_state):\\n    raise ValueError("finalize")', ''),
                          request(source, noop, 'def run_tests(namespace):\\n    raise ValueError("tests")'),
                        ]) errors.push(await runtime.run(req));
                        return {cold,repeated,restarted,errors};
                      } finally { runtime.dispose(); }
                    }''')
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
        expected = [('runtime','starter.py',2), ('trace','lesson/trace.py',2),
                    ('trace','lesson/trace.py',4), ('trace','lesson/trace.py',2),
                    ('trace','lesson/trace.py',4), ('tests','lesson/tests.py',2)]
        for actual, (kind, filename, line) in zip(result['errors'], expected):
            self.assertEqual(actual['error']['kind'], kind, actual)
            self.assertEqual(actual['error']['source']['file'], filename, actual)
            self.assertEqual(actual['error']['source']['line'], line, actual)
        self.assertIn('direct cause', result['errors'][3]['error']['traceback'])

    def test_lesson_check_accepts_trace_that_would_hit_frame_limit_before_timeout(self):
        # Normal lesson behavior stays unchanged. Unlike the template trace,
        # this adapter also captures unrelated source such as an infinite loop.
        trace = self.lesson / 'lesson/trace.py'
        trace.write_text(trace.read_text() + '''
_lesson_capture = capture
def capture(frame, event, previous_state):
    result = _lesson_capture(frame, event, previous_state)
    return result if result is not None else {"state": {"items": []}}
''')
        result, _ = code_check.run_browser_check(self.pages, 'page-01')
        self.assertTrue(result.startswith('✓ 代码工作台自检通过'), result)
        self.assertNotIn('timeout recovery', result)

    def test_single_frame_lesson_without_tests_is_valid(self):
        root = self.lesson / 'lesson'
        (root / 'starter.py').write_text('value = 42\n')
        (root / 'trace.py').write_text('''def capture(frame, event, previous_state):
    return None
def finalize(namespace, previous_state):
    return {"state": {"items": [namespace["value"]]}}
''')
        lesson = root / 'lesson.js'
        lesson.write_text(lesson.read_text().replace('testsUrl: "./lesson/tests.py"', 'testsUrl: null'))
        result, _ = code_check.run_browser_check(self.pages, 'page-01')
        self.assertTrue(result.startswith('✓ 代码工作台自检通过'), result)

    def test_lesson_errors_are_not_hidden_by_platform_split(self):
        root = self.lesson / 'lesson'
        for path, source, expected in (
            ('tests.py', 'def run_tests(namespace):\n    return [{"name":"lesson-sentinel", "passed":False}]\n', 'lesson-sentinel'),
            ('view/render.js', 'window.renderNotaleView = () => { throw new Error("view-sentinel"); };', 'view'),
        ):
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
        for platform_only in ('runtime_protocol_coverage', 'native_view_coverage', 'getRawOptions',
                              'panelSash', 'SecurityError', 'contract-probe', 'def broken('):
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
                    # Serve the real runtime without launching Monaco or a lesson.
                    await page.route('**/probe.html', lambda route: route.fulfill(
                        content_type='text/html', body='<!doctype html><title>Runtime test</title>'))
                    await page.goto(url + 'probe.html')
                    return await asyncio.wait_for(page.evaluate('''async capture => {
                      const {WorkerRuntimeAdapter} = await import('./core/runtime-client.js');
                      const runtime = new WorkerRuntimeAdapter({
                        workerUrl: './runtime/python-worker.js', timeoutMs: 1000
                      });
                      const request = source => ({entry:'starter.py',
                        files:[{filename:'starter.py', source}], traceSource:capture,
                        testsSource:'', seed:1, limits:{maxFrames:16}});
                      try {
                        await runtime.start();
                        const before = runtime.generation;
                        let failure;
                        try { failure = await runtime.run(request('while True:\\n    pass')); }
                        catch (error) { failure = {error:{kind:error.kind}}; }
                        await runtime.start();
                        const after = runtime.generation;
                        const recovered = await runtime.run(request('value = 42'));
                        return {before, after, failure, recovered};
                      } finally { runtime.dispose(); }
                    }''', capture), timeout=30)
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


if __name__ == '__main__':
    unittest.main()
