"""Read-only comparative audit and offline transport capture; never calls a model."""
from collections import Counter
import asyncio
from dataclasses import replace
from datetime import datetime
import hashlib
import io
import json
from pathlib import Path
import statistics
import sys
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
sys.path.insert(0,str(ROOT))
from core import builder, llm, skills


def sha(value):return hashlib.sha256(value.encode() if isinstance(value,str) else value).hexdigest()
def seconds(value):return datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()


def compare(label):
    root=RUNS_ROOT /label
    manifest=json.loads((root/'builder-manifest.json').read_text())
    results=json.loads((root/'builder-results.json').read_text())
    rows=[json.loads(line) for line in (root/'trace.jsonl').open()]
    by_id={r['uuid']:r for r in rows}
    durations=[];details={}
    for pid,page in results.items():
        replies=[r for r in rows if r['type']=='assistant' and isinstance(r.get('toolUseResult'),dict) and r['toolUseResult'].get('page')==pid]
        spans=[seconds(r['timestamp'])-seconds(by_id[r['parentUuid']]['timestamp']) for r in replies]
        durations.extend(spans)
        first_check=next((i for i,r in enumerate(replies) if any(t['name']=='Check' for t in r['toolUseResult'].get('tools',[]))),None)
        details[pid]={'calls':page['calls'],'seconds':page['seconds'],'request_seconds':round(sum(spans),2),
            'other_seconds_including_tools':round(page['seconds']-sum(spans),2),
            'after_first_check_responses':len(replies)-first_check-1 if first_check is not None else 0,
            'tools':dict(Counter(t['name'] for r in replies for t in r['toolUseResult'].get('tools',[]))),
            'first_request_tokens':replies[0]['message']['usage']['input_tokens'] if replies else None}
        assert len(replies)==page['calls'],(label,pid)
    css=(root/'pages/assets/theme.css').read_text()
    from core.theme import INTERFACE
    interface=INTERFACE.search(css).group(0)
    return {'label':label,'manifest':{k:v for k,v in manifest.items() if k in ['profile','model','adapter','reasoningEffort','workflowProfiles','samples','auxiliarySamples','notes','concurrency','wallSeconds','attempted','artifacts']},
        'responses':sum(p['calls'] for p in results.values()),'response_median_seconds':round(statistics.median(durations),2),
        'response_mean_seconds':round(statistics.mean(durations),2),'page_median_calls':statistics.median(p['calls'] for p in results.values()),
        'page_median_seconds':statistics.median(p['seconds'] for p in results.values()),
        'theme_chars':len(css),'interface_chars':len(interface),'theme_lines':len(css.splitlines()),
        'max_calls':max(p['calls'] for p in results.values()),'details':details,
        'all_tools':dict(Counter(t for p in results.values() for t in p['steps'])),
        'first_request_token_median':statistics.median(p['first_request_tokens'] for p in details.values()),
        'sample_read_suffixes':dict(Counter(Path(p).suffixes[-2] if len(Path(p).suffixes)>1 else 'other' for r in results.values() for p in r.get('reference_reads',[]) if 'samples/' in p))}


class Captured(Exception):pass


def capture_production_rewind():
    """Run the real checker, including its 800px shrink, without changing artifacts."""
    from PIL import Image, ImageChops
    from vendor.chassis import selfcheck
    path=RUNS_ROOT / 'nn-style-coherence-0909/pages/page-15.html'
    before=sha(path.read_bytes())
    original_shrink=selfcheck._shrink
    rows=[]
    for trial in range(3):
        captures={}
        def shrink_and_capture(p):
            original_shrink(p)
            if p.name in ('page-15-step0.png','page-15-step0-back.png'):
                captures[p.name]=p.read_bytes()
        with tempfile.TemporaryDirectory(prefix='notale-rewind-audit-') as tmp:
            with patch.object(selfcheck,'_shrink',shrink_and_capture):
                result=asyncio.run(selfcheck.run([path],shot_dir=tmp))
        first=captures['page-15-step0.png'];back=captures['page-15-step0-back.png']
        initial=Image.open(io.BytesIO(first)).convert('RGB')
        delta=ImageChops.difference(initial,Image.open(io.BytesIO(back)).convert('RGB'))
        rows.append({'trial':trial,'size':initial.size,'bytes_equal':first==back,
            'different_pixels':sum(pixel!=(0,0,0) for pixel in delta.get_flattened_data()),
            'pixel_bbox':delta.getbbox(),'step_issues':result[0][1][0]['step_issues']})
    without=asyncio.run(selfcheck.run([path],shot_dir=None))
    return {'page_sha256':before,'artifact_unchanged':before==sha(path.read_bytes()),
        'trials':rows,'without_screenshots_step_issues':without[0][1][0]['step_issues'],
        'scope':'Real current selfcheck.run using file://, its default waits and its actual 800x450 shrink. Only temporary screenshots; no model call or artifact edits. Compare artifact hash with the historical 1600x900 single-pixel diagnostic.'}


