"""Reuse the sibling capture kit's proven filesystem view; no Codex process."""
import importlib.util
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from audit import inventory, sha256

KIT = Path(__file__).resolve().parents[3] / 'codex-harness-kit'
sys.path.insert(0, str(KIT))
_spec = importlib.util.spec_from_file_location('capture_runner_for_harness', KIT/'run.py')
capture_runner = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(capture_runner)


class Sandbox:
    def __init__(self, workspace, state_dir):
        self.workspace = Path(workspace).resolve()
        self.private_home = Path(state_dir).resolve()/'home'
        self.private_home.mkdir(exist_ok=True)
        self.real_home = Path.home().resolve()
        self.bwrap = capture_runner.bwrap_binary(shutil.which('codex') or '')
        self.runtimes = [self.real_home/p for p in (
            '.local', '.npm-global', 'miniforge3', '.cache/ms-playwright') if (self.real_home/p).exists()]
        self.env = capture_runner.environment(self.real_home)
        self.env['TMPDIR'] = str(self.workspace/'.tmp')
        self.env['PLAYWRIGHT_BROWSERS_PATH'] = str(self.real_home/'.cache/ms-playwright')

    def command(self, command, cwd=None):
        args = capture_runner.jail_command(self.bwrap, self.real_home, self.private_home,
            self.workspace, self.runtimes, [Path(__file__).resolve().parent], command,
            readonly=[self.workspace/'input', self.workspace/'_harness'])
        if cwd:
            args[args.index('--chdir')+1] = str(cwd)
        return args

    def preflight(self):
        result = subprocess.run(self.command(['/bin/true']), env=self.env, capture_output=True, timeout=10)
        if result.returncode:
            raise RuntimeError('Filesystem isolation failed: '+result.stderr.decode())


def prepare(pptx, run_dir, render=True):
    run_dir = Path(run_dir).resolve()
    run_dir.mkdir(parents=True, exist_ok=False)
    work = run_dir/'workspace'
    for p in ('input', 'output', '_harness', '.tmp'):
        (work/p).mkdir(parents=True)
    (run_dir/'state').mkdir()
    shutil.copy2(pptx, work/'input/template.pptx')
    (work/'input/template.pptx').chmod(0o444)
    facts = inventory(work/'input/template.pptx')
    (work/'_harness/input.json').write_text(json.dumps(facts, ensure_ascii=False, indent=2))
    sandbox = Sandbox(work, run_dir/'state')
    sandbox.preflight()
    env_report = {'python': sys.executable,
                  'python_version': sys.version,
                  'packages': {n: importlib.metadata.version(n) if importlib.util.find_spec(m) else None
                      for n, m in [('Pillow', 'PIL'), ('playwright', 'playwright'), ('openai', 'openai')]},
                  'executables': {n: shutil.which(n) for n in ('node', 'libreoffice', 'pdftoppm')},
                  'input_sha256': facts['sha256'], 'reference': {'status': 'not_requested'}}
    if render:
        reference = work/'output/reference'
        reference.mkdir()
        shutil.copy2(work/'input/template.pptx', reference/'original.pptx')
        profile = work/'.tmp/libreoffice-profile'
        commands = [
            ['libreoffice', '-env:UserInstallation='+profile.as_uri(), '--headless', '--convert-to', 'pdf',
             '--outdir', str(reference), str(work/'input/template.pptx')],
            ['pdftoppm', '-png', '-r', '96', str(reference/'template.pdf'), str(reference/'slide')],
        ]
        results = []
        for command in commands:
            try:
                result = subprocess.run(sandbox.command(command), env=sandbox.env, capture_output=True, text=True, timeout=120)
                results.append({'command': command, 'returncode': result.returncode,
                                'stdout': result.stdout, 'stderr': result.stderr})
                if result.returncode:
                    break
            except (OSError, subprocess.TimeoutExpired) as e:
                results.append({'command': command, 'error': str(e)})
                break
        images = sorted(reference.glob('slide-*.png'))
        success = len(results) == 2 and all(r.get('returncode') == 0 for r in results) and len(images) == len(facts['slides'])
        env_report['reference'] = {'status': 'pass' if success else 'fail', 'commands': results,
                                   'pages': len(images), 'renderer': 'LibreOffice + Poppler at 96 DPI'}
        if images:
            from PIL import Image, ImageDraw
            width, height = Image.open(images[0]).size
            thumb_h = round(height*640/width)
            contact = Image.new('RGB', (1280, ((len(images)+1)//2)*(thumb_h+25)), '#eee')
            draw = ImageDraw.Draw(contact)
            for i, path in enumerate(sorted(images, key=lambda p: int(p.stem.split('-')[-1]))):
                with Image.open(path) as picture:
                    picture.thumbnail((640, thumb_h))
                    x, y = (i % 2)*640, (i//2)*(thumb_h+25)
                    contact.paste(picture, (x, y+25))
                    draw.text((x+8, y+5), path.stem, fill='black')
            contact.save(reference/'contact.png')
    (work/'_harness/environment.json').write_text(json.dumps(env_report, ensure_ascii=False, indent=2))
    (run_dir/'manifest.json').write_text(json.dumps({'input_sha256': sha256(pptx), 'source': str(Path(pptx).resolve()),
        'workspace': str(work), 'environment': env_report, 'harness_version': 1}, ensure_ascii=False, indent=2))
    return work
