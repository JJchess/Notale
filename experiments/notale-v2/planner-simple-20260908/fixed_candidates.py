"""Two independent Planner assignments; frozen old candidates, no ImageSearch."""
import json
from pathlib import Path
import sys
import time
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
sys.path.insert(0, str(ROOT))
from core import llm, planner, skills
from tools import runtime as tools


def main():
    source = RUNS_ROOT / 'neural-planner-intent-0908-a'
    read = lambda p: json.loads(p.read_text())
    old = read(source / 'planner-input.json')
    meta = read(source / 'experiment.json')
    result = read(source / 'planner-results.json')
    final = result['responses'][-1]['tools'][0]['arguments']
    search = read(next((source / 'pages/assets/img').glob('*/search.json')))
    receiver = SimpleNamespace(prompts=planner.PROMPTS, style_director=True)
    new_prompt = planner.Run.prompt(receiver, 'deck', query=meta['query'], minutes=meta['minutes'],
        audience=meta['audience'], scenario=meta['scenario'] or '（没写）',
        philosophy=skills.philosophy_block('deck', planner.PROMPTS),
        page_skills=skills.page_skill_descriptions(), visual_focus='')
    content = [{'type': 'input_text', 'text':
        '本次只做素材分配：保留以下已有页表，查看候选后用 FinalizePlan 提交页表和素材映射。'
        '不再取图；未选用可不列。\n' + final['pages_md'] + '\n候选：\n' +
        json.dumps(search['result'], ensure_ascii=False)}]
    for row in search['result']['results']:
        if 'path' not in row:
            continue
        content.append({'type': 'input_text', 'text': json.dumps({
            '需求': search['query'][row['query_index']], 'path': row['path']}, ensure_ascii=False)})
        for mime, data in tools._image(source / 'pages' / row['path']).images:
            content.append({'type': 'input_image', 'image_url': f'data:{mime};base64,{data}'})
    runtime = llm.ModelRuntime(llm.resolve_builder_profile(llm.config(), 'gemini38-google-low'))
    summaries = []
    for arm, prompt in [('current', old['history'][0]['content']), ('simple', new_prompt)]:
        out = Path(__file__).parent / ('fixed-' + arm)
        out.mkdir(exist_ok=False)
        hist = [{'role': 'user', 'content': prompt}, {'role': 'user', 'content': content}]
        (out / 'input.json').write_text(json.dumps({'instructions': old['instructions'],
            'history': hist, 'tools': [planner.FINALIZE_SPEC]}, ensure_ascii=False))
        started = time.monotonic()
        r = runtime.respond(old['instructions'], hist, [planner.FINALIZE_SPEC], tag='fixed-' + arm)
        calls = [{'name': c.name, 'arguments': json.loads(c.arguments)} for c in r.output
                 if getattr(c, 'type', '') == 'function_call']
        tin, tout, cached = llm.usage_of(r)
        row = {'arm': arm, 'seconds': round(time.monotonic() - started, 2),
               'input_tokens': tin, 'output_tokens': tout, 'cached_tokens': cached,
               'prompt_chars': len(prompt), 'calls': calls}
        available = {r['path']: r for r in search['result']['results'] if 'path' in r}
        try:
            args = next(c['arguments'] for c in calls if c['name'] == 'FinalizePlan')
            row['pages_unchanged'] = planner.split_pages(args['pages_md']) == planner.split_pages(final['pages_md'])
            row['mapping'] = planner.validate_media(args.get('media_by_page', {}), args['pages_md'], available, source / 'pages')
        except (KeyError, StopIteration, ValueError) as exc:
            row['error'] = str(exc)
        (out / 'result.json').write_text(json.dumps(row, ensure_ascii=False, indent=2))
        summaries.append(row)
    print(json.dumps(summaries, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
