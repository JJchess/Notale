#!/usr/bin/env python3
"""Independent minimal PPTX→HTML harness: prepare, run, inspect."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import shutil

from agent import Agent, Record
from model import MODEL, DEFAULT_BASE_URL, Gemini
from sandbox import Sandbox
from tools import Tools

HERE = Path(__file__).resolve().parent


def prepare(source, run):
    source, run = Path(source).resolve(), Path(run).resolve()
    if not source.is_file():
        raise ValueError('PPTX input file does not exist')
    run.mkdir(parents=True, exist_ok=False)
    work = run/'workspace'
    for folder in ['input', 'output', '.tmp']:
        (work/folder).mkdir(parents=True)
    (run/'state').mkdir()
    shutil.copy2(source, work/'input/template.pptx')
    (work/'input/template.pptx').chmod(0o444)
    (run/'manifest.json').write_text(json.dumps({'harness': 'pptx2html-minimal-v1',
        'model': MODEL, 'source': str(source)}, ensure_ascii=False, indent=2))
    return work


def check_delivery(work, record):
    """The only domain gate: there is a nonempty local HTML candidate."""
    work = Path(work).resolve()
    output = work/'output'
    files = [] if output.is_symlink() else sorted(str(p.relative_to(work)) for p in output.rglob('*')
        if p.suffix.lower() in ('.html', '.htm') and p.is_file()
        and p.resolve().is_relative_to(output) and p.stat().st_size > 0)
    report = {'html_files': files, 'quality_evaluated': False}
    record.save('delivery.json', report)
    record.log('delivery.checked', report)
    return None if files else 'output/ 中尚无非空 HTML 文件，请先保存转换结果，再交付。'


def main():
    os.umask(0o077)
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['prepare', 'run', 'inspect'])
    p.add_argument('--run-dir', type=Path, required=True)
    p.add_argument('--pptx', type=Path)
    p.add_argument('--base-url', default=DEFAULT_BASE_URL)
    p.add_argument('--api-key-env', default='GEMINI_API_KEY')
    p.add_argument('--max-turns', type=int)
    args = p.parse_args()
    run = args.run_dir.resolve()
    if args.command == 'prepare':
        if not args.pptx:
            p.error('--pptx is required for prepare')
        print(json.dumps({'workspace': str(prepare(args.pptx, run))}))
        return 0
    if args.command == 'inspect':
        status = run/'state/result.json'
        print(status.read_text() if status.exists() else json.dumps({'status': 'not_completed'}))
        return 0
    if args.max_turns is not None and args.max_turns < 1:
        p.error('--max-turns must be positive')
    manifest = run/'manifest.json'
    if not manifest.is_file() or json.loads(manifest.read_text()).get('harness') != 'pptx2html-minimal-v1':
        p.error('prepare a fresh run in this harness first')
    work = run/'workspace'
    sandbox = Sandbox(work, run/'state')
    sandbox.preflight()
    model = Gemini(args.base_url, args.api_key_env)
    record = Record(run/'state')

    async def execute():
        try:
            with (run/'state/started.json').open('x') as f:
                json.dump({'model': MODEL, 'base_url': args.base_url, 'api_key_env': args.api_key_env}, f)
            tools = Tools(work, sandbox, record.log)
            agent = Agent(model, tools, record, args.max_turns)
            task = f'工作目录：{work}。shell=/bin/bash。input/ 只读，产物放 output/。\n\n'+(HERE/'task.md').read_text()
            return await agent.run((HERE/'policy.md').read_text(), task, lambda: check_delivery(work, record))
        finally:
            await model.close()
    result = asyncio.run(execute())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['status'] == 'delivered_unreviewed' else 2


if __name__ == '__main__':
    raise SystemExit(main())
