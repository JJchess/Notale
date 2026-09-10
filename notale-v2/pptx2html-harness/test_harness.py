import copy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

from agent import Agent, Record
from model import MODEL, Gemini
from run import prepare, check_delivery
from sandbox import Sandbox
from tools import Tools


def response(message, finish='stop'):
    return {'id': 'fixture', 'object': 'chat.completion', 'created': 1, 'model': MODEL,
            'choices': [{'index': 0, 'finish_reason': finish, 'message': message}]}


def final():
    return response({'role': 'assistant', 'content': 'Done'})


def calls(*items):
    return response({'role': 'assistant', 'content': None, 'tool_calls': list(items)}, 'tool_calls')


def tool(name, arguments, ident='c1'):
    return {'id': ident, 'type': 'function', 'function': {'name': name, 'arguments': json.dumps(arguments)},
            'extra_content': {'google': {'thought_signature': 'opaque-fixture-signature'}}}


class Fixture:
    def __init__(self, replies):
        self.replies, self.requests = iter(replies), []

    async def complete(self, request):
        self.requests.append(copy.deepcopy(request))
        return next(self.replies)


class HarnessTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root/'test.pptx'
        self.source.write_bytes(b'original; prepare does not parse PPTX')
        self.run_dir = self.root/'run'
        self.work = prepare(self.source, self.run_dir)
        self.record = Record(self.run_dir/'state')
        self.sandbox = Sandbox(self.work, self.record.root)
        self.sandbox.preflight()
        self.tools = Tools(self.work, self.sandbox, self.record.log)

    def gate(self):
        return check_delivery(self.work, self.record)

    async def test_chat_http_signature_pixels_and_readonly_input(self):
        # A valid PNG without requiring an image library in this standalone project.
        import base64
        (self.work/'output/ref.png').write_bytes(base64.b64decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ZkAAAAASUVORK5CYII='))
        replies = iter([
            calls(tool('exec_command', {'cmd': "printf changed > input/template.pptx; printf '<html>candidate</html>' > output/index.html"})),
            calls(tool('view_image', {'path': 'output/ref.png'}, 'c2')),
            final(),
        ])
        received = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                received.append((self.path, json.loads(self.rfile.read(int(self.headers['Content-Length'])))))
                data = json.dumps(next(replies)).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.dict(os.environ, {'HARNESS_TEST_KEY': 'local-fixture-only'}):
                model = Gemini(f'http://127.0.0.1:{server.server_port}/v1', 'HARNESS_TEST_KEY')
            try:
                result = await Agent(model, self.tools, self.record).run('policy', 'task', self.gate)
            finally:
                await model.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
        self.assertEqual(result['status'], 'delivered_unreviewed')
        self.assertFalse(result['quality_evaluated'])
        self.assertEqual((self.work/'input/template.pptx').read_bytes(), self.source.read_bytes())
        self.assertTrue(all(path == '/v1/chat/completions' for path, _ in received))
        self.assertTrue(all(req['model'] == MODEL for _, req in received))
        assistant = received[1][1]['messages'][2]
        self.assertEqual(assistant['tool_calls'][0]['extra_content']['google']['thought_signature'],
                         'opaque-fixture-signature')
        self.assertEqual(received[1][1]['messages'][3]['tool_call_id'], 'c1')
        image = received[2][1]['messages'][-1]['content'][1]
        self.assertEqual(image['type'], 'image_url')
        self.assertTrue(image['image_url']['url'].startswith('data:image/png;base64,'))

    async def test_missing_html_is_only_gate(self):
        fixture = Fixture([final(), calls(tool('exec_command', {'cmd': "printf candidate > output/free-form.html"})), final()])
        result = await Agent(fixture, self.tools, self.record).run('policy', 'task', self.gate)
        self.assertIn('尚无非空 HTML', fixture.requests[1]['messages'][-1]['content'])
        self.assertEqual(result['status'], 'delivered_unreviewed')
        self.assertFalse((self.run_dir/'state/checkpoint.json').exists())

    async def test_process_continuation_and_credential_isolation(self):
        self.assertNotIn('GEMINI_API_KEY', self.sandbox.env)
        try:
            first = await self.tools.exec_command('read -r line; printf "%s" "$line"', yield_time_ms=1)
            self.assertIn('session_id', first)
            done = await self.tools.write_stdin(first['session_id'], chars='continued\n')
            self.assertEqual(done['exit_code'], 0)
            self.assertEqual(done['output'], 'continued')
        finally:
            await self.tools.close()

    async def test_unavailable_model_tool_and_budget(self):
        fixture = Fixture([calls(tool('image_gen__imagegen', {})), final()])
        result = await Agent(fixture, self.tools, self.record, max_turns=2).run('policy', 'task', self.gate)
        self.assertEqual(result['status'], 'budget_exhausted')
        self.assertIn('unavailable', fixture.requests[1]['messages'][-1]['content'])
        self.assertFalse((self.run_dir/'final.md').exists())

    async def test_incomplete_response_is_recorded_as_error(self):
        fixture = Fixture([response({'role': 'assistant', 'content': 'partial'}, 'length')])
        with self.assertRaisesRegex(RuntimeError, 'did not complete'):
            await Agent(fixture, self.tools, self.record).run('policy', 'task', self.gate)
        self.assertEqual(json.loads((self.run_dir/'state/result.json').read_text())['status'], 'error')

    def test_gate_rejects_empty_or_external_files(self):
        (self.work/'output/empty.html').touch()
        (self.root/'outside.html').write_text('outside')
        (self.work/'output/link.html').symlink_to(self.root/'outside.html')
        self.assertIsNotNone(self.gate())
        with self.assertRaisesRegex(ValueError, 'inside'):
            self.tools.path('../state/result.json')

    def test_copied_directory_runs_without_parent_project(self):
        standalone = self.root/'standalone'
        shutil.copytree(Path(__file__).parent, standalone,
                        ignore=shutil.ignore_patterns('runs', '__pycache__', '.env', '.venv'))
        destination = self.root/'independent-run'
        result = subprocess.run([sys.executable, str(standalone/'run.py'), 'prepare',
            '--pptx', str(self.source), '--run-dir', str(destination)], cwd=self.root,
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((destination/'workspace/input/template.pptx').read_bytes(), self.source.read_bytes())


class CommandTests(unittest.TestCase):
    def test_one_command_creates_run_and_protects_existing_results(self):
        replies = iter([
            calls(tool('exec_command', {'cmd': "printf '<html>candidate</html>' > output/index.html"})),
            final(),
        ])
        received = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                received.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                data = json.dumps(next(replies)).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                standalone = root/'standalone'
                shutil.copytree(Path(__file__).parent, standalone,
                               ignore=shutil.ignore_patterns('runs', '__pycache__', '.env', '.venv'))
                source = root/'中文 template.pptx'
                source.write_bytes(b'original input')

                def invoke(*args):
                    return subprocess.run([sys.executable, str(standalone/'run.py'), *args,
                        '--base-url', f'http://127.0.0.1:{server.server_port}/v1',
                        '--api-key-env', 'HARNESS_TEST_KEY'], cwd=root,
                        env={**os.environ, 'HARNESS_TEST_KEY': 'local-fixture-only'},
                        capture_output=True, text=True, timeout=15)

                result = invoke('--pptx', str(source))
                self.assertEqual(result.returncode, 0, result.stderr)
                run = Path(json.loads(result.stdout.splitlines()[0])['run_dir'])
                self.assertEqual(run.parent, standalone/'runs')
                self.assertEqual((run/'workspace/input/template.pptx').read_bytes(), source.read_bytes())
                candidate = run/'workspace/output/index.html'
                self.assertEqual(candidate.read_text(), '<html>candidate</html>')
                inspection = invoke('inspect', '--run-dir', str(run))
                self.assertEqual(inspection.returncode, 0, inspection.stderr)
                self.assertEqual(json.loads(inspection.stdout)['status'], 'delivered_unreviewed')
                for args in [('--pptx', str(source), '--run-dir', str(run)), ('run', '--run-dir', str(run))]:
                    rejected = invoke(*args)
                    self.assertEqual(rejected.returncode, 2, rejected.stderr)
                self.assertEqual(candidate.read_text(), '<html>candidate</html>')
                self.assertEqual(len(received), 2)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
