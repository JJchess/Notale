#!/usr/bin/env python3
"""Measure own runs with the same token subset rules as the teacher archive."""
import argparse
from collections import Counter
import json
from pathlib import Path


def measure(run):
    state = json.loads((run/'state/checkpoint.json').read_text())
    usage = list(state['usage_by_response_id'].values())
    def total(key, parent=None):
        values = [(u.get(parent) or {}).get(key) if parent else u.get(key) for u in usage]
        return sum(values) if values and all(isinstance(v, (int, float)) for v in values) else None
    events = [json.loads(line) for line in (run/'state/events.jsonl').read_text().splitlines()]
    summary = {'status': state['status'], 'model': state['model'], 'turns': state['turns'],
        'unique_usage_response_count': len(usage), 'usage': {
            'input_tokens': total('input_tokens'), 'output_tokens': total('output_tokens'),
            'cached_input_tokens': total('cached_tokens', 'input_tokens_details'),
            'reasoning_output_tokens': total('reasoning_tokens', 'output_tokens_details'),
            'total_tokens': total('total_tokens')},
        'nested_tool_starts': dict(Counter(e['payload']['name'] for e in events if e['type'] == 'tool.started')),
        'gate_runs': sum(e['type'] == 'gate.completed' for e in events),
        'artifact_snapshots': len(list((run/'state/artifacts/snapshots').glob('*.json'))),
        'cost_usd': None, 'cost_note': 'Unpriced; image usage separate; missing usage is unknown, not zero',
        'limits': ['Cached input and reasoning output are subsets; never add twice',
                   'Fixture replay is not model quality or latency evidence']}
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('run', type=Path)
    args = parser.parse_args()
    value = measure(args.run)
    (args.run/'measurements.json').write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(value, ensure_ascii=False, indent=2))
