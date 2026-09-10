"""Style routing / history / native resources. No paid model calls."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
from PIL import Image
from core import builder, director, planner, style_catalog, theme
from tools import runtime as tools
from test.test_media import call, response

CSS = '''/* ==== INTERFACE ====
token --bg: 背景
token --text: 正文
token --font-sans: 字体
class .nt-title: 标题
variant dark: 深色无图
==== /INTERFACE ==== */
:root { --bg: #fff; --text: rgb(20 20 20); --font-sans: sans-serif; }
html[data-variant="dark"] { --bg: #111; --text: #eee; }
.nt-title { font-size: 48px; }
.nt-controls { --surface: #ffffff80; background: var(--surface); border: 2px solid; }
'''


class StyleTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.assets = self.root / 'pages/assets'
        self.assets.mkdir(parents=True)
        self.run = SimpleNamespace(root=self.root, query='固定事实', audience='读者', scenario='',
            style=None, template=None, style_director=True, canvas=(1600,900),
            prompts=planner.PROMPTS, prompt=lambda *args, **kw: json.dumps(kw, default=str), log=Mock())

    def test_no_aesthetic_thresholds_or_shape_rejection(self):
        for color in ('#fff', '#eee', '#f5eee4', 'hsl(200 10% 90%)', 'oklch(95% .03 70)'):
            self.assertEqual(theme.validate(CSS.replace('#fff;', color+';'), self.assets, browser=False), [])

    def test_structural_failures(self):
        for css in ('', CSS.replace('--text: rgb(20 20 20);', ''), CSS+'}', CSS[:-2],
                    CSS.replace('--bg: #fff;', '--bg #fff;'), CSS.replace('variant dark:', 'variant nonexistent:'),
                    CSS.replace('.nt-title {', '.other {'), CSS+'\n@import "x.css";',
                    CSS+'\n#stage {transform:none}', CSS+'\n:root {--panel-bg:#fff}'):
            with self.subTest(css=css[-60:]):
                self.assertTrue(theme.validate(css, self.assets, browser=False))

    def test_write_contract(self):
        target = self.assets / 'theme.css'
        good = call('Write', file_path=str(target), content=CSS)
        self.assertEqual(director._one_write(response(good), target), (CSS, []))
        for r in (response(), response(good, good), response(call('Write',file_path=str(target),content=' ')),
                  response(call('Write',file_path=str(target),content=42)), response(call('Write',file_path='/wrong',content=CSS))):
            self.assertTrue(director._one_write(r,target)[1])
        for raw in ('[]', 'null', 'false', '"text"', '{'):
            item = copy.copy(good)
            item.arguments = raw
            self.assertTrue(director._one_write(response(item), target)[1])

    def test_local_urls_preserve_nested_names_fragments_and_original(self):
        source = self.root / 'package'
        for folder in ('a', 'b'):
            path = source / 'assets' / folder / 'same.png'
            path.parent.mkdir(parents=True)
            Image.new('RGB',(8,8),'red').save(path)
        original = CSS + '\n#stage {background-image: url("assets/a/same.png#x"),url(assets/b/same.png)}'
        (source/'theme.css').write_text(original)
        css, shots = theme.import_input(source, self.assets)
        self.assertIn('style/assets/a/same.png#x', css)
        self.assertTrue((self.assets/'style/assets/b/same.png').is_file())
        self.assertEqual((source/'theme.css').read_text(), original)
        self.assertEqual(theme.validate(css,self.assets,browser=False), [])
        self.assertEqual(shots, [])

    def test_resource_boundaries(self):
        for url in ('https://example.org/a.png', 'data:image/png;base64,eA==', '../outside.png',
                    '/absolute.png', 'missing.png', 'file:///etc/passwd', 'x.png?v=2'):
            self.assertTrue(theme.validate(CSS+f'\n#stage {{background:url("{url}")}}',self.assets,browser=False))
        outside = self.root/'outside.png'
        Image.new('RGB',(8,8)).save(outside)
        (self.assets/'link.png').symlink_to(outside)
        self.assertTrue(theme.validate(CSS+'\n#stage{background:url(link.png)}',self.assets,browser=False))
        self.assertEqual(theme.validate(CSS+'\n.nt-art{filter:url(#local)}',self.assets,browser=False), [])

    def test_reuse_is_zero_calls_and_invalid_reuse_is_not_repaired(self):
        source = self.root/'package'
        source.mkdir()
        (source/'theme.css').write_text(CSS)
        self.run.template = source
        with patch.object(director, 'gates',return_value=[]), patch.object(director.llm,'respond') as model, \
             patch.object(style_catalog,'inputs') as catalog:
            result = director.direct(self.run,'low')
            self.assertEqual(result['model_calls'],0)
            model.assert_not_called()
            catalog.assert_not_called()
        with patch.object(director,'gates',return_value=['broken']), patch.object(director.llm,'respond') as model:
            with self.assertRaisesRegex(ValueError,'未授权重写'):
                director.direct(self.run,'low')
            model.assert_not_called()

    def test_history_contains_rejected_candidate_and_error(self):
        target = self.assets/'theme.css'
        snapshots=[]
        answers = iter([response(call('Write',file_path=str(target),content='broken candidate')),
                        response(call('Write',file_path=str(target),content=CSS))])
        def respond(_i,hist,*a,**kw):
            snapshots.append(copy.deepcopy(hist))
            return next(answers)
        with patch.object(director.llm,'respond',side_effect=respond), patch.object(style_catalog,'inputs',return_value=('catalog',[])), \
             patch.object(director,'gates',side_effect=[['missing --bg'],[]]):
            director.theme(self.run,[],'low',planner.skills.WORKFLOWS)
        second=json.dumps(snapshots[1],ensure_ascii=False)
        first_slots=json.loads(snapshots[0][0]['content'][0]['text'].split('\n\n明确风格要求：')[0])
        self.assertIn('通用 Paper', first_slots['theme_bans'])
        self.assertIn('broken candidate',second)
        self.assertIn('missing --bg',second)
        self.assertEqual(self.run._style_calls,2)
        logs=str(self.run.log.add.call_args_list)
        self.assertIn('broken candidate',logs)

    def test_input_conflicts_and_empty_directory(self):
        for args in ((None,' ',True),(None,'Swiss',False),(self.root,None,False)):
            with self.assertRaises(ValueError): theme.check_options(*args)
        with self.assertRaises(ValueError): theme.import_input(self.root,self.assets)

    def test_user_reference_is_copied_and_visible_to_builder(self):
        source=self.root/'user.png'
        Image.new('RGB',(8,8)).save(source)
        css,shots=theme.import_input(source,self.assets)
        self.assertFalse(css)
        self.assertEqual(len(shots),1)
        self.assertEqual(len([x for x in builder.user_ref_images(self.root) if x['type']=='input_image']),1)

    def test_all_40_catalog_entries_and_lazy_details(self):
        rows=style_catalog.rows()
        self.assertEqual(len(rows),40)
        for row in rows:
            with Image.open(style_catalog.read_path(row[0])) as im:
                self.assertGreater(im.width,700)
                self.assertGreater(im.height,180)
        text,images=style_catalog.inputs()
        self.assertTrue(all(r[0] in text for r in rows))
        self.assertEqual(sum(x['type']=='input_image' for x in images),0)
        text,images=style_catalog.inputs('包豪斯风')
        self.assertIn('21-bauhaus',text)
        self.assertEqual(sum(x['type']=='input_image' for x in images),1)
        with self.assertRaises(ValueError): style_catalog.read_path('../../config.yaml')
        text, images = style_catalog.selection_inputs()
        self.assertTrue(all(r[0] in text for r in rows))
        self.assertEqual(sum(x['type']=='input_image' for x in images), 10)
        self.assertIn('1488×656', str([x for x in images if x['type']=='input_text']))

    def test_import_does_not_silently_repair_unclosed_css(self):
        source=self.root/'broken-package'
        source.mkdir()
        (source/'theme.css').write_text(CSS[:-2])
        with self.assertRaisesRegex(ValueError,'未授权重写'):
            theme.import_input(source,self.assets)

    def test_publish_failure_never_leaves_partial_theme(self):
        target=self.assets/'theme.css'
        with patch.object(theme.os,'replace',side_effect=OSError('disk failure')):
            with self.assertRaises(OSError): theme.publish(CSS,target)
        self.assertFalse(target.exists())
        self.assertFalse(list(self.assets.glob('.theme-publish-*')))

    def test_visual_pick_preserves_reason_and_preloads_details_in_two_calls(self):
        history=[]
        selection='19-hand-drawn\t不规则墨线与荧光批注'
        r=response(call('Write',file_path=str(self.root/'style-picks.tsv'),content=selection))
        with patch.object(director.llm,'respond',return_value=r) as model:
            chosen=director.pick(self.run,'low',history)
            self.assertEqual(chosen,['19-hand-drawn'])
            first=model.call_args.args[1][0]['content']
            self.assertEqual(sum(x['type']=='input_image' for x in first),10)
            self.assertIn('通用 Paper', json.loads(first[0]['text'])['theme_bans'])
        self.assertEqual((self.root/'style-picks.tsv').read_text().strip(),selection)
        self.assertTrue(any(x.get('type')=='function_call_output' for x in history))
        snapshot=[]
        def respond(_i,hist,*a,**kw):
            snapshot.extend(copy.deepcopy(hist))
            return response(call('Write',file_path=str(self.assets/'theme.css'),content=CSS))
        with patch.object(director.llm,'respond',side_effect=respond), patch.object(director,'gates',return_value=[]):
            director.theme(self.run,chosen,'low',planner.skills.WORKFLOWS,history)
        self.assertTrue(any(x.get('type')=='function_call_output' for x in snapshot))
        body='\n'.join(c.get('text','') for item in snapshot if item.get('role')=='user'
                       for c in item.get('content',[]) if isinstance(c,dict))
        writes=[json.loads(item['arguments'])['content'] for item in snapshot
                if item.get('type')=='function_call' and item.get('name')=='Write']
        self.assertIn(selection,writes)
        self.assertIn('已备妥的字体声明',body)
        self.assertIn('19-hand-drawn.png',body)
        theme_body=next(item['content'][0]['text'] for item in snapshot
                        if item.get('role')=='user' and isinstance(item.get('content'),list)
                        and '待修改完整原主题' not in item['content'][0].get('text','')
                        and '\n\n明确风格要求：' in item['content'][0].get('text',''))
        self.assertEqual(json.loads(theme_body.split('\n\n明确风格要求：')[0])['theme_bans'], '')
        self.assertEqual(self.run._style_calls,2)
        self.assertEqual(theme.references((self.assets/'theme.css').read_text()),[('style','19-hand-drawn')])

    def test_pick_does_not_gate_reason_length_or_style_count(self):
        for selection in ('01-minimalism', '01-minimalism\n02-swiss\n03-editorial'):
            r=response(call('Write',file_path=str(self.root/'style-picks.tsv'),content=selection))
            with patch.object(director.llm,'respond',return_value=r), \
                 patch.object(style_catalog,'selection_inputs',return_value=('index',[])):
                self.assertEqual(director.pick(self.run,'low'),selection.splitlines())

    def test_explicit_style_skips_pick(self):
        self.run.style='19-hand-drawn'
        with patch.object(director,'pick') as pick, patch.object(director,'theme',return_value=CSS):
            director.direct(self.run,'low')
        pick.assert_not_called()

    def test_final_reference_is_used_without_candidate_or_old_image(self):
        shots=self.assets/'style/shots'
        shots.mkdir(parents=True)
        Image.new('RGB',(8,8)).save(shots/'old.png')
        css=CSS.replace('==== /INTERFACE ====', 'reference style:21-bauhaus\n==== /INTERFACE ====')
        (self.assets/'theme.css').write_text(css)
        images=builder.theme_ref_images(self.root)
        self.assertEqual(sum(x['type']=='input_image' for x in images),1)
        captions=str([x for x in images if x['type']=='input_text'])
        self.assertIn('21-bauhaus',captions)
        self.assertNotIn('old.png',captions)
        (self.assets/'theme.css').write_text(CSS)
        self.assertIn('old.png',str([x for x in builder.theme_ref_images(self.root) if x['type']=='input_text']))

    def test_user_reference_relocation_and_boundary(self):
        source=self.root/'package'
        source.mkdir()
        Image.new('RGB',(8,8)).save(source/'my reference.png')
        css=CSS.replace('==== /INTERFACE ====', 'reference user:my reference.png\n==== /INTERFACE ====')
        (source/'theme.css').write_text(css)
        imported,_=theme.import_input(source,self.assets)
        self.assertEqual(theme.references(imported),[('user','style/my reference.png')])
        self.assertTrue(Path(theme.reference_images(imported,self.assets)[0]['shot']).is_file())
        for value in ('../../outside.png','https://example.org/image.png'):
            with self.assertRaises(ValueError):
                theme.reference_images(css.replace('my reference.png',value),self.assets)

    def test_reference_optional_colon_preserves_identity_and_relocation(self):
        css=CSS.replace('==== /INTERFACE ====', 'reference: style:03-editorial\nreference style:03-editorial\n==== /INTERFACE ====')
        self.assertEqual(theme.references(css), [('style','03-editorial')])
        source=self.root/'package'
        source.mkdir()
        Image.new('RGB',(8,8)).save(source/'ref.png')
        (source/'theme.css').write_text(css.replace('reference: style:03-editorial', 'reference: user:ref.png'))
        imported,_=theme.import_input(source,self.assets)
        self.assertEqual(theme.references(imported), [('user','style/ref.png'),('style','03-editorial')])

    def test_theme_submissions_are_bounded_and_keep_source_candidate(self):
        r=response(call('Write',file_path=str(self.assets/'theme.css'),content='bad CSS'))
        with patch.object(director.llm,'respond',return_value=r) as model, \
             patch.object(style_catalog,'inputs',return_value=('styles',[])), patch.object(director,'gates',return_value=['invalid']):
            with self.assertRaises(RuntimeError): director.theme(self.run,[],'low',planner.skills.WORKFLOWS)
        self.assertEqual(model.call_count,3)
        self.assertFalse((self.assets/'theme.css').exists())
        self.assertEqual(json.loads((self.root/'style.rejected.json').read_text())['css'],'bad CSS')

    def test_media_returns_to_same_history_before_write(self):
        target=self.assets/'theme.css'
        snapshots=[]
        answers=iter([response(call('ImageSearch',query='decorative light')),
                      response(call('Write',file_path=str(target),content=CSS))])
        def respond(_i,hist,*a,**kw):
            snapshots.append(copy.deepcopy(hist))
            return next(answers)
        result=tools.Out('{"results":[{"path":"assets/img/director-x/a.png"}]}',[('image/png','eA==')])
        with patch.object(director.llm,'respond',side_effect=respond), patch.object(director.tools,'media_call',return_value=result) as media_call, \
             patch.object(style_catalog,'inputs',return_value=('styles',[])), patch.object(director,'gates',return_value=[]):
            director.theme(self.run,[],'low',planner.skills.WORKFLOWS)
        self.assertEqual(media_call.call_args.args[-1],'director')
        self.assertIn('input_image',json.dumps(snapshots[1]))
        self.assertIn('assets/img/director-x/a.png',json.dumps(snapshots[1]))
        self.assertNotIn('eA==',str(self.run.log.add.call_args_list))

    def test_explicit_modify_uses_original_without_gallery(self):
        source=self.root/'package'
        source.mkdir()
        (source/'theme.css').write_text(CSS)
        self.run.template,self.run.style=source,'改成包豪斯'
        with patch.object(director,'theme',return_value=CSS) as write_theme, patch.object(director,'pick') as pick:
            result=director.direct(self.run,'low')
        pick.assert_not_called()
        self.assertEqual(result['route'],'modify')
        self.assertIn('--text',write_theme.call_args.args[5])


if __name__ == '__main__':
    unittest.main()
