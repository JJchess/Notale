#!/usr/bin/env python3
"""Extract every model boundary, not just semantic phases, from captured wire.

The Codex lite stream omits output from response.completed in this trace.
Reconstruct it from output_item.done; never infer model text from token deltas.
Original fields remain in requests/responses. Contexts are linked by response ID.
"""
import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')
    path.chmod(0o600)


def lines(path):
    with path.open() as source:
        yield from enumerate(source, 1)


def extract(run, destination):
    destination.mkdir(parents=True, exist_ok=False)
    exchanges = []
    for path in sorted((run / 'wire/ws').glob('*.jsonl')):
        pending = []
        active = {}
        for line, raw in lines(path):
            row = json.loads(raw)
            p = row.get('payload', {})
            ref = {'file': str(path.relative_to(run)), 'line': line}
            typ = p.get('type')
            if row.get('direction') == 'client' and typ == 'response.create':
                exchange = {'timestamp': row['timestamp'], 'request_ref': ref,
                            'request': p, 'items': {}, 'item_refs': [], 'errors': []}
                pending.append(exchange)
                exchanges.append(exchange)
            elif row.get('direction') == 'server':
                if typ == 'response.created':
                    if not pending:
                        raise ValueError(f'Unpaired response.created: {ref}')
                    active[p['response']['id']] = pending.pop(0)
                elif typ == 'response.output_item.done':
                    rid = p.get('response_id')
                    if rid is None and len(active) == 1:
                        rid = next(iter(active))
                    if rid not in active:
                        raise ValueError(f'Ambiguous output item: {ref}')
                    e = active[rid]
                    e['items'][p['output_index']] = p['item']
                    e['item_refs'].append(ref)
                elif typ in ('response.completed', 'response.failed', 'response.incomplete'):
                    response = deepcopy(p['response'])
                    rid = response['id']
                    if rid not in active:
                        raise ValueError(f'Unpaired completion: {ref}')
                    e = active.pop(rid)
                    items = [e['items'][i] for i in sorted(e['items'])]
                    if items and response.get('output') and items != response['output']:
                        raise ValueError(f'Conflicting completed output: {rid}')
                    e['terminal_response'] = response
                    response = deepcopy(response)
                    if items:
                        response['output'] = items
                    e['response'] = response
                    e['response_ref'] = ref
                elif typ == 'error':
                    for e in active.values():
                        e['errors'].append({'ref': ref, 'error': p.get('error')})
    # HTTP Responses are supported too; this run's 27 HTTP calls were ancillary.
    for path in sorted((run / 'wire/calls').glob('*.json')):
        call = json.loads(path.read_text())
        if not call.get('path', '').split('?')[0].endswith('/responses'):
            continue
        request = call['request']
        items = {}
        response = call.get('response')
        for event in call.get('events', []):
            if event.get('type') == 'response.output_item.done':
                items[event['output_index']] = event['item']
            if event.get('type') in ('response.completed', 'response.failed', 'response.incomplete'):
                response = event['response']
        ref = {'file': str(path.relative_to(run))}
        e = {'timestamp': call.get('started_at', call.get('timestamp', '')), 'request': request,
             'request_ref': ref, 'response_ref': ref, 'items': items, 'item_refs': [], 'errors': []}
        if response:
            e['terminal_response'] = response
            e['response'] = deepcopy(response)
            if items:
                e['response']['output'] = [items[i] for i in sorted(items)]
        exchanges.append(e)
    exchanges.sort(key=lambda e: e['timestamp'])
    index, previous, ids = [], {}, set()
    for number, e in enumerate(exchanges, 1):
        name = f'{number:03}'
        request = e['request']
        response = e.get('response', {})
        rid = response.get('id')
        if rid and rid in ids:
            raise ValueError(f'Duplicate response: {rid}')
        if rid:
            ids.add(rid)
        prev = request.get('previous_response_id')
        if prev and prev not in previous:
            raise ValueError(f'Missing context ancestor {prev}')
        write(destination/'requests'/f'{name}.json', request)
        write(destination/'responses'/f'{name}.json', response)
        write(destination/'terminal-responses'/f'{name}.json', e.get('terminal_response', {}))
        outputs = response.get('output', [])
        entry = {'step': number, 'timestamp': e['timestamp'], 'response_id': rid,
                 'previous_response_id': prev, 'parent_step': previous.get(prev),
                 'request_ref': e['request_ref'], 'response_ref': e.get('response_ref'),
                 'item_refs': e['item_refs'], 'status': response.get('status', 'missing'),
                 'input_types': dict(Counter(x['type'] for x in request.get('input', []))),
                 'output_types': dict(Counter(x['type'] for x in outputs)),
                 'tool_calls': [{k: x[k] for k in ('type', 'name', 'call_id') if k in x}
                     for x in outputs if x['type'] in ('custom_tool_call', 'function_call')],
                 'usage': response.get('usage'), 'errors': e['errors']}
        index.append(entry)
        if rid:
            previous[rid] = number
    write(destination/'index.json', index)
    initial = json.loads((destination/'requests/001.json').read_text())
    for number, item in enumerate(initial['input']):
        write(destination/'initial-context'/f'{number:02}-{item["type"]}.json', item)
        if item['type'] == 'message':
            (destination/'initial-context'/f'{number:02}-{item["role"]}.md').write_text(
                '\n'.join(x.get('text', '') for x in item['content']))
    source = [{'file': str(p.relative_to(run)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
              for p in sorted((run/'sessions').glob('*.jsonl'))]
    write(destination/'source.json', {'run': str(run.resolve()), 'sessions': source,
        'limits': ['Reconstructed client-visible context, not server hidden state',
                   'No intermediate filesystem snapshots; cannot branch execution at arbitrary old steps',
                   'Do not use future tool results or final files as earlier model inputs']})
    return index


def context(bundle, step):
    index = json.loads((bundle/'index.json').read_text())
    chain, current = [], step
    while current:
        if current in chain:
            raise ValueError('Context cycle')
        chain.append(current)
        current = index[current-1]['parent_step']
    items = []
    for n in reversed(chain):
        request = json.loads((bundle/'requests'/f'{n:03}.json').read_text())
        items.extend(request['input'])
        if n != step:
            items.extend(json.loads((bundle/'responses'/f'{n:03}.json').read_text())['output'])
    return items


def main():
    p = argparse.ArgumentParser(description=__doc__)
    subs = p.add_subparsers(dest='command', required=True)
    a = subs.add_parser('extract')
    a.add_argument('run', type=Path)
    a.add_argument('destination', type=Path)
    a = subs.add_parser('context')
    a.add_argument('bundle', type=Path)
    a.add_argument('step', type=int)
    a.add_argument('destination', type=Path)
    args = p.parse_args()
    if args.command == 'extract':
        index = extract(args.run, args.destination)
        print(json.dumps({'steps': len(index), 'tool_calls': sum(len(e['tool_calls']) for e in index)}))
    else:
        if args.destination.exists():
            p.error('Destination exists')
        write(args.destination, context(args.bundle, args.step))


if __name__ == '__main__':
    main()
