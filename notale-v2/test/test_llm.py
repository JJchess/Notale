"""Llm behavior contracts; historical versions live in outer legacy."""
from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import yaml
from core import llm
ROOT = Path(__file__).resolve().parents[1]

class CaptureEndpoint:

    def __init__(self, response):
        self.response = response
        self.requests: list[dict] = []

    def create(self, **request):
        self.requests.append(request)
        return self.response

def chat_tool_response():
    tool_call = SimpleNamespace(id='call-1', function=SimpleNamespace(name='Write', arguments='{"file_path":"p.html"}'))
    message = SimpleNamespace(content=None, tool_calls=[tool_call], reasoning_content='opaque-thought-state', reasoning=None, thinking=None)
    return SimpleNamespace(id='chat-1', choices=[SimpleNamespace(message=message, finish_reason='tool_calls')], usage=SimpleNamespace(prompt_tokens=100, completion_tokens=20, prompt_tokens_details=SimpleNamespace(cached_tokens=80)))

class ProfileTests(unittest.TestCase):

    def test_glm_profile_contains_all_provider_policy(self):
        cfg = yaml.safe_load((ROOT / 'config.yaml').read_text(encoding='utf-8'))
        profile = llm.resolve_builder_profile(cfg, 'glm53-flash-low')
        self.assertEqual(profile.model, 'GLM-5.3-Flash')
        self.assertEqual(profile.adapter, 'chat')
        self.assertEqual(profile.reasoning_effort, 'low')
        self.assertTrue(profile.vision_input)
        self.assertTrue(profile.replay_reasoning)
        self.assertEqual(profile.request_options, {'thinking': {'type': 'enabled', 'clear_thinking': False}})

    def test_builder_profile_does_not_accept_legacy_wire_key(self):
        cfg = {'builder': {'default_profile': 'old', 'profiles': {'old': {'model': 'model', 'base_url': 'https://example.test/v1', 'api_key_env': 'KEY', 'wire_api': 'chat', 'reasoning_effort': 'low', 'vision_input': True}}}}
        with self.assertRaisesRegex(ValueError, 'missing: adapter'):
            llm.resolve_builder_profile(cfg)

class AdapterTests(unittest.TestCase):

    def test_chat_adapter_translates_request_and_losslessly_replays_reasoning(self):
        endpoint = CaptureEndpoint(chat_tool_response())
        sdk = SimpleNamespace(chat=SimpleNamespace(completions=endpoint))
        profile = llm.ModelProfile(id='glm', model='GLM-5.3-Flash', base_url='https://example.test/v1', api_key_env='KEY', adapter='chat', reasoning_effort='low', vision_input=True, request_options={'thinking': {'type': 'enabled', 'clear_thinking': False}}, replay_reasoning=True)
        runtime = llm.ModelRuntime(profile, sdk_client=sdk)
        response = runtime.respond('system', [{'role': 'user', 'content': 'build'}], [{'type': 'function', 'name': 'Write', 'description': 'write', 'parameters': {'type': 'object', 'properties': {}}}])
        request = endpoint.requests[0]
        self.assertEqual(request['model'], 'GLM-5.3-Flash')
        self.assertEqual(request['reasoning_effort'], 'low')
        self.assertEqual(request['tools'][0]['function']['name'], 'Write')
        self.assertEqual(request['extra_body'], profile.request_options)
        self.assertEqual(response.output[0].name, 'Write')
        self.assertEqual(llm.usage_of(response), (100, 20, 80))
        replay = runtime.replay(response)
        self.assertEqual(replay[0]['type'], 'chat_assistant')
        history = llm._chat_history([{'role': 'user', 'content': 'build'}] + replay + [{'type': 'function_call_output', 'call_id': 'call-1', 'output': 'written'}])
        assistant = history[1]
        self.assertEqual(assistant['reasoning_content'], 'opaque-thought-state')
        self.assertEqual(assistant['tool_calls'][0]['id'], 'call-1')
        self.assertEqual(history[2]['tool_call_id'], 'call-1')

    def test_responses_adapter_keeps_canonical_request_shape(self):
        item = SimpleNamespace(model_dump=lambda **_kw: {'type': 'function_call', 'name': 'Check', 'arguments': '{}', 'call_id': 'c1'})
        raw = SimpleNamespace(output=[item])
        endpoint = CaptureEndpoint(raw)
        sdk = SimpleNamespace(responses=endpoint)
        profile = llm.ModelProfile(id='responses', model='model-r', base_url='https://example.test/v1', api_key_env='KEY', adapter='responses', reasoning_effort='medium', vision_input=True)
        runtime = llm.ModelRuntime(profile, sdk_client=sdk)
        self.assertIs(runtime.respond('system', [], [], tag='test'), raw)
        request = endpoint.requests[0]
        self.assertEqual(request['instructions'], 'system')
        self.assertEqual(request['input'], [])
        self.assertEqual(request['reasoning'], {'effort': 'medium'})
        self.assertEqual(runtime.replay(raw)[0]['call_id'], 'c1')

    def test_messages_adapter_owns_transport_and_replays_native_blocks(self):
        profile = llm.ModelProfile(id='sonnet', model='sonnet', base_url='https://example.test/v1', api_key_env='KEY', adapter='messages', reasoning_effort='low', vision_input=True)
        native = {'id': 'msg-1', 'content': [{'type': 'thinking', 'thinking': 'opaque', 'signature': 'sig'}, {'type': 'tool_use', 'id': 't1', 'name': 'Check', 'input': {}}], 'usage': {'input_tokens': 5, 'output_tokens': 2}, 'stop_reason': 'tool_use'}
        adapted = llm._adapt_messages(native)
        runtime = llm.ModelRuntime(profile)
        with patch.object(llm, '_post_messages_for', return_value=adapted) as post:
            response = runtime.respond('system', [], [], tag='test')
        sent_profile, sent_body = post.call_args.args
        self.assertIs(sent_profile, profile)
        self.assertEqual(sent_body['reasoning'], {'effort': 'low'})
        replay = runtime.replay(response)
        self.assertEqual(replay[0]['type'], 'anthropic_assistant')
        self.assertEqual(replay[0]['content'][0]['signature'], 'sig')
        translated = llm.to_messages({'model': 'sonnet', 'instructions': 'system', 'input': replay + [{'type': 'function_call_output', 'call_id': 't1', 'output': 'ok'}], 'reasoning': {'effort': 'low'}})
        self.assertEqual(translated['messages'][0]['content'][0]['signature'], 'sig')
        self.assertEqual(translated['messages'][1]['content'][0]['tool_use_id'], 't1')
