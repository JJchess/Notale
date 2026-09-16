"""Check behavior contracts; historical versions live in outer legacy."""
from __future__ import annotations

import contextlib
import copy
import importlib.util
import io
from pathlib import Path
import asyncio
import shutil
import tempfile
import unittest
from playwright.sync_api import sync_playwright
from vendor.chassis import selfcheck as check
import base64
import json
from unittest.mock import patch
from core import builder
from tools import runtime as tools
from core.trace import Writer, TraceRow
from test.support import builder_call, builder_page, tool_response, done_response
check_report_spec = importlib.util.spec_from_file_location('selfcheck_report', Path(__file__).resolve().parents[1] / 'vendor/chassis/selfcheck.py')
check_report_check = importlib.util.module_from_spec(check_report_spec)
check_report_spec.loader.exec_module(check_report_check)

def state(label=None):
    return {'label': label, 'errs': [], 'bad': [], 'png': None, 'probe': {'sizes': [15, 18, 34], 'canvases': 1, 'escaped': [], 'clipped': [], 'subject': {'top': 0.5, 'ratio': 3}, 'theme': {'invalidTokens': []}}}

def render(states):
    stream = io.StringIO()
    with contextlib.redirect_stdout(stream):
        check_report_check.report('page-01.html', states)
    return stream.getvalue()

def test_equal_states_keep_measurement_coverage_without_repeating_statistics():
    states = [state(), state('void 0'), state('void 0')]
    before = copy.deepcopy(states)
    out = render(states)
    assert out.count('canvas 1 个') == 1
    assert out.count('指标同初态') == 2
    assert 'after1' in out and 'after2' in out
    assert states == before

def test_changed_metrics_errors_and_recovery_are_explicit():
    states = [state(), state('break'), state('reset')]
    states[1]['errs'] = ['JS 报错: broken']
    states[1]['probe']['sizes'] = [13, 18, 34]
    states[1]['probe']['theme']['invalidTokens'] = ['--text']
    states[1]['probe']['rails'] = ['box@12,24']
    out = render(states)
    assert '✗ JS 报错: broken' in out
    assert '字号最小 13px' in out and '--text' in out
    assert '字阶' not in out and '--pad-x' not in out
    assert 'after2' in out and out.rstrip().endswith('指标同初态')

def test_repeated_failures_and_missing_metrics_are_not_hidden():
    states = [state(), state('still broken')]
    for s in states:
        s['errs'] = ['JS 报错: broken']
    states[1]['probe']['sizes'] = []
    out = render(states)
    assert out.count('✗ JS 报错: broken') == 2
    assert '本状态不再报告的项目：canvas' in out

def test_aesthetic_statistics_are_not_returned_but_evidence_is_preserved():
    s = state()
    s['probe'].update(rails=['box@12,24'], tiny=4, overlap=1, fills=[{'tag': 'div', 'at': [12, 24], 'fill': 0.2, 'gap': 0.5}])
    s['result'] = {'computed': 100, 'displayed': 74}
    before = copy.deepcopy(s)
    out = render([s])
    for phrase in ('主体 最大', '侧边条', '区块', '小容器'):
        assert phrase not in out
    assert '文字叠压 1 处' in out
    assert '返回值' in out and '字号最小' in out
    assert s == before

def test_failed_after_never_claims_it_was_measured():
    failed = {'label': 'throw Error()', 'probe': None, 'js_error': 'bad'}
    out = render([state(), failed])
    assert '这个状态没测到' in out
    assert '同初态' not in out

def test_contract_failures_stay_explicit_without_layout_diagnosis():
    broken = state()
    broken['probe'] = {'contract': ['缺少基础样式 base.css 引用']}
    repeated = copy.deepcopy(broken)
    repeated['label'] = 'still missing'
    out = render([broken, repeated])
    assert out.count('✗ 底盘契约: 缺少基础样式 base.css 引用') == 2
    assert '渲染无报错' not in out
    assert 'canvas' not in out
    assert '指标同初态' not in out

def test_small_viewport_failure_is_not_reported_as_success():
    initial = state()
    initial['viewport_issues'] = ['舞台未居中等比适配 800×450 视口']
    out = render([initial])
    assert '✗ 底盘契约: 舞台未居中等比适配 800×450 视口' in out
    assert '渲染无报错' not in out

