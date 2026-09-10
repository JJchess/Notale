"""Gemini only, using the Chat route already exercised in Notale experiments."""
import os

MODEL = 'gemini-3.8-flash'
DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai'


class Gemini:
    def __init__(self, base_url=DEFAULT_BASE_URL, key_env='GEMINI_API_KEY', timeout=600):
        from openai import AsyncOpenAI
        key = os.environ.get(key_env)
        if not key:
            raise ValueError(f'Set {key_env}; credentials are never loaded from other projects')
        self.client = AsyncOpenAI(api_key=key, base_url=base_url, timeout=timeout, max_retries=0)

    async def complete(self, request):
        if request['model'] != MODEL:
            raise ValueError('This harness only runs Gemini 3.8 Flash')
        reply = await self.client.chat.completions.create(**request)
        return reply.model_dump(exclude_none=True)

    async def close(self):
        await self.client.close()
