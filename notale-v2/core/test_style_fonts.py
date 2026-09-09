"""Font inventory, lazy detail and self-contained delivery regressions (no model calls)."""
import copy
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch

from core import director, font_library as fonts, planner, style_catalog as catalog, theme
from core.test_media import call, response
from core.test_style_upgrade import CSS
from core import test_style_upgrade as fixtures


class FontTests(unittest.TestCase):
    def test_all_details_have_roles_images_and_real_font_files(self):
        roles = ('中文标题', '英文标题', '中文正文', '英文正文', '数字与标签')
        inventory = fonts.inventory()
        self.assertEqual(len(inventory), 19)
        for row in catalog.rows():
            with self.subTest(style=row[0]):
                text, images = catalog.detail(row[0])
                self.assertTrue(all(role in text for role in roles))
                self.assertIn('## 配色结合', text)
                self.assertIn('## 形状与材质', text)
                self.assertIn('## 构图与阅读', text)
                self.assertIn('## 边界与来源', text)
                self.assertEqual(sum(x['type'] == 'input_image' for x in images), 1)
                for key in catalog.font_keys(text):
                    record = inventory[key]
                    self.assertTrue((fonts.ROOT / key / record['license']).is_file())
                    for notice in record.get('notices', []):
                        self.assertTrue((fonts.ROOT / key / notice).is_file())
                    for face in record['files']:
                        self.assertTrue((fonts.ROOT / key / face['file']).is_file())
        text, images = catalog.inputs()
        self.assertEqual(images, [])
        self.assertNotIn('@font-face', text)
        self.assertNotIn('中文标题', text)
        self.assertEqual(catalog.match(' Swiss '), '02-swiss')
        self.assertIsNone(catalog.match('手绘与拼贴结合'))

    def test_explicit_detail_preload_and_legacy_read(self):
        for value in ('Pixel', '像素游戏风', '20-pixel'):
            text, images = catalog.inputs(value)
            self.assertIn('NTF-fusion-pixel', text)
            self.assertNotIn('NTF-bodoni-moda', text)
            self.assertEqual(len([x for x in images if x['type'] == 'input_image']), 1)
        self.assertEqual(catalog.identify('shots/20-pixel.png'), '20-pixel')
        self.assertEqual(catalog.identify('details/20-pixel.md'), '20-pixel')
        for invalid in ('../../config.yaml', 'details/unknown.md', '../fonts/manifest.json', None):
            with self.assertRaises(ValueError): catalog.detail(invalid)

    def test_selected_files_and_licenses_only_with_conflict_protection(self):
        css = CSS + fonts.snippets(['fusion-pixel'])
        with tempfile.TemporaryDirectory() as tmp:
            assets = Path(tmp)
            copied = fonts.prepare(css, assets)
            self.assertEqual(len(copied), 1)
            self.assertEqual([x.name for x in (assets / fonts.PREFIX).iterdir()], ['fusion-pixel'])
            self.assertTrue((assets / fonts.PREFIX / 'fusion-pixel/OFL.txt').is_file())
            for notice in fonts.inventory()['fusion-pixel']['notices']:
                self.assertTrue((assets / fonts.PREFIX / 'fusion-pixel' / notice).is_file())
            self.assertEqual(theme.validate(css, assets, browser=False), [])
            self.assertEqual(fonts.prepare(css, assets), copied)
            target = assets / copied[0]
            target.write_bytes(b'user-owned')
            with self.assertRaisesRegex(ValueError, '不能覆盖'): fonts.prepare(css, assets)
            self.assertEqual(target.read_bytes(), b'user-owned')

    def test_library_path_and_symlink_boundaries(self):
        with tempfile.TemporaryDirectory() as tmp:
            assets = Path(tmp) / 'assets'
            assets.mkdir()
            for url in ('fonts/library/unknown/face.ttf', 'fonts/library/../secret.ttf',
                        'fonts/library/fusion-pixel/face-0.woff2?v=1',
                        'fonts/library/%2e%2e/secret.ttf'):
                with self.assertRaises(ValueError): fonts.prepare(CSS + f'@font-face{{src:url("{url}")}}', assets)
            outside = Path(tmp) / 'elsewhere'
            outside.mkdir()
            (assets / 'fonts').symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, '越界'):
                fonts.prepare(fonts.snippets(['inter']), assets)
            self.assertEqual(list(outside.iterdir()), [])

    def test_imported_theme_keeps_font_notices_without_library_lookup(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, assets = Path(tmp) / 'source', Path(tmp) / 'target'
            source.mkdir()
            css = CSS + fonts.snippets(['fusion-pixel'])
            fonts.prepare(css, source)
            (source / 'theme.css').write_text(css)
            with patch.object(fonts, 'inventory', side_effect=AssertionError('reuse must be self-contained')):
                copied, shots = theme.import_input(source, assets)
            self.assertEqual(shots, [])
            self.assertIn('style/fonts/library/fusion-pixel/face-0.woff2', copied)
            self.assertTrue((assets / 'style/fonts/library/fusion-pixel/OFL.txt').is_file())
            for notice in fonts.inventory()['fusion-pixel']['notices']:
                self.assertTrue((assets / 'style/fonts/library/fusion-pixel' / notice).is_file())
            self.assertEqual(theme.validate(copied, assets, browser=False), [])

    def test_font_notice_cannot_escape_import_boundary(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, assets = Path(tmp) / 'source', Path(tmp) / 'target'
            source.mkdir()
            css = CSS + fonts.snippets(['inter'])
            fonts.prepare(css, source)
            (source / 'theme.css').write_text(css)
            external = Path(tmp) / 'outside.txt'
            external.write_text('not a package notice')
            (source / fonts.PREFIX / 'inter/NOTICE.txt').symlink_to(external)
            with self.assertRaisesRegex(ValueError, '越界'):
                theme.import_input(source, assets)

    def test_font_metadata_and_language_coverage(self):
        from fontTools.ttLib import TTFont
        from hashlib import sha256
        for key, row in fonts.inventory().items():
            for face in row['files']:
                path = fonts.ROOT / key / face['file']
                self.assertEqual(sha256(path.read_bytes()).hexdigest(), face['sha256'])
                with TTFont(path) as font:
                    self.assertEqual(font['name'].getDebugName(16) or font['name'].getDebugName(1), face['family'])
        for key in ('noto-sans-sc', 'noto-serif-sc', 'lxgw-wenkai', 'smiley-sans',
                    'zcool-kuaile', 'zcool-qingke', 'zcool-xiaowei', 'fusion-pixel'):
            self.assertEqual(fonts.missing(key, '知识的形状'), '', key)
        self.assertEqual(fonts.missing('inter', 'ABC 012'), '')
        self.assertEqual(fonts.missing('inter', '中文'), '中文')
        self.assertIn('font-style: italic', fonts.snippets(['smiley-sans']))
        self.assertNotIn('local(', fonts.snippets(['inter']))


class DetailHistoryTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.StyleTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.run, self.assets = fixture.run, fixture.assets

    def test_multi_read_returns_details_and_images_in_same_history(self):
        # Exercise the real prompt, not the fixture's JSON-only slot recorder.
        self.run.prompt = lambda name, **kw: director.llm.fill(
            (self.run.prompts / f'{name}.md').read_text(), **kw)
        histories = []
        answers = iter([response(call('Read', file_path='19-hand-drawn'), call('Read', file_path='18-collage')),
                        response(call('Write', file_path=str(self.assets / 'theme.css'), content=CSS))])
        def respond(_i, history, *args, **kw):
            histories.append(copy.deepcopy(history))
            return next(answers)
        with patch.object(director.llm, 'respond', side_effect=respond), patch.object(director, 'gates', return_value=[]):
            director.theme(self.run, [], 'low', planner.skills.WORKFLOWS)
        self.assertEqual(self.run._style_calls, 2)
        first = json.dumps(histories[0], ensure_ascii=False)
        second = json.dumps(histories[1], ensure_ascii=False)
        for rule in ('Builder 结合内容完成具体页面的视觉设计', '数字字体不等于完整标签字体',
                     '只改配色则保留未要求改动的字体', '最小 HTML/SVG 例子',
                     '整体缩放只交给底盘'):
            self.assertIn(rule, first)
        self.assertNotIn('input_image', first)
        self.assertNotIn('NTF-lxgw-wenkai', first)
        self.assertIn('中文标题', second)
        self.assertIn('NTF-lxgw-wenkai', second)
        self.assertIn('input_image', second)
        self.assertNotIn('base64', str(self.run.log.add.call_args_list))

    def test_explicit_style_writes_once_and_copies_before_gate(self):
        self.run.style = '20-pixel'
        css = CSS + fonts.snippets(['fusion-pixel'])
        def gate(_css, **kw):
            self.assertTrue((self.assets / fonts.PREFIX / 'fusion-pixel/face-0.woff2').is_file())
            return []
        with patch.object(director.llm, 'respond', return_value=response(call('Write', file_path=str(self.assets / 'theme.css'), content=css))), \
             patch.object(director, 'gates', side_effect=gate):
            director.theme(self.run, [], 'low', planner.skills.WORKFLOWS)
        self.assertEqual(self.run._style_calls, 1)
        self.assertEqual((self.assets / 'theme.css').read_text(), css)


if __name__ == '__main__': unittest.main()
