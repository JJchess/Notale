from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import lab


class CatalogTests(unittest.TestCase):
    def test_every_legacy_skill_is_accounted_for_once_or_more(self):
        catalog = lab.yaml.safe_load(lab.CATALOG.read_text())
        old = {p.name for p in (lab.ROOT / "legacy/notale-v2/vendor-skills").iterdir() if (p / "SKILL.md").is_file()}
        mapped = {s for row in catalog["workflows"] for s in row.get("sources", [])}
        omitted = {row["name"] for row in catalog.get("not_imported", [])}
        self.assertEqual(old, mapped | omitted)

    def test_every_workflow_has_two_distinct_cases(self):
        counts = {name: [] for name in lab.workflow_names()}
        for row in lab.load_cases():
            counts[row["workflow"]].append(row)
        self.assertTrue(counts)
        for name, rows in counts.items():
            self.assertEqual(len(rows), 2, name)
            self.assertEqual({r["kind"] for r in rows}, {"typical", "boundary"})

    def test_lab_uses_builder_tool_surface(self):
        names = {row["name"] for row in lab.core_tools.specs()}
        self.assertEqual(names, {"Read", "Write", "Edit", "Patch", "Check", "Look",
                                 "Bash", "Skill"})

    def test_interactive_prompt_declares_neutral_test_hook(self):
        case = next(r for r in lab.load_cases() if r.get("interactive"))
        text = lab.prompt_for(case, Path("/tmp/skill-lab-pages"))
        self.assertIn("window.__skillLab", text)
        self.assertIn(case["workflow"], text)
        self.assertIn("snapshot→act→reset", text)

    def test_prompt_preserves_exact_chassis_paths_and_requires_clean_render(self):
        case = next(r for r in lab.load_cases() if not r.get("fixture"))
        text = lab.prompt_for(case, Path("/tmp/skill-lab-pages"))
        self.assertIn("assets/base.css", text)
        self.assertIn("assets/base.js", text)
        self.assertIn("Check 报告中的 ✗", text)
        self.assertNotIn("Render", text)

    def test_human_feedback_boundaries_are_encoded(self):
        simulate = (lab.WORKFLOWS / "simulate-2d/SKILL.md").read_text()
        matter = (lab.WORKFLOWS / "simulate-2d/references/matter-recipe.md").read_text()
        scene = (lab.WORKFLOWS / "build-3d-scene/SKILL.md").read_text()
        game = (lab.WORKFLOWS / "build-learning-game/SKILL.md").read_text()
        self.assertIn("does not contain a vehicle", simulate)
        self.assertIn("not an asset library", matter)
        self.assertIn("recognition gate", scene)
        self.assertIn("game—not quiz—gate", game)
        cases = {row["id"]: row["task"] for row in lab.load_cases()}
        self.assertIn("叉车", cases["simulation-physics"])
        self.assertIn("隐藏文字", cases["scene-structure"])
        self.assertIn("不得出现逐题选择类别", cases["game-classify"])

    def test_browser_launch_failure_is_not_hidden(self):
        report = "[stderr]\nTraceback\nTargetClosedError: BrowserType.launch failed"
        compact = lab.compact_render_report(report)
        self.assertIn("TargetClosedError", compact)


class ScaffoldTests(unittest.TestCase):
    def test_scaffold_copies_chassis_without_touching_vendor(self):
        case = next(r for r in lab.load_cases() if not r.get("fixture"))
        with tempfile.TemporaryDirectory() as td:
            pages = lab.scaffold(case, Path(td))
            self.assertTrue((pages / "index.html").is_file())
            self.assertTrue((pages / "assets/base.css").is_file())
            self.assertIn('id="stage"', (pages / "index.html").read_text())

    def test_review_fixture_is_used_as_starting_artifact(self):
        case = next(r for r in lab.load_cases() if r.get("fixture"))
        with tempfile.TemporaryDirectory() as td:
            pages = lab.scaffold(case, Path(td))
            text = (pages / "index.html").read_text()
            self.assertIn("有意", lab.prompt_for(case, pages))
            self.assertIn("#stage", text)


class BuilderLoopAlignmentTests(unittest.TestCase):
    def test_run_case_delegates_once_to_builder_and_preserves_lab_task(self):
        case = next(r for r in lab.load_cases() if r["id"] == "interaction-drag")
        built = SimpleNamespace(
            ok=True, why="done", calls=4,
            steps=["Skill", "Read", "Write", "Check"],
            loaded_skills=["design-interaction"],
            reference_reads=["references/interaction-recipes.md"],
            termination="no_tool_use", images=1,
        )
        with tempfile.TemporaryDirectory() as td, \
                patch.object(lab.core_builder, "build_one", return_value=built) as loop, \
                patch.object(lab, "smoke", return_value=(True, "clean", None)):
            result = lab.run_case(
                case, Path(td), lab.MODEL, "medium", lab.WORKFLOWS
            )
        self.assertEqual(loop.call_count, 1)
        page, _, _, root, instructions, effort = loop.call_args.args
        self.assertIn(case["task"], page.prompt)
        self.assertEqual(page.primary_workflow, case["workflow"])
        self.assertEqual(page.skill_mode, "workflow")
        self.assertEqual(root, lab.WORKFLOWS)
        self.assertTrue(instructions.startswith(lab.core_builder.IDENTITY))
        self.assertEqual(effort, "medium")
        self.assertEqual(result["agent_loop"], "core.builder.build_one")
        self.assertEqual(result["termination"], "no_tool_use")
        self.assertTrue(result["ok"])


