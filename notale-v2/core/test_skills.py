#!/usr/bin/env python3
"""Production workflow, sample-bundle, and tool-boundary tests."""

from __future__ import annotations

import json
import re
import tempfile
import unittest
from pathlib import Path

from core import builder, code_runtime, sample_bundles, skills, tools


ROOT = Path(__file__).resolve().parents[1]


class WorkflowRegistryTests(unittest.TestCase):
    def test_registry_is_exactly_the_four_page_routes_plus_auditor(self):
        self.assertEqual(
            skills.PAGE_WORKFLOWS,
            ("build-cover", "build-page", "build-interaction", "build-code"),
        )
        self.assertEqual(set(skills.available()), set(skills.ALL_WORKFLOWS))

    def test_routed_skill_is_inline_and_paths_are_directly_readable(self):
        for name in skills.PAGE_WORKFLOWS:
            with self.subTest(name=name):
                block = skills.routed_workflow(name)
                self.assertIn(f'<workflow_skill name="{name}"', block)
                self.assertNotIn("<skill-dir>", block)
                # 路径根只写一次，其余是相对 workflow 根的路径（省下每条重复
                # 60 多字符的绝对前缀）。所以判据从「绝对路径存在」改成
                # 「按 root 解析后存在」，并且 root 必须真的声明出来。
                env = builder.environment_context(Path('/tmp/pages'), builder.Page('page-01', ''), skills.WORKFLOWS / name)
                root = re.search(r'<read_only_skill>(.*?)</read_only_skill>', env)
                self.assertNotIn('root=', block)
                rels = re.findall(
                    r"(?:`|\()((?:references|samples)/[^`)]+\.md)(?:`|\))", block)
                self.assertTrue(rels)
                for rel in rels:
                    self.assertTrue((Path(root.group(1)) / rel).is_file(), rel)

    def test_reference_taxonomy_is_non_overlapping(self):
        expected = {
            "build-cover": {"composition.md", "motion.md", "generative.md"},
            "build-page": {"general.md", "chart.md", "3d.md"},
            "build-interaction": {"general.md", "3d.md"},
            "build-code": {"code.md"},
        }
        for name, references in expected.items():
            with self.subTest(name=name):
                root = skills.WORKFLOWS / name
                self.assertEqual(
                    {path.name for path in (root / "references").glob("*.md")},
                    references,
                )
                text = (root / "SKILL.md").read_text(encoding="utf-8")
                self.assertNotRegex(text, r"\b(?:chars?|characters?)\b|字符数")

    def test_sample_catalog_describes_transferable_surface_not_topics_only(self):
        counts = {
            "build-cover": 8,
            "build-page": 11,
            "build-interaction": 3,
            "build-code": 1,
        }
        for name, count in counts.items():
            with self.subTest(name=name):
                skill_dir = skills.WORKFLOWS / name
                catalog = json.loads(
                    (skill_dir / "samples/catalog.json").read_text(encoding="utf-8")
                )
                self.assertEqual(len(catalog["samples"]), count)
                if name == "build-code":
                    self.assertEqual(catalog["samples"][0]["id"], "code-core-bundle")
                    continue
                text = (skill_dir / "SKILL.md").read_text(encoding="utf-8")
                for row in catalog["samples"]:
                    self.assertIn(f"- `{row['id']}`", text)
                    section = text.split(f"- `{row['id']}`", 1)[1].split("\n- `", 1)[0]
                    # 2026-09-05 删掉了 Scene 那一行（题材描述）。SKILL 正文明令
                    # 「按证据几何选 Main，绝不按题材相似选」，而 Scene 恰恰只描述题材，
                    # 留着等于一边禁止一边提供。判据改成：必须有可迁移描述和路径，
                    # 且不得再出现题材行。
                    self.assertNotIn("Scene:", section)
                    self.assertIn(f"{row['category']}/{row['id']}", section)
                    body = [l.strip(" -") for l in section.splitlines()
                            if l.strip(" -") and ".md" not in l]
                    self.assertTrue(body, f"{row['id']} 没有可迁移描述")

    def test_main_only_is_default_and_aux_minis_are_opt_in(self):
        for name in skills.PAGE_WORKFLOWS:
            with self.subTest(name=name):
                skill_text = (skills.WORKFLOWS / name / "SKILL.md").read_text(
                    encoding="utf-8"
                )
                default = skills.routed_workflow(name)
                self.assertNotIn("  - Aux:", skill_text)
                self.assertNotIn(".mini.md", skill_text)
                self.assertNotIn("<aux_sample_catalog", default)
                self.assertNotIn(".mini.md", default)

        for name in ("build-cover", "build-page", "build-interaction"):
            with self.subTest(aux_enabled=name):
                enabled = skills.routed_workflow(name, include_aux=True)
                self.assertIn(f'<aux_sample_catalog workflow="{name}">', enabled)
                self.assertIn(".mini.md", enabled)
                self.assertNotIn("Do not read any other sample.", enabled)

        self.assertNotIn(
            "<aux_sample_catalog",
            skills.routed_workflow("build-code", include_aux=True),
        )

    def test_interaction_requires_real_state_and_code_is_separate(self):
        interaction = (skills.WORKFLOWS / "build-interaction/SKILL.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("real algorithm, simulation, rule system", interaction)
        self.assertIn("visible evidence must derive", interaction)
        self.assertNotIn("CodeScaffold", interaction)
        code = (skills.WORKFLOWS / "build-code/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("CodeScaffold", code)
        self.assertIn("four contrasting author layers", code)


class SampleAblationTests(unittest.TestCase):
    """三档样本预算必须真的改变 SKILL 正文,而不是静默不变。

    一个悄悄没生效的消融臂等于偷偷跑了对照组,比直接崩掉更糟 —— 结论会反过来。
    """

    def test_none_removes_every_worked_sample(self):
        for name in skills.PAGE_WORKFLOWS:
            with self.subTest(name=name):
                body = skills.routed_workflow(name, samples="none")
                self.assertNotIn(".full.md", body)
                self.assertNotIn(".mini.md", body)
                self.assertNotIn("## Samples", body)
                # reference 必须还在,否则这一臂连构造契约都没有
                self.assertRegex(body, r"references/[a-z0-9-]+\.md")

    def test_mini_swaps_mains_and_records_fallbacks(self):
        skills.MINI_FALLBACKS.clear()
        for name in skills.PAGE_WORKFLOWS:
            with self.subTest(name=name):
                body = skills.routed_workflow(name, samples="mini")
                root = skills.WORKFLOWS / name
                for rel in re.findall(
                        r"(?:`|\()((?:references|samples)/[^`)]+\.md)(?:`|\))", body):
                    self.assertTrue((Path(root) / rel).is_file(), rel)
        # build-cover 有三份 Main 至今没有 mini,必须被记下来而不是静默换掉菜单
        self.assertIn("build-cover", skills.MINI_FALLBACKS)
        self.assertIn("telescope-zoom", skills.MINI_FALLBACKS["build-cover"])

    def test_code_mini_is_one_author_layer(self):
        full = skills.routed_workflow("build-code", samples="full")
        one = skills.routed_workflow("build-code", samples="mini")
        self.assertIn("code-core-bundle.full.md", full)
        self.assertIn("four contrasting author layers", full)
        self.assertIn("code-core-bundle.one.md", one)
        self.assertIn("one worked author layer", one)
        bundles = skills.WORKFLOWS / "build-code/samples/bundles/code"
        self.assertLess(
            (bundles / "code-core-bundle.one.md").stat().st_size,
            (bundles / "code-core-bundle.full.md").stat().st_size / 2,
        )

    def test_bad_mode_and_aux_conflict_are_refused(self):
        with self.assertRaises(ValueError):
            skills.routed_workflow("build-page", samples="tiny")
        with self.assertRaises(ValueError):
            skills.routed_workflow("build-page", samples="none", include_aux=True)

    def test_mini_plus_aux_is_the_many_small_samples_arm(self):
        body = skills.routed_workflow("build-page", samples="mini", include_aux=True)
        self.assertIn("<aux_sample_catalog", body)
        self.assertNotIn(".full.md", body)
        self.assertGreaterEqual(body.count(".mini.md"), 4)


class BundleTests(unittest.TestCase):
    def test_generated_bundles_are_current_and_keep_visual_css(self):
        rendered = sample_bundles.render_all()
        self.assertEqual(len(rendered), 42)
        for path, expected in rendered.items():
            with self.subTest(path=path):
                self.assertEqual(path.read_text(encoding="utf-8"), expected)
                self.assertIn("<sample ", expected)
                self.assertIn("<file path=", expected)
                if "build-code" in path.parts:
                    self.assertNotRegex(expected, r"(?i)<style\b|```css")
                else:
                    self.assertRegex(expected, r"(?i)<style\b|```css")

    def test_visual_full_bundles_declare_every_omitted_dependency(self):
        for path, text in sample_bundles.render_all().items():
            if "build-code" in path.parts or not path.name.endswith(".full.md"):
                continue
            with self.subTest(path=path):
                self.assertIn("<omitted path=", text)  # every sample uses the chassis
        with self.assertRaises(ValueError):
            sample_bundles.omitted_lines(
                "x", {"files": ["index.html"]}, '<script src="assets/data.js"></script>'
            )
        with self.assertRaises(ValueError):
            sample_bundles.omitted_lines(
                "x", {"files": ["index.html"], "omitted": {"stale.js": "n"}}, ""
            )
        self.assertEqual(
            sample_bundles.omitted_lines(
                "x", {"files": ["index.html"], "omitted": {"data/*.js": "rows"}},
                '<script src="assets/base.js"></script><script src="data/a.js"></script>',
            ),
            ['  <omitted path="assets/base.js">' + sample_bundles._PROVIDED_NOTE + "</omitted>",
             '  <omitted path="data/a.js">rows</omitted>'],
        )

    def test_main_only_and_combined_code_contracts(self):
        interaction = json.loads(
            (skills.WORKFLOWS / "build-interaction/samples/catalog.json").read_text()
        )
        climate = next(row for row in interaction["samples"]
                       if row["id"] == "future-climate-analogy")
        self.assertNotIn("mini", climate)

        code = json.loads(
            (skills.WORKFLOWS / "build-code/samples/catalog.json").read_text()
        )["samples"][0]
        self.assertEqual(len(code["full"]["files"]), 28)
        self.assertNotIn("mini", code)


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
            # An actual page-local file still takes precedence.
            (cwd / 'references').mkdir()
            (cwd / relative).write_text('local')
            self.assertEqual(tools.resolve_read_path(relative, cwd, resource), cwd / relative)

    def test_surface_has_no_selection_or_media_tools(self):
        names = [schema["name"] for schema in tools.specs()]
        self.assertEqual(
            names, ["Read", "Write", "Edit", "Patch", "Check", "Look", "Bash"]
        )
        self.assertNotIn("WorkflowContext", names)
        self.assertNotIn("Skill", names)
        self.assertNotIn("ImageSearch", names)
        self.assertNotIn("ImageGen", names)

    def test_check_schema_exposes_reload_and_batched_state_semantics(self):
        check = next(row for row in tools.specs() if row["name"] == "Check")
        self.assertIn("1.2 秒", check["description"])
        self.assertIn("同一次 after", check["description"])

    def test_workflow_resource_read_is_full_and_read_only(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            pages = base / "run/pages"
            resource = base / "workflows/build-page/references/large.md"
            pages.mkdir(parents=True)
            resource.parent.mkdir(parents=True)
            body = "START\n" + "guidance\n" * 5000 + "UNIQUE EOF"
            resource.write_text(body, encoding="utf-8")
            result = tools.run(
                "Read",
                {"file_path": str(resource), "offset": 4000, "limit": 1},
                pages,
                resource.parent.parent,
                "page-01",
            )
            denied = tools.run(
                "Write",
                {"file_path": str(resource), "content": "overwrite"},
                pages,
                resource.parent.parent,
                "page-01",
            )
        self.assertIn("START", result)
        self.assertIn("UNIQUE EOF", result)
        self.assertIn("EOF", result)
        self.assertIn("拒绝", denied)

    def test_sample_use_frames_both_visual_bundle_variants(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            pages = base / "run/pages"
            pages.mkdir(parents=True)

            def read(workflow: str, name: str) -> str:
                resource_root = base / "workflows" / workflow
                sample = resource_root / "samples/bundles/general" / name
                sample.parent.mkdir(parents=True, exist_ok=True)
                sample.write_text("<sample>body</sample>", encoding="utf-8")
                return tools.run(
                    "Read",
                    {"file_path": str(sample)},
                    pages,
                    resource_root,
                    "page-01",
                )

            visual_full = read("build-page", "example.full.md")
            visual_mini = read("build-page", "example.mini.md")
            code_full = read("build-code", "example.full.md")

        self.assertTrue(visual_full.startswith("<sample_use>"))
        self.assertIn("worked example, not a template", visual_full)
        self.assertTrue(visual_mini.startswith("<sample_use>"))
        self.assertNotIn("<sample_use>", code_full)

    def test_check_use_is_returned_only_for_visual_workflows(self):
        for name in ("build-cover", "build-page", "build-interaction"):
            with self.subTest(name=name):
                text = tools.check_use(name)
                self.assertTrue(text.startswith(f'<check_use workflow="{name}">'))
                self.assertIn("instrumentation, not approval", text)
                self.assertNotIn("When you finish", text)
        self.assertEqual(tools.check_use("build-code"), "")
        self.assertEqual(tools.check_use(None), "")

        original = tools._selfcheck
        tools._selfcheck = lambda *a, **k: "── page-01.html\n   渲染无报错"
        try:
            with tempfile.TemporaryDirectory() as td:
                page = tools._check(Path(td), {"page": "page-01.html"}, "build-page")
                code = tools._check(Path(td), {"page": "page-01.html"}, "build-code")
        finally:
            tools._selfcheck = original
        self.assertTrue(page.text.startswith('<check_use workflow="build-page">'))
        self.assertIn("渲染无报错", page.text)
        self.assertNotIn("<check_use", code.text)

    def test_check_inlines_initial_and_final_state_screenshots(self):
        shots = [Path(f"/s/page-01{suffix}.png") for suffix in ("", "-after1", "-after2", "-after3")]
        self.assertEqual(tools._pick_shots(shots), ([shots[0], shots[3]], shots[1:3]))
        self.assertEqual(tools._pick_shots(shots[:2]), (shots[:2], []))

    def test_check_lists_each_screenshot_once_with_inline_status(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as td:
            shots = [Path(td) / f'page-01-{i}.png' for i in range(3)]
            for shot in shots:
                shot.touch()
            report = '\n'.join(f'   截图 {shot} (800×450)' for shot in shots)
            with patch.object(tools, '_selfcheck', return_value=report), \
                 patch.object(tools, '_image', return_value=tools.Out('', [('image/png', 'stub')])):
                out = tools._check(Path(td), {'page': 'page-01.html', 'shot': True})
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
        self.assertNotIn('description', next(row for row in tools.specs()
                         if row['name'] == 'Bash')['parameters']['properties'])

    def test_own_run_screenshots_are_readable_but_other_runs_are_not(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            pages = base / "mine/pages"
            pages.mkdir(parents=True)
            mine = base / "mine/.shots/page-01-after3.png"
            other = base / "other/.shots/page-01-after3.png"
            self.assertIsNone(
                tools._out_of_bounds("Read", {"file_path": str(mine)}, pages, "page-01")
            )
            self.assertIsNotNone(
                tools._out_of_bounds("Read", {"file_path": str(other)}, pages, "page-01")
            )
            self.assertIsNotNone(
                tools._out_of_bounds("Write", {"file_path": str(mine), "content": ""},
                                     pages, "page-01")
            )

    def test_raw_sample_sources_are_not_builder_readable(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            pages = base / "run/pages"
            resource_root = base / "workflows/build-page"
            raw = resource_root / "samples/general/example/pages/index.html"
            pages.mkdir(parents=True)
            raw.parent.mkdir(parents=True)
            raw.write_text("raw runnable source", encoding="utf-8")
            result = tools.run(
                "Read",
                {"file_path": str(raw)},
                pages,
                resource_root,
                "page-01",
            )
        self.assertIn("拒绝", result)

    def test_scope_guard_blocks_other_pages_and_external_paths(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            pages = base / "mine/pages"
            pages.mkdir(parents=True)
            other = base / "other/pages/page-01.html"
            self.assertEqual(
                tools._out_of_bounds("Read", {"file_path": "page-02.html"}, pages,
                                     "page-01"),
                "page-02.html",
            )
            self.assertIsNotNone(
                tools._out_of_bounds("Read", {"file_path": str(other)}, pages, "page-01")
            )
            self.assertIsNone(
                tools._out_of_bounds("Write", {
                    "file_path": "page-01.html",
                    "content": "mentions page-02.html",
                }, pages, "page-01")
            )


class CodeScaffoldTests(unittest.TestCase):
    def test_scaffold_is_idempotent_and_returns_paths_with_contents(self):
        with tempfile.TemporaryDirectory() as td:
            pages = Path(td) / "pages"
            pages.mkdir()
            first = code_runtime.scaffold(pages, "page-04", "AdaBoost 实操", 5)
            second = code_runtime.scaffold(pages, "page-04", "AdaBoost 实操", 5)
        self.assertEqual(first["editable"], second["editable"])
        self.assertEqual(len(first["editable"]), len(code_runtime.EDITABLE))
        self.assertTrue(all(set(item) == {"path", "content"} for item in first["editable"]))
        self.assertTrue(all(item["content"] for item in first["editable"]))


if __name__ == "__main__":
    unittest.main()
