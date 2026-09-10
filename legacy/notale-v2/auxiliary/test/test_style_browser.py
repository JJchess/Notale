"""Offline Chromium diagnostics; run separately from mock-only unit tests."""
import shutil
import tempfile
import unittest
from pathlib import Path
from playwright.sync_api import sync_playwright
from core import theme
from tools.code_scaffold import tool as code_runtime
from test.test_style_upgrade import CSS

ROOT = Path(__file__).resolve().parents[1]
PHOTO = ROOT/'skills/build-page/samples/general/walk-photo-journal/pages/assets/images/holden-pond.jpg'


class BrowserTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.pages = Path(tmp.name)/'pages'
        self.assets = self.pages/'assets'
        self.assets.mkdir(parents=True)
        for name in ('base.css','base.js'):
            shutil.copy2(ROOT/'vendor/chassis'/name,self.assets/name)
        shutil.copy2(PHOTO,self.assets/'photo.jpg')
        (self.assets/'logo.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><rect width="100" height="40" fill="white"/><text x="8" y="27" font-size="24" fill="black">TEST</text></svg>')

    def test_values_variants_images_fonts(self):
        self.assertEqual(theme.validate(CSS,self.assets),[])
        self.assertEqual(theme.validate(CSS+'.nt-title, .nt-controls { color:var(--text) }',self.assets),[])
        for old,new in (('--bg: #fff;', '--bg: nonsense;'),
                        ('--font-sans: sans-serif;', '--font-sans: var(--missing);'),
                        ('--text: #eee;', '--text: 12px;')):
            self.assertTrue(theme.validate(CSS.replace(old,new),self.assets))
        (self.assets/'broken.png').write_bytes(b'not an image')
        (self.assets/'broken.woff2').write_bytes(b'not a font')
        self.assertTrue(theme.validate(CSS+'#stage{background-image:url(broken.png)}',self.assets))
        self.assertTrue(theme.validate(CSS+'@font-face{font-family:test;src:url(broken.woff2)}',self.assets))

    def test_compatibility_rules_and_optional_values_do_not_gate_theme(self):
        css = CSS + '''
.nt-controls input[type="range"]::-webkit-slider-runnable-track { height: 8px; }
.nt-controls input[type="range"]::-moz-range-track { height: 8px; }
.nt-controls input[type="range"]::-moz-range-thumb { background: red; }
.nt-title { color: #123456; color: not-a-color; -moz-appearance: none; }
@supports (-moz-appearance: none) { .nt-title { hanging-punctuation: first; } }
'''
        self.assertEqual(theme.validate(css, self.assets), [])
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            try:
                page = browser.new_page()
                page.set_content('<style>'+css+'</style><h1 class="nt-title">标题</h1>')
                self.assertEqual(page.locator('h1').evaluate('(e)=>getComputedStyle(e).color'),
                                 'rgb(18, 52, 86)')
            finally:
                browser.close()
        # Removing support preflight must not bypass existing safety checks.
        for extra in ('@import "remote.css";',
                      '.nt-controls::-moz-range-thumb { background:url(missing.png); }',
                      '#stage { transform:none; }'):
            with self.subTest(extra=extra):
                self.assertTrue(theme.validate(CSS + extra, self.assets))

    def test_three_mechanisms_and_code_isolation(self):
        html = '''<!doctype html><html><head><link rel="stylesheet" href="assets/base.css"><link rel="stylesheet" href="assets/theme.css"></head>
<body><div id="stage"><h1 class="nt-title">固定诊断页</h1><p>正文与图注</p>
<div class="nt-controls"><button id="increment">增加</button><output id="count">0</output></div>
<svg width="200" height="80"><rect id="bar" width="100" height="40" style="fill:var(--text)"/></svg>
<canvas id="canvas" width="200" height="80"></canvas><span hidden class="nt-title">隐藏内容</span></div>
<script src="assets/base.js"></script><script>Deck.init({index:1,total:1});
document.querySelector('button').onclick=()=>count.textContent=Number(count.textContent)+1;
const ctx=canvas.getContext('2d');ctx.fillStyle=Deck.token('--text');ctx.fillRect(0,0,100,40);</script></body></html>'''
        (self.pages/'index.html').write_text(html)
        brand = '#stage::after{content:"";right:20px;top:20px;width:100px;height:40px;background:url(logo.svg) center/contain no-repeat}'
        styles = {
            'plain': CSS + '#stage{padding:48px;background-color:var(--bg)}',
            'glass': CSS + '#stage{padding:48px;background:linear-gradient(100deg,#adc,#ded)}.nt-controls{backdrop-filter:blur(12px);border-radius:20px;box-shadow:0 8px 20px #0002}',
            'photo': CSS + 'html[data-variant="dark"]{--photo:linear-gradient(90deg,#000b,#0002),url(photo.jpg)}#stage{padding:48px;background-color:var(--bg);background-image:var(--photo,none);background-size:cover}',
        }
        with sync_playwright() as pw:
            browser=pw.chromium.launch()
            page=browser.new_page(viewport={'width':800,'height':450},reduced_motion='reduce')
            blocked=[]
            def offline(route):
                if route.request.url.startswith('file:'): route.continue_()
                else:
                    blocked.append(route.request.url)
                    route.abort()
            page.route('**/*',offline)
            for name,css in styles.items():
                (self.assets/'theme.css').write_text(css+brand)
                page.goto((self.pages/'index.html').as_uri())
                page.locator('#increment').click()
                self.assertEqual(page.locator('#count').inner_text(),'1')
                page.locator('#increment').focus()
                page.keyboard.press('Enter')
                self.assertEqual(page.locator('#count').inner_text(),'2')
                facts=page.evaluate('''() => ({width:stage.getBoundingClientRect().width,
                  hidden:getComputedStyle(document.querySelector('[hidden]')).display,
                  logo:getComputedStyle(stage,'::after').pointerEvents,
                  z:getComputedStyle(stage,'::after').zIndex, color:Deck.token('--text'),
                  pixel:Array.from(canvas.getContext('2d').getImageData(1,1,1,1).data),
                  svg:getComputedStyle(document.querySelector('#bar')).fill, reduced:Deck.reduced()})''')
                self.assertEqual(facts['width'],800)
                self.assertEqual(facts['hidden'],'none')
                self.assertEqual((facts['logo'],facts['z']),('none','100'))
                self.assertEqual(facts['pixel'][:3],[20,20,20])
                self.assertEqual(facts['svg'],'rgb(20, 20, 20)')
                self.assertTrue(facts['reduced'])
                page.evaluate("document.documentElement.dataset.variant='dark'")
                page.wait_for_function("getComputedStyle(document.querySelector('#stage')).color === 'rgb(238, 238, 238)'", timeout=3000)
                self.assertEqual(page.evaluate("getComputedStyle(stage).color"),'rgb(238, 238, 238)',
                    (name,page.evaluate("({variant:document.documentElement.dataset.variant,root:Deck.token('--text'),body:getComputedStyle(document.body).color,stage:getComputedStyle(stage).getPropertyValue('--text')})")))
                if name=='photo':
                    self.assertIn('photo.jpg',page.evaluate("getComputedStyle(stage).backgroundImage"))
                    page.evaluate('delete document.documentElement.dataset.variant')
                    self.assertEqual(page.evaluate('getComputedStyle(stage).backgroundImage'),'none')
            (self.pages/'code.html').write_text(code_runtime._outer_page('page-01','测试',1))
            page.goto((self.pages/'code.html').as_uri())
            self.assertNotIn('theme.css',page.content())
            self.assertEqual(page.evaluate("getComputedStyle(stage,'::after').content"),'none')
            self.assertEqual(page.evaluate('getComputedStyle(stage).backgroundColor'),'rgb(24, 24, 24)')
            self.assertEqual(blocked,[])
            browser.close()


if __name__=='__main__':
    unittest.main()
