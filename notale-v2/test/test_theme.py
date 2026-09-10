"""Theme behavior contracts; historical versions live in outer legacy."""
from __future__ import annotations

import unittest
from pathlib import Path
from core import director
import copy
import json
import tempfile
from unittest.mock import patch
from PIL import Image
from core import builder, planner, style_catalog, theme
from tools import runtime as tools
from core import font_library as fonts, style_catalog as catalog
import shutil
from playwright.sync_api import sync_playwright
from tools.code_scaffold import tool as code_runtime
import asyncio
import contextlib
import importlib.util
import io
from core import font_library
from test.support import media_call, media_response, make_run, make_style_run, STYLE_CSS

def gate_css(description='页面底色', contract='', extra_css='', outside='', prefix=''):
    return f'/* ==== INTERFACE ====\n{prefix}token --bg #F4F6F2 {description}\n论点 光合作用的透光冷绿底。\n{contract}\n==== /INTERFACE ==== */\n{outside}\n:root {{ --bg: #F4F6F2; --text: #111; --font-sans: sans-serif; {extra_css} }}\n'

class DirectorGateTests(unittest.TestCase):

    def check(self, css):
        return director.gates(css, assets=Path('/tmp'), browser=False)

    def test_plain_theme_passes(self):
        self.assertEqual(self.check(gate_css()), [])

    def test_contract_prohibitions_and_material_metaphors_pass(self):
        for contract in ('禁令 严禁出现任何承载区块底色的卡片或面板层。', '材质 生漆墨木：取自汉代简牍黑漆底板。\n禁令 禁止任何卡片底色块堆叠。'):
            with self.subTest(contract=contract):
                self.assertEqual(self.check(gate_css(contract=contract)), [])

    def test_token_prose_is_not_interpreted_as_surface_permission(self):
        for word in ('承载面', '底板', '卡片底', '面板', '容器背景', '区块底色'):
            for prefix in ('', '   ', ' * '):
                with self.subTest(word=word, prefix=prefix):
                    self.assertEqual(self.check(gate_css(f'页面底色，不用于{word}', prefix=prefix)), [])

    def test_undefined_token_still_fails_without_semantic_keyword_gate(self):
        css = gate_css(contract='token --context #A1B2C3 不是图表承载面')
        self.assertIn('接口 token 未定义: --context', self.check(css))
        self.assertEqual(self.check(gate_css(contract='token --context #A1B2C3 不是图表承载面', extra_css='--context:#A1B2C3;')), [])

    def test_function_and_attribute_commas_do_not_split_local_scope(self):
        for selector in ('.nt-button:is(:hover, :focus-visible)', '.nt-controls:not(:is(.compact, .hidden))', '.nt-controls[data-label="a,b"], .nt-other:has(button, input)'):
            with self.subTest(selector=selector):
                css = gate_css(outside=selector + '{--surface:#fff;color:var(--text)}')
                self.assertEqual(self.check(css), [])

    def test_top_level_branches_still_enforce_shared_boundaries(self):
        for rule, error in (('.nt-button:is(:hover, :focus-visible), button {color:red}', '共享样式'), ('.nt-controls:is(:hover, :focus-visible), :root {--surface:#fff}', '承载面'), ('.nt-controls:is(:hover, :focus-visible), #stage {transform:none}', '底盘')):
            with self.subTest(rule=rule):
                self.assertTrue(any((error in issue for issue in self.check(gate_css(outside=rule)))))

    def test_actual_surface_tokens_still_fail(self):
        for name in ('surface', 'panel', 'card', 'board', 'panel-bg'):
            with self.subTest(name=name):
                errors = self.check(gate_css(extra_css=f'--{name}: #A1B2C3;'))
                self.assertTrue(any(('不许定义承载面 token' in error for error in errors)))

    def test_comments_outside_interface_are_not_token_permissions(self):
        self.assertEqual(self.check(gate_css(outside='/* token --example 禁止面板 */')), [])

