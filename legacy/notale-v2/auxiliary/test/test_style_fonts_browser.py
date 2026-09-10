"""Native webfont and Canvas loading tests; no system font assumptions or model calls."""
from pathlib import Path
import tempfile
import unittest
from playwright.sync_api import sync_playwright
from core import font_library as fonts, theme
from test.test_style_upgrade import CSS


class FontBrowserTests(unittest.TestCase):
    def test_native_bilingual_faces_survive_self_contained_import(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, assets = Path(tmp) / 'source', Path(tmp) / 'assets'
            source.mkdir()
            css = CSS + fonts.snippets(['fusion-pixel', 'inter'])
            css += '\n.nt-title{font-family:"NTF-inter","NTF-fusion-pixel",sans-serif;font-weight:400}'
            fonts.prepare(css, source)
            (source / 'theme.css').write_text(css)
            imported, _ = theme.import_input(source, assets)
            (assets / 'theme.css').write_text(imported)
            (assets / 'index.html').write_text('<link rel="stylesheet" href="theme.css">'
                '<h1 class="nt-title"><span id="zh">知识的形状</span><span id="en">Knowledge</span></h1>')
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(assets.as_uri()) else r.abort())
                page.goto((assets / 'index.html').as_uri())
                page.evaluate('document.fonts.ready')
                cdp = page.context.new_cdp_session(page)
                cdp.send('DOM.enable'); cdp.send('CSS.enable')
                root = cdp.send('DOM.getDocument')['root']['nodeId']
                actual = {}
                for key in ('zh', 'en'):
                    node = cdp.send('DOM.querySelector', {'nodeId': root, 'selector': '#' + key})['nodeId']
                    actual[key] = cdp.send('CSS.getPlatformFontsForNode', {'nodeId': node})['fonts']
                    self.assertTrue(actual[key])
                    self.assertTrue(all(f['isCustomFont'] for f in actual[key]))
                self.assertIn('Fusion', actual['zh'][0]['familyName'])
                self.assertEqual(actual['en'][0]['familyName'], 'Inter')
                browser.close()

    def test_canvas_explicit_load_before_measure_and_draw(self):
        with tempfile.TemporaryDirectory() as tmp:
            assets = Path(tmp)
            css = fonts.snippets(['fusion-pixel'])
            fonts.prepare(css, assets)
            (assets / 'fonts.css').write_text(css)
            (assets / 'index.html').write_text('<link rel="stylesheet" href="fonts.css"><canvas width="600" height="100"></canvas>')
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(assets.as_uri()) else r.abort())
                page.goto((assets / 'index.html').as_uri())
                result = page.evaluate('''async()=>{
                  const font='24px "NTF-fusion-pixel"',text='知识的形状';
                  const before=document.fonts.check(font,text);
                  const loaded=await document.fonts.load(font,text);await document.fonts.ready;
                  const ctx=document.querySelector('canvas').getContext('2d');ctx.font=font;
                  const width=ctx.measureText(text).width;ctx.fillText(text,0,40);
                  return {before,loaded:loaded.map(f=>f.status),ready:document.fonts.check(font,text),width,
                    pixels:[...ctx.getImageData(0,0,600,100).data].some((v,i)=>i%4===3&&v>0)};
                }''')
                self.assertFalse(result['before'])
                self.assertEqual(result['loaded'], ['loaded'])
                self.assertTrue(result['ready'])
                self.assertGreater(result['width'], 0)
                self.assertTrue(result['pixels'])
                browser.close()


if __name__ == '__main__': unittest.main()
