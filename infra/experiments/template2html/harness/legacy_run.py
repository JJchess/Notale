#!/usr/bin/env python3
"""Independent template2html runtime: prepare, run, resume, inspect."""
import argparse
import asyncio
import fcntl
import json
import os
from pathlib import Path

from environment import prepare, Sandbox
from loop import Engine, Journal
from model import ResponsesModel, ImagesProvider
from tools import Host
from audit import sha256


def main():
    os.umask(0o077)
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['prepare', 'run', 'resume', 'inspect'])
    p.add_argument('--run-dir', type=Path, required=True)
    p.add_argument('--pptx', type=Path)
    p.add_argument('--skip-reference', action='store_true')
    p.add_argument('--model', default='gemini3.8flash', help='Execution model (default: gemini3.8flash); Astra is the teacher')
    p.add_argument('--base-url', help='Explicit endpoint; the current adapter requires the Responses protocol')
    p.add_argument('--api-key-env', default='HARNESS_API_KEY')
    p.add_argument('--effort', default='high')
    p.add_argument('--image-model')
    p.add_argument('--image-base-url')
    p.add_argument('--image-key-env')
    p.add_argument('--max-turns', type=int)
    p.add_argument('--max-context-bytes', type=int)
    args = p.parse_args()
    args.run_dir = args.run_dir.resolve()
    if args.command == 'prepare':
        if not args.pptx:
            p.error('--pptx is required for prepare')
        work = prepare(args.pptx, args.run_dir, not args.skip_reference)
        print(json.dumps({'status': 'prepared', 'workspace': str(work)}))
        return 0
    checkpoint = args.run_dir/'state/checkpoint.json'
    if args.command == 'inspect':
        state = json.loads(checkpoint.read_text()) if checkpoint.exists() else {'status': 'prepared'}
        print(json.dumps({k: state[k] for k in ('status', 'turns', 'model', 'error', 'last_gate') if k in state}, ensure_ascii=False, indent=2))
        return 0
    if not args.base_url:
        p.error('--base-url is required for run/resume; configure a Responses-compatible endpoint or implement its provider adapter first')
    if not (args.run_dir/'manifest.json').is_file():
        p.error('Run prepare first')
    if args.command == 'run' and checkpoint.exists():
        p.error('Checkpoint exists; use resume')
    if args.command == 'resume' and not checkpoint.exists():
        p.error('No checkpoint to resume')
    # Prevent concurrent controllers from executing the same tool requests.
    lock = (args.run_dir/'state/controller.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    work = args.run_dir/'workspace'
    manifest = json.loads((args.run_dir/'manifest.json').read_text())
    if sha256(work/'input/template.pptx') != manifest['input_sha256']:
        p.error('Prepared input hash changed')
    sandbox = Sandbox(work, args.run_dir/'state')
    sandbox.preflight()
    model = ResponsesModel(args.model, args.base_url, args.api_key_env, args.effort)
    images = ImagesProvider(work, args.run_dir/'state', args.image_model,
        args.image_base_url or args.base_url, args.image_key_env or args.api_key_env) if args.image_model else None
    journal = Journal(args.run_dir)
    host = Host(work, journal.log, images, sandbox=sandbox)
    engine = Engine(args.run_dir, model, host, journal, args.model, args.effort,
                    args.max_turns, args.max_context_bytes)
    transport = {'backend': 'public-responses-api', 'base_url': args.base_url,
        'api_key_env': args.api_key_env,
        'image_backend': 'public-images-api' if images else 'unavailable',
        'image_model': args.image_model, 'image_base_url': args.image_base_url or args.base_url,
        'image_key_env': args.image_key_env or args.api_key_env, 'native_codex_equivalent': False}
    if args.command == 'resume':
        state = json.loads(checkpoint.read_text())
        if state['status'] == 'delivered_needs_manual_review':
            p.error('Already delivered; create a new run for another experiment')
        if state.get('transport') != transport:
            p.error('Resume must keep the same transport configuration')
        engine.recover(state)
    else:
        state = engine.initial(Path(__file__).resolve().parents[1].joinpath('task.md').read_text())
        state['transport'] = transport
    async def execute_run():
        try:
            return await engine.run_loop(state)
        finally:
            await model.client.close()
            if images:
                images.client.close()
    result = asyncio.run(execute_run())
    print(json.dumps({'status': result['status'], 'turns': result['turns'],
                      'image_generation': 'configured' if images else 'unavailable'}, ensure_ascii=False))
    return 0 if result['status'] == 'delivered_needs_manual_review' else 2


if __name__ == '__main__':
    raise SystemExit(main())
