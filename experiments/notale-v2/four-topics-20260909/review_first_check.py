"""Fresh-context screenshot review; never render or edit source runs."""
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import hashlib
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
sys.path.insert(0, str(ROOT))
from core import llm
from core.redact import redact

QUESTION = '请检查这张 slide 截图。只指出截图中有明确证据的问题，并给出具体修改建议；没有明显问题就说没有。无法从截图判断的内容请明确说明。'
TASK = '本轮任务是独立截图评审，只回答用户的问题，不创作页面、不输出页面源码、不调用工具。附图是首次 Check 的初态；如有其他状态的报告，不代表你看到了那些状态的截图。'


def save(path, value):
    path.write_text(redact(json.dumps(value, ensure_ascii=False, indent=2)), encoding='utf-8')


def main():
    out = RUNS_ROOT / ('first-check-review-' + datetime.now().strftime('%m%d-%H%M%S'))
    out.mkdir()
    profile = llm.resolve_builder_profile(llm.config(), 'gemini38-google-low')
    save(out/'experiment.json', dict(question=QUESTION, task=TASK, model=profile.model,
        profile=profile.id, effort=profile.reasoning_effort, adapter=profile.adapter,
        limitations='Two versions of the same slide; one sample per arm. B jointly adds historical instructions and full Check text; cannot separate their effects. No page source, previous assistant replies or tools supplied.'))
    jobs = []
    for suffix in ('181849', '190702'):
        source = RUNS_ROOT / ('nn-page17-evidence-0909-' + suffix)
        rows = [json.loads(line) for line in (source/'trace.jsonl').read_text().splitlines()]
        instructions = next(r['toolUseResult']['instructions'] for r in rows
                            if isinstance(r.get('toolUseResult'), dict) and 'instructions' in r['toolUseResult'])
        first_write = None
        for row in rows:
            t = row.get('toolUseResult') or {}
            if row['type'] != 'system':
                continue
            if t.get('name') == 'Write' and first_write is None:
                first_write = json.loads(t['arguments'])['content']
            if first_write is not None and t.get('name') == 'Check':
                evidence = t
                break
        picture = evidence['images'][0]
        raw = (source/picture['path']).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == picture['sha256']
        (out/(suffix+'-first.png')).write_bytes(raw)
        (out/(suffix+'-first.html')).write_text(first_write, encoding='utf-8')
        save(out/(suffix+'-source.json'), dict(source=source.name, image=picture,
            check_arguments=evidence['arguments'], check_output=evidence['output'], instructions=instructions,
            first_write_sha256=hashlib.sha256(first_write.encode()).hexdigest()))
        for arm in ('A', 'B'):
            system = (instructions+'\n\n' if arm=='B' else '') + TASK
            prompt = QUESTION + ('\n\n以下为该次 Check 的原始报告：\n'+evidence['output'] if arm=='B' else '')
            jobs.append((suffix,arm,system,prompt,picture['mimeType'],raw))

    def review(job):
        suffix,arm,system,prompt,mime,raw = job
        runtime = llm.ModelRuntime(profile)
        history = [{'role':'user','content':[{'type':'input_text','text':prompt},
            {'type':'input_image','image_url':'data:'+mime+';base64,'+base64.b64encode(raw).decode()}]}]
        start = time.monotonic()
        try:
            response = runtime.respond(system,history,[],tag=suffix+'-'+arm)
            result = dict(seconds=round(time.monotonic()-start,2), text=llm.text_of(response),
                response=dict(id=response.id, status=response.status,
                              output=[item.model_dump() for item in response.output]))
        except Exception as exc:
            result = dict(seconds=round(time.monotonic()-start,2),error=redact(str(exc)))
        save(out/(suffix+'-'+arm+'.json'),result)
        print(suffix,arm,result.get('seconds'), 'error' if 'error' in result else 'done',flush=True)

    print(out.name,flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(review,jobs))


if __name__ == '__main__':
    main()
