"""Focused offline checks for tool evidence and unified Check screenshots."""
import base64
import json
from pathlib import Path
import tempfile
import shutil
import unittest
from unittest.mock import patch

from core import builder
from tools import runtime as tools
from core.trace import Writer, TraceRow
from test.test_builder import page, call, tool_response, done_response


class ToolEvidenceTests(unittest.TestCase):
    def test_trace_keeps_redacted_results_images_and_existing_parent_links(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'trace.jsonl'
            log = Writer(path, 'session')
            log.add([], '', {}, 'response', 'start', 'end')
            secret = 'private-test-token-with-more-than-16-chars'
            with patch.dict('os.environ', {'EVIDENCE_API_KEY': secret}):
                for _ in range(2):
                    log.tool(rid='response', call_id='call', page='page-01', name='Patch',
                             arguments=json.dumps({'old': secret, 'new': 'new code'}),
                             output='failed: ' + secret, started='tool-start', finished='tool-end',
                             seconds=0.25, images=[('image/png', base64.b64encode(b'picture').decode())])
            log.add([], 'done', {}, 'next', 'start2', 'end2')
            raw = path.read_text()
            self.assertNotIn(secret, raw)
            rows = [TraceRow.model_validate_json(line) for line in raw.splitlines()]
            evidence = rows[2].toolUseResult
            self.assertEqual(evidence['seconds'], 0.25)
            self.assertIn('new code', evidence['arguments'])
            self.assertIn('<redacted:EVIDENCE_API_KEY>', evidence['output'])
            self.assertEqual((path.parent / evidence['images'][0]['path']).read_bytes(), b'picture')
            self.assertEqual(len(list((path.parent / '.trace-images').iterdir())), 1)
            self.assertEqual(rows[4].parentUuid, rows[1].uuid)
            self.assertEqual(rows[5].parentUuid, rows[4].uuid)

    def test_builder_records_exact_tool_output_without_extra_model_messages(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            responses = [tool_response(call('Read', file_path='page-01.html')), done_response()]
            histories = []
            def respond(_instructions, history, *_args, **_kwargs):
                histories.append(json.loads(json.dumps(history)))
                return responses.pop(0)
            with patch.object(builder, 'respond', side_effect=respond), \
                 patch.object(builder.tools, 'run', return_value='actual tool result'), \
                 patch.object(builder, 'audit_delivery', return_value={}):
                result = builder.build_one(page(), root, root/'trace.jsonl',
                                           builder.ROOT/'skills', 'instructions', 'low')
            rows = [json.loads(line) for line in (root/'trace.jsonl').read_text().splitlines()]
            evidence = [r for r in rows if r['type'] == 'system']
            self.assertEqual(len(evidence), 1)
            self.assertEqual(evidence[0]['toolUseResult']['output'], 'actual tool result')
            self.assertEqual(rows[1]['toolUseResult']['instructions'], 'instructions')
            self.assertEqual(json.loads(evidence[0]['toolUseResult']['arguments']), {'file_path':'page-01.html'})
            self.assertEqual(result.calls, 2)
            self.assertEqual(result.termination, 'no_tool_use')
            self.assertFalse(any(m.get('role') == 'system' for m in histories[1]))
            self.assertEqual(histories[1][-1]['output'], 'actual tool result')


class CheckCropTests(unittest.TestCase):
    def test_full_stage_uses_overview_and_preserves_after(self):
        with patch.object(tools.check, '_selfcheck', return_value='overview') as render:
            result = tools.check._check(Path('/tmp'), {'page':'page-01.html', 'box':[0,0,1600,900],
                                               'shot':True, 'zoom':2, 'after':['act()']})
            self.assertEqual(result.text, 'overview')
            render.assert_called_once_with(Path('/tmp'), 'page-01.html', ['act()'],
                                           shot=True, crop=None, zoom=2)

    def test_actual_crop_is_not_changed_into_overview(self):
        with patch.object(tools.check, '_selfcheck', return_value='no crop') as render:
            tools.check._check(Path('/tmp'), {'page':'page-01.html','box':[50,60,300,200],'zoom':3,'shot':True})
            render.assert_called_once_with(Path('/tmp'), 'page-01.html', (),
                                           shot=True, crop=[50,60,300,200], zoom=3)

    def test_invalid_crop_and_report_only(self):
        with patch.object(tools.check, '_selfcheck', return_value='report') as render:
            for extra in ({'box':[1,2,0,4]}, {'box':[0,0,True,4]}, {'box':[1600,0,10,10]},
                          {'box':[0,0,10,10],'zoom':0}):
                self.assertIn('失败', tools.check._check(Path('/tmp'), dict(page='page-01.html',shot=True,**extra)).text)
            render.assert_not_called()
            tools.check._check(Path('/tmp'), {'page':'page-01.html','shot':False,'box':'ignored','after':['act()']})
            render.assert_called_once_with(Path('/tmp'),'page-01.html',['act()'],shot=False,crop=None,zoom=2)

    def test_specs_do_not_mutate_visual_schema(self):
        for workflow in (None, 'build-code', 'build-interaction'):
            for vision in (False, True):
                specs = tools.specs(workflow, vision_input=vision)
                self.assertNotIn('Look', [s['name'] for s in specs])
                props = next(s for s in specs if s['name']=='Check')['parameters']['properties']
                self.assertEqual('box' in props, vision)
                self.assertEqual('zoom' in props, vision)


class BrowserCheckTests(unittest.TestCase):
    def test_overview_keeps_after_state_without_upscaled_full_frame(self):
        import io
        from PIL import Image
        with tempfile.TemporaryDirectory() as td:
            pages = Path(td) / 'pages'
            assets = pages / 'assets'
            assets.mkdir(parents=True)
            for name in ('base.css', 'base.js', 'selfcheck.py'):
                shutil.copy2(builder.ROOT / 'vendor/chassis' / name, assets / name)
            (pages / 'page-01.html').write_text('''<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="assets/base.css">
<style>:root{--bg:white;--text:black;--font-sans:sans-serif}</style>
<div id="stage"><p id="label">initial</p></div><script src="assets/base.js"></script>''')
            result = tools.check._check(pages, {'page':'page-01.html', 'box':[0,0,1600,900], 'shot':True,
                'after':["document.querySelector('#label').textContent='after-state'; return {computed:100,displayed:74};"]})
            self.assertEqual(len(result.images), 2)
            for _, encoded in result.images:
                image = Image.open(io.BytesIO(base64.b64decode(encoded)))
                self.assertEqual(image.size, (800, 450))
            self.assertIn('after-state', result.text)
            self.assertIn('返回值 {"computed": 100, "displayed": 74}', result.text)
            self.assertNotIn('裁图', result.text)

            cropped = tools.check._check(pages, {'page':'page-01.html', 'shot':True,
                'box':[0,0,200,100], 'zoom':3,
                'after':["window.count=(window.count||0)+1; return count;"] * 3})
            self.assertEqual(len(cropped.images), 2)
            for _, encoded in cropped.images:
                self.assertEqual(Image.open(io.BytesIO(base64.b64decode(encoded))).size, (600,300))
            for count in (1,2,3):
                self.assertIn(f'返回值 {count}', cropped.text)
            lines = [line for line in cropped.text.splitlines() if '裁图 ' in line]
            self.assertEqual(len(lines), 4)
            self.assertIn('[已内联]', lines[0])
            self.assertIn('[可 Read]', lines[1])
            self.assertIn('[可 Read]', lines[2])
            self.assertIn('[已内联]', lines[3])


if __name__ == '__main__':
    unittest.main()
