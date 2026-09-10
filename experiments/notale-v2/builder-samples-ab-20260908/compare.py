"""Summarize completed A/B arms, including audit outcomes and actual sample reads."""
import hashlib
import json
from collections import Counter
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
HERE = Path(__file__).resolve().parent


def summarize(label):
    root = RUNS_ROOT / label
    manifest = json.loads((root / 'builder-manifest.json').read_text())
    results = json.loads((root / 'builder-results.json').read_text())
    experiment = json.loads((root / 'experiment.json').read_text())
    assert manifest.get('completedAt'), label
    changed_source = [p for p, h in experiment['source_hashes'].items()
                      if hashlib.sha256((ROOT / p).read_bytes()).hexdigest() != h]
    changed_inputs = [p for p, h in experiment['input_hashes'].items()
                      if not (root / p).is_file() or hashlib.sha256((root / p).read_bytes()).hexdigest() != h]
    rows = [json.loads(line) for line in (root / 'trace.jsonl').read_text().splitlines()]
    calls = [r for r in rows if r['type'] == 'assistant'
             and isinstance(r.get('toolUseResult'), dict) and 'page' in r['toolUseResult']]
    assert len(calls) == sum(p['calls'] for p in results.values())
    tools = Counter(t['name'] for r in calls for t in r['toolUseResult']['tools'])
    sample_reads = {pid: [s for s in p['reference_reads'] if s.startswith('samples/bundles/')]
                    for pid, p in results.items()}
    metrics = {'label': label, 'pages': len(results), 'calls': len(calls),
               'median_calls': median(p['calls'] for p in results.values()),
               'max_calls': max(p['calls'] for p in results.values()),
               'over_11': sum(p['calls'] > 11 for p in results.values()),
               'input_tokens': sum(p['tok_in'] for p in results.values()),
               'cached_input_tokens': sum(p['tok_cached'] for p in results.values()),
               'output_tokens': sum(p['tok_out'] for p in results.values()),
               'wall_seconds': manifest['wallSeconds'], 'tools': dict(tools),
               'artifact_pages': sum(p['artifact_present'] for p in results.values()),
               'fatal_pages': [pid for pid,p in results.items() if p['audit']['fatal_errors']],
               'visual_warning_pages': [pid for pid,p in results.items() if p['audit']['visual_warnings']],
               'termination': dict(Counter(p['termination'] for p in results.values())),
               'sample_reads': sample_reads, 'changed_source': changed_source,
               'changed_inputs': changed_inputs}
    return metrics, results


def main():
    arms = json.loads((HERE / 'arms.json').read_text())
    a, ar = summarize(arms['mini']['label'])
    b, br = summarize(arms['none']['label'])
    assert ar.keys() == br.keys()
    pairs = [{ 'page': pid, 'workflow': ar[pid]['workflow'],
               'mini_calls': ar[pid]['calls'], 'none_calls': br[pid]['calls'],
               'delta_calls': br[pid]['calls'] - ar[pid]['calls'],
               'mini_input': ar[pid]['tok_in'], 'none_input': br[pid]['tok_in'],
               'mini_audit': ar[pid]['audit'], 'none_audit': br[pid]['audit']}
             for pid in ar]
    comparison = {'arms': {'mini': a, 'none': b}, 'pairs': pairs,
                  'none_fewer_calls': sum(p['delta_calls'] < 0 for p in pairs),
                  'none_equal_calls': sum(p['delta_calls'] == 0 for p in pairs),
                  'none_more_calls': sum(p['delta_calls'] > 0 for p in pairs),
                  'change_percent': {k: round((b[k] / a[k] - 1) * 100, 1)
                                     for k in ('calls', 'input_tokens', 'output_tokens', 'wall_seconds')}}
    (HERE / 'results.json').write_text(json.dumps(comparison, ensure_ascii=False, indent=2))
    lines = ['# 32 页逐页配对', '', '| 页面 | 页型 | mini＋辅助 | 无 sample | 响应数变化 |',
             '| --- | --- | ---: | ---: | ---: |']
    lines += [f'| {p["page"]} | {p["workflow"]} | {p["mini_calls"]} | {p["none_calls"]} | {p["delta_calls"]:+} |'
              for p in pairs]
    (HERE / 'PAIRS.md').write_text('\n'.join(lines) + '\n')
    print(json.dumps({**comparison, 'pairs': 'see PAIRS.md',
                      'arms': {k:{f:v for f,v in x.items() if f!='sample_reads'}
                               for k,x in comparison['arms'].items()}}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
