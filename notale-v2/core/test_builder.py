#!/usr/bin/env python3
"""Regression tests for the deliberately small Builder harness."""

from __future__ import annotations

import copy
import json
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from core import builder, llm


ROOT = Path(__file__).resolve().parents[1]


class FakeCall(SimpleNamespace):
    def model_dump(self):
        return {
            "type": "function_call",
            "name": self.name,
            "arguments": self.arguments,
            "call_id": self.call_id,
        }


def call(name: str, **args) -> FakeCall:
    return FakeCall(
        type="function_call",
        name=name,
        arguments=json.dumps(args),
        call_id=f"c-{name}-{abs(hash(json.dumps(args, sort_keys=True))) % 100000}",
    )


def tool_response(*calls: FakeCall, index: int = 0):
    return SimpleNamespace(output=list(calls), usage=None, id=f"req-{index}")


def done_response(text: str = "done"):
    message = SimpleNamespace(
        type="message",
        content=[SimpleNamespace(type="output_text", text=text)],
    )
    return SimpleNamespace(output=[message], usage=None, id="req-done")


def page(pid="page-01", workflow="build-cover", label="标题页") -> builder.Page:
    return builder.Page(
        pid,
        "Build the current target.",
        workflow=workflow,
        label=label,
        spec_text=f"# {pid} [{label}]\nAdaBoosting 算法",
        total=4,
    )


class SampleDefaultsTests(unittest.TestCase):
    def test_cli_defaults_to_mini_plus_aux(self):
        args = builder.parse_args(["--label", "test"])
        self.assertEqual(args.samples, "mini")
        self.assertTrue(args.aux_samples)

    def test_cli_supports_explicit_sample_overrides(self):
        for flags, mode, aux in [
            (["--no-aux-samples"], "mini", False),
            (["--samples", "none"], "none", False),
            (["--samples", "mini", "--aux-samples"], "mini", True),
        ]:
            with self.subTest(flags=flags):
                args = builder.parse_args(["--label", "test", *flags])
                self.assertEqual((args.samples, args.aux_samples), (mode, aux))


    def test_cli_rejects_retired_full_mode(self):
        with patch("sys.stderr"), self.assertRaises(SystemExit) as caught:
            builder.parse_args(["--label", "test", "--samples", "full"])
        self.assertEqual(caught.exception.code, 2)


