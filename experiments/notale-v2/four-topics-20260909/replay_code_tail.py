"""Replay historical Python payloads in today's Worker, without an LLM or run edits."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
sys.path.insert(0, str(ROOT))
from core import code_runtime


def snapshots():
    source = RUNS_ROOT / 'neural-check-trim-0909-193805-neural/trace.jsonl'
    files, selected = {}, {}
    for row in map(json.loads, source.read_text().splitlines()):
        tool = row.get('toolUseResult')
        if not isinstance(tool, dict) or tool.get('page') != 'page-11' or 'arguments' not in tool:
            continue
        args = json.loads(tool['arguments'])
        path = args.get('file_path', '')
        if path.endswith('.py'):
            name = Path(path).name
            if tool['name'] == 'Write':
                files[name] = args['content']
            elif tool['name'] == 'Edit' and name in files:
                old = args['old_string']
                assert old in files[name], (name, old)
                files[name] = files[name].replace(old, args['new_string'],
                                                  -1 if args.get('replace_all') else 1)
        if tool['name'] == 'Check':
            label = ('numpy' if 'ModuleNotFoundError' in tool['output'] else
                     'name_key' if "KeyError: '__name__'" in tool['output'] else None)
            if label and label not in selected:
                selected[label] = dict(files)
        if len(selected) == 2:
            break
    assert len(selected) == 2
    return selected


async def replay(url, cases):
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        try:
            page = await browser.new_page()
            await page.route('**/probe.html', lambda route: route.fulfill(
                content_type='text/html', body='<!doctype html><title>Historical replay</title>'))
            await page.goto(url + 'probe.html')
            results = await page.evaluate('''async cases => {
              const {WorkerRuntimeAdapter} = await import('./core/runtime-client.js');
              const results = {};
              for (const [label, files] of Object.entries(cases)) {
                const runtime = new WorkerRuntimeAdapter({workerUrl:'./runtime/python-worker.js', timeoutMs:15000});
                try {
                  results[label] = await runtime.run({entry:'starter.py',
                    files:[{filename:'starter.py',source:files['starter.py']}],
                    traceSource:files['trace.py'], testsSource:files['tests.py'], seed:17, limits:{}});
                } finally { runtime.dispose(); }
              }
              return results;
            }''', cases)
            # A broken deployment must fail before ready, not become a lesson error.
            await page.context.route('**/*.whl', lambda route: route.fulfill(status=404, body='missing'))
            failure = await page.evaluate('''async () => {
              const {WorkerRuntimeAdapter} = await import('./core/runtime-client.js');
              const runtime = new WorkerRuntimeAdapter({workerUrl:'./runtime/python-worker.js'});
              try {
                await runtime.start();
                return {ready:runtime.ready};
              } catch (error) {
                return {ready:runtime.ready, kind:error.kind, message:error.message, source:error.source};
              } finally { runtime.dispose(); }
            }''')
            assert not failure['ready'] and failure['kind'] == 'initialization', failure
            assert not failure.get('source'), failure
            print(json.dumps(dict(missing_package=failure), ensure_ascii=False))
            return results
        finally:
            await browser.close()


def main():
    with tempfile.TemporaryDirectory(prefix='notale-code-tail-') as temp:
        pages = Path(temp) / 'pages'
        code_runtime.scaffold(pages, 'page-11', 'Historical replay', 1)
        spec = importlib.util.spec_from_file_location('replay_check', code_runtime.lesson_root(pages, 'page-11') / 'check.py')
        check = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(check)
        server, url = check.serve()
        try:
            results = asyncio.run(asyncio.wait_for(replay(url, snapshots()), 60))
            for label, message, line in [('numpy', "KeyError: 'W2'", 101),
                                         ('name_key', "KeyError: '__name__'", 104)]:
                error = results[label]['error']
                assert error['kind'] == 'trace' and error['message'] == message, error
                assert error['source'] == {'file': 'lesson/trace.py', 'line': line, 'column': 1}, error
            for label, result in results.items():
                print(json.dumps(dict(snapshot=label, type=result['type'], error=result.get('error'),
                                      tests=result.get('tests'), frames=len(result.get('frames', []))), ensure_ascii=False))
        finally:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    main()
