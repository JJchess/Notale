"""One Chat history and a direct tool loop. Domain delivery policy is a callback."""
import json
from pathlib import Path
import time

from model import MODEL
from tools import TOOLS


class Record:
    def __init__(self, directory):
        self.root = Path(directory)
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, name, value):
        (self.root/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')

    def log(self, kind, data):
        with (self.root/'events.jsonl').open('a') as f:
            f.write(json.dumps({'time': time.time(), 'type': kind, 'data': data}, ensure_ascii=False)+'\n')


class Agent:
    def __init__(self, model, tools, record, max_turns=None):
        self.model, self.tools, self.record, self.max_turns = model, tools, record, max_turns

    async def run(self, system, task, accept_final):
        history = [{'role': 'system', 'content': system}, {'role': 'user', 'content': task}]
        result = {'status': 'running', 'model': MODEL, 'turns': 0, 'usage': [], 'quality_evaluated': False}
        try:
            while self.max_turns is None or result['turns'] < self.max_turns:
                turn = result['turns']+1
                request = {'model': MODEL, 'messages': history, 'tools': TOOLS,
                           'tool_choice': 'auto', 'reasoning_effort': 'low', 'stream': False}
                self.record.save(f'request-{turn:03}.json', request)
                response = await self.model.complete(request)
                self.record.save(f'response-{turn:03}.json', response)
                result['turns'] = turn
                result['usage'].append({'response_id': response.get('id'), 'usage': response.get('usage')})
                choice = response['choices'][0]
                if choice.get('finish_reason') not in ('stop', 'tool_calls'):
                    raise RuntimeError(f'Model did not complete: {choice.get("finish_reason")}')
                message = choice['message']
                calls = message.get('tool_calls') or []
                if not calls and not message.get('content'):
                    raise RuntimeError('Empty model response; no synthetic completion')
                # Keep each full tool_call, including extra_content.google.thought_signature.
                # Only output-only assistant fields are omitted from the next request.
                history.append({k: message[k] for k in (
                    'role', 'content', 'tool_calls', 'reasoning', 'reasoning_content', 'thinking') if k in message})
                images = []
                for call in calls:
                    try:
                        fn = call['function']
                        value = await self.tools.call(fn['name'], json.loads(fn['arguments']), call['id'])
                        if fn['name'] == 'view_image':
                            images.append({'type': 'image_url', 'image_url': {'url': value['image_url']}})
                            value = {'viewed': json.loads(fn['arguments'])['path'], 'pixels_in_next_user_message': True}
                    except Exception as e:
                        value = {'error': str(e)}
                    history.append({'role': 'tool', 'tool_call_id': call['id'],
                                    'content': json.dumps(value, ensure_ascii=False)})
                if images:
                    history.append({'role': 'user', 'content': [
                        {'type': 'text', 'text': 'Images in this turn’s view_image call order:'}, *images]})
                if calls:
                    continue
                feedback = accept_final()
                if feedback:
                    history.append({'role': 'user', 'content': feedback})
                    continue
                result.update(status='delivered_unreviewed', final=message['content'])
                (self.record.root.parent/'final.md').write_text(message['content'])
                return result
            result['status'] = 'budget_exhausted'
            return result
        except BaseException as e:
            result.update(status='error', error=str(e))
            raise
        finally:
            try:
                self.record.save('result.json', result)
            finally:
                await self.tools.close()