class PlanningContextTests(unittest.TestCase):
    def test_instruction_defaults_match_explicit_mini_plus_aux(self):
        with tempfile.TemporaryDirectory() as td:
            root = self.make_root(Path(td))
            for workflow in builder.skills.PAGE_WORKFLOWS:
                with self.subTest(workflow=workflow):
                    self.assertEqual(
                        builder.instruction_blocks(root, 6, workflow),
                        builder.instruction_blocks(root, 6, workflow,
                                                   samples="mini", include_aux=True),
                    )

    def test_code_and_cover_receive_only_applicable_guidance(self):
        with tempfile.TemporaryDirectory() as td:
            root = self.make_root(Path(td))
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
            root = self.make_root(Path(td))
            assets = root / 'pages/assets'
            def instructions(workflow):
                return '\n\n'.join(builder.instruction_blocks(
                    root, 6, workflow, notes='notes', visual_focus=True, frame_cap=True).values())
            (assets / 'theme.css').write_text(
                '/* ==== INTERFACE ====\n论点 LIGHT_THEME_SENTINEL\n'
                'token --bg #E8EEF1\n==== /INTERFACE ==== */')
            before = instructions('build-code')
            cover_before = instructions('build-cover')
            (assets / 'theme.css').write_text(
                '/* ==== INTERFACE ====\n论点 MAGENTA_THEME_SENTINEL\n'
                'token --bg #ff00ff\n==== /INTERFACE ==== */')
            (assets / 'CHASSIS.md').write_text('DECK_CHASSIS_SENTINEL')
            after = instructions('build-code')
            cover_after = instructions('build-cover')
        self.assertEqual(before, after)
        for token in ['<theme_css>', '<chassis>', '<anti_ai_slop_visual>',
                      '<speaker_notes>', '<visual_focus>', '<frame_budget>',
                      'LIGHT_THEME_SENTINEL', 'MAGENTA_THEME_SENTINEL', 'DECK_CHASSIS_SENTINEL']:
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
            root = self.make_root(Path(td))
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
                    denial = builder.code_runtime.tool_guard(
                        'Read', {'file_path': name}, pages, 'page-25', ROOT / 'workflows/build-code')
                    self.assertIsNotNone(denial)

    @staticmethod
    def make_root(path: Path) -> Path:
        assets = path / "pages" / "assets"
        plan = path / "pages" / "plan"
        assets.mkdir(parents=True)
        plan.mkdir()
        (assets / "CHASSIS.md").write_text("chassis", encoding="utf-8")
        (assets / "theme.css").write_text(
            "/* ==== INTERFACE ====\n组件 .panel 读数容器\n"
            "==== /INTERFACE ==== */\n.panel{padding:12px}",
            encoding="utf-8",
        )
        library = assets / "lib"
        library.mkdir()
        (library / "LIBS.md").write_text(
            "# Libraries\n\n## 按「要做的事」查\n\n| task | file |\n|---|---|\n"
            "| chart | d3.min.js |\n\n## Details\nAPI details",
            encoding="utf-8",
        )
        specs = [
            "# page-01 [标题页]\n整套开场",
            "# page-02 [内容页]\n历史背景",
            "# page-03 [交互页]\n交互理解",
            "# page-04 [代码页]\n代码实操",
            "# page-05 [标题页]\n第二章",
            "# page-06 [内容页]\n章节内容",
        ]
        (plan / "pages.md").write_text(
            "本套无需图池\n\n" + "\n\n".join(specs), encoding="utf-8"
        )
        for index, spec in enumerate(specs, 1):
            (plan / f"p{index:02d}.md").write_text(spec, encoding="utf-8")
        return path

    def test_shared_prefix_has_outline_not_all_page_details(self):
        with tempfile.TemporaryDirectory() as td:
            text = builder.shared_preload(self.make_root(Path(td)), 6)
        self.assertIn("<deck_outline>", text)
        self.assertIn("整套开场", text)
        self.assertIn("第二章", text)
        self.assertNotIn("历史背景", text)
        self.assertIn(".panel 读数容器", text)
        self.assertNotIn("padding:12px", text)

    def test_chapter_context_is_compact_valid_xml(self):
        with tempfile.TemporaryDirectory() as td:
            blocks = builder.chapter_preloads(self.make_root(Path(td)), 6)
        node = ET.fromstring(blocks["page-03"])
        self.assertEqual(node.attrib["current"], "page-03")
        self.assertEqual(
            [child.attrib["id"] for child in node],
            ["page-01", "page-02", "page-03", "page-04"],
        )
        self.assertEqual(node[2].attrib["current"], "true")
        self.assertEqual(
            [child.attrib["id"] for child in ET.fromstring(blocks["page-06"])],
            ["page-05", "page-06"],
        )

    def test_environment_context_matches_real_absent_target(self):
        with tempfile.TemporaryDirectory() as td:
            pages = Path(td) / "pages"
            pages.mkdir()
            p = page()
            text = builder.environment_context(
                pages, p, ROOT / "workflows" / p.workflow
            )
        node = ET.fromstring(text)
        self.assertEqual(node.findtext("target_state"), "absent")
        self.assertTrue(node.findtext("target").endswith("page-01.html"))
        self.assertTrue(node.findtext("read_only_skill").endswith("build-cover"))