def capture_gate_examples():
    from core import theme
    base='''/* ==== INTERFACE ====\ntoken --bg: 页面底色。\n==== /INTERFACE ==== */
    :root {--bg:#fff;--text:#111;--font-sans:sans-serif;}
    '''
    cases={
        'control':base+'.nt-button {color:var(--text)}',
        'named_functional_selector':base+'.nt-button:is(:hover, :focus-visible) {color:var(--text)}',
        'negative_surface_instruction':base.replace('页面底色。','页面底色，不用于任意区块底色。'),
        'public_surface_still_forbidden':base+':root {--surface:#eee}',
        'private_surface_allowed':base+'.nt-controls {--surface:#eee;background:var(--surface)}',
    }
    return {key:{'css':css,'issues':theme.inspect(css)[0]} for key,css in cases.items()}


def capture_read_round(pid):
    root=RUNS_ROOT / 'nn-style-coherence-0909'
    rows=[json.loads(line) for line in (root/'trace.jsonl').open()]
    by_id={r['uuid']:r for r in rows}
    response=next(r for r in rows if r['type']=='assistant' and isinstance(r.get('toolUseResult'),dict) and r['toolUseResult'].get('page')==pid)
    prompt=by_id[response['parentUuid']]['message']['content'][0]['text']
    result=json.loads((root/'builder-results.json').read_text())[pid]
    workflow=result['workflow']
    references=result['reference_reads']
    # Original tool IDs/full arguments were not logged. These are explicitly synthetic IDs.
    content=[{'type':'tool_use','id':f'audit-read-{i}','name':'Read','input':{'file_path':p}} for i,p in enumerate(references)]
    response_body={'id':'offline-synthetic','type':'message','role':'assistant','content':content,'stop_reason':'tool_use','usage':{'input_tokens':100,'output_tokens':10}}
    bodies=[]
    def capture_urlopen(request,timeout=None):
        bodies.append(json.loads(request.data))
        if len(bodies)==2:raise Captured()
        return io.BytesIO(json.dumps(response_body).encode())
    profile=replace(llm.resolve_builder_profile(llm.config()),api_key_env='STYLE_AUDIT_FAKE_KEY')
    assert profile.adapter=='messages'
    runtime=llm.ModelRuntime(profile)
    blocks=builder.instruction_blocks(root,44,workflow)
    page=builder.Page(pid,prompt,workflow=workflow,total=44)
    with tempfile.TemporaryDirectory(prefix='notale-read-audit-') as tmp:
        with patch.dict('os.environ',{'STYLE_AUDIT_FAKE_KEY':'offline-not-a-credential'}),patch.object(llm.urllib.request,'urlopen',capture_urlopen):
            try:
                builder.build_one(page,root/'pages',Path(tmp)/'synthetic-trace.jsonl',skills.WORKFLOWS,'\n\n'.join(blocks.values()),'low',runtime=runtime)
            except Captured:pass
    assert len(bodies)==2
    second=bodies[1]
    messages=second['messages']
    first=messages[0]['content'][0]['text']
    calls=[b for m in messages for b in m['content'] if b['type']=='tool_use']
    outputs=[b for m in messages for b in m['content'] if b['type']=='tool_result']
    return {'pid':pid,'offline_only':True,'original_prompt_sha256':sha(prompt),'task_exactly_preserved':first==prompt,
        'roles':[m['role'] for m in messages],'calls':len(calls),'results':len(outputs),
        'tool_ids_matched':{b['id'] for b in calls}=={b['tool_use_id'] for b in outputs},
        'outputs':[{'id':b['tool_use_id'],'chars':len(b['content']),'sha256':sha(b['content']),'nonempty':bool(b['content'].strip()),'starts':b['content'][:100]} for b in outputs],
        'empty_messages':sum(not m['content'] for m in messages),
        'literal_trace_placeholder_sent':any(b.get('text')=='(tool results)' for m in messages for b in m['content']),
        'scope':'Current production build_one + real Read + replay + to_messages + actual HTTP serialization; HTTP intercepted before network. Historical prompt exact; original full tool arguments/IDs/raw response absent, so this does not prove the historical upstream request was correct.'}


def main():
    labels=['neural-networks-style-media-0908-0241-r2','nn-style-coherence-0909']
    result={'comparisons':[compare(label) for label in labels],'offline_read_captures':[capture_read_round(p) for p in ['page-13','page-22']],
        'production_rewind':capture_production_rewind(),'gate_examples':capture_gate_examples()}
    target=Path(__file__).with_name('evidence.json');target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'comparisons':[{k:v for k,v in c.items() if k!='details'} for c in result['comparisons']],'offline_read_captures':result['offline_read_captures'],
        'production_rewind':result['production_rewind'],'gate_examples':result['gate_examples']},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
