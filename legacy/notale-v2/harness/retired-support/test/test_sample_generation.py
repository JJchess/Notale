"""Historical sample-generator and full-sample tests; not in current discovery."""

import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path
from core import sample_bundles, sample_shots, skills
ROOT = Path(__file__).resolve().parents[1]


class BundleTests(unittest.TestCase):
    def test_sample_shots_stage_the_mini_without_full_or_mirror(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "build-page"
            entry = root / "samples/general/example/mini/pages/index.html"
            entry.parent.mkdir(parents=True)
            entry.write_text("MINI_ONLY")
            row = {"id": "example", "category": "general",
                   "mini": {"root": "samples/general/example/mini/pages",
                            "files": ["index.html"]}}
            staged, html = sample_shots._stage(root, row)
            try:
                self.assertEqual(html.read_text(), "MINI_ONLY")
                self.assertIn("mini/pages", str(html))
                self.assertFalse((staged / "example/pages").exists())
            finally:
                shutil.rmtree(staged)


    def test_generated_bundles_are_current_and_keep_visual_css(self):
        rendered = sample_bundles.render_all()
        self.assertEqual(len(rendered), 52)
        for path, expected in rendered.items():
            with self.subTest(path=path):
                self.assertEqual(path.read_text(encoding="utf-8"), expected)
                self.assertIn("<sample ", expected)
                self.assertIn("<file path=", expected)
                if "build-code" in path.parts:
                    self.assertNotRegex(expected, r"(?i)<style\b|```css")
                else:
                    self.assertRegex(expected, r"(?i)<style\b|```css")


    def test_independent_mini_dependencies_are_preserved(self):
        for name, sample in (
            ("build-page", "foundation-shade-desk"),
            ("build-page", "yearbook-hair-timeline"),
            ("build-interaction", "crokinole-shot-lab"),
        ):
            root = skills.WORKFLOWS / name
            catalog = json.loads((root / "samples/catalog.json").read_text())
            row = next(row for row in catalog["samples"] if row["id"] == sample)
            spec = row["mini"]
            self.assertNotIn("full", row)
            html = (root / spec["root"] / "index.html").read_text()
            expected = sample_bundles.omitted_lines(sample, spec, html)
            self.assertTrue(expected)
            text = sample_bundles._variant(root, row, "mini", spec)
            for line in expected:
                self.assertIn(line, text)


    def test_visual_minis_preserve_dependency_checks(self):
        for path, text in sample_bundles.render_all().items():
            if "build-code" in path.parts:
                continue
            with self.subTest(path=path):
                # Dependencies may all be inlined; render_all validates every relative HTML reference.
                self.assertIn("<sample ", text)
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


    def test_crossword_bundle_exposes_its_core_mechanism(self):
        root = skills.WORKFLOWS / "build-interaction"
        text = (ROOT.parent / "legacy/notale-v2/full-samples/workflows/build-interaction/samples/bundles/general/crossword-representation.full.md").read_text()
        for marker in (
            "vendor/svelte-crossword/src/Crossword.svelte",
            "function onCellUpdate(", "function onHistoricalChange(",
            "function onKeydown(", "function onCheck(",
            "$: isComplete = percentCorrect == 1;", "MIT License",
        ):
            self.assertIn(marker, text)


    def test_crossword_mini_contains_authors_and_declares_local_dependencies(self):
        root = skills.WORKFLOWS / "build-interaction"
        row = next(r for r in json.loads((root / "samples/catalog.json").read_text())["samples"]
                   if r["id"] == "crossword-representation")
        spec = row["mini"]
        self.assertEqual(spec["files"], [
            "index.html", "src/App.svelte", "src/components/Play.svelte",
            "src/main.js", "src/utils/loadData.js", "style.css", "mini-scrollbars.css",
        ])
        text = sample_bundles._variant(root, row, "mini", spec)
        self.assertEqual(text, (root / "samples/bundles/general/crossword-representation.mini.md").read_text())
        for path in re.findall(r'<file path="([^"]+)"', text):
            self.assertNotIn("/vendor/", path)
            self.assertNotIn("/src/data/", path)
        for marker in ("direction", "answer", "clue", "revealDuration", "revealed", "MIT"):
            self.assertIn(marker, " ".join(spec["omitted"].values()))
        source = root / spec["root"]
        loader = source / "src/utils/loadData.js"
        imports = re.findall(r'from "([^"]+\.json)"', loader.read_text())
        self.assertEqual(len(imports), 13)
        for rel in imports:
            self.assertTrue((loader.parent / rel).is_file())
        for rel in ("vendor/svelte-crossword/src/Crossword.svelte",
                    "vendor/svelte-crossword/README.md", "vendor/svelte-crossword/LICENSE",
                    *spec["omitted"]):
            self.assertTrue((source / rel).is_file(), rel)

