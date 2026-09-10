import asyncio
import base64
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from extract import extract, context
from loop import Engine, Journal
from model import ImagesProvider, ResponsesModel
from protocol import tool_definitions
from tools import Host
from artifacts import Artifacts

PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII='


def response(number, *items, status='completed'):
    return {'id': f'resp_{number}', 'status': status, 'output': list(items),
            'usage': {'input_tokens': 10, 'output_tokens': 3}}


def call(ident, code):
    return {'type': 'custom_tool_call', 'name': 'exec', 'call_id': ident, 'input': code}


def final():
    return {'type': 'message', 'role': 'assistant', 'phase': 'final_answer',
            'content': [{'type': 'output_text', 'text': '交付完成'}]}


class ScriptedModel:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.requests = []

    async def complete(self, request):
        self.requests.append(deepcopy(request))
        return next(self.responses)


class RuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.work = self.root/'workspace'
        (self.work/'input').mkdir(parents=True)
        (self.work/'input/template.pptx').write_bytes(b'fixture')
        self.journal = Journal(self.root)
        self.host = Host(self.work, self.journal.log)

    async def asyncTearDown(self):
        await self.host.close()

    async def test_js_yield_and_memory_are_not_shell_sessions(self):
        result = await self.host.exec('store("n",7);await new Promise(r=>setTimeout(r,100));text("late");', 'a', yield_time_ms=1)
        self.assertIn('running', result[0]['text'])
        cid = result[0]['text'].split()[-1]
        result = await self.host.wait(cid, yield_time_ms=1000)
        self.assertEqual([x['text'] for x in result], ['Script completed', 'late'])
        with self.assertRaises(ValueError):
            await self.host.wait(cid)
        result = await self.host.exec('text(load("n"));', 'b')
        self.assertEqual(result[-1]['text'], '7')

    async def test_process_stdin_persists_across_cells(self):
        result = await self.host.exec_command('read value; echo "received:$value"', yield_time_ms=1)
        sid = result['session_id']
        self.assertIsNone(result['exit_code'])
        result = await self.host.write_stdin(sid, 'hello\n', yield_time_ms=1000)
        self.assertEqual(result['exit_code'], 0)
        self.assertIn('received:hello', result['output'])
        result = await self.host.write_stdin(sid, yield_time_ms=1)
        self.assertEqual(result['output'], '')

    async def test_image_is_multimodal_not_a_path_string(self):
        (self.work/'test.png').write_bytes(base64.b64decode(PNG))
        result = await self.host.exec('image(await tools.view_image({path:"test.png"}));', 'image-call')
        self.assertEqual(result[1]['type'], 'input_image')
        self.assertEqual(result[1]['image_url'], 'data:image/png;base64,'+PNG)

    async def test_large_image_frame_is_flushed_before_cell_exit(self):
        from PIL import Image
        path = self.work/'large.png'
        Image.frombytes('RGB', (1024, 1024), os.urandom(1024*1024*3)).save(path)
        result = await self.host.exec('image(await tools.view_image({path:"large.png"}));', 'large-image')
        self.assertEqual(result[1]['type'], 'input_image')
        self.assertEqual(base64.b64decode(result[1]['image_url'].split(',', 1)[1]), path.read_bytes())

    async def test_parallel_tools_and_error_feedback(self):
        result = await self.host.exec('const r=await Promise.allSettled([tools.exec_command({cmd:"echo one"}),tools.exec_command({cmd:"echo two"})]);for(const x of r)text(x.value.output);', 'parallel')
        self.assertEqual([x['text'] for x in result[1:]], ['one\n', 'two\n'])
        result = await self.host.exec('await tools.no_such_tool({});', 'bad')
        self.assertIn('no_such_tool', result[-1]['text'])

    async def test_gate_failure_returns_to_same_model_history(self):
        model = ScriptedModel([
            response(1, call('a', 'text(await tools.exec_command({cmd:"echo bad > marker"}));')),
            response(2, final()),
            response(3, call('b', 'text(await tools.exec_command({cmd:"echo good > marker"}));')),
            response(4, final())])

        async def gate(attempt):
            ok = (self.work/'marker').read_text().strip() == 'good'
            return {'status': 'needs_manual_review' if ok else 'fail', 'actual': (self.work/'marker').read_text()}

        engine = Engine(self.root, model, self.host, self.journal, 'fixture', validator=gate)
        state = await engine.run_loop(engine.initial('fixture task'))
        self.assertEqual(state['status'], 'delivered_needs_manual_review')
        self.assertEqual(state['turns'], 4)
        third = model.requests[2]['input']
        self.assertIn('harness_check', third[-1]['content'][0]['text'])
        self.assertTrue(any(x['type'] == 'custom_tool_call_output' and x['call_id'] == 'a' for x in third))
        self.assertEqual(len(state['usage_by_response_id']), 4)

    async def test_resume_does_not_repeat_ambiguous_tool(self):
        engine = Engine(self.root, ScriptedModel([]), self.host, self.journal, 'fixture')
        state = engine.initial('task')
        pending = call('uncertain', 'text(await tools.exec_command({cmd:"echo unsafe-repeat"}));')
        state['history'].append(pending)
        state['pending'] = [pending]
        state['memory'] = {'known': 9}
        engine.recover(state)
        self.assertFalse(state['pending'])
        self.assertEqual(self.host.memory['known'], 9)
        self.assertIn('Effects are unknown', state['history'][-2]['output'][0]['text'])
        self.assertFalse(self.host.sessions)

    async def test_incomplete_and_budget_are_not_delivery(self):
        model = ScriptedModel([response(1, status='incomplete')])
        engine = Engine(self.root, model, self.host, self.journal, 'fixture')
        result = await engine.run_loop(engine.initial('task'))
        self.assertEqual(result['status'], 'model_incomplete')
        self.assertFalse((self.root/'final.md').exists())
        model = ScriptedModel([])
        engine = Engine(self.root, model, self.host, self.journal, 'fixture', max_turns=0)
        result = await engine.run_loop(engine.initial('task'))
        self.assertEqual(result['status'], 'budget_exhausted')

    async def test_duplicate_call_is_not_executed_twice(self):
        item = call('once', 'text(await tools.exec_command({cmd:"echo one >> counter"}));')
        model = ScriptedModel([response(1, item), response(2, item), response(3, final())])
        async def gate(attempt):
            return {'status': 'needs_manual_review'}
        engine = Engine(self.root, model, self.host, self.journal, 'fixture', validator=gate)
        await engine.run_loop(engine.initial('task'))
        self.assertEqual((self.work/'counter').read_text(), 'one\n')

    async def test_generation_reference_selection_and_provenance(self):
        class Reply:
            data = [SimpleNamespace(b64_json=PNG)]
            def model_dump(self):
                return {'usage': {'total_tokens': 5}}
        calls = []
        def generate(**kwargs):
            calls.append(('generate', kwargs['prompt']))
            return Reply()
        def edit(**kwargs):
            calls.append(('edit', kwargs['image'][0].read()))
            return Reply()
        client = SimpleNamespace(images=SimpleNamespace(generate=generate, edit=edit))
        provider = ImagesProvider(self.work, self.root/'state', 'image-fixture', '', '', client)
        self.host.image_provider = provider
        self.host.names.append('image_gen__imagegen')
        await self.host.exec('generatedImage(await tools.image_gen__imagegen({prompt:"new illustration"}));', 'generated')
        made = self.host.seen_images[-1]
        await self.host.image_gen__imagegen('edit illustration', num_last_images_to_include=1)
        self.assertEqual(calls[0], ('generate', 'new illustration'))
        self.assertEqual(calls[1], ('edit', base64.b64decode(PNG)))
        records = [json.loads(p.read_text()) for p in (self.root/'state/generation').glob('*.json')]
        self.assertEqual(len(records), 2)
        self.assertTrue(all(p['status'] == 'completed' for p in records))
        self.assertTrue(any(p['references'] for p in records))
        with self.assertRaises(ValueError):
            await self.host.image_gen__imagegen('bad', referenced_image_paths=[made], num_last_images_to_include=1)

    async def test_public_adapter_preserves_custom_tool_and_image_wire(self):
        captured = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_POST(self):
                captured.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
                payload = json.dumps(response(1, final())).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.dict(os.environ, {'HARNESS_FIXTURE_KEY': 'fixture-no-real-key'}):
                model = ResponsesModel('fixture', f'http://127.0.0.1:{server.server_port}/v1', 'HARNESS_FIXTURE_KEY')
                body = {'model': 'fixture', 'store': False, 'stream': False, 'tools': tool_definitions(False),
                    'input': [call('image-call', 'image(...)'), {'type': 'custom_tool_call_output', 'call_id': 'image-call',
                        'output': [{'type': 'input_image', 'image_url': 'data:image/png;base64,'+PNG, 'detail': 'original'}]}]}
                reply = await model.complete(body)
                await model.client.close()
            self.assertEqual(reply['status'], 'completed')
            self.assertEqual(captured, [body])
        finally:
            await asyncio.to_thread(server.shutdown)
            server.server_close()
            thread.join()