def test_return_values_are_not_hidden_as_repeated_layout_metrics():
    states = [state(), state('return object'), state('return object again')]
    states[1]['result'] = states[2]['result'] = {'computed': 100, 'displayed': 74}
    out = render(states)
    assert out.count('返回值 {"computed": 100, "displayed": 74}') == 2
    assert '✗' not in out

def test_false_and_zero_return_values_remain_visible():
    states = [state(), state('return false'), state('return 0')]
    states[1]['result'], states[2]['result'] = (False, 0)
    out = render(states)
    assert '返回值 false' in out
    assert '返回值 0' in out
ROOT = Path(__file__).resolve().parents[1]

class StepCheckTests(unittest.TestCase):

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        for name in ('base.css', 'base.js'):
            shutil.copy2(ROOT / 'vendor/chassis' / name, self.root / name)
        self.target = self.root / 'page.html'

    def write_page(self, script, markup=''):
        self.target.write_text('<!doctype html><html><head><link rel="stylesheet" href="base.css">\n          <style>:root{--bg:white;--text:#111;--font-sans:sans-serif}\n          #dot{position:absolute;left:100px;top:100px;width:1px;height:1px}</style></head>\n          <body><div id="stage"><p id="status">初态</p><i id="dot"></i>' + markup + '</div><script src="base.js"></script><script>' + script + '</script></body></html>')

    def run_check(self, screenshots=False):
        return asyncio.run(check.run([self.target], shot_dir=self.root / 'shots' if screenshots else None, wait=0))[0][1][0]

    def test_single_advance_keeps_rewind_screenshot_without_pixel_gate(self):
        self.write_page("let visited=false;\n          Deck.onStep(step=>{\n            if(step===1) visited=true;\n            document.querySelector('#status').textContent=step===0?'初态':'末态';\n            document.querySelector('#dot').style.background=visited?'black':'white';\n          },1);")
        state = self.run_check(True)
        self.assertEqual(state['steps'], 1)
        self.assertEqual(state['step_issues'], [])
        self.assertEqual(state['errs'], [])
        self.assertTrue(state['rewind_png'].is_file())
        self.assertNotEqual(state['step_pngs'][0].read_bytes(), state['rewind_png'].read_bytes())
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            check.report('page.html', [state])
        self.assertIn('0..1（2 个状态）', output.getvalue())
        self.assertIn('回退到第 0 步，供核对状态', output.getvalue())
        self.assertNotIn('✗', output.getvalue())

    def test_rewind_runtime_errors_remain_visible_without_screenshots(self):
        self.write_page("let visited=false;\n          Deck.onStep(step=>{\n            if(step===1) visited=true;\n            if(step===0 && visited) console.error('rewind-sentinel');\n          },1);")
        for screenshots in (False, True):
            with self.subTest(screenshots=screenshots):
                state = self.run_check(screenshots)
                self.assertTrue(any(('rewind-sentinel' in e for e in state['errs'])))

    def test_max_step_is_last_index_and_bad_index_still_fails(self):
        for maximum in (2, 3):
            with self.subTest(maximum=maximum):
                self.write_page("const states=['初态','中态','末态'];\n                  Deck.onStep(step=>{document.querySelector('#status').textContent=states[step].toString();}," + str(maximum) + ');')
                state = self.run_check()
                if maximum == 2:
                    self.assertEqual(state['step_issues'], [])
                    self.assertNotIn('fatal', state['probe'])
                else:
                    self.assertIn('fatal', state['probe'])

    def test_static_and_actual_empty_step_are_distinct(self):
        self.write_page('')
        self.assertEqual(self.run_check()['step_issues'], [])
        self.write_page('', '<p data-deck-step="2">末态</p>')
        self.assertEqual(self.run_check()['step_issues'], ['第 1 步没有任何元素出场,也没有 Deck.onStep(空步)'])

    def test_deck_step_is_explicit_and_local_steps_stay_clickable(self):
        self.write_page("document.querySelector('#local').onclick=()=>statusLabel.textContent='clicked';", '<button id="local" data-step="5">t5</button><span id="statusLabel"></span><p id="reveal" data-deck-step="1">新证据</p>')
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            try:
                for reduced, suffix in (('no-preference', ''), ('reduce', ''), ('no-preference', '?all'), ('no-preference', '#last')):
                    with self.subTest(reduced=reduced, suffix=suffix):
                        page = browser.new_page(viewport={'width': 800, 'height': 450}, reduced_motion=reduced)
                        page.goto(self.target.as_uri() + suffix)
                        self.assertEqual(page.evaluate('Deck.stepMax'), 1)
                        self.assertFalse(page.locator('#local').evaluate('e=>e.inert'))
                        page.locator('#local').click()
                        self.assertEqual(page.locator('#statusLabel').inner_text(), 'clicked')
                        self.assertEqual(page.locator('#reveal').evaluate('e=>e.inert'), reduced == 'no-preference' and (not suffix))
                        page.evaluate('Deck.stepTo(1)')
                        self.assertFalse(page.locator('#reveal').evaluate('e=>e.inert'))
                        page.evaluate('Deck.stepTo(0)')
                        self.assertTrue(page.locator('#reveal').evaluate('e=>e.inert'))
                        self.assertFalse(page.locator('#local').evaluate('e=>e.inert'))
                        self.assertEqual(page.evaluate(check.CONTRACT), [])
                        page.close()
            finally:
                browser.close()

    def test_missing_base_resources_and_stage_report_the_actual_contract(self):
        from core.builder import _audit_lines
        for old, new, expected in (('<link rel="stylesheet" href="base.css">', '', '缺少基础样式 base.css'), ('<script src="base.js"></script>', '', '缺少基础脚本 base.js'), ('id="stage"', 'id="not-stage"', '有且仅有一个 #stage')):
            with self.subTest(expected=expected):
                self.write_page('')
                self.target.write_text(self.target.read_text().replace(old, new))
                state = self.run_check()
                self.assertIn(expected, ' '.join(state['probe']['contract']))
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    check.report(self.target.name, [state])
                self.assertIn('✗ 底盘契约:', output.getvalue())
                self.assertNotIn('渲染无报错', output.getvalue())
                self.assertTrue(_audit_lines(output.getvalue())[0])

    def test_wrong_geometry_is_detected_at_native_and_small_viewports(self):
        for extra, location in (('#stage{width:1500px}', 'contract'), ('@media(max-width:900px){#stage{transform:translate(-50%,-50%)}}', 'viewport_issues')):
            with self.subTest(extra=extra):
                self.write_page('')
                self.target.write_text(self.target.read_text().replace('</style>', extra + '</style>'))
                state = self.run_check(True)
                issues = state['probe'].get('contract') if location == 'contract' else state['viewport_issues']
                self.assertTrue(issues)
                if location == 'viewport_issues':
                    self.assertNotIn('contract', state['probe'])
                    self.assertFalse(state['probe']['escaped'])
                    self.assertTrue(state['png'].is_file())

    def test_after_cannot_silently_break_the_stage_contract(self):
        self.write_page('')
        states = asyncio.run(check.run([self.target], wait=0, after=("document.querySelector('#stage').style.transform='none'",)))[0][1]
        self.assertNotIn('contract', states[0]['probe'])
        self.assertTrue(states[1]['probe']['contract'])

