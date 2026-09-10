"""Explicit public Responses/Images adapters; never reuse ChatGPT credentials."""
import asyncio
import base64
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path
import uuid


class ResponsesModel:
    def __init__(self, model, base_url, key_env, effort='high', timeout=600):
        from openai import AsyncOpenAI
        key = os.environ.get(key_env)
        if not key:
            raise ValueError(f'Missing environment variable {key_env}')
        self.client = AsyncOpenAI(api_key=key, base_url=base_url, timeout=timeout, max_retries=0)
        self.model, self.effort = model, effort

    async def complete(self, request):
        # No hidden SDK retries and no model fallback. Host records failed request.
        response = await self.client.responses.create(**request)
        return response.model_dump(exclude_none=True)


class ImagesProvider:
    """Same exposed reference mechanism, different backend from native Codex.

    A real provider call is made only when the model invokes image_gen__imagegen.
    Generated files and provenance are durable; usage is not added to text tokens.
    """
    def __init__(self, workspace, state_dir, model, base_url, key_env, client=None):
        if client is None:
            from openai import OpenAI
            key = os.environ.get(key_env)
            if not key:
                raise ValueError(f'Missing environment variable {key_env}')
            client = OpenAI(api_key=key, base_url=base_url, timeout=600, max_retries=0)
        self.client, self.model = client, model
        self.assets = Path(workspace)/'output/assets/generated'
        self.state = Path(state_dir)/'generation'
        self.assets.mkdir(parents=True, exist_ok=True)
        self.state.mkdir(parents=True, exist_ok=True)

    async def __call__(self, prompt, references):
        ident = uuid.uuid4().hex
        reference_info = []
        for i, path in enumerate(references):
            data = path.read_bytes()
            copy = self.state/f'{ident}-reference-{i}{path.suffix}'
            copy.write_bytes(data)
            reference_info.append({'path': str(path), 'snapshot': str(copy),
                                   'sha256': hashlib.sha256(data).hexdigest()})
        record = {'id': ident, 'backend': 'public-images-api', 'model': self.model, 'prompt': prompt,
                  'references': reference_info, 'status': 'started', 'used_by': None}
        record_path = self.state/f'{ident}.json'
        record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2))

        def request():
            with ExitStack() as stack:
                if references:
                    return self.client.images.edit(model=self.model, prompt=prompt,
                        image=[stack.enter_context(p.open('rb')) for p in references])
                return self.client.images.generate(model=self.model, prompt=prompt)

        try:
            reply = await asyncio.to_thread(request)
            # URL downloads would introduce another unobserved fetch boundary;
            # require a base64-capable configured image model.
            payload = reply.data[0].b64_json
            if not payload:
                raise ValueError('Image provider returned no base64 image')
            data = base64.b64decode(payload, validate=True)
            from PIL import Image
            import io
            with Image.open(io.BytesIO(data)) as image:
                fmt = image.format.lower()
                suffix = 'jpg' if fmt == 'jpeg' else fmt
                mime = Image.MIME[image.format]
            path = self.assets/f'{ident}.{suffix}'
            path.write_bytes(data)
            record.update(status='completed', output=str(path), sha256=hashlib.sha256(data).hexdigest(),
                          usage=reply.model_dump().get('usage'))
            return {'path': str(path), 'image_url': f'data:{mime};base64,{payload}',
                    'output_hint': f'Generated asset saved to {path}; record final usage location in assets/manifest.json',
                    'generation_id': ident}
        except Exception as e:
            record.update(status='failed', error=str(e))
            raise
        finally:
            record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2))
