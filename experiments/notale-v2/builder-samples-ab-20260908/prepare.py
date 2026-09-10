"""Freeze identical Builder inputs; use existing sample flags, no agent intervention."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
sys.path.insert(0, str(ROOT))
from core import builder, skills

SOURCE = RUNS_ROOT / 'neural-networks-style-media-0908-0241-r2'
ARMS = {'mini': 'neural-samples-mini-0908-ab-a', 'none': 'neural-samples-none-0908-ab-b'}


def hashes(root):
    return {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob('*')) if p.is_file()}


def main():
    here = Path(__file__).resolve().parent
    for label in ARMS.values():
        if (RUNS_ROOT / label).exists():
            raise FileExistsError(label)
    source_files = [*ROOT.glob('core/*.py'), *ROOT.glob('prompts/*.md'), ROOT / 'config.yaml',
                    *ROOT.glob('skills/*/SKILL.md'), *ROOT.glob('skills/*/references/*.md'),
                    *ROOT.glob('skills/*/samples/bundles/*/*.md')]
    source_hashes = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                     for p in source_files}
    records = {}
    baseline_inputs = None
    for mode, label in ARMS.items():
        root = RUNS_ROOT / label
        (root / 'pages').mkdir(parents=True)
        shutil.copy2(SOURCE / 'briefs.json', root / 'briefs.json')
        shutil.copytree(SOURCE / 'pages/plan', root / 'pages/plan')
        # Never reuse generated pages or lesson author files. The normal
        # CodeScaffold will create each arm's fixed runtime and lesson files.
        shutil.copytree(SOURCE / 'pages/assets', root / 'pages/assets',
                        ignore=shutil.ignore_patterns('lessons', 'code-runtime', '__pycache__'))
        inputs = hashes(root)
        if baseline_inputs is None:
            baseline_inputs = inputs
        assert inputs == baseline_inputs
        assert not list((root / 'pages').glob('page-*.html'))
        cmd = [sys.executable, '-m', 'core.builder', '--label', label,
               '--profile', 'gemini38-google-low', '--uniform', '--concurrency', '15',
               '--samples', mode, '--notes', 'notes']
        if mode == 'mini':
            cmd.append('--aux-samples')
        record = {'baseline_commit': subprocess.check_output(
            ['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
            'source_run': SOURCE.name, 'scope': 'Builder-only frozen-input A/B; no Planner or Director',
            'command': cmd, 'input_hashes': inputs, 'source_hashes': source_hashes}
        (root / 'experiment.json').write_text(json.dumps(record, ensure_ascii=False, indent=2))
        blocks = {workflow: builder.instruction_blocks(root, 32, workflow, samples=mode,
                  include_aux=mode == 'mini', notes='notes') for workflow in skills.PAGE_WORKFLOWS}
        if mode == 'none':
            assert all('samples/bundles/' not in b['workflow'] for b in blocks.values())
        (here / f'inputs-{mode}.json').write_text(json.dumps(blocks, ensure_ascii=False, indent=2))
        records[mode] = {'label': label, 'command': cmd,
                         'system_chars': {w: len('\n\n'.join(b.values())) for w, b in blocks.items()}}
    (here / 'arms.json').write_text(json.dumps(records, ensure_ascii=False, indent=2))
    print(json.dumps(records, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
