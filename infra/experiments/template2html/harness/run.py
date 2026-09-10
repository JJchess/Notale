#!/usr/bin/env python3
"""Minimal PPTX→HTML v1: prepare, run, inspect. One model; one existence gate."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import shutil

from environment import Sandbox
from minimal import MODEL, MinimalEngine, Record
from model import ResponsesModel
from tools import Host


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['prepare', 'run', 'inspect'])
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--pptx', type=Path)
    parser.add_argument('--model', choices=[MODEL], default=MODEL)
    parser.add_argument('--base-url', help='Explicit Responses-compatible endpoint; Gemini integration is unverified')
    parser.add_argument('--api-key-env', default='HARNESS_API_KEY')
    parser.add_argument('--max-turns', type=int, help='Optional operational budget, never a quality gate')
    args = parser.parse_args()
    run = args.run_dir.resolve()
    work = run/'workspace'
    if args.command == 'prepare':
        if not args.pptx or not args.pptx.is_file():
            parser.error('--pptx must name an existing input file')
        run.mkdir(parents=True, exist_ok=False)
        for folder in ['input', 'output', '.tmp', '_harness']:
            (work/folder).mkdir(parents=True)
        (run/'state').mkdir()
        shutil.copy2(args.pptx, work/'input/template.pptx')
        (work/'input/template.pptx').chmod(0o444)
        # No fixed PPTX parser, renderer, inventory schema or font preflight.
        (run/'manifest.json').write_text(json.dumps({'harness': 'minimal-v1', 'model': MODEL,
            'source': str(args.pptx.resolve())}, ensure_ascii=False, indent=2))
        print(json.dumps({'status': 'prepared', 'workspace': str(work)}))
        return 0
    if args.command == 'inspect':
        result = run/'state/result.json'
        print(result.read_text() if result.exists() else json.dumps({'status': 'not_completed'}))
        return 0
    if not args.base_url:
        parser.error('--base-url is required; Gemini transport is not yet verified')
    if args.max_turns is not None and args.max_turns < 1:
        parser.error('--max-turns must be positive')
    manifest = run/'manifest.json'
    if not manifest.is_file() or json.loads(manifest.read_text()).get('harness') != 'minimal-v1':
        parser.error('Run prepare in a new minimal-v1 directory first')
    sandbox = Sandbox(work, run/'state')
    sandbox.preflight()
    model = ResponsesModel(MODEL, args.base_url, args.api_key_env)
    record = Record(run/'state')
    # Fresh runs only. A marker also prevents two controllers sharing this directory.
    with (run/'state/started.json').open('x') as f:
        json.dump({'model': MODEL, 'base_url': args.base_url, 'api_key_env': args.api_key_env}, f)
    host = Host(work, record.log, sandbox=sandbox)
    engine = MinimalEngine(work, model, host, record, args.max_turns)
    async def execute():
        try:
            here = Path(__file__).resolve().parent
            return await engine.run((here.parent/'task.md').read_text(), (here/'minimal-policy.md').read_text())
        finally:
            await model.client.close()
    result = asyncio.run(execute())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['status'] == 'delivered_unreviewed' else 2


if __name__ == '__main__':
    raise SystemExit(main())
