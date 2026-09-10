"""One independent capability probe; never enters or changes the Planner loop."""
import json
import os
from pathlib import Path
import sys
import time

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from core import image_search, llm
from core.redact import redact


def main():
    llm.config()
    output = Path(__file__).with_name('native-image.json')
    if output.exists():
        raise FileExistsError(output)
    # Reuse the exact LeNet need from the last natural Planner run, without
    # requesting image generation or changing the configured search model.
    prior = json.loads((ROOT / 'runs/neural-planner-align-0908-a/planner-results.json').read_text())
    query = prior['responses'][0]['tools'][0]['arguments']['query'][1]
    body = image_search.request_body([query], 3)
    body['tools'] = [{'googleSearch': {'searchTypes': {'imageSearch': {}}}}]
    started = time.monotonic()
    response = httpx.post(image_search.ENDPOINT, json=body,
                          headers={'x-goog-api-key': os.environ['GEMINI_API_KEY']}, timeout=120)
    data = response.json()
    record = {'model': image_search.MODEL, 'request': body, 'http_status': response.status_code,
              'seconds': round(time.monotonic() - started, 2), 'response': data}
    output.write_text(redact(json.dumps(record, ensure_ascii=False, indent=2)))
    candidates = data.get('candidates', [])
    summary = {'http_status': response.status_code, 'seconds': record['seconds'],
               'error': data.get('error'), 'usage': data.get('usageMetadata'),
               'candidates': [{'finish': c.get('finishReason'),
                   'grounding_keys': list(c.get('groundingMetadata', {})),
                   'image_chunks': [x for x in c.get('groundingMetadata', {}).get('groundingChunks', [])
                                    if 'image' in x],
                   'tool_types': [p['toolCall'].get('toolType')
                                  for p in c.get('content', {}).get('parts', []) if 'toolCall' in p]}
                              for c in candidates]}
    print(redact(json.dumps(summary, ensure_ascii=False, indent=2)))


if __name__ == '__main__':
    main()
