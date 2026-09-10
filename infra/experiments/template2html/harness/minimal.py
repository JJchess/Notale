"""Minimal baseline: one model, direct tools, history, and one existence gate."""
import json
from pathlib import Path

MODEL = 'gemini3.8flash'


def function(name, description, properties, required):
    return {'type': 'function', 'name': name, 'description': description,
            'parameters': {'type': 'object', 'properties': properties,
                           'required': required, 'additionalProperties': False}, 'strict': False}


TOOLS = [
    function('exec_command', 'Execute a shell command in the workspace. Use shell for reading, writing, '
             'editing, PPTX inspection and browser scripts. Long commands return session_id for write_stdin.',
             {'cmd': {'type': 'string'}, 'workdir': {'type': 'string'},
              'yield_time_ms': {'type': 'integer'}, 'max_output_tokens': {'type': 'integer'}}, ['cmd']),
    function('write_stdin', 'Poll or send input to a shell session returned by exec_command.',
             {'session_id': {'type': 'string'}, 'chars': {'type': 'string'},
              'yield_time_ms': {'type': 'integer'}, 'max_output_tokens': {'type': 'integer'}}, ['session_id']),
    function('view_image', 'View a local PNG, JPEG, WebP or GIF inside the workspace. '
             'The host returns its pixels to this same model. Rasterize PDF/SVG first.',
             {'path': {'type': 'string'}}, ['path']),
]


def delivery_files(workspace):
    """Existence only; deliberately makes no visual or structural quality claim."""
    work = Path(workspace).resolve()
    output = work/'output'
    if not output.is_dir() or output.is_symlink():
        return []
    return sorted(str(p.relative_to(work)) for p in output.rglob('*')
                  if p.suffix.lower() in ('.html', '.htm') and p.is_file()
                  and p.resolve().is_relative_to(output) and p.stat().st_size > 0)


class Record:
    def __init__(self, state):
        self.root = Path(state)
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, name, value):
        (self.root/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')

    def log(self, kind, value):
        with (self.root/'events.jsonl').open('a') as f:
            f.write(json.dumps({'type': kind, 'data': value}, ensure_ascii=False)+'\n')


class MinimalEngine:
    def __init__(self, workspace, model, host, record, max_turns=None):
        if host.image_provider is not None:
            raise ValueError('Minimal v1 has no separate image model')
        self.work, self.model, self.host, self.record = Path(workspace), model, host, record
        self.max_turns = max_turns

    async def run(self, task, policy):
        history = [
            {'role': 'developer', 'content': policy},
            {'role': 'user', 'content': f'工作目录：{self.work}。输入：input/template.pptx（只读）。'
             '输出：output/。临时文件可使用 .tmp/。使用环境已有的 Python、LibreOffice 和 Chromium。\n\n'+task},
        ]
        result = {'status': 'running', 'model': MODEL, 'turns': 0, 'usage': []}
        try:
            while self.max_turns is None or result['turns'] < self.max_turns:
                turn = result['turns']+1
                request = {'model': MODEL, 'input': history, 'tools': TOOLS,
                           'store': False, 'stream': False, 'tool_choice': 'auto'}
                self.record.save(f'request-{turn:03}.json', request)
                response = await self.model.complete(request)
                self.record.save(f'response-{turn:03}.json', response)
                result['turns'] = turn
                result['usage'].append({'response_id': response.get('id'), 'usage': response.get('usage')})
                if response.get('status') != 'completed' or not response.get('output'):
                    raise RuntimeError('Model response incomplete or empty; inspect the recorded response')
                output = response['output']
                history.extend(output)
                calls = [item for item in output if item['type'] == 'function_call']
                if any(item['type'] == 'custom_tool_call' for item in output):
                    raise RuntimeError('Minimal v1 exposes function tools only; no Code-mode cells')
                images = []
                for call in calls:
                    try:
                        if call['name'] not in {t['name'] for t in TOOLS}:
                            raise ValueError('Tool unavailable in minimal v1')
                        value = await self.host.call(call['name'], json.loads(call['arguments']), call['call_id'])
                        if call['name'] == 'view_image':
                            images.append({'type': 'input_image', 'image_url': value['image_url']})
                            value = {'viewed': json.loads(call['arguments'])['path'], 'image_in_next_user_message': True}
                    except Exception as e:
                        value = {'error': str(e)}
                    history.append({'type': 'function_call_output', 'call_id': call['call_id'],
                                    'output': json.dumps(value, ensure_ascii=False)})
                if images:
                    history.append({'role': 'user', 'content': [
                        {'type': 'input_text', 'text': '按本轮 view_image 调用顺序返回的图像：'}, *images]})
                if calls:
                    continue
                finals = [item for item in output if item['type'] == 'message'
                          and item.get('role') == 'assistant' and item.get('phase') != 'commentary']
                if not finals:
                    continue
                files = delivery_files(self.work)
                self.record.log('delivery.checked', {'html_files': files, 'quality_evaluated': False})
                if not files:
                    history.append({'role': 'user', 'content': 'output/ 中尚无非空 HTML 文件，请先保存转换结果，再交付。'})
                    continue
                result.update(status='delivered_unreviewed', html_files=files, quality_evaluated=False)
                (self.record.root.parent/'final.md').write_text('\n'.join(
                    c['text'] for item in finals for c in item.get('content', []) if c.get('type') == 'output_text'))
                return result
            result['status'] = 'budget_exhausted'
            return result
        except BaseException as e:
            result.update(status='error', error=str(e))
            raise
        finally:
            self.record.save('result.json', result)
            await self.host.close()