class ToolEvidenceTests(unittest.TestCase):

    def test_trace_keeps_redacted_results_images_and_existing_parent_links(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / 'trace.jsonl'
            log = Writer(path, 'session')
            log.add([], '', {}, 'response', 'start', 'end')
            secret = 'private-test-token-with-more-than-16-chars'
            with patch.dict('os.environ', {'EVIDENCE_API_KEY': secret}):
                for _ in range(2):
                    log.tool(rid='response', call_id='call', page='page-01', name='Patch', arguments=json.dumps({'old': secret, 'new': 'new code'}), output='failed: ' + secret, started='tool-start', finished='tool-end', seconds=0.25, images=[('image/png', base64.b64encode(b'picture').decode())])
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
            responses = [tool_response(builder_call('Read', file_path='page-01.html')), done_response()]
            histories = []

            def respond(_instructions, history, *_args, **_kwargs):
                histories.append(json.loads(json.dumps(history)))
                return responses.pop(0)
            with patch.object(builder, 'respond', side_effect=respond), patch.object(builder.tools, 'run', return_value='actual tool result'), patch.object(builder, 'audit_delivery', return_value={'fatal_errors': [], 'visual_warnings': [], 'code_result': None}):
                result = builder.build_one(builder_page(), root, root / 'trace.jsonl', builder.ROOT / 'skills', 'instructions', 'low')
            rows = [json.loads(line) for line in (root / 'trace.jsonl').read_text().splitlines()]
            evidence = [r for r in rows if r['type'] == 'system' and r['toolUseResult'].get('name') != 'DeliveryAudit']
            self.assertEqual(len(evidence), 1)
            self.assertEqual(evidence[0]['toolUseResult']['output'], 'actual tool result')
            self.assertEqual(rows[1]['toolUseResult']['instructions'], 'instructions')
            self.assertEqual(json.loads(evidence[0]['toolUseResult']['arguments']), {'file_path': 'page-01.html'})
            self.assertEqual(result.calls, 2)
            self.assertEqual(result.termination, 'no_tool_use')
            self.assertFalse(any((m.get('role') == 'system' for m in histories[1])))
            self.assertEqual(histories[1][-1]['output'], 'actual tool result')

class CheckCropTests(unittest.TestCase):

    def test_full_stage_uses_overview_and_preserves_after(self):
        with patch.object(tools.check, '_selfcheck', return_value='overview') as render:
            result = tools.check._check(Path('/tmp'), {'page': 'page-01.html', 'box': [0, 0, 1600, 900], 'shot': True, 'zoom': 2, 'after': ['act()']})
            self.assertEqual(result.text, 'overview')
            render.assert_called_once_with(Path('/tmp'), 'page-01.html', ['act()'], shot=True, crop=None, zoom=2)

    def test_actual_crop_is_not_changed_into_overview(self):
        with patch.object(tools.check, '_selfcheck', return_value='no crop') as render:
            tools.check._check(Path('/tmp'), {'page': 'page-01.html', 'box': [50, 60, 300, 200], 'zoom': 3, 'shot': True})
            render.assert_called_once_with(Path('/tmp'), 'page-01.html', (), shot=True, crop=[50, 60, 300, 200], zoom=3)

    def test_invalid_crop_and_report_only(self):
        with patch.object(tools.check, '_selfcheck', return_value='report') as render:
            for extra in ({'box': [1, 2, 0, 4]}, {'box': [0, 0, True, 4]}, {'box': [1600, 0, 10, 10]}, {'box': [0, 0, 10, 10], 'zoom': 0}):
                self.assertIn('失败', tools.check._check(Path('/tmp'), dict(page='page-01.html', shot=True, **extra)).text)
            render.assert_not_called()
            tools.check._check(Path('/tmp'), {'page': 'page-01.html', 'shot': False, 'box': 'ignored', 'after': ['act()']})
            render.assert_called_once_with(Path('/tmp'), 'page-01.html', ['act()'], shot=False, crop=None, zoom=2)

    def test_specs_do_not_mutate_visual_schema(self):
        for workflow in (None, 'build-code', 'build-interaction'):
            for vision in (False, True):
                specs = tools.specs(workflow, vision_input=vision)
                self.assertNotIn('Look', [s['name'] for s in specs])
                props = next((s for s in specs if s['name'] == 'Check'))['parameters']['properties']
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
            (pages / 'page-01.html').write_text('<!doctype html><meta charset="utf-8">\n<link rel="stylesheet" href="assets/base.css">\n<style>:root{--bg:white;--text:black;--font-sans:sans-serif}</style>\n<div id="stage"><p id="label">initial</p></div><script src="assets/base.js"></script>')
            result = tools.check._check(pages, {'page': 'page-01.html', 'box': [0, 0, 1600, 900], 'shot': True, 'after': ["document.querySelector('#label').textContent='after-state'; return {computed:100,displayed:74};"]})
            self.assertEqual(len(result.images), 2)
            for _, encoded in result.images:
                image = Image.open(io.BytesIO(base64.b64decode(encoded)))
                self.assertEqual(image.size, (800, 450))
            self.assertIn('after-state', result.text)
            self.assertIn('返回值 {"computed": 100, "displayed": 74}', result.text)
            self.assertNotIn('裁图', result.text)
            cropped = tools.check._check(pages, {'page': 'page-01.html', 'shot': True, 'box': [0, 0, 200, 100], 'zoom': 3, 'after': ['window.count=(window.count||0)+1; return count;'] * 3})
            self.assertEqual(len(cropped.images), 2)
            for _, encoded in cropped.images:
                self.assertEqual(Image.open(io.BytesIO(base64.b64decode(encoded))).size, (600, 300))
            for count in (1, 2, 3):
                self.assertIn(f'返回值 {count}', cropped.text)
            lines = [line for line in cropped.text.splitlines() if '裁图 ' in line]
            self.assertEqual(len(lines), 4)
            self.assertIn('[已内联]', lines[0])
            self.assertIn('[可 Read]', lines[1])
            self.assertIn('[可 Read]', lines[2])
            self.assertIn('[已内联]', lines[3])
