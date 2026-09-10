import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from capture.assets import archive_generated_assets
from capture.pptx import inspect_pptx
from measure.capabilities import tool_declarations, summarize
from run import binary, bwrap_binary, environment, jail_command


def pptx_fixture(path):
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("ppt/presentation.xml", '''<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256"/><p:sldId id="257"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>''')
        for name in ("slides/slide1.xml", "slides/slide2.xml", "slideLayouts/slideLayout1.xml", "slideMasters/slideMaster1.xml", "theme/theme1.xml"):
            z.writestr("ppt/" + name, "<fixture/>")
        z.writestr("ppt/media/image1.png", b"fixture")


class TemplateTests(unittest.TestCase):
    def test_pptx_inventory_and_identity(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "template.pptx"
            pptx_fixture(path)
            info = inspect_pptx(path)
            self.assertEqual(info["slide_count"], 2)
            self.assertEqual(info["layout_parts"], 1)
            self.assertEqual(info["media_parts"], 1)
            self.assertEqual(info["slide_size_emu"]["cx"], "12192000")
            old_hash = info["sha256"]
            with zipfile.ZipFile(path, "a") as z:
                z.writestr("ppt/media/image2.png", b"another")
            self.assertNotEqual(old_hash, inspect_pptx(path)["sha256"])
            path.write_text("not a pptx")
            with self.assertRaises(ValueError):
                inspect_pptx(path)

    def test_asset_archive_ignores_external_links(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "home/generated_images"
            source.mkdir(parents=True)
            (source / "asset.png").write_bytes(b"image fixture")
            external = root / "private.txt"
            external.write_text("must not copy")
            (source / "outside.png").symlink_to(external)
            files = archive_generated_assets(root / "home", root / "out")
            self.assertEqual(len(files), 1)
            self.assertEqual((root / "out/generated-assets/asset.png").read_bytes(), b"image fixture")
            self.assertFalse((root / "out/generated-assets/outside.png").exists())

    def test_additional_tools_and_code_mode_are_observed(self):
        request = {"input": [{"type": "additional_tools", "tools": [
            {"type": "namespace", "name": "functions", "tools": [
                {"type": "custom", "name": "exec", "description":
                 "declare const tools: { image_gen__imagegen(args: {prompt: string}): Promise<unknown>; };"}]}]}]}
        report = summarize(tool_declarations(request))
        self.assertEqual(report["image_generation"]["status"], "advertised")
        self.assertIn("functions.exec", report["tool_declarations"])
        skill_only = {"input": [{"type": "message", "role": "developer", "content": [{"text": "imagegen skill is installed"}]}]}
        self.assertEqual(summarize(tool_declarations(skill_only))["image_generation"]["status"], "not_observed")

    def test_dry_run_requires_explicit_input_and_creates_no_run(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            kit = Path(__file__).resolve().parents[1]
            base = [sys.executable, str(kit / "run.py"), "fixture", "--dry-run", "--runs", str(root / "runs")]
            result = subprocess.run(base, capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn("--pptx", result.stderr)
            source = root / "template.pptx"
            pptx_fixture(source)
            result = subprocess.run(base + ["--pptx", str(source)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            manifest = json.loads(result.stdout)
            self.assertEqual(manifest["experiment"], "template2html")
            self.assertEqual(manifest["input_pptx"]["slide_count"], 2)
            self.assertEqual(manifest["required_capabilities"], ["image_generation"])
            self.assertFalse((root / "runs").exists())

    @unittest.skipUnless(os.environ.get("CODEX_KIT_TEST_JAIL"), "opt in to namespace test")
    def test_subject_pptx_is_readonly_inside_writable_work(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            home, work = root / "home", root / "work"
            home.mkdir(); work.mkdir()
            source = work / "template.pptx"
            pptx_fixture(source)
            original = source.read_bytes()
            command = jail_command(bwrap_binary(binary("codex")), Path.home(), home, work, [], [],
                                   ["/bin/sh", "-c", 'touch output-ok; if echo damage > template.pptx; then exit 1; fi'], [source])
            result = subprocess.run(command, env=environment(Path.home()), cwd="/", capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(source.read_bytes(), original)
            self.assertTrue((work / "output-ok").exists())


if __name__ == "__main__":
    unittest.main()