class StyleTests(unittest.TestCase):

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.run, self.assets = make_style_run(self.root)

    def test_no_aesthetic_thresholds_or_shape_rejection(self):
        for color in ('#fff', '#eee', '#f5eee4', 'hsl(200 10% 90%)', 'oklch(95% .03 70)'):
            self.assertEqual(theme.validate(STYLE_CSS.replace('#fff;', color + ';'), self.assets, browser=False), [])

    def test_structural_failures(self):
        for css in ('', STYLE_CSS.replace('--text: rgb(20 20 20);', ''), STYLE_CSS + '}', STYLE_CSS[:-2], STYLE_CSS.replace('--bg: #fff;', '--bg #fff;'), STYLE_CSS.replace('variant dark:', 'variant nonexistent:'), STYLE_CSS.replace('.nt-title {', '.other {'), STYLE_CSS + '\n@import "x.css";', STYLE_CSS + '\n#stage {transform:none}', STYLE_CSS + '\n:root {--panel-bg:#fff}'):
            with self.subTest(css=css[-60:]):
                self.assertTrue(theme.validate(css, self.assets, browser=False))

    def test_write_contract(self):
        target = self.assets / 'theme.css'
        good = media_call('Write', file_path=str(target), content=STYLE_CSS)
        self.assertEqual(director._one_write(media_response(good), target), (STYLE_CSS, []))
        for r in (media_response(), media_response(good, good), media_response(media_call('Write', file_path=str(target), content=' ')), media_response(media_call('Write', file_path=str(target), content=42)), media_response(media_call('Write', file_path='/wrong', content=STYLE_CSS))):
            self.assertTrue(director._one_write(r, target)[1])
        for raw in ('[]', 'null', 'false', '"text"', '{'):
            item = copy.copy(good)
            item.arguments = raw
            self.assertTrue(director._one_write(media_response(item), target)[1])

    def test_local_urls_preserve_nested_names_fragments_and_original(self):
        source = self.root / 'package'
        for folder in ('a', 'b'):
            path = source / 'assets' / folder / 'same.png'
            path.parent.mkdir(parents=True)
            Image.new('RGB', (8, 8), 'red').save(path)
        original = STYLE_CSS + '\n#stage {background-image: url("assets/a/same.png#x"),url(assets/b/same.png)}'
        (source / 'theme.css').write_text(original)
        css, shots = theme.import_input(source, self.assets)
        self.assertIn('style/assets/a/same.png#x', css)
        self.assertTrue((self.assets / 'style/assets/b/same.png').is_file())
        self.assertEqual((source / 'theme.css').read_text(), original)
        self.assertEqual(theme.validate(css, self.assets, browser=False), [])
        self.assertEqual(shots, [])

    def test_resource_boundaries(self):
        for url in ('https://example.org/a.png', 'data:image/png;base64,eA==', '../outside.png', '/absolute.png', 'missing.png', 'file:///etc/passwd', 'x.png?v=2'):
            self.assertTrue(theme.validate(STYLE_CSS + f'\n#stage {{background:url("{url}")}}', self.assets, browser=False))
        outside = self.root / 'outside.png'
        Image.new('RGB', (8, 8)).save(outside)
        (self.assets / 'link.png').symlink_to(outside)
        self.assertTrue(theme.validate(STYLE_CSS + '\n#stage{background:url(link.png)}', self.assets, browser=False))
        self.assertEqual(theme.validate(STYLE_CSS + '\n.nt-art{filter:url(#local)}', self.assets, browser=False), [])

    def test_reuse_is_zero_calls_and_invalid_reuse_is_not_repaired(self):
        source = self.root / 'package'
        source.mkdir()
        (source / 'theme.css').write_text(STYLE_CSS)
        self.run.template = source
        with patch.object(director, 'gates', return_value=[]), patch.object(director.llm, 'respond') as model, patch.object(style_catalog, 'inputs') as catalog:
            result = director.direct(self.run, 'low')
            self.assertEqual(result['model_calls'], 0)
            model.assert_not_called()
            catalog.assert_not_called()
        with patch.object(director, 'gates', return_value=['broken']), patch.object(director.llm, 'respond') as model:
            with self.assertRaisesRegex(ValueError, '未授权重写'):
                director.direct(self.run, 'low')
            model.assert_not_called()

    def test_history_contains_rejected_candidate_and_error(self):
        target = self.assets / 'theme.css'
        snapshots = []
        answers = iter([media_response(media_call('Write', file_path=str(target), content='broken candidate')), media_response(media_call('Write', file_path=str(target), content=STYLE_CSS))])

        def respond(_i, hist, *a, **kw):
            snapshots.append(copy.deepcopy(hist))
            return next(answers)
        with patch.object(director.llm, 'respond', side_effect=respond), patch.object(style_catalog, 'inputs', return_value=('catalog', [])), patch.object(director, 'gates', side_effect=[['missing --bg'], []]):
            director.theme(self.run, [], 'low', planner.skills.WORKFLOWS)
        second = json.dumps(snapshots[1], ensure_ascii=False)
        first_slots = json.loads(snapshots[0][0]['content'][0]['text'].split('\n\n明确风格要求：')[0])
        self.assertIn('通用 Paper', first_slots['theme_bans'])
        self.assertIn('broken candidate', second)
        self.assertIn('missing --bg', second)
        self.assertEqual(self.run._style_calls, 2)
        logs = str(self.run.log.add.call_args_list)
        self.assertIn('broken candidate', logs)

    def test_input_conflicts_and_empty_directory(self):
        for args in ((None, ' ', True), (None, 'Swiss', False), (self.root, None, False)):
            with self.assertRaises(ValueError):
                theme.check_options(*args)
        with self.assertRaises(ValueError):
            theme.import_input(self.root, self.assets)

    def test_user_reference_is_copied_and_visible_to_builder(self):
        source = self.root / 'user.png'
        Image.new('RGB', (8, 8)).save(source)
        css, shots = theme.import_input(source, self.assets)
        self.assertFalse(css)
        self.assertEqual(len(shots), 1)
        self.assertEqual(len([x for x in builder.user_ref_images(self.root) if x['type'] == 'input_image']), 1)

    def test_all_40_catalog_entries_and_lazy_details(self):
        rows = style_catalog.rows()
        self.assertEqual(len(rows), 40)
        for row in rows:
            with Image.open(style_catalog.read_path(row[0])) as im:
                self.assertGreater(im.width, 700)
                self.assertGreater(im.height, 180)
        text, images = style_catalog.inputs()
        self.assertTrue(all((r[0] in text for r in rows)))
        self.assertEqual(sum((x['type'] == 'input_image' for x in images)), 0)
        text, images = style_catalog.inputs('包豪斯风')
        self.assertIn('21-bauhaus', text)
        self.assertEqual(sum((x['type'] == 'input_image' for x in images)), 1)
        with self.assertRaises(ValueError):
            style_catalog.read_path('../../config.yaml')
        text, images = style_catalog.selection_inputs()
        self.assertTrue(all((r[0] in text for r in rows)))
        self.assertEqual(sum((x['type'] == 'input_image' for x in images)), 10)
        self.assertIn('1488×656', str([x for x in images if x['type'] == 'input_text']))

    def test_import_does_not_silently_repair_unclosed_css(self):
        source = self.root / 'broken-package'
        source.mkdir()
        (source / 'theme.css').write_text(STYLE_CSS[:-2])
        with self.assertRaisesRegex(ValueError, '未授权重写'):
            theme.import_input(source, self.assets)

    def test_publish_failure_never_leaves_partial_theme(self):
        target = self.assets / 'theme.css'
        with patch.object(theme.os, 'replace', side_effect=OSError('disk failure')):
            with self.assertRaises(OSError):
                theme.publish(STYLE_CSS, target)
        self.assertFalse(target.exists())
        self.assertFalse(list(self.assets.glob('.theme-publish-*')))

    def test_visual_pick_preserves_reason_and_preloads_details_in_two_calls(self):
        history = []
        selection = '19-hand-drawn\t不规则墨线与荧光批注'
        r = media_response(media_call('Write', file_path=str(self.root / 'style-picks.tsv'), content=selection))
        with patch.object(director.llm, 'respond', return_value=r) as model:
            chosen = director.pick(self.run, 'low', history)
            self.assertEqual(chosen, ['19-hand-drawn'])
            first = model.call_args.args[1][0]['content']
            self.assertEqual(sum((x['type'] == 'input_image' for x in first)), 10)
            self.assertIn('通用 Paper', json.loads(first[0]['text'])['theme_bans'])
        self.assertEqual((self.root / 'style-picks.tsv').read_text().strip(), selection)
        self.assertTrue(any((x.get('type') == 'function_call_output' for x in history)))
        snapshot = []

        def respond(_i, hist, *a, **kw):
            snapshot.extend(copy.deepcopy(hist))
            return media_response(media_call('Write', file_path=str(self.assets / 'theme.css'), content=STYLE_CSS))
        with patch.object(director.llm, 'respond', side_effect=respond), patch.object(director, 'gates', return_value=[]):
            director.theme(self.run, chosen, 'low', planner.skills.WORKFLOWS, history)
        self.assertTrue(any((x.get('type') == 'function_call_output' for x in snapshot)))
        body = '\n'.join((c.get('text', '') for item in snapshot if item.get('role') == 'user' for c in item.get('content', []) if isinstance(c, dict)))
        writes = [json.loads(item['arguments'])['content'] for item in snapshot if item.get('type') == 'function_call' and item.get('name') == 'Write']
        self.assertIn(selection, writes)
        self.assertIn('已备妥的字体声明', body)
        self.assertIn('19-hand-drawn.png', body)
        theme_body = next((item['content'][0]['text'] for item in snapshot if item.get('role') == 'user' and isinstance(item.get('content'), list) and ('待修改完整原主题' not in item['content'][0].get('text', '')) and ('\n\n明确风格要求：' in item['content'][0].get('text', ''))))
        self.assertEqual(json.loads(theme_body.split('\n\n明确风格要求：')[0])['theme_bans'], '')
        self.assertEqual(self.run._style_calls, 2)
        self.assertEqual(theme.references((self.assets / 'theme.css').read_text()), [('style', '19-hand-drawn')])

    def test_pick_does_not_gate_reason_length_or_style_count(self):
        for selection in ('01-minimalism', '01-minimalism\n02-swiss\n03-editorial'):
            r = media_response(media_call('Write', file_path=str(self.root / 'style-picks.tsv'), content=selection))
            with patch.object(director.llm, 'respond', return_value=r), patch.object(style_catalog, 'selection_inputs', return_value=('index', [])):
                self.assertEqual(director.pick(self.run, 'low'), selection.splitlines())

    def test_explicit_style_skips_pick(self):
        self.run.style = '19-hand-drawn'
        with patch.object(director, 'pick') as pick, patch.object(director, 'theme', return_value=STYLE_CSS):
            director.direct(self.run, 'low')
        pick.assert_not_called()

    def test_final_reference_is_used_without_candidate_or_old_image(self):
        shots = self.assets / 'style/shots'
        shots.mkdir(parents=True)
        Image.new('RGB', (8, 8)).save(shots / 'old.png')
        css = STYLE_CSS.replace('==== /INTERFACE ====', 'reference style:21-bauhaus\n==== /INTERFACE ====')
        (self.assets / 'theme.css').write_text(css)
        images = builder.theme_ref_images(self.root)
        self.assertEqual(sum((x['type'] == 'input_image' for x in images)), 1)
        captions = str([x for x in images if x['type'] == 'input_text'])
        self.assertIn('21-bauhaus', captions)
        self.assertNotIn('old.png', captions)
        (self.assets / 'theme.css').write_text(STYLE_CSS)
        self.assertIn('old.png', str([x for x in builder.theme_ref_images(self.root) if x['type'] == 'input_text']))

    def test_user_reference_relocation_and_boundary(self):
        source = self.root / 'package'
        source.mkdir()
        Image.new('RGB', (8, 8)).save(source / 'my reference.png')
        css = STYLE_CSS.replace('==== /INTERFACE ====', 'reference user:my reference.png\n==== /INTERFACE ====')
        (source / 'theme.css').write_text(css)
        imported, _ = theme.import_input(source, self.assets)
        self.assertEqual(theme.references(imported), [('user', 'style/my reference.png')])
        self.assertTrue(Path(theme.reference_images(imported, self.assets)[0]['shot']).is_file())
        for value in ('../../outside.png', 'https://example.org/image.png'):
            with self.assertRaises(ValueError):
                theme.reference_images(css.replace('my reference.png', value), self.assets)

    def test_reference_optional_colon_preserves_identity_and_relocation(self):
        css = STYLE_CSS.replace('==== /INTERFACE ====', 'reference: style:03-editorial\nreference style:03-editorial\n==== /INTERFACE ====')
        self.assertEqual(theme.references(css), [('style', '03-editorial')])
        source = self.root / 'package'
        source.mkdir()
        Image.new('RGB', (8, 8)).save(source / 'ref.png')
        (source / 'theme.css').write_text(css.replace('reference: style:03-editorial', 'reference: user:ref.png'))
        imported, _ = theme.import_input(source, self.assets)
        self.assertEqual(theme.references(imported), [('user', 'style/ref.png'), ('style', '03-editorial')])

    def test_theme_submissions_are_bounded_and_keep_source_candidate(self):
        r = media_response(media_call('Write', file_path=str(self.assets / 'theme.css'), content='bad CSS'))
        with patch.object(director.llm, 'respond', return_value=r) as model, patch.object(style_catalog, 'inputs', return_value=('styles', [])), patch.object(director, 'gates', return_value=['invalid']):
            with self.assertRaises(RuntimeError):
                director.theme(self.run, [], 'low', planner.skills.WORKFLOWS)
        self.assertEqual(model.call_count, 3)
        self.assertFalse((self.assets / 'theme.css').exists())
        self.assertEqual(json.loads((self.root / 'style.rejected.json').read_text())['css'], 'bad CSS')

    def test_media_returns_to_same_history_before_write(self):
        target = self.assets / 'theme.css'
        snapshots = []
        answers = iter([media_response(media_call('ImageSearch', query='decorative light')), media_response(media_call('Write', file_path=str(target), content=STYLE_CSS))])

        def respond(_i, hist, *a, **kw):
            snapshots.append(copy.deepcopy(hist))
            return next(answers)
        result = tools.Out('{"results":[{"path":"assets/img/director-x/a.png"}]}', [('image/png', 'eA==')])
        with patch.object(director.llm, 'respond', side_effect=respond), patch.object(director.tools, 'media_call', return_value=result) as fetch_media, patch.object(style_catalog, 'inputs', return_value=('styles', [])), patch.object(director, 'gates', return_value=[]):
            director.theme(self.run, [], 'low', planner.skills.WORKFLOWS)
        self.assertEqual(fetch_media.call_args.args[-1], 'director')
        self.assertIn('input_image', json.dumps(snapshots[1]))
        self.assertIn('assets/img/director-x/a.png', json.dumps(snapshots[1]))
        self.assertNotIn('eA==', str(self.run.log.add.call_args_list))

    def test_explicit_modify_uses_original_without_gallery(self):
        source = self.root / 'package'
        source.mkdir()
        (source / 'theme.css').write_text(STYLE_CSS)
        self.run.template, self.run.style = (source, '改成包豪斯')
        with patch.object(director, 'theme', return_value=STYLE_CSS) as write_theme, patch.object(director, 'pick') as pick:
            result = director.direct(self.run, 'low')
        pick.assert_not_called()
        self.assertEqual(result['route'], 'modify')
        self.assertIn('--text', write_theme.call_args.args[5])

