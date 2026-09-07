"""Rebuild the latest frozen 32-page experiment with the trimmed harness."""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from core import llm

SOURCE = ROOT / 'runs/ens-steps3-0907'
LABEL = 'ens-trim-full-0907'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--label', default=LABEL)
    parser.add_argument('--only', action='append', default=[])
    args = parser.parse_args()
    if not args.label or Path(args.label).name != args.label or args.label in ('.', '..'):
        parser.error('label must be a directory name')
    dest = ROOT / 'runs' / args.label
    if dest.exists():
        raise FileExistsError(f'Refusing to reuse experiment directory: {dest}')
    pages = dest / 'pages'
    assets = pages / 'assets'
    assets.mkdir(parents=True)
    shutil.copytree(SOURCE / 'pages/plan', pages / 'plan')
    shutil.copy2(SOURCE / 'pages/assets/theme.css', assets / 'theme.css')
    for name in ('lib', 'img'):
        origin = SOURCE / 'pages/assets' / name
        if origin.exists():
            shutil.copytree(origin, assets / name)
    for name in ('base.css', 'base.js', 'CHASSIS.md', 'selfcheck.py'):
        shutil.copy2(ROOT / 'vendor/chassis' / name, assets / name)
    if (SOURCE / 'style-picks.tsv').exists():
        shutil.copy2(SOURCE / 'style-picks.tsv', dest / 'style-picks.tsv')

    briefs = json.loads((SOURCE / 'briefs.json').read_text())
    prefix = briefs[0]['prompt'].split('》做 ', 1)[0]
    assert prefix.startswith('为《'), prefix
    query = prefix.removeprefix('为《')
    template = (ROOT / 'prompts/brief.md').read_text()
    for i, brief in enumerate(briefs, 1):
        brief['prompt'] = llm.fill(template, query=query, pid=f'page-{i:02d}', total=len(briefs))
    (dest / 'briefs.json').write_text(json.dumps(briefs, ensure_ascii=False, indent=2) + '\n')

    command = [sys.executable, '-B', '-u', '-m', 'core.builder', '--label', args.label,
               '--profile', 'gemini38-google-low', '--uniform', '--concurrency', '6',
               '--samples', 'mini', '--aux-samples', '--notes', 'notes']
    for pid in args.only:
        command += ['--only', pid]
    sources = [*ROOT.glob('core/*.py'), *ROOT.glob('prompts/*.md'),
               *ROOT.glob('workflows/**/*.md'), *ROOT.glob('vendor/chassis/*')]
    provenance = {
        'startedAt': datetime.now(timezone.utc).isoformat(),
        'query': query, 'source': str(SOURCE.relative_to(ROOT)),
        'scope': 'frozen-plan builder run; planner/theme not regenerated',
        'pages': len(briefs), 'selectedPages': args.only or 'all', 'command': command,
        'sourceHashes': {str(p.relative_to(ROOT)): digest(p) for p in sources if p.is_file()},
        'frozenHashes': {str(p.relative_to(pages)): digest(p)
                         for p in [*sorted((pages / 'plan').glob('*')), assets / 'theme.css'] if p.is_file()},
    }
    (dest / 'experiment.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n')
    print(f'Prepared {args.label}: {len(briefs)} planned pages, selected={args.only or "all"}, query={query}', flush=True)
    with (ROOT / 'runs' / f'{args.label}.builder.log').open('x') as log:
        proc = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    print(f'Builder exit={proc.returncode}; results={dest}', flush=True)
    return proc.returncode


if __name__ == '__main__':
    raise SystemExit(main())