class RoutingTests(unittest.TestCase):
    def test_all_four_labels_route_one_to_one(self):
        cases = {
            "标题页": "build-cover",
            "内容页": "build-page",
            "交互页": "build-interaction",
            "代码页": "build-code",
        }
        for label, workflow in cases.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as td:
                root = Path(td)
                plan = root / "pages" / "plan"
                plan.mkdir(parents=True)
                (plan / "p01.md").write_text(
                    f"# page-01 [{label}]\nAdaBoosting", encoding="utf-8"
                )
                routed = builder.route_page(root, builder.Page("page-01", "Build"))
                self.assertEqual(routed.workflow, workflow)

    def test_unknown_label_fails_loudly(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            plan = root / "pages" / "plan"
            plan.mkdir(parents=True)
            (plan / "p01.md").write_text(
                "# page-01 [练习页]\nAdaBoosting", encoding="utf-8"
            )
            with self.assertRaisesRegex(ValueError, "cannot route"):
                builder.route_page(root, builder.Page("page-01", "Build"))


class AgentLoopTests(unittest.TestCase):
    def test_second_read_and_bash_before_write_stop_without_retry(self):
        for forbidden in (call('Read', file_path='assets/base.js'),
                          call('Bash', command='cat assets/base.js'),
                          call('Check', page='page-01.html')):
            with self.subTest(tool=forbidden.name), tempfile.TemporaryDirectory() as td:
                events = []
                responses = [tool_response(call('Read', file_path='reference.md')),
                             tool_response(forbidden, call('Write', file_path='page-01.html', content='<html/>'))]
                with patch.object(builder, 'respond', side_effect=responses) as respond, \
                     patch.object(builder.tools, 'run', self.fake_run_factory(events)):
                    result = builder.build_one(page(), Path(td), Path(td)/'trace.jsonl',
                                               ROOT/'workflows', 'instructions', 'low')
                self.assertEqual(respond.call_count, 2)
                self.assertEqual(result.termination, 'initial_read_order')
                self.assertEqual([name for name, _ in events], ['Read'])
                self.assertFalse(result.artifact_present)
                self.assertIn(forbidden.name, result.why)

    def test_mixed_first_batch_is_not_partially_executed(self):
        with tempfile.TemporaryDirectory() as td:
            with patch.object(builder, 'respond', return_value=tool_response(
                    call('Read', file_path='reference.md'),
                    call('Write', file_path='page-01.html', content='<html/>'))) as respond, \
                 patch.object(builder.tools, 'run') as execute:
                result = builder.build_one(page(), Path(td), Path(td)/'trace.jsonl',
                                           ROOT/'workflows', 'instructions', 'low')
            execute.assert_not_called()
            respond.assert_called_once()
            self.assertEqual(result.termination, 'initial_read_order')

    def test_initial_read_failure_and_bad_json_stop_without_followup(self):
        for broken_args in (False, True):
            with self.subTest(bad_json=broken_args), tempfile.TemporaryDirectory() as td:
                reading = call('Read', file_path='missing.md')
                if broken_args:
                    reading.arguments = '{'
                with patch.object(builder, 'respond', return_value=tool_response(reading)) as respond, \
                     patch.object(builder.tools, 'run', return_value='FileNotFoundError: missing') as execute:
                    result = builder.build_one(page(), Path(td), Path(td)/'trace.jsonl',
                                               ROOT/'workflows', 'instructions', 'low')
                respond.assert_called_once()
                self.assertEqual(execute.call_count, 0 if broken_args else 1)
                self.assertEqual(result.termination, 'initial_read_failed')

    def test_existing_file_empty_write_and_failed_write_do_not_unlock_reads(self):
        cases = ('existing', 'empty', 'unchanged', 'failed')
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as td:
                pages = Path(td)
                if case in ('existing', 'unchanged'):
                    (pages/'page-01.html').write_text('<html/>')
                writing = [] if case == 'existing' else [tool_response(
                    call('Write', file_path='page-01.html', content='' if case == 'empty' else '<html/>'))]
                responses = [tool_response(call('Read', file_path='reference.md'))] + writing + [
                    tool_response(call('Read', file_path='assets/base.js'))]
                events = []
                normal = self.fake_run_factory(events)
                def execute(name, args, cwd, resource, pid):
                    if case == 'failed' and name == 'Write':
                        return 'PermissionError: cannot write'
                    return normal(name, args, cwd, resource, pid)
                with patch.object(builder, 'respond', side_effect=responses), \
                     patch.object(builder.tools, 'run', side_effect=execute):
                    result = builder.build_one(page(), pages, pages/'trace.jsonl',
                                               ROOT/'workflows', 'instructions', 'low')
                self.assertEqual(result.termination, 'initial_read_order')
                self.assertEqual(sum(name == 'Read' for name, _ in events), 1)

    def test_code_scaffold_does_not_unlock_but_real_lesson_edit_does(self):
        for edit in (False, True):
            with self.subTest(edit=edit), tempfile.TemporaryDirectory() as td:
                pages = Path(td)
                lesson = builder.code_runtime.editable_root(pages, 'page-04')
                source = lesson/'starter.py'
                reference = ROOT/'workflows/build-code/references/code.md'
                def scaffold(*_args):
                    lesson.mkdir(parents=True)
                    source.write_text('x = 1')
                    (pages/'page-04.html').write_text('<html/>')
                    return {'editable':[{'path':str(source),'content':'x = 1'}]}
                responses = [tool_response(call('Read', file_path=str(reference)), call('CodeScaffold'))]
                if edit:
                    responses.append(tool_response(call('Edit', file_path=str(source), old_string='x = 1', new_string='x = 2')))
                responses += [tool_response(call('Read', file_path=str(source))), done_response()]
                with patch.object(builder, 'respond', side_effect=responses), \
                     patch.object(builder.code_runtime, 'scaffold', side_effect=scaffold), \
                     patch.object(builder, 'audit_delivery', return_value={}):
                    result = builder.build_one(page('page-04','build-code','代码页'), pages, pages/'trace.jsonl',
                                               ROOT/'workflows', 'instructions', 'low')
                self.assertEqual(result.termination, 'no_tool_use' if edit else 'initial_read_order')
                self.assertEqual(source.read_text(), 'x = 2' if edit else 'x = 1')

    def test_guidance_is_sent_once_per_page_without_rewriting_history(self):
        snapshots = []
        use = builder.tools.check_use('build-cover')
        responses = [tool_response(call('Read', file_path='reference.md')),
                     tool_response(call('Write', file_path='page-01.html', content='<html/>')),
                     tool_response(call('Check', page='page-01.html')),
                     tool_response(call('Check', page='page-01.html')),
                     done_response()]

        def respond(_instructions, hist, _specs, _effort, **_kwargs):
            snapshots.append(copy.deepcopy(hist))
            return responses.pop(0)

        ordinary = self.fake_run_factory([])

        def execute(name, args, cwd, resource, pid):
            return use + '\n\nmeasured' if name == 'Check' else ordinary(name, args, cwd, resource, pid)

        with tempfile.TemporaryDirectory() as td, \
                patch.object(builder, 'respond', respond), \
                patch.object(builder.tools, 'run', side_effect=execute):
            builder.build_one(page(), Path(td), Path(td) / 'trace.jsonl',
                              ROOT / 'workflows', 'instructions', 'low')
        outputs = [x['output'] for x in snapshots[-1] if x.get('type') == 'function_call_output'
                   and x['call_id'].startswith('c-Check-')]
        self.assertEqual(len(outputs), 2)
        self.assertIn('<check_use', outputs[0])
        self.assertEqual(outputs[1], 'measured')
        self.assertEqual(snapshots[-1][:len(snapshots[-2])], snapshots[-2])
        # A second page gets its own first copy; no process-global suppression.
        self.assertEqual(builder.first_guidance_only(use, set()), use)

    @staticmethod
    def fake_run_factory(events: list, fatal_audit: bool = False):
        def fake_run(name, args, cwd, _resource_root, _pid):
            events.append((name, copy.deepcopy(args)))
            if name == "Write":
                target = Path(args["file_path"])
                if not target.is_absolute():
                    target = cwd / target
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(args["content"], encoding="utf-8")
                return "written"
            if name == "Edit":
                return "edited"
            if name == "Read":
                return "resource body · EOF"
            if name == "Check":
                return "✗ JS 报错" if fatal_audit else "✓ clean"
            return "ok"

        return fake_run

    def test_no_tool_stops_once_without_delivery_or_nag(self):
        with tempfile.TemporaryDirectory() as td, patch.object(
            builder, "respond", return_value=done_response()
        ) as respond:
            result = builder.build_one(
                page(), Path(td), Path(td) / "trace.jsonl", ROOT / "workflows",
                "instructions", "low",
            )
        self.assertEqual(result.calls, 1)
        self.assertEqual(result.termination, "no_tool_use")
        self.assertFalse(result.artifact_present)
        self.assertIn("target missing", result.audit["fatal_errors"][0])
        respond.assert_called_once()

    def test_response_target_is_not_a_runtime_cap(self):
        responses = [tool_response(call('Read', file_path='reference.md')),
                     tool_response(call('Write', file_path='page-01.html', content='<html/>'))] + [
            tool_response(
                call("Read", file_path=f"missing-{index}.md"),
                index=index,
            )
            for index in range(builder.RESPONSE_TARGET + 1)
        ] + [done_response()]
        events = []
        with tempfile.TemporaryDirectory() as td, \
                patch.object(builder, "respond", side_effect=responses) as respond, \
                patch.object(builder.tools, "run", self.fake_run_factory(events)):
            result = builder.build_one(
                page(), Path(td), Path(td) / "trace.jsonl", ROOT / "workflows",
                "instructions", "low",
            )

        self.assertEqual(result.calls, builder.RESPONSE_TARGET + 4)
        self.assertEqual(respond.call_count, builder.RESPONSE_TARGET + 4)
        self.assertEqual(result.termination, "no_tool_use")
        self.assertTrue(result.artifact_present)

    def test_tools_in_one_response_execute_in_listed_order(self):
        responses = [
            tool_response(call('Read', file_path='reference.md')),
            tool_response(
                call("Write", file_path="page-01.html", content="<html>one</html>"),
                call("Check", page="page-01.html", after=[]),
            ),
            done_response(),
        ]
        events = []
        with tempfile.TemporaryDirectory() as td, \
                patch.object(builder, "respond", side_effect=responses), \
                patch.object(builder.tools, "run", self.fake_run_factory(events)):
            result = builder.build_one(
                page(), Path(td), Path(td) / "trace.jsonl", ROOT / "workflows",
                "instructions", "low",
            )

        self.assertEqual(result.calls, 3)
        self.assertEqual(result.termination, "no_tool_use")
        self.assertEqual([name for name, _ in events[1:3]], ["Write", "Check"])
        self.assertTrue(result.artifact_present)

    def test_native_reads_then_write_use_one_constant_surface_and_effort(self):
        skill = ROOT / "workflows" / "build-cover"
        responses = [
            tool_response(
                call("Read", file_path=str(skill / "references/composition.md")),
                call("Read", file_path=str(skill / "samples/bundles/composition/prism-light.mini.md")),
                index=0,
            ),
            tool_response(
                call("Write", file_path="page-01.html", content="<html>one</html>"),
                index=1,
            ),
            done_response(),
        ]
        surfaces, efforts, events = [], [], []

        def fake_respond(_instructions, _hist, specs, effort, tag="-"):
            surfaces.append(tuple(row["name"] for row in specs))
            efforts.append(effort)
            return responses.pop(0)

        with tempfile.TemporaryDirectory() as td, \
                patch.object(builder, "respond", fake_respond), \
                patch.object(builder.tools, "run", self.fake_run_factory(events)):
            result = builder.build_one(
                page(), Path(td), Path(td) / "trace.jsonl", ROOT / "workflows",
                "instructions", "low",
            )

        self.assertTrue(result.artifact_present)
        self.assertEqual(result.termination, "no_tool_use")
        self.assertEqual(len(set(surfaces)), 1)
        self.assertEqual(efforts, ["low", "low", "low"])
        self.assertNotIn("Skill", surfaces[0])
        self.assertNotIn("WorkflowContext", surfaces[0])
        self.assertNotIn("Edit", surfaces[0])
        self.assertIn("Patch", surfaces[0])
        self.assertEqual(
            result.reference_reads,
            ["references/composition.md", "samples/bundles/composition/prism-light.mini.md"],
        )
        self.assertEqual([name for name, _ in events].count("Check"), 1)

    def test_repeated_write_is_not_masked_or_rejected(self):
        responses = [
            tool_response(call('Read', file_path='reference.md')),
            tool_response(
                call("Write", file_path="page-01.html", content="<html>first</html>"),
                index=0,
            ),
            tool_response(
                call("Write", file_path="page-01.html", content="<html>final</html>"),
                index=1,
            ),
            done_response(),
        ]
        surfaces, events = [], []

        def fake_respond(_instructions, _hist, specs, _effort, tag="-"):
            surfaces.append({row["name"] for row in specs})
            return responses.pop(0)

        with tempfile.TemporaryDirectory() as td, \
                patch.object(builder, "respond", fake_respond), \
                patch.object(builder.tools, "run", self.fake_run_factory(events)):
            pages = Path(td)
            result = builder.build_one(
                page(), pages, pages / "trace.jsonl", ROOT / "workflows",
                "instructions", "low",
            )
            final = (pages / "page-01.html").read_text(encoding="utf-8")

        self.assertTrue(result.artifact_present)
        self.assertEqual(final, "<html>final</html>")
        self.assertTrue(all("Write" in surface for surface in surfaces))
        self.assertEqual([name for name, _ in events].count("Write"), 2)

    def test_artifact_and_failed_audit_are_recorded_separately(self):
        responses = [
            tool_response(call('Read', file_path='reference.md')),
            tool_response(call("Write", file_path="page-01.html", content="<html/>")),
            done_response(),
        ]
        events = []
        with tempfile.TemporaryDirectory() as td, \
                patch.object(builder, "respond", side_effect=responses), \
                patch.object(
                    builder.tools, "run",
                    self.fake_run_factory(events, fatal_audit=True),
                ):
            result = builder.build_one(
                page(), Path(td), Path(td) / "trace.jsonl", ROOT / "workflows",
                "instructions", "low",
            )
        self.assertTrue(result.artifact_present)
        self.assertEqual(result.audit["fatal_errors"], ["✗ JS 报错"])

    def test_code_surface_is_constant_and_scaffold_returns_editable_contents(self):
        skill = ROOT / "workflows" / "build-code"
        responses = [
            tool_response(
                call("Read", file_path=str(skill / "references/code.md")),
                call("Read", file_path=str(skill / "samples/bundles/code/code-core-bundle.one.md")),
                call("CodeScaffold"),
                index=0,
            ),
            done_response(),
        ]
        surfaces = []

        def fake_respond(_instructions, _hist, specs, _effort, tag="-"):
            self.assertIsInstance(_hist[0]['content'], str)
            self.assertNotIn(builder.REF_SHOTS_NOTE, _hist[0]['content'])
            surfaces.append({row["name"] for row in specs})
            return responses.pop(0)

        def fake_scaffold(pages, pid, _title, _total):
            (pages / f"{pid}.html").write_text("<html>workbench</html>", encoding="utf-8")
            editable = builder.code_runtime.editable_root(pages, pid)
            editable.mkdir(parents=True)
            source = editable / "starter.py"
            source.write_text("print('ready')", encoding="utf-8")
            return {"editable": [{"path": str(source), "content": source.read_text()}]}

        with tempfile.TemporaryDirectory() as td, \
                patch.object(builder, "respond", fake_respond), \
                patch.object(builder.code_runtime, "scaffold", side_effect=fake_scaffold), \
                patch.object(builder.code_runtime, "run_browser_check", return_value=("✓ inner", [])), \
                patch.object(builder.tools, "run", return_value="✓ outer"):
            result = builder.build_one(
                page("page-04", "build-code", "代码页"),
                Path(td), Path(td) / "trace.jsonl", ROOT / "workflows",
                "instructions", "low",
                refs=[{'type': 'input_image', 'image_url': 'data:image/png;base64,stub'}],
            )

        self.assertTrue(result.artifact_present)
        expected = {"CodeScaffold", "Read", "Write", "Edit", "Check", "ImageSearch", "ImageGen"}
        self.assertTrue(all(surface == expected for surface in surfaces))
        self.assertNotIn("Bash", surfaces[0])
        self.assertNotIn("Patch", surfaces[0])
        self.assertEqual(
            result.reference_reads,
            ["references/code.md", "samples/bundles/code/code-core-bundle.one.md"],
        )

    def test_text_only_profile_removes_look_and_forces_text_check(self):
        responses = [
            tool_response(call('Read', file_path='reference.md')),
            tool_response(call("Write", file_path="page-01.html", content="<html/>")),
            tool_response(call("Check", page="page-01.html", shot=True)),
            done_response(),
        ]
        surfaces, events = [], []

        def fake_respond(_instructions, _hist, specs, _effort, tag="-"):
            surfaces.append({row["name"] for row in specs})
            return responses.pop(0)

        with tempfile.TemporaryDirectory() as td, \
                patch.object(builder, "respond", fake_respond), \
                patch.object(builder.tools, "run", self.fake_run_factory(events)):
            result = builder.build_one(
                page(), Path(td), Path(td) / "trace.jsonl", ROOT / "workflows",
                "instructions", "low", vision_input=False,
            )
        self.assertTrue(result.artifact_present)
        self.assertTrue(all("Look" not in surface for surface in surfaces))
        checks = [args for name, args in events if name == "Check"]
        self.assertTrue(checks)
        self.assertTrue(all(args["shot"] is False for args in checks))
        self.assertEqual(result.images, 0)


class ProfileTests(unittest.TestCase):
    def test_builder_profile_keeps_one_effort_setting(self):
        cfg = {
            "builder": {
                "default_profile": "sonnet-low",
                "profiles": {
                    "sonnet-low": {
                        "model": "sonnet-5",
                        "base_url": "https://example.test",
                        "api_key_env": "KEY",
                        "adapter": "messages",
                        "reasoning_effort": "low",
                        "vision_input": True,
                    }
                },
            }
        }
        profile = llm.resolve_builder_profile(cfg)
        self.assertEqual(profile.reasoning_effort, "low")
        self.assertFalse(hasattr(profile, "post_composition_effort"))


    def test_workflow_profiles_route_only_listed_workflows(self):
        prof = {"base_url": "https://example.test", "api_key_env": "KEY",
                "adapter": "messages", "vision_input": True}
        cfg = {"builder": {
            "default_profile": "a",
            "workflow_profiles": {"build-code": "b"},
            "profiles": {"a": {**prof, "model": "m-a", "reasoning_effort": "low"},
                         "b": {**prof, "model": "m-b", "reasoning_effort": "high"}},
        }}
        default = llm.resolve_builder_profile(cfg)
        original = llm.ModelRuntime.__init__
        llm.ModelRuntime.__init__ = lambda self, profile, sdk_client=None: setattr(self, "profile", profile)
        try:
            runtimes = builder.workflow_runtimes(cfg, default)
            self.assertEqual({k: v.profile.id for k, v in runtimes.items()},
                             {"build-cover": "a", "build-page": "a",
                              "build-interaction": "a", "build-code": "b"})
            self.assertEqual(runtimes["build-code"].profile.reasoning_effort, "high")
            self.assertIs(runtimes["build-cover"], runtimes["build-page"])
            cfg["builder"]["workflow_profiles"] = {"build-3d": "b"}
            with self.assertRaises(ValueError):
                builder.workflow_runtimes(cfg, default)
        finally:
            llm.ModelRuntime.__init__ = original

if __name__ == "__main__":
    unittest.main()
