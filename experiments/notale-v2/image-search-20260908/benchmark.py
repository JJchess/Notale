"""Exercise the actual ImageSearch entry point only; no Planner or image selection model."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import html
import hashlib
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
sys.path.insert(0, str(ROOT))
from core import llm, media, tools
from core.redact import redact

QUERIES = [
    'Leo Breiman portrait photograph Berkeley random forests',
    'Frank Rosenblatt perceptron portrait photograph Cornell',
    'chloroplast transmission electron micrograph thylakoid stroma',
]


def costs(provider):
    data = provider.get('response', {})
    usage = data.get('usageMetadata', {})
    candidates = data.get('candidates', [])
    observed = [c['groundingMetadata']['webSearchQueries'] for c in candidates
                if 'webSearchQueries' in c.get('groundingMetadata', {})]
    invocations = [p['toolCall']['args']['queries'] for c in candidates
                   for p in c.get('content', {}).get('parts', [])
                   if p.get('toolCall', {}).get('toolType') == 'GOOGLE_SEARCH_WEB'
                   and isinstance(p['toolCall'].get('args', {}).get('queries'), list)]
    observed = invocations or observed
    queries = list(dict.fromkeys(q for group in observed for q in group if q.strip())) if observed else None
    p, c, t = (usage.get(k) for k in ('promptTokenCount', 'candidatesTokenCount', 'thoughtsTokenCount'))
    # Missing thoughtsTokenCount means no reported thinking; missing usage is unknown.
    thinking = t or 0
    cached = usage.get('cachedContentTokenCount', 0)
    model_cost = ((p - cached) * .75 + cached * .075 + (c + thinking) * 3.75) / 1_000_000 \
        if p is not None and c is not None else None
    return {'input_tokens': p, 'output_tokens': c, 'thinking_tokens': t,
            'cached_tokens': cached, 'search_queries': queries,
            'search_count': len(queries) if queries is not None else None,
            'estimated_usd_with_search_quota': model_cost,
            'estimated_usd_without_search_quota': model_cost + len(queries) * .014
                if model_cost is not None and queries is not None else None}


def invoke(root, round_no, indices, arm):
    label = f'round-{round_no}-{arm}' + (f'-{indices[0]}' if arm == 'single' else '')
    pages = root / label / 'pages'
    pages.mkdir(parents=True)
    args = {'query': QUERIES[indices[0]] if arm == 'single' else [QUERIES[i] for i in indices], 'count': 3}
    started = time.monotonic()
    print(f'START {label}', flush=True)
    result = tools.media_call('ImageSearch', args, pages, 'image-search')
    body = json.loads(result.text)
    record = {'label': label, 'round': round_no, 'arm': arm, 'indices': indices,
              'seconds': round(time.monotonic() - started, 3), 'args': args, 'result': body,
              'image_count': len(result.images), 'pages': str(pages.relative_to(root))}
    provider_files = list(pages.glob('assets/img/*/provider.json'))
    if provider_files:
        provider = json.loads(provider_files[0].read_text())
        record.update(costs(provider))
        record['http_status'] = provider.get('http_status')
        record['request_seconds'] = provider.get('request_seconds')
    (pages.parent / 'result.json').write_text(redact(json.dumps(record, ensure_ascii=False, indent=2)))
    print(json.dumps({k: record.get(k) for k in ('label', 'http_status', 'seconds', 'image_count',
                     'search_count', 'estimated_usd_without_search_quota')}), flush=True)
    if body['errors']:
        print(json.dumps(body['errors'], ensure_ascii=False), flush=True)
    return record


def gallery(root, records):
    sections = []
    for record in records:
        cards = []
        for index, row in enumerate(record['result']['results']):
            qidx = record['indices'][row.get('query_index', 0)]
            path = record['pages'] + '/' + row['path'] if row.get('path') else None
            picture = f'<a href="{html.escape(path, quote=True)}"><img src="{html.escape(path, quote=True)}"></a>' if path else ''
            cards.append(f'<article><h3>query {qidx} · candidate {index}</h3>{picture}'
                         f'<p>{html.escape(row.get("title", ""))}</p>'
                         f'<p><a href="{html.escape(row.get("page_url", ""), quote=True)}">Source</a></p>'
                         f'<p>{html.escape(row.get("error", ""))}</p></article>')
        sections.append(f'<section><h2>{record["label"]}</h2><div>{"".join(cards)}</div></section>')
    document = ('<!doctype html><meta charset="utf-8"><title>ImageSearch independent test</title>'
                '<style>body{font:16px system-ui;margin:32px;background:#eee;color:#222}'
                'section>div{display:flex;flex-wrap:wrap;gap:16px}article{background:white;padding:16px;width:300px}'
                'img{width:100%;height:260px;object-fit:contain}p{overflow-wrap:anywhere}</style>'
                '<h1>ImageSearch — all automatically returned candidates</h1>'
                '<p>No Planner, no generated images, no human-selected download URLs.</p>' + ''.join(sections))
    (root / 'index.html').write_text(document)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--label', required=True)
    parser.add_argument('--rounds', type=int, default=3)
    parser.add_argument('--probe', action='store_true', help='One single-query transport check only')
    args = parser.parse_args()
    if Path(args.label).name != args.label or args.label in ('.', '..') or args.rounds < 1:
        parser.error('invalid label or rounds')
    llm.config()
    if not os.environ.get('GEMINI_API_KEY') or media.search_backend() != 'gemini':
        parser.error('GEMINI_API_KEY and gemini search backend required; no request made')
    root = Path(__file__).resolve().parent / args.label
    root.mkdir(exist_ok=False)
    (root / 'source-hashes.json').write_text(json.dumps({
        path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
        for path in ('core/image_search.py', 'core/media.py', 'core/tools.py', 'config.yaml',
                     'experiments/image-search-20260908/benchmark.py')}, indent=2))
    if args.probe:
        record = invoke(root, 1, [0], 'single')
        gallery(root, [record])
        return
    records, groups = [], []
    for round_no in range(1, args.rounds + 1):
        for arm in (('single', 'batch') if round_no % 2 else ('batch', 'single')):
            started = time.monotonic()
            if arm == 'single':
                with ThreadPoolExecutor(max_workers=3) as pool:
                    current = list(pool.map(lambda i: invoke(root, round_no, [i], arm), range(3)))
            else:
                current = [invoke(root, round_no, [0, 1, 2], arm)]
            records.extend(current)
            groups.append({'round': round_no, 'arm': arm, 'wall_seconds': round(time.monotonic() - started, 3),
                           'calls': [r['label'] for r in current]})
            (root / 'summary.json').write_text(json.dumps({'queries': QUERIES, 'groups': groups, 'calls': records},
                                                         ensure_ascii=False, indent=2))
            gallery(root, records)
            # A rejected contract isn't a price/quality experiment; diagnose before spending more.
            if any(r.get('http_status') != 200 or r.get('search_count') is None for r in current):
                raise SystemExit('API/search evidence missing; saved evidence and stopped this experiment')
    print(f'COMPLETE {root}', flush=True)


if __name__ == '__main__':
    main()
