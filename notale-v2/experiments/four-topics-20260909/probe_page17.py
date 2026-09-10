"""Fresh instrumented page-17 generation; original brief/theme, no artifact repair."""
from datetime import datetime
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from scripts.style_e2e import hashes, now, save


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', default='four-topics-0909-171933-neural')
    parser.add_argument('--page', default='page-17')
    args = parser.parse_args()
    source = ROOT / 'runs' / args.source
    label = 'nn-' + args.page.replace('-', '') + '-evidence-' + datetime.now().strftime('%m%d-%H%M%S')
    target = ROOT / 'runs' / label
    target.mkdir()
    (target / 'pages').mkdir()
    # Copy only inputs, never the finished page or any prior tool history.
    shutil.copy2(source / 'briefs.json', target / 'briefs.json')
    for directory in ('assets', 'plan'):
        shutil.copytree(source / 'pages' / directory, target / 'pages' / directory, symlinks=True)
    # Keep theme/content inputs, but exercise the current checker under investigation.
    shutil.copy2(ROOT / 'vendor/chassis/selfcheck.py', target / 'pages/assets/selfcheck.py')
    shutil.copy2(ROOT / 'vendor/chassis/lib/LIBS.md', target / 'pages/assets/lib/LIBS.md')
    command = [sys.executable, '-B', '-u', '-m', 'core.builder', '--label', label,
               '--only', args.page, '--profile', 'gemini38-google-low', '--samples', 'mini',
               '--aux-samples', '--notes', 'notes', '--concurrency', '1']
    before = hashes()
    original = source / 'pages' / (args.page + '.html')
    original_hash = hashlib.sha256(original.read_bytes()).hexdigest()
    save(target / 'experiment.json', dict(source=source.name, label=label, started=now(),
        command=command, code_before=before, original_page_sha256=original_hash,
        scope='one fresh Builder; no Planner/Director calls or prior page content',
        checker_sha256=hashlib.sha256((target / 'pages/assets/selfcheck.py').read_bytes()).hexdigest(),
        libs_sha256=hashlib.sha256((target / 'pages/assets/lib/LIBS.md').read_bytes()).hexdigest(),
        limitations='diagnostic repetition, not proof of causal improvement from one sample'))
    print(label, flush=True)
    started = time.monotonic()
    with (target / 'builder.log').open('x') as log:
        result = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
    after = hashes()
    save(target / 'result.json', dict(exit_code=result.returncode, finished=now(),
        seconds=round(time.monotonic()-started, 1),
        changed_code=[k for k,v in before.items() if after.get(k)!=v],
        original_page_unchanged=hashlib.sha256(original.read_bytes()).hexdigest()==original_hash))
    print(label, 'finished', result.returncode, flush=True)


if __name__ == '__main__':
    main()
