"""Real offline Check traversal: no pixel-equality or minimum-step gate."""
import asyncio
import contextlib
import io
from pathlib import Path
import shutil
import tempfile
import unittest
from playwright.sync_api import sync_playwright

from vendor.chassis import selfcheck as check

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
        self.target.write_text('''<!doctype html><html><head><link rel="stylesheet" href="base.css">
          <style>:root{--bg:white;--text:#111;--font-sans:sans-serif}
          #dot{position:absolute;left:100px;top:100px;width:1px;height:1px}</style></head>
          <body><div id="stage"><p id="status">初态</p><i id="dot"></i>'''
          + markup + '</div><script src="base.js"></script><script>' + script + '</script></body></html>')

    def run_check(self, screenshots=False):
        return asyncio.run(check.run([self.target], shot_dir=self.root / 'shots' if screenshots else None,
                                     wait=0))[0][1][0]

    def test_single_advance_keeps_rewind_screenshot_without_pixel_gate(self):
        self.write_page('''let visited=false;
          Deck.onStep(step=>{
            if(step===1) visited=true;
            document.querySelector('#status').textContent=step===0?'初态':'末态';
            document.querySelector('#dot').style.background=visited?'black':'white';
          },1);''')
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
        self.write_page('''let visited=false;
          Deck.onStep(step=>{
            if(step===1) visited=true;
            if(step===0 && visited) console.error('rewind-sentinel');
          },1);''')
        for screenshots in (False, True):
            with self.subTest(screenshots=screenshots):
                state = self.run_check(screenshots)
                self.assertTrue(any('rewind-sentinel' in e for e in state['errs']))

    def test_max_step_is_last_index_and_bad_index_still_fails(self):
        for maximum in (2, 3):
            with self.subTest(maximum=maximum):
                self.write_page('''const states=['初态','中态','末态'];
                  Deck.onStep(step=>{document.querySelector('#status').textContent=states[step].toString();},'''
                  + str(maximum) + ');')
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
        self.assertEqual(self.run_check()['step_issues'],
                         ['第 1 步没有任何元素出场,也没有 Deck.onStep(空步)'])

    def test_deck_step_is_explicit_and_local_steps_stay_clickable(self):
        self.write_page('''document.querySelector('#local').onclick=()=>statusLabel.textContent='clicked';''',
                        '<button id="local" data-step="5">t5</button><span id="statusLabel"></span>'
                        '<p id="reveal" data-deck-step="1">新证据</p>')
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            try:
                for reduced, suffix in (('no-preference', ''), ('reduce', ''), ('no-preference', '?all'), ('no-preference', '#last')):
                    with self.subTest(reduced=reduced, suffix=suffix):
                        page = browser.new_page(viewport={'width':800,'height':450}, reduced_motion=reduced)
                        page.goto(self.target.as_uri() + suffix)
                        self.assertEqual(page.evaluate('Deck.stepMax'), 1)
                        self.assertFalse(page.locator('#local').evaluate('e=>e.inert'))
                        page.locator('#local').click()
                        self.assertEqual(page.locator('#statusLabel').inner_text(), 'clicked')
                        self.assertEqual(page.locator('#reveal').evaluate('e=>e.inert'), reduced == 'no-preference' and not suffix)
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
        for old, new, expected in (
            ('<link rel="stylesheet" href="base.css">', '', '缺少基础样式 base.css'),
            ('<script src="base.js"></script>', '', '缺少基础脚本 base.js'),
            ('id="stage"', 'id="not-stage"', '有且仅有一个 #stage'),
        ):
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
        for extra, location in (
            ('#stage{width:1500px}', 'contract'),
            ('@media(max-width:900px){#stage{transform:translate(-50%,-50%)}}', 'viewport_issues'),
        ):
            with self.subTest(extra=extra):
                self.write_page('')
                self.target.write_text(self.target.read_text().replace('</style>', extra + '</style>'))
                state = self.run_check(True)
                issues = state['probe'].get('contract') if location == 'contract' else state['viewport_issues']
                self.assertTrue(issues)
                if location == 'viewport_issues':
                    self.assertNotIn('contract', state['probe'])
                    # The audit uses another page; primary geometry and screenshots stay 1600×900.
                    self.assertFalse(state['probe']['escaped'])
                    self.assertTrue(state['png'].is_file())

    def test_after_cannot_silently_break_the_stage_contract(self):
        self.write_page('')
        states = asyncio.run(check.run([self.target], wait=0,
            after=("document.querySelector('#stage').style.transform='none'",)))[0][1]
        self.assertNotIn('contract', states[0]['probe'])
        self.assertTrue(states[1]['probe']['contract'])


if __name__ == '__main__':
    unittest.main()
