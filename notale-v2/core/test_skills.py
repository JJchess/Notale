#!/usr/bin/env python3
"""Production workflow, sample-bundle, and tool-boundary tests."""

from __future__ import annotations

import json
import re
import tempfile
import unittest
from pathlib import Path

from core import code_runtime, sample_bundles, skills, tools


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
                paths = re.findall(r"(/[^`\s()]+\.md)", block)
                self.assertTrue(paths)
                self.assertTrue(all(Path(path).is_file() for path in paths))

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
            "build-cover": 9,
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
                    self.assertIn("Scene:", section)
                    self.assertIn("Visual:", section)
                    self.assertIn("Main:", section)
                    if name == "build-interaction":
                        self.assertIn("Interaction:", section)

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


class BundleTests(unittest.TestCase):
    def test_generated_bundles_are_current_and_css_free(self):
        rendered = sample_bundles.render_all()
        self.assertEqual(len(rendered), 43)
        for path, expected in rendered.items():
            with self.subTest(path=path):
                self.assertEqual(path.read_text(encoding="utf-8"), expected)
                self.assertNotRegex(expected, r"(?i)<style\b|```css")
                self.assertIn("<sample ", expected)
                self.assertIn("<file path=", expected)

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
    def test_surface_has_no_selection_or_media_tools(self):
        names = [schema["name"] for schema in tools.specs()]
        self.assertEqual(
            names, ["Read", "Write", "Edit", "Patch", "Check", "Look", "Bash"]
        )
        self.assertNotIn("WorkflowContext", names)
        self.assertNotIn("Skill", names)
        self.assertNotIn("ImageSearch", names)
        self.assertNotIn("ImageGen", names)

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
