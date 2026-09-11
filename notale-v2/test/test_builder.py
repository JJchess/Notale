"""Builder behavior contracts; historical versions live in outer legacy."""
from __future__ import annotations

import copy
import json
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch
from core import builder, llm
from fnmatch import fnmatch
import re
from core import skills
from tools import runtime as tools
from tools.code_scaffold import tool as code_runtime
from test.support import builder_call, builder_page, tool_response, done_response, make_run
ROOT = Path(__file__).resolve().parents[1]

def catalog_paths(body):
    """Expand the documented path template exactly as a caller would."""
    paths = re.findall(r'(?:`|\()((?:references|samples)/[^`)]+\.md)(?:`|\))', body)
    paths = [p for p in paths if '<' not in p]
    main = body.split('## Samples', 1)[-1].split('</workflow_skill>', 1)[0]
    category = None
    for line in main.splitlines():
        if line.startswith('### '):
            category = line[4:].strip()
        match = re.match(r'- ([a-z0-9-]+) — (.+)', line)
        if match:
            assert category, line
            paths.append(f'samples/bundles/{category}/{match[1]}.mini.md')
    return paths

class SampleDefaultsTests(unittest.TestCase):

    def test_cli_defaults_to_mini_plus_aux(self):
        args = builder.parse_args(['--label', 'test'])
        self.assertEqual(args.samples, 'mini')
        self.assertTrue(args.aux_samples)

    def test_cli_supports_explicit_sample_overrides(self):
        for flags, mode, aux in [(['--no-aux-samples'], 'mini', False), (['--samples', 'none'], 'none', False), (['--samples', 'mini', '--aux-samples'], 'mini', True)]:
            with self.subTest(flags=flags):
                args = builder.parse_args(['--label', 'test', *flags])
                self.assertEqual((args.samples, args.aux_samples), (mode, aux))

