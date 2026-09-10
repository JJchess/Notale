#!/usr/bin/env python3
"""Execute original JS against inert tools to measure the real nested surface.

This proves JS/dispatch compatibility, not shell replay or rendering quality.
No captured shell command is executed and no recorded result is invented as truth.
"""
import argparse
import asyncio
from collections import Counter
import json
from pathlib import Path
import tempfile

from extract import context
from tools import Host

PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII='


class InertHost(Host):
    def __init__(self, workspace):
        super().__init__(workspace, lambda *_: None)
        self.observed = []

    async def call(self, name, args, parent_call_id):
        self.observed.append({'parent_call_id': parent_call_id, 'name': name, 'arguments': args})
        if name == 'view_image':
            return {'image_url': PNG, 'detail': 'original'}
        if name in ('exec_command', 'write_stdin'):
            return {'output': '', 'exit_code': 0, 'session_id': 'inert-session', 'wall_time_seconds': 0}
        raise ValueError('Unexpected nested tool: '+name)


async def probe(bundle):
    index = json.loads((bundle/'index.json').read_text())
    checks, failures = [], []
    with tempfile.TemporaryDirectory() as tmp:
        host = InertHost(tmp)
        try:
            for step in index:
                number = step['step']
                items = context(bundle, number)
                calls, unmatched = set(), []
                for item in items:
                    if item['type'] in ('custom_tool_call', 'function_call'):
                        calls.add(item['call_id'])
                    elif item['type'] in ('custom_tool_call_output', 'function_call_output') and item['call_id'] not in calls:
                        unmatched.append(item['call_id'])
                checks.append({'step': number, 'context_items': len(items),
                    'images_in_tool_outputs': sum(sum(c.get('type') == 'input_image' for c in x.get('output', []) if isinstance(c, dict))
                        for x in items if isinstance(x.get('output'), list)),
                    'unmatched_tool_outputs': unmatched})
                if unmatched:
                    failures.append({'step': number, 'unmatched': unmatched})
                response = json.loads((bundle/'responses'/f'{number:03}.json').read_text())
                for item in response['output']:
                    if item['type'] != 'custom_tool_call':
                        continue
                    output = await host.exec(item['input'], item['call_id'])
                    for piece in output:
                        if piece['type'] == 'input_text' and '"error":' in piece['text']:
                            failures.append({'step': number, 'call_id': item['call_id'], 'error': piece['text']})
        finally:
            await host.close()
        return {'status': 'fail' if failures else 'pass', 'scope': 'Context pairing and inert JS dispatch; no captured shell executed',
                'steps': checks, 'nested_counts': dict(Counter(x['name'] for x in host.observed)),
                'nested_calls': host.observed, 'failures': failures}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('bundle', type=Path)
    p.add_argument('destination', type=Path)
    args = p.parse_args()
    if args.destination.exists():
        p.error('Destination exists')
    result = asyncio.run(probe(args.bundle))
    args.destination.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k: result[k] for k in ('status', 'nested_counts', 'failures')}, ensure_ascii=False))
    return 1 if result['failures'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