class FontTests(unittest.TestCase):

    def test_all_details_have_roles_images_and_real_font_files(self):
        roles = ('中文标题', '英文标题', '中文正文', '英文正文', '数字与标签')
        inventory = fonts.inventory()
        self.assertEqual(len(inventory), 19)
        for row in catalog.rows():
            with self.subTest(style=row[0]):
                text, images = catalog.detail(row[0])
                self.assertTrue(all((role in text for role in roles)))
                for heading in ('核心特征', '参考图观察', '字体建议', '可变表达', '项目应用建议', '来源与定义边界'):
                    self.assertIn('## ' + heading, text)
                self.assertIn(row[2], text)
                self.assertIn('### 形状与材质', text)
                self.assertIn('### 构图与阅读', text)
                self.assertEqual(sum((x['type'] == 'input_image' for x in images)), 1)
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
        self.assertEqual(catalog.match('日式与北欧融合风'), '32-japandi')

    def test_conditional_fonts_remain_lazy_and_available(self):
        for key in ('05-bento-grid', '25-dashboard', '37-split-screen'):
            text, _ = catalog.detail(key)
            self.assertIn('条件备选', text)
            self.assertIn('NTF-noto-serif-sc', text)
            self.assertIn('NTF-zcool-qingke', text)
            self.assertNotIn('NTF-fusion-pixel', text)

    def test_explicit_detail_preload_and_legacy_read(self):
        for value in ('Pixel', '像素游戏风', '20-pixel'):
            text, images = catalog.inputs(value)
            self.assertIn('NTF-fusion-pixel', text)
            self.assertNotIn('NTF-bodoni-moda', text)
            self.assertEqual(len([x for x in images if x['type'] == 'input_image']), 1)
        self.assertEqual(catalog.identify('shots/20-pixel.png'), '20-pixel')
        self.assertEqual(catalog.identify('details/20-pixel.md'), '20-pixel')
        for invalid in ('../../config.yaml', 'details/unknown.md', '../fonts/manifest.json', None):
            with self.assertRaises(ValueError):
                catalog.detail(invalid)

    def test_selected_files_and_licenses_only_with_conflict_protection(self):
        css = STYLE_CSS + fonts.snippets(['fusion-pixel'])
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
            with self.assertRaisesRegex(ValueError, '不能覆盖'):
                fonts.prepare(css, assets)
            self.assertEqual(target.read_bytes(), b'user-owned')

    def test_library_path_and_symlink_boundaries(self):
        with tempfile.TemporaryDirectory() as tmp:
            assets = Path(tmp) / 'assets'
            assets.mkdir()
            for url in ('fonts/library/unknown/face.ttf', 'fonts/library/../secret.ttf', 'fonts/library/fusion-pixel/face-0.woff2?v=1', 'fonts/library/%2e%2e/secret.ttf'):
                with self.assertRaises(ValueError):
                    fonts.prepare(STYLE_CSS + f'@font-face{{src:url("{url}")}}', assets)
            outside = Path(tmp) / 'elsewhere'
            outside.mkdir()
            (assets / 'fonts').symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, '越界'):
                fonts.prepare(fonts.snippets(['inter']), assets)
            self.assertEqual(list(outside.iterdir()), [])

    def test_imported_theme_keeps_font_notices_without_library_lookup(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, assets = (Path(tmp) / 'source', Path(tmp) / 'target')
            source.mkdir()
            css = STYLE_CSS + fonts.snippets(['fusion-pixel'])
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
            source, assets = (Path(tmp) / 'source', Path(tmp) / 'target')
            source.mkdir()
            css = STYLE_CSS + fonts.snippets(['inter'])
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
        for key in ('noto-sans-sc', 'noto-serif-sc', 'lxgw-wenkai', 'smiley-sans', 'zcool-kuaile', 'zcool-qingke', 'zcool-xiaowei', 'fusion-pixel'):
            self.assertEqual(fonts.missing(key, '知识的形状'), '', key)
        self.assertEqual(fonts.missing('inter', 'ABC 012'), '')
        self.assertEqual(fonts.missing('inter', '中文'), '中文')
        self.assertIn('font-style: italic', fonts.snippets(['smiley-sans']))
        self.assertNotIn('local(', fonts.snippets(['inter']))

class DetailHistoryTests(unittest.TestCase):

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.run, self.assets = make_style_run(self.root)

    def test_multi_read_returns_details_and_images_in_same_history(self):
        self.run.prompt = lambda name, **kw: director.llm.fill((self.run.prompts / f'{name}.md').read_text(), **kw)
        histories = []
        answers = iter([media_response(media_call('Read', file_path='19-hand-drawn'), media_call('Read', file_path='18-collage')), media_response(media_call('Write', file_path=str(self.assets / 'theme.css'), content=STYLE_CSS))])

        def respond(_i, history, *args, **kw):
            histories.append(copy.deepcopy(history))
            return next(answers)
        with patch.object(director.llm, 'respond', side_effect=respond), patch.object(director, 'gates', return_value=[]):
            director.theme(self.run, [], 'low', planner.skills.WORKFLOWS)
        self.assertEqual(self.run._style_calls, 2)
        first = json.dumps(histories[0], ensure_ascii=False)
        second = json.dumps(histories[1], ensure_ascii=False)
        for rule in ('Builder 结合内容完成具体页面的视觉设计', '数字字体不等于完整标签字体', '只改配色则保留未要求改动的字体', '最小 HTML/SVG 例子', '整体缩放只交给底盘'):
            self.assertIn(rule, first)
        self.assertNotIn('input_image', first)
        self.assertNotIn('NTF-lxgw-wenkai', first)
        self.assertIn('中文标题', second)
        self.assertIn('NTF-lxgw-wenkai', second)
        self.assertIn('input_image', second)
        self.assertNotIn('base64', str(self.run.log.add.call_args_list))

    def test_explicit_style_writes_once_and_copies_before_gate(self):
        self.run.style = '20-pixel'
        css = STYLE_CSS + fonts.snippets(['fusion-pixel'])

        def gate(_css, **kw):
            self.assertTrue((self.assets / fonts.PREFIX / 'fusion-pixel/face-0.woff2').is_file())
            return []
        with patch.object(director.llm, 'respond', return_value=media_response(media_call('Write', file_path=str(self.assets / 'theme.css'), content=css))), patch.object(director, 'gates', side_effect=gate):
            director.theme(self.run, [], 'low', planner.skills.WORKFLOWS)
        self.assertEqual(self.run._style_calls, 1)
        self.assertEqual((self.assets / 'theme.css').read_text(), css.replace('==== /INTERFACE ====', 'reference style:20-pixel\n==== /INTERFACE ===='))
ROOT = Path(__file__).resolve().parents[1]
style_browser_PHOTO = ROOT / 'skills/build-page/samples/general/walk-photo-journal/pages/assets/images/holden-pond.jpg'

class BrowserTests(unittest.TestCase):

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.pages = Path(tmp.name) / 'pages'
        self.assets = self.pages / 'assets'
        self.assets.mkdir(parents=True)
        for name in ('base.css', 'base.js'):
            shutil.copy2(ROOT / 'vendor/chassis' / name, self.assets / name)
        shutil.copy2(style_browser_PHOTO, self.assets / 'photo.jpg')
        (self.assets / 'logo.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><rect width="100" height="40" fill="white"/><text x="8" y="27" font-size="24" fill="black">TEST</text></svg>')

    def test_values_variants_images_fonts(self):
        self.assertEqual(theme.validate(STYLE_CSS, self.assets), [])
        self.assertEqual(theme.validate(STYLE_CSS + '.nt-title, .nt-controls { color:var(--text) }', self.assets), [])
        for old, new in (('--bg: #fff;', '--bg: nonsense;'), ('--font-sans: sans-serif;', '--font-sans: var(--missing);'), ('--text: #eee;', '--text: 12px;')):
            self.assertTrue(theme.validate(STYLE_CSS.replace(old, new), self.assets))
        (self.assets / 'broken.png').write_bytes(b'not an image')
        (self.assets / 'broken.woff2').write_bytes(b'not a font')
        self.assertTrue(theme.validate(STYLE_CSS + '#stage{background-image:url(broken.png)}', self.assets))
        self.assertTrue(theme.validate(STYLE_CSS + '@font-face{font-family:test;src:url(broken.woff2)}', self.assets))

    def test_compatibility_rules_and_optional_values_do_not_gate_theme(self):
        css = STYLE_CSS + '\n.nt-controls input[type="range"]::-webkit-slider-runnable-track { height: 8px; }\n.nt-controls input[type="range"]::-moz-range-track { height: 8px; }\n.nt-controls input[type="range"]::-moz-range-thumb { background: red; }\n.nt-title { color: #123456; color: not-a-color; -moz-appearance: none; }\n@supports (-moz-appearance: none) { .nt-title { hanging-punctuation: first; } }\n'
        self.assertEqual(theme.validate(css, self.assets), [])
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            try:
                page = browser.new_page()
                page.set_content('<style>' + css + '</style><h1 class="nt-title">标题</h1>')
                self.assertEqual(page.locator('h1').evaluate('(e)=>getComputedStyle(e).color'), 'rgb(18, 52, 86)')
            finally:
                browser.close()
        for extra in ('@import "remote.css";', '.nt-controls::-moz-range-thumb { background:url(missing.png); }', '#stage { transform:none; }'):
            with self.subTest(extra=extra):
                self.assertTrue(theme.validate(STYLE_CSS + extra, self.assets))

    def test_three_mechanisms_and_code_isolation(self):
        html = '<!doctype html><html><head><link rel="stylesheet" href="assets/base.css"><link rel="stylesheet" href="assets/theme.css"></head>\n<body><div id="stage"><h1 class="nt-title">固定诊断页</h1><p>正文与图注</p>\n<div class="nt-controls"><button id="increment">增加</button><output id="count">0</output></div>\n<svg width="200" height="80"><rect id="bar" width="100" height="40" style="fill:var(--text)"/></svg>\n<canvas id="canvas" width="200" height="80"></canvas><span hidden class="nt-title">隐藏内容</span></div>\n<script src="assets/base.js"></script><script>Deck.init({index:1,total:1});\ndocument.querySelector(\'button\').onclick=()=>count.textContent=Number(count.textContent)+1;\nconst ctx=canvas.getContext(\'2d\');ctx.fillStyle=Deck.token(\'--text\');ctx.fillRect(0,0,100,40);</script></body></html>'
        (self.pages / 'index.html').write_text(html)
        brand = '#stage::after{content:"";right:20px;top:20px;width:100px;height:40px;background:url(logo.svg) center/contain no-repeat}'
        styles = {'plain': STYLE_CSS + '#stage{padding:48px;background-color:var(--bg)}', 'glass': STYLE_CSS + '#stage{padding:48px;background:linear-gradient(100deg,#adc,#ded)}.nt-controls{backdrop-filter:blur(12px);border-radius:20px;box-shadow:0 8px 20px #0002}', 'photo': STYLE_CSS + 'html[data-variant="dark"]{--photo:linear-gradient(90deg,#000b,#0002),url(photo.jpg)}#stage{padding:48px;background-color:var(--bg);background-image:var(--photo,none);background-size:cover}'}
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page(viewport={'width': 800, 'height': 450}, reduced_motion='reduce')
            blocked = []

            def offline(route):
                if route.request.url.startswith('file:'):
                    route.continue_()
                else:
                    blocked.append(route.request.url)
                    route.abort()
            page.route('**/*', offline)
            for name, css in styles.items():
                (self.assets / 'theme.css').write_text(css + brand)
                page.goto((self.pages / 'index.html').as_uri())
                page.locator('#increment').click()
                self.assertEqual(page.locator('#count').inner_text(), '1')
                page.locator('#increment').focus()
                page.keyboard.press('Enter')
                self.assertEqual(page.locator('#count').inner_text(), '2')
                facts = page.evaluate("() => ({width:stage.getBoundingClientRect().width,\n                  hidden:getComputedStyle(document.querySelector('[hidden]')).display,\n                  logo:getComputedStyle(stage,'::after').pointerEvents,\n                  z:getComputedStyle(stage,'::after').zIndex, color:Deck.token('--text'),\n                  pixel:Array.from(canvas.getContext('2d').getImageData(1,1,1,1).data),\n                  svg:getComputedStyle(document.querySelector('#bar')).fill, reduced:Deck.reduced()})")
                self.assertEqual(facts['width'], 800)
                self.assertEqual(facts['hidden'], 'none')
                self.assertEqual((facts['logo'], facts['z']), ('none', '100'))
                self.assertEqual(facts['pixel'][:3], [20, 20, 20])
                self.assertEqual(facts['svg'], 'rgb(20, 20, 20)')
                self.assertTrue(facts['reduced'])
                page.evaluate("document.documentElement.dataset.variant='dark'")
                page.wait_for_function("getComputedStyle(document.querySelector('#stage')).color === 'rgb(238, 238, 238)'", timeout=3000)
                self.assertEqual(page.evaluate('getComputedStyle(stage).color'), 'rgb(238, 238, 238)', (name, page.evaluate("({variant:document.documentElement.dataset.variant,root:Deck.token('--text'),body:getComputedStyle(document.body).color,stage:getComputedStyle(stage).getPropertyValue('--text')})")))
                if name == 'photo':
                    self.assertIn('photo.jpg', page.evaluate('getComputedStyle(stage).backgroundImage'))
                    page.evaluate('delete document.documentElement.dataset.variant')
                    self.assertEqual(page.evaluate('getComputedStyle(stage).backgroundImage'), 'none')
            (self.pages / 'code.html').write_text(code_runtime._outer_page('page-01', '测试', 1))
            page.goto((self.pages / 'code.html').as_uri())
            self.assertNotIn('theme.css', page.content())
            self.assertEqual(page.evaluate("getComputedStyle(stage,'::after').content"), 'none')
            self.assertEqual(page.evaluate('getComputedStyle(stage).backgroundColor'), 'rgb(24, 24, 24)')
            self.assertEqual(blocked, [])
            browser.close()

class FontBrowserTests(unittest.TestCase):

    def test_native_bilingual_faces_survive_self_contained_import(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, assets = (Path(tmp) / 'source', Path(tmp) / 'assets')
            source.mkdir()
            css = STYLE_CSS + fonts.snippets(['fusion-pixel', 'inter'])
            css += '\n.nt-title{font-family:"NTF-inter","NTF-fusion-pixel",sans-serif;font-weight:400}'
            fonts.prepare(css, source)
            (source / 'theme.css').write_text(css)
            imported, _ = theme.import_input(source, assets)
            (assets / 'theme.css').write_text(imported)
            (assets / 'index.html').write_text('<link rel="stylesheet" href="theme.css"><h1 class="nt-title"><span id="zh">知识的形状</span><span id="en">Knowledge</span></h1>')
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(assets.as_uri()) else r.abort())
                page.goto((assets / 'index.html').as_uri())
                page.evaluate('document.fonts.ready')
                cdp = page.context.new_cdp_session(page)
                cdp.send('DOM.enable')
                cdp.send('CSS.enable')
                root = cdp.send('DOM.getDocument')['root']['nodeId']
                actual = {}
                for key in ('zh', 'en'):
                    node = cdp.send('DOM.querySelector', {'nodeId': root, 'selector': '#' + key})['nodeId']
                    actual[key] = cdp.send('CSS.getPlatformFontsForNode', {'nodeId': node})['fonts']
                    self.assertTrue(actual[key])
                    self.assertTrue(all((f['isCustomFont'] for f in actual[key])))
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
                result = page.evaluate('async()=>{\n                  const font=\'24px "NTF-fusion-pixel"\',text=\'知识的形状\';\n                  const before=document.fonts.check(font,text);\n                  const loaded=await document.fonts.load(font,text);await document.fonts.ready;\n                  const ctx=document.querySelector(\'canvas\').getContext(\'2d\');ctx.font=font;\n                  const width=ctx.measureText(text).width;ctx.fillText(text,0,40);\n                  return {before,loaded:loaded.map(f=>f.status),ready:document.fonts.check(font,text),width,\n                    pixels:[...ctx.getImageData(0,0,600,100).data].some((v,i)=>i%4===3&&v>0)};\n                }')
                self.assertFalse(result['before'])
                self.assertEqual(result['loaded'], ['loaded'])
                self.assertTrue(result['ready'])
                self.assertGreater(result['width'], 0)
                self.assertTrue(result['pixels'])
                browser.close()
ROOT = Path(__file__).resolve().parents[1]
style_consumers_spec = importlib.util.spec_from_file_location('consumer_selfcheck', ROOT / 'vendor/chassis/selfcheck.py')
style_consumers_check = importlib.util.module_from_spec(style_consumers_spec)
style_consumers_spec.loader.exec_module(style_consumers_check)
style_consumers_CSS = '/* ==== INTERFACE ====\ntoken --bg: 背景\ntoken --text: 正文\ntoken --font-sans: 中英混排\ntoken --fs-h2: 标题字阶\nclass .nt-title: 标题，英文子元素 .nt-title-en\nclass .nt-chart: SVG 宿主，path.fixed 为线，text.label 为混排标签\n用法：<svg class="nt-chart"><path class="fixed"/><text class="label fixed">200.00</text></svg>\n==== /INTERFACE ==== */\n:root { --bg:#fff; --text:#111; --font-sans:"NTF-inter","NTF-lxgw-wenkai",sans-serif;\n  --fs-h2:48px; --fixed:#254d9b; }\n#stage { color:var(--text); background-color:var(--bg); font-family:var(--font-sans); }\n.nt-title { font-size:clamp(44px,calc(var(--fs-h2) * 1.2),68px); }\n.nt-title-en { font-size:.76em; }\n.nt-chart path.fixed { fill:none; stroke:var(--fixed); stroke-width:4; }\n.nt-chart text.label { fill:var(--text); font-size:17px; font-family:var(--font-sans); }\n.nt-chart text.label.fixed { fill:var(--fixed); }\n'
style_consumers_HTML = '<!doctype html><html lang="zh"><head>\n<link rel="stylesheet" href="assets/base.css"><link rel="stylesheet" href="assets/theme.css">\n</head><body><div id="stage"><h1 class="nt-title">增长率<span class="nt-title-en">Growth Rate</span></h1>\n<svg class="nt-chart" width="400" height="100"><path class="fixed" d="M0,80L300,20"/>\n<text class="label fixed" id="value" x="20" y="30">200.00</text>\n<text class="label" id="mixed" x="100" y="60">20% 参照</text></svg>\n<p id="minor" style="font-size:14px;color:#777">辅助说明</p>\n<button id="increment">增加</button><output id="count">0</output>\n</div><script src="assets/base.js"></script>\n<script>document.querySelector(\'button\').onclick=()=>count.textContent=Number(count.textContent)+1;</script>\n</body></html>'

class GuidanceTests(unittest.TestCase):

    def test_theme_interface_is_loaded_without_private_css(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = make_run(Path(tmp))
            (root / 'pages/assets/theme.css').write_text(style_consumers_CSS)
            for workflow in ('build-cover', 'build-page', 'build-interaction'):
                with self.subTest(workflow=workflow):
                    inputs = '\n'.join(builder.instruction_blocks(root, 6, workflow).values())
                    self.assertIn('path.fixed 为线', inputs)
                    self.assertNotIn('font-size:clamp', inputs)

class ConsumerBrowserTests(unittest.TestCase):

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.pages = Path(tmp.name)
        assets = self.pages / 'assets'
        assets.mkdir()
        for name in ('base.css', 'base.js'):
            shutil.copy2(ROOT / 'vendor/chassis' / name, assets / name)
        css = style_consumers_CSS + font_library.snippets(['inter', 'lxgw-wenkai'])
        font_library.prepare(css, assets)
        (assets / 'theme.css').write_text(css)
        self.target = self.pages / 'page-01.html'
        self.target.write_text(style_consumers_HTML)
        pw = sync_playwright().start()
        self.addCleanup(pw.stop)
        self.browser = pw.chromium.launch()
        self.addCleanup(self.browser.close)
        self.page = self.browser.new_page(viewport={'width': 1600, 'height': 900})
        self.page.route('**/*', lambda r: r.continue_() if r.request.url.startswith(self.pages.as_uri()) else r.abort())
        self.page.goto(self.target.as_uri())
        self.page.evaluate('document.fonts.ready')

    def probe(self):
        return self.page.evaluate(style_consumers_check.PROBE)

    def test_background_variant_layer_pairing_and_intentional_repeat(self):
        from PIL import Image
        self.page.add_style_tag(content='\n          #stage{background-color:white;background-image:linear-gradient(90deg,transparent 86%,cyan 86%),linear-gradient(0deg,transparent 95%,cyan 95%);background-size:160px 100%,100% 120px}\n          html[data-variant="full"] #stage{background-size:100% 100%;background-position:0 0;background-repeat:no-repeat}\n          html[data-variant="texture"] #stage{background-size:160px 100%,100% 120px;background-repeat:repeat}\n        ')

        def pixels():
            shot = Image.open(io.BytesIO(self.page.screenshot()))
            return [shot.getpixel(p)[:3] for p in ((150, 650), (1500, 650))]
        self.assertEqual(pixels()[0], (0, 255, 255))
        self.page.evaluate("document.documentElement.dataset.variant='full'")
        self.assertEqual(pixels(), [(255, 255, 255), (0, 255, 255)])
        self.page.evaluate("document.documentElement.dataset.variant='texture'")
        self.assertEqual(pixels()[0], (0, 255, 255))
        self.page.evaluate('delete document.documentElement.dataset.variant')
        self.assertEqual(pixels()[0], (0, 255, 255))

    def test_shared_stroke_reaches_svg_and_echarts_with_local_scale(self):
        shutil.copy2(ROOT / 'vendor/chassis/lib/echarts.min.js', self.pages / 'assets/echarts.min.js')
        self.page.add_script_tag(url=(self.pages / 'assets/echarts.min.js').as_uri())
        self.page.evaluate('() => {\n          stage.innerHTML=\'<svg id="native" width="200" height="100" viewBox="0 0 400 200"><path id="series" d="M20 160L380 40" fill="none" stroke="#245d9b"/></svg><div id="library" style="width:200px;height:100px"></div>\';\n          window.chart=echarts.init(document.querySelector(\'#library\'),null,{renderer:\'svg\'});\n          window.draw=()=>{\n            const width=Number(Deck.token(\'--plot-stroke\'));\n            const svg=document.querySelector(\'#native\');\n            const localScale=svg.clientWidth/svg.viewBox.baseVal.width;\n            document.querySelector(\'#series\').style.strokeWidth=width/localScale;\n            chart.setOption({animation:false,xAxis:{type:\'value\',show:false},yAxis:{type:\'value\',show:false},series:[{type:\'line\',data:[[0,0],[1,1]],symbol:\'none\',lineStyle:{width,color:\'#245d9b\'}}]});\n          };\n        }')
        for width in (3, 6):
            self.page.evaluate('(w)=>{document.documentElement.style.setProperty("--plot-stroke",w);draw()}', width)
            actual = self.page.evaluate("() => {\n              const e=document.querySelector('#series'),m=e.getScreenCTM();\n              const line=chart.getZr().storage.getDisplayList().find(e=>e.type==='ec-polyline');\n              return {svg:parseFloat(getComputedStyle(e).strokeWidth)*Math.hypot(m.a,m.b),library:line.style.lineWidth};\n            }")
            self.assertEqual(actual, {'svg': width, 'library': width})

    def test_typography_roles_allow_cover_scale_and_long_titles(self):
        self.page.add_style_tag(content='\n          .nt-title{width:1000px;font-size:48px;line-height:1.15}\n          .nt-title-en{display:block;font-size:.6em}\n          .nt-cover-title{font-size:72px}\n        ')
        self.page.evaluate('() => {\n          stage.innerHTML=\'<h1 class="nt-title nt-cover-title">可学习的函数<span class="nt-title-en">Learning a function</span></h1><h2 class="nt-title">卷积神经网络怎样利用图像的局部结构和共享参数<span class="nt-title-en">Local structure and shared weights</span></h2>\';\n        }')
        facts = self.page.locator('.nt-title').evaluate_all('els=>els.map(e=>({size:parseFloat(getComputedStyle(e).fontSize),ratio:parseFloat(getComputedStyle(e.firstElementChild).fontSize)/parseFloat(getComputedStyle(e).fontSize),fits:e.scrollWidth<=e.clientWidth}))')
        self.assertEqual([f['size'] for f in facts], [72, 48])
        for f in facts:
            self.assertAlmostEqual(f['ratio'], 0.6)
            self.assertTrue(f['fits'])

    def test_page_heading_role_wraps_without_covering_lead_or_controls(self):
        self.page.add_style_tag(content='\n          :root{--fs-h1:48px;--fs-h2:28px}\n          article{width:650px;margin:40px}\n          .nt-title{font-size:var(--fs-h1);line-height:1.15;margin:0 0 16px}\n          .nt-section-title{font-size:var(--fs-h2);margin:20px 0 8px}\n          .nt-cover-title{font-size:72px}\n        ')
        self.page.evaluate('() => {\n          stage.innerHTML=\'<article><h1 class="nt-title">卷积网络怎样利用图像的局部结构和共享参数</h1><p id="lead">解释与限定条件放在标题之后。</p><h2 class="nt-section-title">局部结构</h2><button id="control">操作</button></article>\';\n        }')
        facts = self.page.evaluate("() => {\n          const h=document.querySelector('h1'), p=document.querySelector('#lead');\n          return {size:getComputedStyle(h).fontSize, section:getComputedStyle(document.querySelector('h2')).fontSize,\n            headingBottom:h.getBoundingClientRect().bottom, leadTop:p.getBoundingClientRect().top,\n            lines:h.getBoundingClientRect().height/parseFloat(getComputedStyle(h).lineHeight)};\n        }")
        self.assertEqual(facts['size'], '48px')
        self.assertEqual(facts['section'], '28px')
        self.assertGreater(facts['lines'], 1.5)
        self.assertLessEqual(facts['headingBottom'], facts['leadTop'])
        self.page.locator('#control').click(timeout=2000)
        self.page.evaluate("document.querySelector('h1').textContent='共享参数'")
        self.assertEqual(self.page.locator('h1').evaluate('(e)=>getComputedStyle(e).fontSize'), '48px')

    def test_shared_visual_primitives_do_not_own_series_or_selection_logic(self):
        self.page.add_style_tag(content='\n          .nt-line{fill:none;stroke:currentColor;stroke-width:4px}\n          .nt-point{fill:var(--bg);stroke:currentColor;stroke-width:3px}\n          .nt-button{background:white;color:var(--text);border:2px solid currentColor}\n          .nt-button[aria-pressed="true"]{background:#254d9b;color:white}\n        ')
        self.page.evaluate('() => {\n          stage.innerHTML=\'<svg width="400" height="100"><g style="color:#254d9b"><path class="nt-line" d="M10 80L390 20"/><circle class="nt-point" cx="390" cy="20" r="4"/></g><g style="color:#a32955"><path class="nt-line" d="M10 70L390 40"/><circle class="nt-point" cx="390" cy="40" r="4"/></g></svg><button class="nt-button" aria-pressed="false">选中</button>\';\n          document.querySelector(\'button\').onclick=e=>e.currentTarget.setAttribute(\'aria-pressed\', \'true\');\n        }')
        for selector in ('.nt-line', '.nt-point'):
            colors = self.page.locator(selector).evaluate_all('es=>es.map(e=>getComputedStyle(e).stroke)')
            self.assertEqual(colors, ['rgb(37, 77, 155)', 'rgb(163, 41, 85)'])
        self.page.locator('button').click()
        self.assertEqual(self.page.locator('button').get_attribute('aria-pressed'), 'true')
        self.assertEqual(self.page.locator('button').evaluate('(e)=>getComputedStyle(e).backgroundColor'), 'rgb(37, 77, 155)')

    def test_theme_classes_mixed_fonts_and_uniform_scaling(self):
        first = self.probe()
        self.assertEqual(first['theme']['invalidTokens'], [])
        self.assertNotIn('offScale', first)
        self.assertNotIn('padX', first['theme'])
        self.assertEqual(self.page.locator('#value').evaluate('(e)=>getComputedStyle(e).stroke'), 'none')
        self.assertEqual(self.page.locator('path').evaluate('(e)=>getComputedStyle(e).strokeWidth'), '4px')
        cdp = self.page.context.new_cdp_session(self.page)
        cdp.send('DOM.enable')
        cdp.send('CSS.enable')
        doc = cdp.send('DOM.getDocument')['root']['nodeId']
        node = cdp.send('DOM.querySelector', {'nodeId': doc, 'selector': '#mixed'})['nodeId']
        fonts = cdp.send('CSS.getPlatformFontsForNode', {'nodeId': node})['fonts']
        self.assertTrue(all((f['isCustomFont'] for f in fonts)))
        self.assertTrue(any(('WenKai' in f['familyName'] for f in fonts)))
        self.assertTrue(any((f['familyName'] == 'Inter' for f in fonts)))
        geometry = "()=>{const e=document.querySelector('.nt-title');return {\n          size:getComputedStyle(e).fontSize,height:e.getBoundingClientRect().height,\n          width:e.getBoundingClientRect().width}}"
        before = self.page.evaluate(geometry)
        self.page.set_viewport_size({'width': 800, 'height': 450})
        self.page.wait_for_function('Deck.s === 0.5')
        after = self.page.evaluate(geometry)
        self.assertEqual(before['size'], after['size'])
        self.assertAlmostEqual(after['height'] / before['height'], 0.5, places=3)
        self.assertAlmostEqual(after['width'] / before['width'], 0.5, places=3)
        self.page.locator('#increment').click()
        self.page.locator('#increment').focus()
        self.page.keyboard.press('Enter')
        self.assertEqual(self.page.locator('#count').inner_text(), '2')
        self.page.add_style_tag(content='.nt-chart .fixed{stroke:var(--fixed);stroke-width:4}')
        self.assertNotEqual(self.page.locator('#value').evaluate('(e)=>getComputedStyle(e).stroke'), 'none')

    def test_native_rgb_conversion_and_no_stale_probe_state(self):
        colors = ['#336699', 'rgb(51,102,153)', 'oklch(65% 0.15 30)', 'color(display-p3 0.2 0.7 0.4)', 'rgb(255 0 0 / 50%)', 'transparent', '#336699', 'not-a-color']
        rows = self.page.evaluate("values=>values.map(value=>{\n          document.documentElement.style.setProperty('--test-color',value);\n          return {rgb:Deck.rgb('--test-color'),rgba:Deck.rgba('--test-color',.25)}})", colors)
        expected = [[51, 102, 153], [51, 102, 153], [219, 102, 86], [0, 182, 93], [255, 0, 0], [0, 0, 0], [51, 102, 153], [0, 0, 0]]
        for row, rgb in zip(rows, expected):
            self.assertEqual(row['rgb'], rgb)
            self.assertEqual(row['rgba'], 'rgba(' + ','.join(map(str, rgb)) + ',0.25)')

    def test_actual_tokens_modern_luminance_and_uncovered_compositing(self):
        self.page.add_style_tag(content='#stage{background-color:oklch(65% 0.15 30)}')
        probe = self.probe()
        components = [v / 255 for v in (219, 102, 86)]
        linear = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in components]
        expected = sum((v * w for v, w in zip(linear, (0.2126, 0.7152, 0.0722))))
        self.assertAlmostEqual(probe['theme']['backgroundLuminance'], expected, places=6)
        self.page.evaluate("document.documentElement.style.setProperty('--text','12px')")
        self.assertIn('--text', self.probe()['theme']['invalidTokens'])
        self.page.evaluate("document.documentElement.style.setProperty('--text','')")
        self.assertEqual(self.probe()['theme']['invalidTokens'], [])
        for css in ('#stage{background-image:linear-gradient(red,blue)}', '#stage{background-color:rgb(255 255 255 / 50%)}', '#minor{color:rgb(255 0 0 / 50%)}', '#minor{background:oklch(65% 0.15 30)}'):
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
            target.write_text('<!doctype html><link rel="stylesheet" href="base.css"><div id="stage" style="width:1600px;height:900px"><p style="position:absolute;left:1700px">越界</p><img src="missing.png"></div><script src="base.js"></script><script>throw Error("sentinel")</script>')
            results = asyncio.run(style_consumers_check.run([target], wait=0))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                style_consumers_check.report(*results[0])
            report = output.getvalue()
            self.assertIn('sentinel', report)
            self.assertIn('missing.png', report)
            self.assertIn('--bg', report)
            self.assertTrue(results[0][1][0]['probe']['escaped'])
