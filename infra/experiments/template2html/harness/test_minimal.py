import copy
import json
from pathlib import Path
import tempfile
import unittest

from environment import Sandbox
from minimal import MODEL, TOOLS, MinimalEngine, Record, delivery_files
from tools import Host


def reply(*items):
    return {'id': 'fixture', 'status': 'completed', 'output': list(items)}


def final():
    return {'type': 'message', 'role': 'assistant', 'content': [{'type': 'output_text', 'text': 'Done'}]}


def call(name, args, ident='c1'):
    return {'type': 'function_call', 'name': name, 'call_id': ident, 'arguments': json.dumps(args)}


class ModelFixture:
    def __init__(self, replies):
        self.replies, self.requests = iter(replies), []

    async def complete(self, request):
        self.requests.append(copy.deepcopy(request))
        return next(self.replies)


class MinimalTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.work = self.root/'workspace'
        for p in ['input', 'output', '_harness', '.tmp']:
            (self.work/p).mkdir(parents=True)
        (self.work/'input/template.pptx').write_bytes(b'original')
        self.record = Record(self.root/'state')

    def engine(self, replies, sandbox=False, max_turns=None):
        self.model = ModelFixture(replies)
        box = Sandbox(self.work, self.record.root) if sandbox else None
        if box:
            box.preflight()
        self.host = Host(self.work, self.record.log, sandbox=box)
        return MinimalEngine(self.work, self.model, self.host, self.record, max_turns)

    async def test_direct_shell_input_readonly_and_unreviewed_delivery(self):
        engine = self.engine([
            reply(call('exec_command', {'cmd': "printf changed > input/template.pptx; printf '<html>Hello</html>' > output/index.html"})),
            reply(final()),
        ], sandbox=True)
        result = await engine.run('convert', 'policy')
        self.assertEqual((self.work/'input/template.pptx').read_bytes(), b'original')
        self.assertEqual(result['status'], 'delivered_unreviewed')
        self.assertFalse(result['quality_evaluated'])
        self.assertEqual({t['name'] for t in TOOLS}, {'exec_command', 'write_stdin', 'view_image'})
        self.assertEqual({r['model'] for r in self.model.requests}, {MODEL})
        self.assertFalse(self.host.cells)
        self.assertFalse((self.record.root/'checkpoint.json').exists())

    async def test_only_missing_html_feeds_back_no_schema_or_visual_gate(self):
        engine = self.engine([
            reply(final()),
            reply(call('exec_command', {'cmd': "printf 'unreviewed candidate' > output/custom-name.html"})),
            reply(final()),
        ])
        result = await engine.run('convert', 'policy')
        self.assertIn('尚无非空 HTML', self.model.requests[1]['input'][-1]['content'])
        self.assertEqual(result['status'], 'delivered_unreviewed')
        self.assertEqual(result['html_files'], ['output/custom-name.html'])

    async def test_image_pixels_and_unavailable_tool_error_return_to_same_model(self):
        from PIL import Image
        Image.new('RGB', (2, 2), 'red').save(self.work/'output/ref.png')
        (self.work/'output/index.html').write_text('candidate')
        engine = self.engine([
            reply(call('view_image', {'path': 'output/ref.png'}), call('image_gen__imagegen', {}, 'c2')),
            reply(final()),
        ])
        await engine.run('convert', 'policy')
        history = self.model.requests[1]['input']
        pairs = {i['call_id']: i for i in history if i.get('type') == 'function_call_output'}
        self.assertEqual(set(pairs), {'c1', 'c2'})
        self.assertIn('unavailable', pairs['c2']['output'])
        self.assertTrue(history[-1]['content'][1]['image_url'].startswith('data:image/png;base64,'))

    async def test_budget_records_unfinished_and_rejects_separate_model(self):
        engine = self.engine([reply(final())], max_turns=1)
        result = await engine.run('convert', 'policy')
        self.assertEqual(result['status'], 'budget_exhausted')
        self.assertFalse((self.root/'final.md').exists())
        host = Host(self.work, self.record.log, image_provider=object())
        with self.assertRaisesRegex(ValueError, 'no separate image model'):
            MinimalEngine(self.work, self.model, host, self.record)

    def test_existence_gate_ignores_empty_files_and_external_symlinks(self):
        (self.work/'output/empty.html').touch()
        (self.root/'outside.html').write_text('outside')
        (self.work/'output/link.html').symlink_to(self.root/'outside.html')
        self.assertEqual(delivery_files(self.work), [])


if __name__ == '__main__':
    unittest.main()