class PlanningContextTests(unittest.TestCase):

    def test_instruction_defaults_match_explicit_mini_plus_aux(self):
        with tempfile.TemporaryDirectory() as td:
            root = make_run(Path(td))
            for workflow in builder.skills.PAGE_WORKFLOWS:
                with self.subTest(workflow=workflow):
                    self.assertEqual(builder.instruction_blocks(root, 6, workflow), builder.instruction_blocks(root, 6, workflow, samples='mini', include_aux=True))

    def test_code_and_cover_receive_only_applicable_guidance(self):
        with tempfile.TemporaryDirectory() as td:
            root = make_run(Path(td))
            (root / 'pages/assets/CHASSIS.md').write_text('API\n## 分步出场\nDeck.onStep')
            code = '\n\n'.join(builder.instruction_blocks(root, 6, 'build-code', notes='notes').values())
            cover = '\n\n'.join(builder.instruction_blocks(root, 6, 'build-cover').values())
        self.assertNotIn('Deck.onStep', code)
        self.assertNotIn('<speaker_notes>', code)
        self.assertNotIn('Patch', code)
        self.assertIn('只编辑', code)
        self.assertIn('Deck.onStep', cover)
        self.assertNotIn('做成分步并删掉控件', cover)

    def test_theme_keeps_style_contract_and_drops_director_revision(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / 'theme.css'
            p.write_text('/* ==== INTERFACE ====\n论点 A\n材质 B\n签名 C\n禁令 D\n修订 E\n==== /INTERFACE ==== */\n:root{}')
            interface = builder._theme_interface(p)
        for row in ['论点 A', '材质 B', '签名 C', '禁令 D']:
            self.assertIn(row, interface)
        self.assertNotIn('修订', interface)

    def test_code_inputs_are_invariant_to_deck_theme_and_chassis(self):
        with tempfile.TemporaryDirectory() as td:
            root = make_run(Path(td))
            assets = root / 'pages/assets'

            def instructions(workflow):
                return '\n\n'.join(builder.instruction_blocks(root, 6, workflow, notes='notes', visual_focus=True).values())
            (assets / 'theme.css').write_text('/* ==== INTERFACE ====\n论点 LIGHT_THEME_SENTINEL\ntoken --bg #E8EEF1\n==== /INTERFACE ==== */')
            before = instructions('build-code')
            cover_before = instructions('build-cover')
            (assets / 'theme.css').write_text('/* ==== INTERFACE ====\n论点 MAGENTA_THEME_SENTINEL\ntoken --bg #ff00ff\n==== /INTERFACE ==== */')
            (assets / 'CHASSIS.md').write_text('DECK_CHASSIS_SENTINEL')
            after = instructions('build-code')
            cover_after = instructions('build-cover')
        self.assertEqual(before, after)
        for token in ['<theme_css>', '<chassis>', '<anti_ai_slop_visual>', '<speaker_notes>', '<visual_focus>', 'LIGHT_THEME_SENTINEL', 'MAGENTA_THEME_SENTINEL', 'DECK_CHASSIS_SENTINEL']:
            self.assertNotIn(token, after)
        self.assertIn('<deck_outline>', after)
        self.assertIn('<anti_ai_slop_copy>', after)
        self.assertIn('单位、适用条件、必要图例和错误提示必须保留', after)
        self.assertIn('LIGHT_THEME_SENTINEL', cover_before)
        self.assertIn('MAGENTA_THEME_SENTINEL', cover_after)
        self.assertIn('DECK_CHASSIS_SENTINEL', cover_after)
        self.assertIn('<anti_ai_slop_visual>', cover_after)

    def test_code_preload_does_not_read_deck_style_assets(self):
        with tempfile.TemporaryDirectory() as td:
            root = make_run(Path(td))
            (root / 'pages/assets/theme.css').unlink()
            (root / 'pages/assets/CHASSIS.md').unlink()
            code = builder.shared_preload(root, 6, workflow='build-code')
        self.assertIn('<deck_outline>', code)
        self.assertIn('references/code.md', code)
        self.assertNotIn('<theme_css>', code)

    def test_code_cannot_read_deck_theme_or_neighbor_page(self):
        with tempfile.TemporaryDirectory() as td:
            pages = Path(td)
            for name in ['assets/theme.css', 'page-24.html']:
                with self.subTest(name=name):
                    denial = builder.code_runtime.tool_guard('Read', {'file_path': name}, pages, 'page-25', ROOT / 'skills/build-code')
                    self.assertIsNotNone(denial)

    def test_shared_prefix_has_outline_not_all_page_details(self):
        with tempfile.TemporaryDirectory() as td:
            text = builder.shared_preload(make_run(Path(td)), 6)
        self.assertIn('<deck_outline>', text)
        self.assertIn('整套开场', text)
        self.assertIn('第二章', text)
        self.assertNotIn('历史背景', text)
        self.assertIn('.panel 读数容器', text)
        self.assertNotIn('padding:12px', text)

    def test_chapter_context_is_compact_valid_xml(self):
        with tempfile.TemporaryDirectory() as td:
            blocks = builder.chapter_preloads(make_run(Path(td)), 6)
        node = ET.fromstring(blocks['page-03'])
        self.assertEqual(node.attrib['current'], 'page-03')
        self.assertEqual([child.attrib['id'] for child in node], ['page-01', 'page-02', 'page-03', 'page-04'])
        self.assertEqual(node[2].attrib['current'], 'true')
        self.assertEqual([child.attrib['id'] for child in ET.fromstring(blocks['page-06'])], ['page-05', 'page-06'])

    def test_environment_context_matches_real_absent_target(self):
        with tempfile.TemporaryDirectory() as td:
            pages = Path(td) / 'pages'
            pages.mkdir()
            p = builder_page()
            text = builder.environment_context(pages, p, ROOT / 'skills' / p.workflow)
        node = ET.fromstring(text)
        self.assertEqual(node.findtext('target_state'), 'absent')
        self.assertTrue(node.findtext('target').endswith('page-01.html'))
        self.assertTrue(node.findtext('read_only_skill').endswith('build-cover'))

class RoutingTests(unittest.TestCase):

    def test_all_four_labels_route_one_to_one(self):
        cases = {'标题页': 'build-cover', '内容页': 'build-page', '交互页': 'build-interaction', '代码页': 'build-code'}
        for label, workflow in cases.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as td:
                root = Path(td)
                plan = root / 'pages' / 'plan'
                plan.mkdir(parents=True)
                (plan / 'p01.md').write_text(f'# page-01 [{label}]\nAdaBoosting', encoding='utf-8')
                routed = builder.route_page(root, builder.Page('page-01', 'Build'))
                self.assertEqual(routed.workflow, workflow)

    def test_unknown_label_fails_loudly(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            plan = root / 'pages' / 'plan'
            plan.mkdir(parents=True)
            (plan / 'p01.md').write_text('# page-01 [练习页]\nAdaBoosting', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'cannot route'):
                builder.route_page(root, builder.Page('page-01', 'Build'))

class AgentLoopTests(unittest.TestCase):

    def test_tools_before_first_write_execute_without_order_gate(self):
        for call in (builder_call('Read', file_path='assets/lib/LIBS.md'), builder_call('Bash', command='cat assets/base.js'), builder_call('Check', page='page-01.html')):
            with self.subTest(tool=call.name), tempfile.TemporaryDirectory() as td:
                events = []
                responses = [tool_response(builder_call('Read', file_path='reference.md')), tool_response(call, builder_call('Write', file_path='page-01.html', content='<html/>')), done_response()]
                with patch.object(builder, 'respond', side_effect=responses) as respond, patch.object(builder.tools, 'run', self.fake_run_factory(events)):
                    result = builder.build_one(builder_page(), Path(td), Path(td) / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
                self.assertEqual(respond.call_count, 3)
                self.assertEqual(result.termination, 'no_tool_use')
                self.assertEqual([name for name, _ in events], ['Read', call.name, 'Write', 'Check'])
                self.assertTrue(result.artifact_present)

    def test_first_batch_can_write_directly_or_after_read(self):
        for read_first in (False, True):
            with self.subTest(read_first=read_first), tempfile.TemporaryDirectory() as td:
                events = []
                calls = [builder_call('Read', file_path='reference.md')] if read_first else []
                calls.append(builder_call('Write', file_path='page-01.html', content='<html/>'))
                with patch.object(builder, 'respond', side_effect=[tool_response(*calls), done_response()]) as respond, patch.object(builder.tools, 'run', self.fake_run_factory(events)):
                    result = builder.build_one(builder_page(), Path(td), Path(td) / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
                self.assertEqual([name for name, _ in events], (['Read'] if read_first else []) + ['Write', 'Check'])
                self.assertEqual(respond.call_count, 2)
                self.assertTrue(result.artifact_present)
                self.assertEqual(result.termination, 'no_tool_use')

    def test_initial_read_errors_return_to_model_and_do_not_skip_batch(self):
        for broken_args in (False, True):
            with self.subTest(bad_json=broken_args), tempfile.TemporaryDirectory() as td:
                reading = builder_call('Read', file_path='missing.md')
                if broken_args:
                    reading.arguments = '{'
                snapshots, events = [], []
                responses = [tool_response(reading, builder_call('Write', file_path='page-01.html', content='<html/>')), done_response()]
                normal = self.fake_run_factory(events)

                def respond(_instructions, hist, *_args, **_kwargs):
                    snapshots.append(copy.deepcopy(hist))
                    return responses.pop(0)

                def execute(name, args, *rest):
                    if name == 'Read':
                        return 'FileNotFoundError: missing'
                    return normal(name, args, *rest)

                with patch.object(builder, 'respond', side_effect=respond) as model, patch.object(builder.tools, 'run', side_effect=execute) as run:
                    result = builder.build_one(builder_page(), Path(td), Path(td) / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
                self.assertEqual(model.call_count, 2)
                self.assertEqual(run.call_count, 2 if broken_args else 3)
                output = next(x['output'] for x in snapshots[1] if x.get('call_id') == reading.call_id and x.get('type') == 'function_call_output')
                self.assertIn('不是合法 JSON' if broken_args else 'FileNotFoundError', output)
                self.assertTrue(result.artifact_present)
                self.assertEqual(result.termination, 'no_tool_use')

    def test_read_availability_is_independent_of_file_changes(self):
        cases = ('existing', 'empty', 'unchanged', 'failed')
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as td:
                pages = Path(td)
                if case in ('existing', 'unchanged'):
                    (pages / 'page-01.html').write_text('<html/>')
                writing = [] if case == 'existing' else [tool_response(builder_call('Write', file_path='page-01.html', content='' if case == 'empty' else '<html/>'))]
                responses = [tool_response(builder_call('Read', file_path='reference.md'))] + writing + [tool_response(builder_call('Read', file_path='assets/base.js')), done_response()]
                events = []
                normal = self.fake_run_factory(events)

                def execute(name, args, cwd, resource, pid):
                    if case == 'failed' and name == 'Write':
                        return 'PermissionError: cannot write'
                    return normal(name, args, cwd, resource, pid)
                with patch.object(builder, 'respond', side_effect=responses), patch.object(builder.tools, 'run', side_effect=execute):
                    result = builder.build_one(builder_page(), pages, pages / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
                self.assertEqual(result.termination, 'no_tool_use')
                self.assertEqual(sum((name == 'Read' for name, _ in events)), 2)
                self.assertEqual(result.artifact_present, case in ('existing', 'unchanged'))
                if not result.artifact_present:
                    self.assertIn('target missing', result.audit['fatal_errors'][0])

    def test_code_lesson_read_does_not_require_prior_edit(self):
        for edit in (False, True):
            with self.subTest(edit=edit), tempfile.TemporaryDirectory() as td:
                pages = Path(td)
                lesson = builder.code_runtime.editable_root(pages, 'page-04')
                source = lesson / 'starter.py'
                reference = ROOT / 'skills/build-code/references/code.md'

                def scaffold(*_args):
                    lesson.mkdir(parents=True)
                    source.write_text('x = 1')
                    (pages / 'page-04.html').write_text('<html/>')
                    return {'editable': [{'path': str(source), 'content': 'x = 1'}]}
                responses = [tool_response(builder_call('Read', file_path=str(reference)), builder_call('CodeScaffold'))]
                if edit:
                    responses.append(tool_response(builder_call('Edit', file_path=str(source), old_string='x = 1', new_string='x = 2')))
                responses += [tool_response(builder_call('Read', file_path=str(source))), done_response()]
                with patch.object(builder, 'respond', side_effect=responses), patch.object(builder.code_runtime, 'scaffold', side_effect=scaffold), patch.object(builder, 'audit_delivery', return_value={}):
                    result = builder.build_one(builder_page('page-04', 'build-code', '代码页'), pages, pages / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
                self.assertEqual(result.termination, 'no_tool_use')
                self.assertEqual(source.read_text(), 'x = 2' if edit else 'x = 1')

    def test_scaffold_error_returns_to_model_without_automatic_retry(self):
        snapshots = []
        responses = [tool_response(builder_call('CodeScaffold')), tool_response(builder_call('CodeScaffold')), done_response()]

        def respond(_instructions, hist, *_args, **_kwargs):
            snapshots.append(copy.deepcopy(hist))
            return responses.pop(0)

        with tempfile.TemporaryDirectory() as td, patch.object(builder, 'respond', side_effect=respond) as model, patch.object(builder.code_runtime, 'scaffold', side_effect=[RuntimeError('broken'), {}]) as scaffold, patch.object(builder, 'audit_delivery', return_value={}):
            result = builder.build_one(builder_page('page-04', 'build-code', '代码页'), Path(td), Path(td) / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
        self.assertEqual(model.call_count, 3)
        self.assertEqual(scaffold.call_count, 2)
        self.assertTrue(any('CodeScaffold 失败' in x.get('output', '') for x in snapshots[1]))
        self.assertEqual(result.termination, 'no_tool_use')

    def test_page_time_limit_still_stops_loop(self):
        with tempfile.TemporaryDirectory() as td, patch.object(builder.time, 'time', side_effect=[0, builder.MAX_SECONDS + 1, builder.MAX_SECONDS + 1]), patch.object(builder, 'respond') as model:
            result = builder.build_one(builder_page(), Path(td), Path(td) / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
        model.assert_not_called()
        self.assertEqual(result.termination, 'max_seconds')
        self.assertFalse(result.artifact_present)

    def test_guidance_is_sent_once_per_page_without_rewriting_history(self):
        snapshots = []
        use = builder.tools.check_use('build-cover')
        responses = [tool_response(builder_call('Read', file_path='reference.md')), tool_response(builder_call('Write', file_path='page-01.html', content='<html/>')), tool_response(builder_call('Check', page='page-01.html')), tool_response(builder_call('Check', page='page-01.html')), done_response()]

        def respond(_instructions, hist, _specs, _effort, **_kwargs):
            snapshots.append(copy.deepcopy(hist))
            return responses.pop(0)
        ordinary = self.fake_run_factory([])

        def execute(name, args, cwd, resource, pid):
            return use + '\n\nmeasured' if name == 'Check' else ordinary(name, args, cwd, resource, pid)
        with tempfile.TemporaryDirectory() as td, patch.object(builder, 'respond', respond), patch.object(builder.tools, 'run', side_effect=execute):
            builder.build_one(builder_page(), Path(td), Path(td) / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
        outputs = [x['output'] for x in snapshots[-1] if x.get('type') == 'function_call_output' and x['call_id'].startswith('c-Check-')]
        self.assertEqual(len(outputs), 2)
        self.assertIn('<check_use', outputs[0])
        self.assertEqual(outputs[1], 'measured')
        self.assertEqual(snapshots[-1][:len(snapshots[-2])], snapshots[-2])
        self.assertEqual(builder.first_guidance_only(use, set()), use)

    @staticmethod
    def fake_run_factory(events: list, fatal_audit: bool=False):

        def fake_run(name, args, cwd, _resource_root, _pid):
            events.append((name, copy.deepcopy(args)))
            if name == 'Write':
                target = Path(args['file_path'])
                if not target.is_absolute():
                    target = cwd / target
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(args['content'], encoding='utf-8')
                return 'written'
            if name == 'Edit':
                return 'edited'
            if name == 'Read':
                return 'resource body · EOF'
            if name == 'Check':
                return '✗ JS 报错' if fatal_audit else '✓ clean'
            return 'ok'
        return fake_run

    def test_no_tool_stops_once_without_delivery_or_nag(self):
        with tempfile.TemporaryDirectory() as td, patch.object(builder, 'respond', return_value=done_response()) as respond:
            result = builder.build_one(builder_page(), Path(td), Path(td) / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
        self.assertEqual(result.calls, 1)
        self.assertEqual(result.termination, 'no_tool_use')
        self.assertFalse(result.artifact_present)
        self.assertIn('target missing', result.audit['fatal_errors'][0])
        respond.assert_called_once()

    def test_response_target_is_not_a_runtime_cap(self):
        responses = [tool_response(builder_call('Read', file_path='reference.md')), tool_response(builder_call('Write', file_path='page-01.html', content='<html/>'))] + [tool_response(builder_call('Read', file_path=f'missing-{index}.md'), index=index) for index in range(builder.RESPONSE_TARGET + 1)] + [done_response()]
        events = []
        with tempfile.TemporaryDirectory() as td, patch.object(builder, 'respond', side_effect=responses) as respond, patch.object(builder.tools, 'run', self.fake_run_factory(events)):
            result = builder.build_one(builder_page(), Path(td), Path(td) / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
        self.assertEqual(result.calls, builder.RESPONSE_TARGET + 4)
        self.assertEqual(respond.call_count, builder.RESPONSE_TARGET + 4)
        self.assertEqual(result.termination, 'no_tool_use')
        self.assertTrue(result.artifact_present)

    def test_tools_in_one_response_execute_in_listed_order(self):
        responses = [tool_response(builder_call('Read', file_path='reference.md')), tool_response(builder_call('Write', file_path='page-01.html', content='<html>one</html>'), builder_call('Check', page='page-01.html', after=[])), done_response()]
        events = []
        with tempfile.TemporaryDirectory() as td, patch.object(builder, 'respond', side_effect=responses), patch.object(builder.tools, 'run', self.fake_run_factory(events)):
            result = builder.build_one(builder_page(), Path(td), Path(td) / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
        self.assertEqual(result.calls, 3)
        self.assertEqual(result.termination, 'no_tool_use')
        self.assertEqual([name for name, _ in events[1:3]], ['Write', 'Check'])
        self.assertTrue(result.artifact_present)

    def test_native_reads_then_write_use_one_constant_surface_and_effort(self):
        skill = ROOT / 'skills' / 'build-cover'
        responses = [tool_response(builder_call('Read', file_path=str(skill / 'references/composition.md')), builder_call('Read', file_path=str(skill / 'samples/bundles/composition/prism-light.mini.md')), index=0), tool_response(builder_call('Write', file_path='page-01.html', content='<html>one</html>'), index=1), done_response()]
        surfaces, efforts, events = ([], [], [])

        def fake_respond(_instructions, _hist, specs, effort, tag='-'):
            surfaces.append(tuple((row['name'] for row in specs)))
            efforts.append(effort)
            return responses.pop(0)
        with tempfile.TemporaryDirectory() as td, patch.object(builder, 'respond', fake_respond), patch.object(builder.tools, 'run', self.fake_run_factory(events)):
            result = builder.build_one(builder_page(), Path(td), Path(td) / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
        self.assertTrue(result.artifact_present)
        self.assertEqual(result.termination, 'no_tool_use')
        self.assertEqual(len(set(surfaces)), 1)
        self.assertEqual(efforts, ['low', 'low', 'low'])
        self.assertNotIn('Skill', surfaces[0])
        self.assertNotIn('WorkflowContext', surfaces[0])
        self.assertNotIn('Edit', surfaces[0])
        self.assertIn('Patch', surfaces[0])
        self.assertEqual(result.reference_reads, ['references/composition.md', 'samples/bundles/composition/prism-light.mini.md'])
        self.assertEqual([name for name, _ in events].count('Check'), 1)

    def test_repeated_write_is_not_masked_or_rejected(self):
        responses = [tool_response(builder_call('Read', file_path='reference.md')), tool_response(builder_call('Write', file_path='page-01.html', content='<html>first</html>'), index=0), tool_response(builder_call('Write', file_path='page-01.html', content='<html>final</html>'), index=1), done_response()]
        surfaces, events = ([], [])

        def fake_respond(_instructions, _hist, specs, _effort, tag='-'):
            surfaces.append({row['name'] for row in specs})
            return responses.pop(0)
        with tempfile.TemporaryDirectory() as td, patch.object(builder, 'respond', fake_respond), patch.object(builder.tools, 'run', self.fake_run_factory(events)):
            pages = Path(td)
            result = builder.build_one(builder_page(), pages, pages / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
            final = (pages / 'page-01.html').read_text(encoding='utf-8')
        self.assertTrue(result.artifact_present)
        self.assertEqual(final, '<html>final</html>')
        self.assertTrue(all(('Write' in surface for surface in surfaces)))
        self.assertEqual([name for name, _ in events].count('Write'), 2)

    def test_artifact_and_failed_audit_are_recorded_separately(self):
        responses = [tool_response(builder_call('Read', file_path='reference.md')), tool_response(builder_call('Write', file_path='page-01.html', content='<html/>')), done_response()]
        events = []
        with tempfile.TemporaryDirectory() as td, patch.object(builder, 'respond', side_effect=responses), patch.object(builder.tools, 'run', self.fake_run_factory(events, fatal_audit=True)):
            result = builder.build_one(builder_page(), Path(td), Path(td) / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low')
        self.assertTrue(result.artifact_present)
        self.assertEqual(result.audit['fatal_errors'], ['✗ JS 报错'])

    def test_code_surface_is_constant_and_scaffold_returns_editable_contents(self):
        skill = ROOT / 'skills' / 'build-code'
        responses = [tool_response(builder_call('Read', file_path=str(skill / 'references/code.md')), builder_call('Read', file_path=str(skill / 'samples/bundles/code/code-core-bundle.one.md')), builder_call('CodeScaffold'), index=0), done_response()]
        surfaces = []

        def fake_respond(_instructions, _hist, specs, _effort, tag='-'):
            self.assertIsInstance(_hist[0]['content'], str)
            self.assertNotIn(builder.REF_SHOTS_NOTE, _hist[0]['content'])
            surfaces.append({row['name'] for row in specs})
            return responses.pop(0)

        def fake_scaffold(pages, pid, _title, _total):
            (pages / f'{pid}.html').write_text('<html>workbench</html>', encoding='utf-8')
            editable = builder.code_runtime.editable_root(pages, pid)
            editable.mkdir(parents=True)
            source = editable / 'starter.py'
            source.write_text("print('ready')", encoding='utf-8')
            return {'editable': [{'path': str(source), 'content': source.read_text()}]}
        with tempfile.TemporaryDirectory() as td, patch.object(builder, 'respond', fake_respond), patch.object(builder.code_runtime, 'scaffold', side_effect=fake_scaffold), patch.object(builder.code_check, 'run_browser_check', return_value=('✓ inner', [])), patch.object(builder.tools, 'run', return_value='✓ outer'):
            result = builder.build_one(builder_page('page-04', 'build-code', '代码页'), Path(td), Path(td) / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low', refs=[{'type': 'input_image', 'image_url': 'data:image/png;base64,stub'}])
        self.assertTrue(result.artifact_present)
        expected = {'CodeScaffold', 'Read', 'Write', 'Edit', 'Check', 'ImageSearch', 'ImageGen'}
        self.assertTrue(all((surface == expected for surface in surfaces)))
        self.assertNotIn('Bash', surfaces[0])
        self.assertNotIn('Patch', surfaces[0])
        self.assertEqual(result.reference_reads, ['references/code.md', 'samples/bundles/code/code-core-bundle.one.md'])

    def test_text_only_profile_removes_look_and_forces_text_check(self):
        responses = [tool_response(builder_call('Read', file_path='reference.md')), tool_response(builder_call('Write', file_path='page-01.html', content='<html/>')), tool_response(builder_call('Check', page='page-01.html', shot=True)), done_response()]
        surfaces, events = ([], [])

        def fake_respond(_instructions, _hist, specs, _effort, tag='-'):
            surfaces.append({row['name'] for row in specs})
            return responses.pop(0)
        with tempfile.TemporaryDirectory() as td, patch.object(builder, 'respond', fake_respond), patch.object(builder.tools, 'run', self.fake_run_factory(events)):
            result = builder.build_one(builder_page(), Path(td), Path(td) / 'trace.jsonl', ROOT / 'skills', 'instructions', 'low', vision_input=False)
        self.assertTrue(result.artifact_present)
        self.assertTrue(all(('Look' not in surface for surface in surfaces)))
        checks = [args for name, args in events if name == 'Check']
        self.assertTrue(checks)
        self.assertTrue(all((args['shot'] is False for args in checks)))
        self.assertEqual(result.images, 0)

class ProfileTests(unittest.TestCase):

    def test_repository_defaults_keep_gemini_low_and_code_override(self):
        import yaml
        cfg = yaml.safe_load((builder.ROOT / 'config.yaml').read_text())
        default = llm._default_model_profile(cfg)
        visual = llm.resolve_builder_profile(cfg)
        expected = llm.resolve_builder_profile(cfg, 'gemini38-google-low')
        for field in ('model', 'base_url', 'api_key_env', 'adapter', 'reasoning_effort', 'vision_input'):
            self.assertEqual(getattr(default, field), getattr(expected, field), field)
            self.assertEqual(getattr(visual, field), getattr(expected, field), field)
        self.assertEqual(cfg['planner']['reasoning_effort'], 'low')
        self.assertEqual(default.reasoning_effort, 'low')
        self.assertTrue(default.vision_input)
        self.assertNotIn('adapter', cfg['model'])
        with patch.object(llm.ModelRuntime, '__init__', lambda self, profile, sdk_client=None: setattr(self, 'profile', profile)):
            runtimes = builder.workflow_runtimes(cfg, visual)
        self.assertEqual({name: rt.profile.id for name, rt in runtimes.items()}, {'build-cover': 'gemini38-google-low', 'build-page': 'gemini38-google-low', 'build-interaction': 'gemini38-google-low', 'build-code': 'deepseek-v4-flash-low'})
        self.assertEqual(runtimes['build-code'].profile.reasoning_effort, 'low')

    def test_builder_profile_keeps_one_effort_setting(self):
        cfg = {'builder': {'default_profile': 'sonnet-low', 'profiles': {'sonnet-low': {'model': 'sonnet-5', 'base_url': 'https://example.test', 'api_key_env': 'KEY', 'adapter': 'messages', 'reasoning_effort': 'low', 'vision_input': True}}}}
        profile = llm.resolve_builder_profile(cfg)
        self.assertEqual(profile.reasoning_effort, 'low')
        self.assertFalse(hasattr(profile, 'post_composition_effort'))

    def test_workflow_profiles_route_only_listed_workflows(self):
        prof = {'base_url': 'https://example.test', 'api_key_env': 'KEY', 'adapter': 'messages', 'vision_input': True}
        cfg = {'builder': {'default_profile': 'a', 'workflow_profiles': {'build-code': 'b'}, 'profiles': {'a': {**prof, 'model': 'm-a', 'reasoning_effort': 'low'}, 'b': {**prof, 'model': 'm-b', 'reasoning_effort': 'high'}}}}
        default = llm.resolve_builder_profile(cfg)
        original = llm.ModelRuntime.__init__
        llm.ModelRuntime.__init__ = lambda self, profile, sdk_client=None: setattr(self, 'profile', profile)
        try:
            runtimes = builder.workflow_runtimes(cfg, default)
            self.assertEqual({k: v.profile.id for k, v in runtimes.items()}, {'build-cover': 'a', 'build-page': 'a', 'build-interaction': 'a', 'build-code': 'b'})
            self.assertEqual(runtimes['build-code'].profile.reasoning_effort, 'high')
            self.assertIs(runtimes['build-cover'], runtimes['build-page'])
            cfg['builder']['workflow_profiles'] = {'build-3d': 'b'}
            with self.assertRaises(ValueError):
                builder.workflow_runtimes(cfg, default)
        finally:
            llm.ModelRuntime.__init__ = original
ROOT = Path(__file__).resolve().parents[1]

class WorkflowRegistryTests(unittest.TestCase):

    def test_registry_is_exactly_the_four_page_routes(self):
        self.assertEqual(skills.PAGE_WORKFLOWS, ('build-cover', 'build-page', 'build-interaction', 'build-code'))
        self.assertEqual(set(skills.available()), set(skills.PAGE_WORKFLOWS))

    def test_planner_skill_descriptions_read_live_metadata_only(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            for name in skills.PAGE_WORKFLOWS:
                path = root / name / 'SKILL.md'
                path.parent.mkdir()
                path.write_text(f'---\nname: {name}\ndescription: >-\n  Capability for {name}\n  across multiple lines.\nlicense: EXTRA_METADATA\n---\nBODY_SENTINEL\n## Samples\nSAMPLE_SENTINEL\n', encoding='utf-8')
            auditor = root / 'extra-auditor' / 'SKILL.md'
            auditor.parent.mkdir()
            auditor.write_text('---\nname: extra-auditor\ndescription: AUDITOR_SENTINEL\n---\n')
            block = skills.page_skill_descriptions(root)
            self.assertEqual(block, '\n'.join((f'- {name}: Capability for {name} across multiple lines.' for name in skills.PAGE_WORKFLOWS)))
            path = root / 'build-code' / 'SKILL.md'
            path.write_text('---\nname: custom-code\ndescription: "Updated: Python"\n---\nNEW_BODY_SENTINEL', encoding='utf-8')
            updated = skills.page_skill_descriptions(root)
            self.assertIn('- custom-code: Updated: Python', updated)
            self.assertNotIn('Capability for build-code', updated)
            self.assertNotIn('SENTINEL', updated)

    def test_routed_skill_is_inline_and_paths_are_directly_readable(self):
        for name in skills.PAGE_WORKFLOWS:
            with self.subTest(name=name):
                block = skills.routed_workflow(name, include_aux=False)
                self.assertIn(f'<workflow_skill name="{name}"', block)
                self.assertNotIn('<skill-dir>', block)
                env = builder.environment_context(Path('/tmp/pages'), builder.Page('page-01', ''), skills.WORKFLOWS / name)
                root = re.search('<read_only_skill>(.*?)</read_only_skill>', env)
                self.assertNotIn('root=', block)
                rels = catalog_paths(block)
                self.assertTrue(rels)
                for rel in rels:
                    self.assertTrue((Path(root.group(1)) / rel).is_file(), rel)

    def test_mini_plus_aux_is_default_and_main_only_remains_available(self):
        for name in skills.PAGE_WORKFLOWS:
            with self.subTest(name=name):
                skill_text = (skills.WORKFLOWS / name / 'SKILL.md').read_text(encoding='utf-8')
                default = skills.routed_workflow(name)
                self.assertNotIn('  - Aux:', skill_text)
                self.assertNotIn('.full.md', skill_text)
                self.assertEqual(default, skills.routed_workflow(name, samples='mini', include_aux=True))
                with self.assertRaises(ValueError):
                    skills.routed_workflow(name, samples='full')
                main_only = skills.routed_workflow(name, include_aux=False)
                self.assertNotIn('<aux_sample_catalog', main_only)
        for name in ('build-cover', 'build-page', 'build-interaction'):
            with self.subTest(aux_enabled=name):
                enabled = skills.routed_workflow(name, include_aux=True)
                self.assertIn(f'<aux_sample_catalog workflow="{name}">', enabled)
                self.assertIn('.mini.md', enabled)
                self.assertNotIn('Do not read any other sample.', enabled)
        self.assertNotIn('<aux_sample_catalog', skills.routed_workflow('build-code', include_aux=True))

class SampleAblationTests(unittest.TestCase):
    """样本开关必须真的改变 SKILL 正文,而不是静默不变。

    一个悄悄没生效的消融臂等于偷偷跑了对照组,比直接崩掉更糟 —— 结论会反过来。
    """

    def test_none_removes_every_worked_sample(self):
        for name in skills.PAGE_WORKFLOWS:
            with self.subTest(name=name):
                body = skills.routed_workflow(name, samples='none')
                self.assertNotIn('.full.md', body)
                self.assertNotIn('.mini.md', body)
                self.assertNotIn('## Samples', body)
                self.assertRegex(body, 'references/[a-z0-9-]+\\.md')

    def test_mini_paths_exist_without_full_fallback(self):
        for name in skills.PAGE_WORKFLOWS:
            with self.subTest(name=name):
                body = skills.routed_workflow(name, include_aux=False)
                self.assertNotIn('.full.md', body)
                for rel in catalog_paths(body):
                    self.assertTrue((skills.WORKFLOWS / name / rel).is_file(), rel)
        self.assertFalse(hasattr(skills, 'MINI_FALLBACKS'))

    def test_bad_mode_and_aux_conflict_are_refused(self):
        with self.assertRaises(ValueError):
            skills.routed_workflow('build-page', samples='tiny')
        with self.assertRaises(ValueError):
            skills.routed_workflow('build-page', samples='none', include_aux=True)

    def test_mini_plus_aux_is_the_many_small_samples_arm(self):
        body = skills.routed_workflow('build-page', samples='mini', include_aux=True)
        self.assertIn('<aux_sample_catalog', body)
        self.assertNotIn('.full.md', body)
        self.assertGreaterEqual(len(catalog_paths(body)), 4)

    def test_compact_catalog_reads_and_visual_order(self):
        with tempfile.TemporaryDirectory() as td:
            root = make_run(Path(td))
            for name in ('build-cover', 'build-page', 'build-interaction'):
                resource = skills.WORKFLOWS / name
                blocks = builder.instruction_blocks(root, 6, name)
                self.assertEqual(list(blocks)[:3], ['identity', 'workflow', 'shared'])
                shared = blocks['shared']
                positions = [shared.index(tag) for tag in ('<tech>', '<theme_css>', '<chassis>', '<deck_outline>')]
                self.assertEqual(positions, sorted(positions))
                paths = catalog_paths(skills.routed_workflow(name, include_aux=False))
                self.assertEqual(len(paths), len(set(paths)))
                for rel in paths:
                    out = tools.run('Read', {'file_path': rel}, root / 'pages', resource, 'page-01')
                    text = out.text if isinstance(out, tools.Out) else out
                    self.assertIn('EOF', text, rel)

class BundleTests(unittest.TestCase):

    def bundles(self):
        for name in skills.PAGE_WORKFLOWS:
            root = skills.WORKFLOWS / name
            rows = json.loads((root / 'samples/catalog.json').read_text())['samples']
            for row in rows:
                variant = 'mini' if 'mini' in row else 'one'
                spec = row[variant]
                path = root / 'samples/bundles' / row['category'] / f"{row['id']}.{variant}.md"
                yield (root, row, spec, path.read_text(encoding='utf-8'))

    def test_current_bundle_dependencies_are_declared(self):
        for root, row, spec, text in self.bundles():
            if root.name == 'build-code' or not spec.get('omitted'):
                continue
            entry = next((rel for rel in spec['files'] if rel.endswith('.html')))
            html = (root / spec['root'] / entry).read_text()
            refs = {r.removeprefix('./') for r in re.findall('(?:src|href)="([^"#?]+)"', html)}
            notes = dict(re.findall('<omitted path="([^"]+)">(.*?)</omitted>', text))
            used = set()
            for ref in refs:
                if ref.startswith(('http:', 'https:', 'data:', '//')) or ref in spec['files']:
                    continue
                with self.subTest(sample=row['id'], dependency=ref):
                    self.assertIn(ref, notes)
                    key = next((k for k in spec['omitted'] if fnmatch(ref, k)), None)
                    if key:
                        used.add(key)
                        self.assertEqual(notes[ref], spec['omitted'][key])
                    else:
                        self.assertRegex(ref, '(?:^|/)(?:base\\.css|base\\.js|[\\w.-]+\\.min\\.js)$')
            self.assertEqual(used, set(spec['omitted']))

    def test_live_catalogs_only_register_independent_minis(self):
        count = 0
        for name in skills.PAGE_WORKFLOWS:
            root = skills.WORKFLOWS / name
            catalog = json.loads((root / 'samples/catalog.json').read_text())
            self.assertFalse(list((root / 'samples/bundles').rglob('*.full.md')))
            for row in catalog['samples']:
                count += 1
                with self.subTest(sample=row['id']):
                    self.assertNotIn('full', row)
                    spec = row.get('mini', row.get('one'))
                    for rel in spec['files']:
                        p = (root / spec['root'] / rel).resolve()
                        self.assertTrue(p.is_file(), p)
                        self.assertTrue(p.is_relative_to(root.resolve()))
        self.assertEqual(count, 52)

class ToolSurfaceTests(unittest.TestCase):

    def test_relative_workflow_read_matches_logged_resolution(self):
        with tempfile.TemporaryDirectory() as td:
            cwd = Path(td) / 'pages'
            cwd.mkdir()
            resource = skills.WORKFLOWS / 'build-page'
            relative = 'references/general.md'
            resolved = tools.resolve_read_path(relative, cwd, resource)
            self.assertEqual(resolved, resource / relative)
            self.assertIn('EOF', tools.run('Read', {'file_path': relative}, cwd, resource, 'page-01'))
            (cwd / 'references').mkdir()
            (cwd / relative).write_text('local')
            self.assertEqual(tools.resolve_read_path(relative, cwd, resource), cwd / relative)

    def test_surface_has_shared_media_but_no_selection_tools(self):
        names = [schema['name'] for schema in tools.specs()]
        self.assertEqual(names, ['Read', 'Write', 'Edit', 'Patch', 'Check', 'Bash', 'ImageSearch', 'ImageGen'])
        self.assertNotIn('WorkflowContext', names)
        self.assertNotIn('Skill', names)
        for row in tools.specs():
            if row['name'] in {'ImageSearch', 'ImageGen'}:
                self.assertNotIn('pages', row['parameters']['properties'])
                self.assertNotIn('out', row['parameters']['properties'])

    def test_check_schema_exposes_reload_and_batched_state_semantics(self):
        check = next((row for row in tools.specs() if row['name'] == 'Check'))
        self.assertIn('1.2 秒', check['description'])
        self.assertIn('同一次 after', check['description'])

    def test_workflow_resource_read_is_full_and_read_only(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            pages = base / 'run/pages'
            resource = base / 'workflows/build-page/references/large.md'
            pages.mkdir(parents=True)
            resource.parent.mkdir(parents=True)
            body = 'START\n' + 'guidance\n' * 5000 + 'UNIQUE EOF'
            resource.write_text(body, encoding='utf-8')
            result = tools.run('Read', {'file_path': str(resource), 'offset': 4000, 'limit': 1}, pages, resource.parent.parent, 'page-01')
            denied = tools.run('Write', {'file_path': str(resource), 'content': 'overwrite'}, pages, resource.parent.parent, 'page-01')
        self.assertIn('START', result)
        self.assertIn('UNIQUE EOF', result)
        self.assertIn('EOF', result)
        self.assertIn('拒绝', denied)

    def test_only_current_library_guide_reads_fully_even_with_limits(self):
        with tempfile.TemporaryDirectory() as td:
            pages = Path(td) / 'pages'
            guide = pages / 'assets/lib/LIBS.md'
            guide.parent.mkdir(parents=True)
            body = 'START\n' + 'usage\n' * 5500 + 'END'
            guide.write_text(body)
            full = tools.run('Read', {'file_path': 'assets/lib/LIBS.md', 'offset': 10, 'limit': 1}, pages, None, 'page-01')
            for name in ('page-01.html', 'assets/lib/example.js', 'LIBS.md'):
                (pages / name).write_text('first\nsecond\nthird')
                partial = tools.run('Read', {'file_path': name, 'offset': 2, 'limit': 1}, pages, None, 'page-01')
                self.assertIn('second', partial)
                self.assertNotIn('first', partial)
                self.assertNotIn('third', partial)
        self.assertIn('START', full)
        self.assertIn('END', full)
        self.assertIn('EOF', full)

    def test_check_use_is_returned_only_for_visual_workflows(self):
        for name in ('build-cover', 'build-page', 'build-interaction'):
            with self.subTest(name=name):
                text = tools.check_use(name)
                self.assertTrue(text.startswith(f'<check_use workflow="{name}">'))
                self.assertIn('instrumentation, not approval', text)
                self.assertNotIn('When you finish', text)
        self.assertEqual(tools.check_use('build-code'), '')
        self.assertEqual(tools.check_use(None), '')
        original = tools.check._selfcheck
        tools.check._selfcheck = lambda *a, **k: '── page-01.html\n   渲染无报错'
        try:
            with tempfile.TemporaryDirectory() as td:
                page = tools.check._check(Path(td), {'page': 'page-01.html'}, 'build-page')
                code = tools.check._check(Path(td), {'page': 'page-01.html'}, 'build-code')
        finally:
            tools.check._selfcheck = original
        self.assertTrue(page.text.startswith('<check_use workflow="build-page">'))
        self.assertIn('渲染无报错', page.text)
        self.assertNotIn('<check_use', code.text)

    def test_check_inlines_initial_and_final_state_screenshots(self):
        shots = [Path(f'/s/page-01{suffix}.png') for suffix in ('', '-after1', '-after2', '-after3')]
        self.assertEqual(tools.check._pick_shots(shots), ([shots[0], shots[3]], shots[1:3]))
        self.assertEqual(tools.check._pick_shots(shots[:2]), (shots[:2], []))

    def test_check_lists_each_screenshot_once_with_inline_status(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as td:
            shots = [Path(td) / f'page-01-{i}.png' for i in range(3)]
            for shot in shots:
                shot.touch()
            report = '\n'.join((f'   截图 {shot} (800×450)' for shot in shots))
            with patch.object(tools.check, '_selfcheck', return_value=report), patch.object(tools.check, '_image', return_value=tools.Out('', [('image/png', 'stub')])):
                out = tools.check._check(Path(td), {'page': 'page-01.html', 'shot': True})
        self.assertEqual(len(out.images), 2)
        self.assertEqual(out.text.count('[已内联]'), 2)
        self.assertEqual(out.text.count('[可 Read]'), 1)
        for shot in shots:
            self.assertEqual(out.text.count(str(shot)), 1)

    def test_tool_descriptions_only_recommend_available_editors(self):
        for workflow, edit in [('build-code', 'Edit'), ('build-cover', 'Patch')]:
            rows = {row['name']: row for row in tools.specs(workflow)}
            self.assertIn(edit, rows)
            self.assertIn(edit, rows['Write']['description'])
            self.assertNotIn('Patch' if edit == 'Edit' else 'Edit', rows['Write']['description'])
        self.assertNotIn('description', next((row for row in tools.specs() if row['name'] == 'Bash'))['parameters']['properties'])

    def test_own_run_screenshots_are_readable_but_other_runs_are_not(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            pages = base / 'mine/pages'
            pages.mkdir(parents=True)
            mine = base / 'mine/.shots/page-01-after3.png'
            other = base / 'other/.shots/page-01-after3.png'
            self.assertIsNone(tools._out_of_bounds('Read', {'file_path': str(mine)}, pages, 'page-01'))
            self.assertIsNotNone(tools._out_of_bounds('Read', {'file_path': str(other)}, pages, 'page-01'))
            self.assertIsNotNone(tools._out_of_bounds('Write', {'file_path': str(mine), 'content': ''}, pages, 'page-01'))

    def test_raw_sample_sources_are_not_builder_readable(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            pages = base / 'run/pages'
            resource_root = base / 'workflows/build-page'
            raw = resource_root / 'samples/general/example/pages/index.html'
            pages.mkdir(parents=True)
            raw.parent.mkdir(parents=True)
            raw.write_text('raw runnable source', encoding='utf-8')
            result = tools.run('Read', {'file_path': str(raw)}, pages, resource_root, 'page-01')
        self.assertIn('拒绝', result)

    def test_scope_guard_blocks_other_pages_and_external_paths(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            pages = base / 'mine/pages'
            pages.mkdir(parents=True)
            other = base / 'other/pages/page-01.html'
            self.assertEqual(tools._out_of_bounds('Read', {'file_path': 'page-02.html'}, pages, 'page-01'), 'page-02.html')
            self.assertIsNotNone(tools._out_of_bounds('Read', {'file_path': str(other)}, pages, 'page-01'))
            self.assertIsNone(tools._out_of_bounds('Write', {'file_path': 'page-01.html', 'content': 'mentions page-02.html'}, pages, 'page-01'))

class CodeScaffoldTests(unittest.TestCase):

    def test_scaffold_is_idempotent_and_returns_paths_with_contents(self):
        with tempfile.TemporaryDirectory() as td:
            pages = Path(td) / 'pages'
            pages.mkdir()
            first = code_runtime.scaffold(pages, 'page-04', 'AdaBoost 实操', 5)
            second = code_runtime.scaffold(pages, 'page-04', 'AdaBoost 实操', 5)
        self.assertEqual(first['editable'], second['editable'])
        self.assertEqual(len(first['editable']), len(code_runtime.EDITABLE))
        self.assertTrue(all((set(item) == {'path', 'content'} for item in first['editable'])))
        self.assertTrue(all((item['content'] for item in first['editable'])))