class ExtractionTests(unittest.TestCase):
    def test_file_versions_preserve_changes_and_deletions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            work = root/'work'
            (work/'output').mkdir(parents=True)
            path = work/'output/template.js'
            store = Artifacts(work, root/'state')
            path.write_text('before')
            first = store.capture('first')
            path.write_text('after')
            second = store.capture('second')
            path.unlink()
            third = store.capture('third')
            def files(ident):
                return json.loads((store.root/'snapshots'/f'{ident}.json').read_text())['files']
            old = files(first)['output/template.js']['sha256']
            new = files(second)['output/template.js']['sha256']
            self.assertEqual((store.root/'blobs'/old).read_text(), 'before')
            self.assertEqual((store.root/'blobs'/new).read_text(), 'after')
            self.assertNotIn('output/template.js', files(third))

    def test_lite_outputs_and_context_chain(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'wire/ws').mkdir(parents=True)
            messages = []
            def push(direction, payload):
                messages.append({'timestamp': f'2026-09-08T00:00:{len(messages):02}Z', 'type': 'message', 'direction': direction, 'payload': payload})
            initial = {'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': 'task'}]}
            action = call('c1', 'text(1)')
            for i, req_input, prev, result in [(1, [initial], None, action),
                    (2, [{'type': 'custom_tool_call_output', 'call_id': 'c1', 'output': '1'}], 'r1', final())]:
                push('client', {'type': 'response.create', 'input': req_input, **({'previous_response_id': prev} if prev else {})})
                push('server', {'type': 'response.created', 'response': {'id': f'r{i}'}})
                push('server', {'type': 'response.output_item.done', 'output_index': 0, 'item': result})
                push('server', {'type': 'response.completed', 'response': {'id': f'r{i}', 'status': 'completed', 'output': []}})
            (root/'wire/ws/a.jsonl').write_text('\n'.join(json.dumps(x) for x in messages))
            destination = root/'bundle'
            index = extract(root, destination)
            self.assertEqual(len(index), 2)
            self.assertEqual(context(destination, 2), [initial, action, {'type': 'custom_tool_call_output', 'call_id': 'c1', 'output': '1'}])
            self.assertEqual(json.loads((destination/'terminal-responses/001.json').read_text())['output'], [])
            self.assertEqual(json.loads((destination/'responses/001.json').read_text())['output'], [action])


if __name__ == '__main__':
    unittest.main()
