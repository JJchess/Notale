"""Read-only browser verification of both completed full runs; outputs in new run."""
import asyncio
import importlib.util
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'runs/ens-trim-full-0907'
spec = importlib.util.spec_from_file_location('selfcheck', ROOT / 'vendor/chassis/selfcheck.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


async def audit_arm(label, run):
    results = json.loads((run / 'builder-results.json').read_text())
    out = DEST / 'verification' / label
    out.mkdir(parents=True, exist_ok=True)
    paths = [str(run / 'pages' / f'{pid}.html') for pid, row in results.items()
             if row['workflow'] != 'build-code' and row['artifact_present']]
    batches = await asyncio.gather(*(check.run(paths[i::4], shot_dir=str(out), wait=1200)
                                    for i in range(4)))
    raw = {name.removesuffix('.html'): states for batch in batches for name, states in batch}
    (out / 'measurements.json').write_text(json.dumps(raw, ensure_ascii=False, indent=2, default=str) + '\n')
    stats = []
    for pid, states in sorted(raw.items()):
        s = states[0]
        p = s.get('probe') or {}
        fills = p.get('fills') or []
        stats.append({'page': pid, 'workflow': results[pid]['workflow'],
            'fatal': p.get('fatal'), 'errors': s.get('errs', []), 'resources': s.get('bad', []),
            'escaped': len(p.get('escaped', [])), 'clipped': len(p.get('clipped', [])),
            'steps': s.get('steps', 0), 'step_issues': s.get('step_issues', []),
            'subject': p.get('subject'), 'text': p.get('text'), 'fontSizes': p.get('sizes'),
            'offScale': p.get('offScale'), 'minor': p.get('minor'),
            'overlap': p.get('overlap'), 'intrude': p.get('intrude'), 'tiny': p.get('tiny'),
            'blocks': len(fills),
            'halfBlocks': sum(f['fill'] < .45 or f['gap'] > .35 for f in fills)})
    def med(values):
        return statistics.median(values) if values else None
    summary = {'run': run.name, 'measured_visual_pages': len(stats),
        'runtime_or_layout_failures': [s['page'] for s in stats if any(
            s[k] for k in ['fatal', 'errors', 'resources', 'escaped', 'clipped', 'step_issues'])],
        'blocks': sum(s['blocks'] for s in stats), 'halfBlocks': sum(s['halfBlocks'] for s in stats),
        'stepped_pages': [s['page'] for s in stats if s['steps']],
        'visible_chars_median': med([(s['text'] or {}).get('chars', 0) for s in stats]),
        'subject_ratio_median': med([(s['subject'] or {}).get('ratio', 0) for s in stats
                                      if (s['subject'] or {}).get('ratio')]),
        'overlap_pages': [s['page'] for s in stats if s['overlap']],
        'intrude_pages': [s['page'] for s in stats if s['intrude']],
        'code_audits': {pid: row['audit'] for pid, row in results.items() if row['workflow'] == 'build-code'},
        'pages': stats}
    (out / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(label, json.dumps({k:v for k,v in summary.items() if k != 'pages'}, ensure_ascii=False), flush=True)


async def main():
    # Audit after generation so verification browsers do not compete with builder.
    await audit_arm('baseline', ROOT / 'runs/ens-steps3-0907')
    await audit_arm('candidate', DEST)


if __name__ == '__main__':
    asyncio.run(main())
