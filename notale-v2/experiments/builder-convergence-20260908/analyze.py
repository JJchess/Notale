"""Read completed Builder traces; emit per-response sequences without running agents."""
import json
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
RUNS = [
    'neural-networks-style-media-0908-0241-r2',
    'photosynthesis-style-media-0908-0232',
    'shiji-style-media-0908-0232',
    'photosynthesis-media-0908-0212',
    'shiji-media-0908-0212',
]


def main():
    summaries, pages = [], []
    lines = ['# 最近五次 Builder 实验：逐次响应', '',
             '只读整理现有 trace；不运行模型或页面，不修改实验产物。', '',
             '轮次按每页模型响应计；同一行工具属于同一次响应。END 表示没有工具调用。',
             '工具参数仅为原日志摘要；没有完整 Write/Patch 内容、Read 行范围或 Check 回灌报告。',
             '保留日志已有的模型文本；它是模型自述，不替代最终审计。', '']
    for name in RUNS:
        root = ROOT / 'runs' / name
        results = json.loads((root / 'builder-results.json').read_text())
        manifest = json.loads((root / 'builder-manifest.json').read_text())
        by_page = defaultdict(list)
        for raw in (root / 'trace.jsonl').read_text().splitlines():
            row = json.loads(raw)
            tag = row.get('toolUseResult')
            if row['type'] == 'assistant' and isinstance(tag, dict) and 'page' in tag:
                by_page[tag['page']].append(row)
        assert set(by_page) == set(results)
        lines.extend([f'## {name}', ''])
        run_pages = []
        for pid, result in sorted(results.items()):
            rows = by_page[pid]
            assert len(rows) == result['calls'], (name, pid)
            rounds = []
            for i, row in enumerate(rows, 1):
                rounds.append({'round': i, 'timestamp': row['timestamp'],
                               'tools': row['toolUseResult']['tools'],
                               'text': '\n'.join(x.get('text', '') for x in row['message']['content']),
                               'usage': row['message']['usage']})
            names = [[t['name'] for t in x['tools']] for x in rounds]
            count = Counter(t for ns in names for t in ns)
            assert sum(count.values()) == len(result['steps']), (name, pid, 'tools')
            first_write = next((i + 1 for i, ns in enumerate(names) if 'Write' in ns), None)
            first_check = next((i + 1 for i, ns in enumerate(names) if 'Check' in ns), None)
            entry = {'run': name, 'page': pid, 'workflow': result['workflow'],
                     'calls': len(rows), 'first_write': first_write, 'first_check': first_check,
                     'post_first_check_responses': len(rows) - first_check if first_check else None,
                     'tools': dict(count), 'patch_misses': result['steps'].count('Patch!miss'),
                     'write_then_check_pairs': sum(a == ['Write'] and b == ['Check']
                                                  for a, b in zip(names, names[1:])),
                     'patch_then_check_pairs': sum(a == ['Patch'] and b == ['Check']
                                                  for a, b in zip(names, names[1:])),
                     'mixed_mutation_check_rounds': sum('Check' in ns and any(
                         t in ns for t in ('Write', 'Patch', 'Edit')) for ns in names),
                     'input_tokens': result['tok_in'], 'output_tokens': result['tok_out'],
                     'cached_tokens': result['tok_cached'], 'termination': result['termination'],
                     'audit': result['audit'], 'rounds': rounds}
            pages.append(entry)
            run_pages.append(entry)
            lines.extend([f'### {pid} · {result["label"]} · {len(rows)} 次响应', '',
                          f'最终审计：fatal={len(result["audit"]["fatal_errors"])}，'
                          f'visual={len(result["audit"]["visual_warnings"])}。', '',
                          '| 轮次 | 工具（按执行顺序） | 输入 / 输出 token |',
                          '| ---: | --- | ---: |'])
            for r in rounds:
                tool = ' → '.join(t['name'] + '(' + t['arg'] + ')' for t in r['tools']) or 'END'
                tool = tool.replace('|', '\\|').replace('\n', ' ')
                u = r['usage']
                lines.append(f'| {r["round"]} | {tool} | {u["input_tokens"]:,} / {u["output_tokens"]:,} |')
            for r in rounds:
                if r['text'].strip():
                    lines.extend(['', f'第 {r["round"]} 轮模型文本：', '',
                                  *('> ' + line for line in r['text'].splitlines())])
            lines.append('')
        summaries.append({'run': name, 'pages': len(run_pages),
                          'calls': sum(x['calls'] for x in run_pages),
                          'median_calls': median(x['calls'] for x in run_pages),
                          'max_calls': max(x['calls'] for x in run_pages),
                          'over_11': sum(x['calls'] > 11 for x in run_pages),
                          'manifest': {k: manifest.get(k) for k in (
                              'profile', 'workflowProfiles', 'auxiliarySamples', 'samples',
                              'notesMode', 'frameCap', 'refShots', 'sampleShots', 'completedAt')}})
    (OUT / 'SEQUENCES.md').write_text('\n'.join(lines))
    (OUT / 'results.json').write_text(json.dumps({'runs': summaries, 'pages': pages},
                                               ensure_ascii=False, indent=2))
    stats = {'pages': len(pages), 'calls': sum(p['calls'] for p in pages),
             'first_write_by_round_2': sum(p['first_write'] <= 2 for p in pages),
             'first_check_by_round_3': sum(p['first_check'] <= 3 for p in pages),
             'median_calls': median(p['calls'] for p in pages),
             'over_11': sum(p['calls'] > 11 for p in pages),
             'post_first_check_responses': sum(p['post_first_check_responses'] for p in pages),
             'write_then_check_pairs': sum(p['write_then_check_pairs'] for p in pages),
             'patch_then_check_pairs': sum(p['patch_then_check_pairs'] for p in pages),
             'mixed_mutation_check_rounds': sum(p['mixed_mutation_check_rounds'] for p in pages),
             'patch_misses': sum(p['patch_misses'] for p in pages),
             'tool_rounds_with_text': sum(bool(r['text'].strip()) and bool(r['tools'])
                                          for p in pages for r in p['rounds'])}
    print(json.dumps({'runs': [{k:v for k,v in r.items() if k!='manifest'} for r in summaries],
                      'stats': stats}, ensure_ascii=False, indent=2))
    for workflow in sorted({p['workflow'] for p in pages}):
        group = [p for p in pages if p['workflow'] == workflow]
        print(workflow, 'pages', len(group), 'median', median(p['calls'] for p in group),
              'max', max(p['calls'] for p in group))


if __name__ == '__main__':
    main()
