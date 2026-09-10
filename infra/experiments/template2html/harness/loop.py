"""Durable model ↔ tools ↔ files ↔ gates loop. No semantic phase counter."""
import asyncio
import base64
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import uuid

from audit import audit_static, audit_browser, sha256
from protocol import tool_definitions, tool_result
from tools import text
from artifacts import Artifacts


def atomic(path, value):
    tmp = path.with_suffix(path.suffix+'.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')
    tmp.chmod(0o600)
    tmp.replace(path)


class Journal:
    def __init__(self, run_dir):
        self.root = Path(run_dir)/'state'
        self.root.mkdir(exist_ok=True)

    def log(self, kind, payload):
        event = {'timestamp': datetime.now(timezone.utc).isoformat(), 'type': kind, 'payload': payload}
        with (self.root/'events.jsonl').open('a') as f:
            f.write(json.dumps(event, ensure_ascii=False)+'\n')

    def save(self, state):
        atomic(self.root/'checkpoint.json', state)


class Engine:
    def __init__(self, run_dir, model, host, journal, model_name, effort='high',
                 max_turns=None, max_context_bytes=None, validator=None):
        self.run = Path(run_dir)
        self.work = self.run/'workspace'
        self.model, self.host, self.journal = model, host, journal
        self.model_name, self.effort = model_name, effort
        self.max_turns, self.max_context_bytes = max_turns, max_context_bytes
        self.validator = validator or self.validate
        self.definitions = tool_definitions(host.image_provider is not None)
        self.artifacts = Artifacts(self.work, journal.root)

    def initial(self, task):
        policy = Path(__file__).with_name('policy.md').read_text()
        environment = f'工作目录：{self.work}。shell=/bin/bash。输入只读；宿主工具在隔离文件系统中运行。运行环境事实见 _harness/environment.json。'
        return {'status': 'ready', 'turns': 0, 'history': [
            {'type': 'message', 'role': 'developer', 'content': [text(policy)]},
            {'type': 'message', 'role': 'user', 'content': [text(environment)]},
            {'type': 'message', 'role': 'user', 'content': [text(task)]}],
            'pending': [], 'completed_calls': {}, 'memory': {}, 'seen_images': [],
            'usage_by_response_id': {}, 'input_sha256': sha256(self.work/'input/template.pptx'),
            'model': self.model_name, 'effort': self.effort, 'tools': self.definitions,
            'prompt_cache_key': 'template2html-'+uuid.uuid4().hex}

    def checkpoint(self, state):
        state['memory'] = self.host.memory
        state['seen_images'] = self.host.seen_images
        self.journal.save(state)

    def recover(self, state):
        if state['model'] != self.model_name or state['effort'] != self.effort or state['tools'] != self.definitions:
            raise ValueError('Resume must keep the same model, effort and tool capabilities')
        self.host.memory = state['memory']
        self.host.seen_images = state['seen_images']
        for call in state['pending']:
            content = [text({'error':
                'Host interrupted before durable result. Effects are unknown. Inspect files; do not blindly repeat the command.'})]
            state['history'].append(tool_result(call, content))
            signature = hashlib.sha256(json.dumps({k: call.get(k) for k in ('type', 'name', 'input', 'arguments')}, sort_keys=True).encode()).hexdigest()
            state['completed_calls'][call['call_id']] = {'signature': signature, 'output': content, 'interrupted': True}
        state['pending'] = []
        state['history'].append({'type': 'message', 'role': 'developer', 'content': [text(
            'Host resumed from checkpoint. Files, history and JSON memory persist. JS cells and shell session handles do not persist; inspect workspace before restarting unfinished work.')]})
        state['status'] = 'ready'
        self.checkpoint(state)

    async def validate(self, attempt):
        report_dir = self.work/'_harness/checks'/f'gate-{attempt:03}-{uuid.uuid4().hex[:6]}'
        report_dir.mkdir(parents=True)
        try:
            result = await asyncio.to_thread(audit_static, self.work/'input/template.pptx', self.work/'output')
            result['gates']['browser'] = await asyncio.to_thread(audit_browser, self.work/'output', report_dir)
        except Exception as e:
            result = {'gates': {'execution': {'status': 'fail', 'error': str(e)}}}
        failed = any(g['status'] != 'pass' for g in result['gates'].values())
        result['status'] = 'fail' if failed else 'needs_manual_review'
        result['report_dir'] = str(report_dir)
        atomic(report_dir/'audit.json', result)
        return result

    async def execute(self, call):
        if call['name'] == 'exec' and call['type'] == 'custom_tool_call':
            return await self.host.exec(call['input'], call['call_id'])
        if call['name'] == 'wait' and call['type'] == 'function_call':
            return await self.host.wait(**json.loads(call['arguments']))
        raise ValueError(f'Unsupported tool type/name: {call["type"]}/{call["name"]}')

    async def run_loop(self, state):
        state['file_snapshot'] = self.artifacts.capture('controller.start')
        self.checkpoint(state)
        try:
            while True:
                if sha256(self.work/'input/template.pptx') != state['input_sha256']:
                    raise RuntimeError('Input integrity changed; refuse to continue')
                if self.max_turns is not None and state['turns'] >= self.max_turns:
                    state['status'] = 'budget_exhausted'
                    return state
                request = {'model': self.model_name, 'input': state['history'], 'tools': self.definitions,
                           'store': False, 'stream': False, 'tool_choice': 'auto', 'parallel_tool_calls': True,
                           'reasoning': {'effort': self.effort}, 'include': ['reasoning.encrypted_content'],
                           'prompt_cache_key': state['prompt_cache_key']}
                if self.max_context_bytes is not None and len(json.dumps(request).encode()) > self.max_context_bytes:
                    state['status'] = 'context_limit'
                    return state
                state['status'] = 'awaiting_model'
                self.checkpoint(state)
                attempt = uuid.uuid4().hex
                atomic(self.journal.root/f'request-{attempt}.json', request)
                self.journal.log('model.requested', {'attempt_id': attempt, 'turn': state['turns']+1})
                response = await self.model.complete(request)
                atomic(self.journal.root/f'response-{attempt}.json', response)
                self.journal.log('model.completed', {'attempt_id': attempt, 'id': response.get('id'), 'status': response.get('status')})
                state['turns'] += 1
                if response.get('id') and response.get('usage'):
                    state['usage_by_response_id'][response['id']] = response['usage']
                if response.get('status') != 'completed':
                    state['status'] = 'model_incomplete'
                    state['model_error'] = response.get('error') or response.get('incomplete_details')
                    return state
                output = response.get('output', [])
                if not output:
                    raise RuntimeError('Empty completed model output; no synthetic success')
                calls = [item for item in output if item['type'] in ('custom_tool_call', 'function_call')]
                # Keep all reasoning/message/tool items together in original order.
                # Do not rewrite previous items or flatten image results into text.
                state['history'].extend(output)
                state['pending'] = calls.copy()
                state['status'] = 'executing_tools' if calls else 'model_message'
                self.checkpoint(state)
                for call in calls:
                    cid = call['call_id']
                    signature = hashlib.sha256(json.dumps({k: call.get(k) for k in ('type', 'name', 'input', 'arguments')}, sort_keys=True).encode()).hexdigest()
                    cached = state['completed_calls'].get(cid)
                    if cached and cached['signature'] != signature:
                        raise RuntimeError(f'Conflicting repeated call_id: {cid}')
                    if cached:
                        content = cached['output']
                    else:
                        try:
                            content = await self.execute(call)
                        except Exception as e:
                            content = [text({'error': str(e)})]
                        state['completed_calls'][cid] = {'signature': signature, 'output': content}
                    state['history'].append(tool_result(call, content))
                    state['pending'] = state['pending'][1:]
                    state['file_snapshot'] = self.artifacts.capture({'call_id': cid, 'live_cells': list(self.host.cells)})
                    self.checkpoint(state)
                if calls:
                    continue
                messages = [i for i in output if i['type'] == 'message' and i.get('role') == 'assistant']
                finals = [m for m in messages if m.get('phase') != 'commentary']
                if not finals:
                    continue
                if self.host.cells:
                    state['history'].append({'type': 'message', 'role': 'user', 'content': [text(
                        {'error': 'Unfinished exec cells remain; use wait before final delivery', 'cell_ids': list(self.host.cells)})]})
                    continue
                state['status'] = 'validating'
                self.checkpoint(state)
                gate = await self.validator(state['turns'])
                self.journal.log('gate.completed', gate)
                state['last_gate'] = gate
                if gate['status'] == 'fail':
                    feedback = [text({'harness_check': 'failed', 'report_dir': gate.get('report_dir'),
                        'failed_gates': {k: v for k, v in gate.get('gates', {}).items() if v['status'] != 'pass'},
                        'details': gate if 'gates' not in gate else None,
                        'instruction': 'Inspect and fix these failures, rerun relevant checks, then deliver again.'})]
                    for check in gate.get('gates', {}).get('browser', {}).get('checks', []):
                        if check.get('status') == 'fail' and gate.get('report_dir'):
                            shot = Path(gate['report_dir'])/(check['page']+'.png')
                            if shot.is_file():
                                self.host.seen_images.append(str(shot))
                                feedback.extend([text({'page': check['page'], 'screenshot': str(shot)}),
                                    {'type': 'input_image', 'detail': 'original', 'image_url': 'data:image/png;base64,'+base64.b64encode(shot.read_bytes()).decode()}])
                    state['history'].append({'type': 'message', 'role': 'user', 'content': feedback})
                    self.checkpoint(state)
                    continue
                state['status'] = 'delivered_needs_manual_review'
                state['file_snapshot'] = self.artifacts.capture('delivery')
                state['final'] = '\n'.join(c.get('text', '') for m in finals for c in m.get('content', []))
                (self.run/'final.md').write_text(state['final'])
                return state
        except BaseException as e:
            state['status'] = 'interrupted' if isinstance(e, (KeyboardInterrupt, asyncio.CancelledError)) else 'error'
            state['error'] = str(e)
            raise
        finally:
            self.checkpoint(state)
            await self.host.close()