class AssembleTests(unittest.TestCase):
    def test_assemble_promotes_only_current_hash_pass(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            runs, workflows = root / "runs", root / "workflows"
            workflow = workflows / "demo"
            workflow.mkdir(parents=True)
            (workflow / "SKILL.md").write_text("current")
            current_hash = lab.sha256(workflow)
            source_case = runs / "source/demo/case-1"
            pages = source_case / "pages"
            pages.mkdir(parents=True)
            (pages / "index.html").write_text("<main id='stage'>ok</main>")
            result = {
                "id": "case-1", "workflow": "demo", "status": "complete",
                "ok": True, "skill_hash": current_hash, "model": lab.MODEL,
                "artifact": "demo/case-1/pages/index.html",
            }
            (source_case / "result.json").write_text(json.dumps(result))
            (runs / "source/run.json").write_text(json.dumps({"results": [result]}))
            reviews = root / "reviews.json"
            reviews.write_text(json.dumps({
                "source/demo/case-1": {
                    "decision": "accept", "skill_hash": current_hash,
                    "note": "same artifact", "reviewed_at": "2026-08-24T00:00:00Z"
                }
            }))
            cases = [{"id": "case-1", "workflow": "demo"}]
            with patch.object(lab, "RUNS", runs), patch.object(lab, "WORKFLOWS", workflows), \
                    patch.object(lab, "REVIEWS", reviews), \
                    patch.object(lab, "load_cases", return_value=cases):
                manifest = lab.assemble_runs(["source"], "final")
            promoted = json.loads(manifest.read_text())
            self.assertEqual(promoted["results"][0]["source_run"], "source")
            self.assertTrue((runs / "final/demo/case-1/pages/index.html").is_file())
            self.assertNotIn("source_run", json.loads((source_case / "result.json").read_text()))
            inherited = json.loads(reviews.read_text())["final/demo/case-1"]
            self.assertEqual(inherited["decision"], "accept")
            self.assertEqual(inherited["inherited_from"], "source/demo/case-1")


class GalleryTests(unittest.TestCase):
    def test_gallery_marks_hash_mismatch_pending(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            run = root / "r1"
            page = run / "review-page/review-density/pages/index.html"
            page.parent.mkdir(parents=True)
            page.write_text("<html></html>")
            result = {
                "id": "review-density", "workflow": "review-page", "title": "Demo",
                "kind": "typical", "task": "Repair", "model": lab.MODEL,
                "skill_hash": "new", "smoke_ok": True, "seconds": 1,
                "artifact": "review-page/review-density/pages/index.html", "screenshot": None,
            }
            (run / "run.json").write_text(json.dumps({"results": [result]}))
            reviews = root / "reviews.json"
            reviews.write_text(json.dumps({
                "r1/review-page/review-density": {
                    "decision": "accept", "skill_hash": "old", "note": "stale"
                }
            }))
            with patch.object(lab, "RUNS", root), patch.object(lab, "REVIEWS", reviews):
                out = lab.gallery("r1")
            self.assertIn('status pending', out)
            self.assertNotIn('>accept</span>', out)

    def test_gallery_invalidates_review_when_workflow_changed_after_run(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            workflows = root / "workflows"
            skill = workflows / "demo"
            skill.mkdir(parents=True)
            (skill / "SKILL.md").write_text("current version")
            run = root / "r1"
            page = run / "demo/case-1/pages/index.html"
            page.parent.mkdir(parents=True)
            page.write_text("<html></html>")
            result = {
                "id": "case-1", "workflow": "demo", "title": "Demo",
                "kind": "typical", "task": "Repair", "model": lab.MODEL,
                "skill_hash": "old", "smoke_ok": True, "seconds": 1,
                "artifact": "demo/case-1/pages/index.html", "screenshot": None,
            }
            (run / "run.json").write_text(json.dumps({"results": [result]}))
            reviews = root / "reviews.json"
            reviews.write_text(json.dumps({
                "r1/demo/case-1": {
                    "decision": "accept", "skill_hash": "old", "note": "accepted"
                }
            }))
            with patch.object(lab, "RUNS", root), patch.object(lab, "WORKFLOWS", workflows), \
                    patch.object(lab, "REVIEWS", reviews):
                out = lab.gallery("r1")
            self.assertIn('status pending', out)
            self.assertNotIn('>accept</span>', out)


if __name__ == "__main__":
    unittest.main()
