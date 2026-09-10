#!/usr/bin/env python3
"""Fixture-only integration: real isolated tools, real browser gate, scripted model.

The supplied teacher output is explicitly a test fixture, never a training input.
No paid model or image service call. This is not a conversion quality experiment.
"""
import argparse
import asyncio
import json
from pathlib import Path
import shutil

from environment import Sandbox
from loop import Engine, Journal
from tools import Host


def copy_fixture(source, destination):
    target = Path(destination)
    if target.is_file() and target.read_bytes() == Path(source).read_bytes():
        return str(target)
    return shutil.copy2(source, destination)


class FixtureModel:
    def __init__(self):
        self.turn = 0
        self.saw_image = False
        self.saw_failure = False

    async def complete(self, request):
        self.turn += 1
        for item in request['input']:
            if isinstance(item.get('output'), list):
                self.saw_image |= any(c.get('type') == 'input_image' for c in item['output'])
            if item.get('role') == 'user':
                self.saw_failure |= any('harness_check' in c.get('text', '') for c in item.get('content', []))
        if self.turn in (1, 3):
            command = ('mv output/template.css output/template.css.held' if self.turn == 1
                       else 'mv output/template.css.held output/template.css')
            code = f'text(await tools.exec_command({json.dumps({"cmd": command})}));'
            if self.turn == 1:
                code += 'image(await tools.view_image({path:"output/reference/contact.png"}));'
            item = {'type': 'custom_tool_call', 'name': 'exec', 'call_id': f'fixture_{self.turn}', 'input': code}
        else:
            item = {'type': 'message', 'role': 'assistant', 'phase': 'final_answer',
                    'content': [{'type': 'output_text', 'text': 'Fixture delivery; not a model-generated conversion.'}]}
        return {'id': f'fixture_response_{self.turn}', 'status': 'completed', 'output': [item]}


async def run(args):
    root = args.run_dir.resolve()
    if (root/'state/checkpoint.json').exists():
        raise ValueError('Use a fresh prepared run directory')
    manifest = json.loads((root/'manifest.json').read_text())
    manifest.update(execution_mode='fixture-smoke-no-model', fixture=str(args.fixture_output.resolve()))
    (root/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    work = root/'workspace'
    shutil.copytree(args.fixture_output, work/'output', dirs_exist_ok=True, copy_function=copy_fixture)
    sandbox = Sandbox(work, root/'state')
    sandbox.preflight()
    journal = Journal(root)
    host = Host(work, journal.log, sandbox=sandbox)
    # Test enforced read-only input and per-command cwd before starting the model.
    probe = await host.exec_command('echo changed > input/template.pptx', yield_time_ms=1000)
    assert probe['exit_code'] != 0, 'Input was writable inside sandbox'
    cwd = await host.exec_command('pwd', workdir=str(work/'output'))
    assert cwd['output'].strip() == str(work/'output'), cwd
    model = FixtureModel()
    engine = Engine(root, model, host, journal, 'fixture-model', max_turns=4)
    state = await engine.run_loop(engine.initial('Exercise fixture repair path'))
    assert model.saw_image and model.saw_failure
    assert state['status'] == 'delivered_needs_manual_review', state['status']
    assert state['turns'] == 4
    result = {'status': 'pass', 'mode': 'fixture-smoke-no-model', 'turns': state['turns'],
              'input_readonly': True, 'workdir_honored': True, 'image_returned_to_model': model.saw_image,
              'failed_gate_returned_to_model': model.saw_failure,
              'final_gate': {k: v['status'] for k, v in state['last_gate']['gates'].items()}}
    (root/'smoke-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--fixture-output', type=Path, required=True)
    asyncio.run(run(parser.parse_args()))
