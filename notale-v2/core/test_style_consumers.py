"""Theme consumers and actual routed guidance; offline, no model calls.

The CSS below is a regression fixture, not evidence of model generation quality.
"""
import asyncio
import contextlib
import importlib.util
import io
from pathlib import Path
import shutil
import tempfile
import unittest

from playwright.sync_api import sync_playwright
from core import builder, font_library, tools, test_builder

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('consumer_selfcheck', ROOT / 'vendor/chassis/selfcheck.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)

CSS = '''/* ==== INTERFACE ====
token --bg: 背景
token --text: 正文
token --font-sans: 中英混排
token --fs-h2: 标题字阶
class .nt-title: 标题，英文子元素 .nt-title-en
class .nt-chart: SVG 宿主，path.fixed 为线，text.label 为混排标签
用法：<svg class="nt-chart"><path class="fixed"/><text class="label fixed">200.00</text></svg>
==== /INTERFACE ==== */
:root { --bg:#fff; --text:#111; --font-sans:"NTF-inter","NTF-lxgw-wenkai",sans-serif;
  --fs-h2:48px; --fixed:#254d9b; }
#stage { color:var(--text); background-color:var(--bg); font-family:var(--font-sans); }
.nt-title { font-size:clamp(44px,calc(var(--fs-h2) * 1.2),68px); }
.nt-title-en { font-size:.76em; }
.nt-chart path.fixed { fill:none; stroke:var(--fixed); stroke-width:4; }
.nt-chart text.label { fill:var(--text); font-size:17px; font-family:var(--font-sans); }
.nt-chart text.label.fixed { fill:var(--fixed); }
'''
HTML = '''<!doctype html><html lang="zh"><head>
<link rel="stylesheet" href="assets/base.css"><link rel="stylesheet" href="assets/theme.css">
</head><body><div id="stage"><h1 class="nt-title">增长率<span class="nt-title-en">Growth Rate</span></h1>
<svg class="nt-chart" width="400" height="100"><path class="fixed" d="M0,80L300,20"/>
<text class="label fixed" id="value" x="20" y="30">200.00</text>
<text class="label" id="mixed" x="100" y="60">20% 参照</text></svg>
<p id="minor" style="font-size:14px;color:#777">辅助说明</p>
<button id="increment">增加</button><output id="count">0</output>
</div><script src="assets/base.js"></script>
<script>document.querySelector('button').onclick=()=>count.textContent=Number(count.textContent)+1;</script>
</body></html>'''


class GuidanceTests(unittest.TestCase):
    def test_actual_builder_inputs_and_tool_results_agree(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = test_builder.PlanningContextTests.make_root(Path(tmp))
            assets = root / 'pages/assets'
            shutil.copy2(ROOT / 'vendor/chassis/CHASSIS.md', assets / 'CHASSIS.md')
            (assets / 'theme.css').write_text(CSS)
            for workflow in ('build-cover', 'build-page', 'build-interaction'):
                inputs = '\n\n'.join(builder.instruction_blocks(root, 6, workflow).values())
                self.assertIn('Director 定主题方向', inputs)
                self.assertIn('风格化容器可以承载整幅图表', inputs)
                self.assertIn('不以有框、白底或面积大单独判错', inputs)
                self.assertIn('必要时可按需读', inputs)
                self.assertIn('字号使用主题 token 或具名排版类', inputs)
                self.assertIn('path.fixed 为线', inputs)
                self.assertIn('同类角色的视觉依据仍沿用主题', inputs)
                self.assertIn('不是所有标题等大', inputs)
                self.assertIn('ECharts/Canvas 也承接主题公开的笔触', inputs)
                self.assertIn('同角色沿用同一默认排版', inputs)
                self.assertIn('不因名称 h1/h2 擅自重新解释已有主题', inputs)
                self.assertIn('SVG 的 stroke 属性不会覆盖它', inputs)
                self.assertIn('具体数据系列归 Builder', inputs)
                self.assertNotIn('必要时沿主题比例调整尺度', inputs)
                self.assertNotIn('font-size:clamp', inputs)  # no full CSS preload
                self.assertNotIn('字号只用主题 token', inputs)
                self.assertNotIn('Builder 只读其 INTERFACE', inputs)
                guidance = tools.check_use(workflow)
                self.assertNotIn('Remove fills, borders and shadows that only group content', guidance)
                if workflow != 'build-cover':
                    self.assertIn('Review container treatments against the initial visual guidance', guidance)
                    self.assertIn('do not flatten every panel into a borderless layout', guidance)
            reference = tools.run('Read', {'file_path':'references/composition.md'},
                                  root / 'pages', ROOT / 'workflows/build-cover', 'page-01')
            text = reference.text if isinstance(reference, tools.Out) else reference
            self.assertIn('When encoding evidence', text)
            self.assertIn('decorative gradients and textures need not encode data', text)
        prompt = (ROOT / 'prompts/style-theme.md').read_text()
        for rule in ('Builder 结合内容完成具体页面的视觉设计', '数字字体不等于完整标签字体',
                     '只改配色则保留未要求改动的字体', '外部视口', '最小 HTML/SVG 例子',
                     '粗 stroke 不得无差别命中文字'):
            self.assertIn(rule, prompt)
        for rule in ('贯穿整套的视觉语言', 'background-size/position/repeat',
                     '必要组合关系', '少量 CSS 变量公开', '不要求固定变体名'):
            self.assertIn(rule, prompt)
        for rule in ('同套同角色保持同一默认排版', '不强制所有标题等大',
                     '复用或修改已有主题时按实际接口理解角色',
                     'hover/focus/aria-pressed', '不要预设训练集/验证集',
                     'currentColor 或公开的局部 CSS 变量', '必要排版角色的少量值'):
            self.assertIn(rule, prompt)


class ConsumerBrowserTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.pages = Path(tmp.name)
        assets = self.pages / 'assets'
        assets.mkdir()
        for name in ('base.css', 'base.js'):
            shutil.copy2(ROOT / 'vendor/chassis' / name, assets / name)
        css = CSS + font_library.snippets(['inter', 'lxgw-wenkai'])
        font_library.prepare(css, assets)
        (assets / 'theme.css').write_text(css)
        self.target = self.pages / 'page-01.html'
        self.target.write_text(HTML)
        pw = sync_playwright().start()
        self.addCleanup(pw.stop)
        self.browser = pw.chromium.launch()
        self.addCleanup(self.browser.close)
        self.page = self.browser.new_page(viewport={'width':1600,'height':900})
        self.page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(self.pages.as_uri()) else r.abort())
        self.page.goto(self.target.as_uri())
        self.page.evaluate('document.fonts.ready')

    def probe(self):
        return self.page.evaluate(check.PROBE)

    def test_background_variant_layer_pairing_and_intentional_repeat(self):
        # Deliberately broken authoring fixture: NOT a production gate/auto-repair.
        from PIL import Image
        self.page.add_style_tag(content='''
          #stage{background-color:white;background-image:linear-gradient(90deg,transparent 86%,cyan 86%),linear-gradient(0deg,transparent 95%,cyan 95%);background-size:160px 100%,100% 120px}
          html[data-variant="full"] #stage{background-size:100% 100%;background-position:0 0;background-repeat:no-repeat}
          html[data-variant="texture"] #stage{background-size:160px 100%,100% 120px;background-repeat:repeat}
        ''')
        def pixels():
            shot = Image.open(io.BytesIO(self.page.screenshot()))
            return [shot.getpixel(p)[:3] for p in ((150,650),(1500,650))]
        self.assertEqual(pixels()[0], (0,255,255))  # unintended left-hand stripe
        self.page.evaluate("document.documentElement.dataset.variant='full'")
        self.assertEqual(pixels(), [(255,255,255),(0,255,255)])
        self.page.evaluate("document.documentElement.dataset.variant='texture'")
        self.assertEqual(pixels()[0], (0,255,255))  # intentional texture is valid
        self.page.evaluate('delete document.documentElement.dataset.variant')
        self.assertEqual(pixels()[0], (0,255,255))

    def test_shared_stroke_reaches_svg_and_echarts_with_local_scale(self):
        shutil.copy2(ROOT/'vendor/chassis/lib/echarts.min.js', self.pages/'assets/echarts.min.js')
        self.page.add_script_tag(url=(self.pages/'assets/echarts.min.js').as_uri())
        self.page.evaluate('''() => {
          stage.innerHTML='<svg id="native" width="200" height="100" viewBox="0 0 400 200"><path id="series" d="M20 160L380 40" fill="none" stroke="#245d9b"/></svg><div id="library" style="width:200px;height:100px"></div>';
          window.chart=echarts.init(document.querySelector('#library'),null,{renderer:'svg'});
          window.draw=()=>{
            const width=Number(Deck.token('--plot-stroke'));
            const svg=document.querySelector('#native');
            const localScale=svg.clientWidth/svg.viewBox.baseVal.width;
            document.querySelector('#series').style.strokeWidth=width/localScale;
            chart.setOption({animation:false,xAxis:{type:'value',show:false},yAxis:{type:'value',show:false},series:[{type:'line',data:[[0,0],[1,1]],symbol:'none',lineStyle:{width,color:'#245d9b'}}]});
          };
        }''')
        for width in (3,6):
            self.page.evaluate('(w)=>{document.documentElement.style.setProperty("--plot-stroke",w);draw()}', width)
            actual=self.page.evaluate('''() => {
              const e=document.querySelector('#series'),m=e.getScreenCTM();
              const line=chart.getZr().storage.getDisplayList().find(e=>e.type==='ec-polyline');
              return {svg:parseFloat(getComputedStyle(e).strokeWidth)*Math.hypot(m.a,m.b),library:line.style.lineWidth};
            }''')
            self.assertEqual(actual, {'svg':width,'library':width})

    def test_typography_roles_allow_cover_scale_and_long_titles(self):
        self.page.add_style_tag(content='''
          .nt-title{width:1000px;font-size:48px;line-height:1.15}
          .nt-title-en{display:block;font-size:.6em}
          .nt-cover-title{font-size:72px}
        ''')
        self.page.evaluate('''() => {
          stage.innerHTML='<h1 class="nt-title nt-cover-title">可学习的函数<span class="nt-title-en">Learning a function</span></h1><h2 class="nt-title">卷积神经网络怎样利用图像的局部结构和共享参数<span class="nt-title-en">Local structure and shared weights</span></h2>';
        }''')
        facts=self.page.locator('.nt-title').evaluate_all('''els=>els.map(e=>({size:parseFloat(getComputedStyle(e).fontSize),ratio:parseFloat(getComputedStyle(e.firstElementChild).fontSize)/parseFloat(getComputedStyle(e).fontSize),fits:e.scrollWidth<=e.clientWidth}))''')
        self.assertEqual([f['size'] for f in facts], [72,48])
        for f in facts:
            self.assertAlmostEqual(f['ratio'], .6)
            self.assertTrue(f['fits'])

    def test_page_heading_role_wraps_without_covering_lead_or_controls(self):
        self.page.add_style_tag(content='''
          :root{--fs-h1:48px;--fs-h2:28px}
          article{width:650px;margin:40px}
          .nt-title{font-size:var(--fs-h1);line-height:1.15;margin:0 0 16px}
          .nt-section-title{font-size:var(--fs-h2);margin:20px 0 8px}
          .nt-cover-title{font-size:72px}
        ''')
        self.page.evaluate('''() => {
          stage.innerHTML='<article><h1 class="nt-title">卷积网络怎样利用图像的局部结构和共享参数</h1><p id="lead">解释与限定条件放在标题之后。</p><h2 class="nt-section-title">局部结构</h2><button id="control">操作</button></article>';
        }''')
        facts = self.page.evaluate('''() => {
          const h=document.querySelector('h1'), p=document.querySelector('#lead');
          return {size:getComputedStyle(h).fontSize, section:getComputedStyle(document.querySelector('h2')).fontSize,
            headingBottom:h.getBoundingClientRect().bottom, leadTop:p.getBoundingClientRect().top,
            lines:h.getBoundingClientRect().height/parseFloat(getComputedStyle(h).lineHeight)};
        }''')
        self.assertEqual(facts['size'], '48px')
        self.assertEqual(facts['section'], '28px')
        self.assertGreater(facts['lines'], 1.5)
        self.assertLessEqual(facts['headingBottom'], facts['leadTop'])
        self.page.locator('#control').click(timeout=2000)
        self.page.evaluate("document.querySelector('h1').textContent='共享参数'")
        self.assertEqual(self.page.locator('h1').evaluate('(e)=>getComputedStyle(e).fontSize'), '48px')

    def test_shared_visual_primitives_do_not_own_series_or_selection_logic(self):
        self.page.add_style_tag(content='''
          .nt-line{fill:none;stroke:currentColor;stroke-width:4px}
          .nt-point{fill:var(--bg);stroke:currentColor;stroke-width:3px}
          .nt-button{background:white;color:var(--text);border:2px solid currentColor}
          .nt-button[aria-pressed="true"]{background:#254d9b;color:white}
        ''')
        self.page.evaluate('''() => {
          stage.innerHTML='<svg width="400" height="100"><g style="color:#254d9b"><path class="nt-line" d="M10 80L390 20"/><circle class="nt-point" cx="390" cy="20" r="4"/></g><g style="color:#a32955"><path class="nt-line" d="M10 70L390 40"/><circle class="nt-point" cx="390" cy="40" r="4"/></g></svg><button class="nt-button" aria-pressed="false">选中</button>';
          document.querySelector('button').onclick=e=>e.currentTarget.setAttribute('aria-pressed', 'true');
        }''')
        for selector in ('.nt-line', '.nt-point'):
            colors = self.page.locator(selector).evaluate_all('es=>es.map(e=>getComputedStyle(e).stroke)')
            self.assertEqual(colors, ['rgb(37, 77, 155)', 'rgb(163, 41, 85)'])
        self.page.locator('button').click()
        self.assertEqual(self.page.locator('button').get_attribute('aria-pressed'), 'true')
        self.assertEqual(self.page.locator('button').evaluate('(e)=>getComputedStyle(e).backgroundColor'),
                         'rgb(37, 77, 155)')

    def test_theme_classes_mixed_fonts_and_uniform_scaling(self):
        first = self.probe()
        self.assertEqual(first['theme']['invalidTokens'], [])
        self.assertNotIn('offScale', first)
        self.assertNotIn('padX', first['theme'])
        self.assertEqual(self.page.locator('#value').evaluate('(e)=>getComputedStyle(e).stroke'), 'none')
        self.assertEqual(self.page.locator('path').evaluate('(e)=>getComputedStyle(e).strokeWidth'), '4px')
        cdp = self.page.context.new_cdp_session(self.page)
        cdp.send('DOM.enable'); cdp.send('CSS.enable')
        doc = cdp.send('DOM.getDocument')['root']['nodeId']
        node = cdp.send('DOM.querySelector', {'nodeId':doc,'selector':'#mixed'})['nodeId']
        fonts = cdp.send('CSS.getPlatformFontsForNode', {'nodeId':node})['fonts']
        self.assertTrue(all(f['isCustomFont'] for f in fonts))
        self.assertTrue(any('WenKai' in f['familyName'] for f in fonts))
        self.assertTrue(any(f['familyName'] == 'Inter' for f in fonts))
        geometry = '''()=>{const e=document.querySelector('.nt-title');return {
          size:getComputedStyle(e).fontSize,height:e.getBoundingClientRect().height,
          width:e.getBoundingClientRect().width}}'''
        before = self.page.evaluate(geometry)
        self.page.set_viewport_size({'width':800,'height':450})
        self.page.wait_for_function('Deck.s === 0.5')
        after = self.page.evaluate(geometry)
        self.assertEqual(before['size'], after['size'])
        self.assertAlmostEqual(after['height']/before['height'], .5, places=3)
        self.assertAlmostEqual(after['width']/before['width'], .5, places=3)
        self.page.locator('#increment').click()
        self.page.locator('#increment').focus(); self.page.keyboard.press('Enter')
        self.assertEqual(self.page.locator('#count').inner_text(), '2')
        # The original overbroad selector is a failing case, not a browser limitation.
        self.page.add_style_tag(content='.nt-chart .fixed{stroke:var(--fixed);stroke-width:4}')
        self.assertNotEqual(self.page.locator('#value').evaluate('(e)=>getComputedStyle(e).stroke'), 'none')

    def test_native_rgb_conversion_and_no_stale_probe_state(self):
        colors = ['#336699','rgb(51,102,153)','oklch(65% 0.15 30)',
                  'color(display-p3 0.2 0.7 0.4)', 'rgb(255 0 0 / 50%)',
                  'transparent', '#336699', 'not-a-color']
        rows = self.page.evaluate('''values=>values.map(value=>{
          document.documentElement.style.setProperty('--test-color',value);
          return {rgb:Deck.rgb('--test-color'),rgba:Deck.rgba('--test-color',.25)}})''', colors)
        expected = [[51,102,153],[51,102,153],[219,102,86],[0,182,93],
                    [255,0,0],[0,0,0],[51,102,153],[0,0,0]]
        for row, rgb in zip(rows, expected):
            self.assertEqual(row['rgb'], rgb)
            self.assertEqual(row['rgba'], 'rgba('+','.join(map(str,rgb))+',0.25)')

    def test_actual_tokens_modern_luminance_and_uncovered_compositing(self):
        self.page.add_style_tag(content='#stage{background-color:oklch(65% 0.15 30)}')
        probe = self.probe()
        components = [v/255 for v in (219,102,86)]
        linear = [v/12.92 if v <= .03928 else ((v+.055)/1.055)**2.4 for v in components]
        expected = sum(v*w for v,w in zip(linear, (.2126,.7152,.0722)))
        self.assertAlmostEqual(probe['theme']['backgroundLuminance'], expected, places=6)
        self.page.evaluate("document.documentElement.style.setProperty('--text','12px')")
        self.assertIn('--text', self.probe()['theme']['invalidTokens'])
        self.page.evaluate("document.documentElement.style.setProperty('--text','')")
        self.assertEqual(self.probe()['theme']['invalidTokens'], [])
        for css in ('#stage{background-image:linear-gradient(red,blue)}',
                    '#stage{background-color:rgb(255 255 255 / 50%)}',
                    '#minor{color:rgb(255 0 0 / 50%)}',
                    '#minor{background:oklch(65% 0.15 30)}'):
            tag = self.page.add_style_tag(content=css)
            state = self.probe()
            self.assertGreater(state['minor']['unmeasuredChars'], 0)
            tag.evaluate('(e)=>e.remove()')


class RuntimeErrorsTests(unittest.TestCase):
    def test_real_resource_runtime_and_overflow_errors_still_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'page.html'
            for name in ('base.css', 'base.js'):
                shutil.copy2(ROOT / 'vendor/chassis' / name, Path(tmp) / name)
            target.write_text('<!doctype html><link rel="stylesheet" href="base.css">'
                             '<div id="stage" style="width:1600px;height:900px">'
                             '<p style="position:absolute;left:1700px">越界</p>'
                             '<img src="missing.png"></div><script src="base.js"></script>'
                             '<script>throw Error("sentinel")</script>')
            results = asyncio.run(check.run([target], wait=0))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                check.report(*results[0])
            report = output.getvalue()
            self.assertIn('sentinel', report)
            self.assertIn('missing.png', report)
            self.assertIn('--bg', report)
            self.assertTrue(results[0][1][0]['probe']['escaped'])


if __name__ == '__main__':
    unittest.main()
