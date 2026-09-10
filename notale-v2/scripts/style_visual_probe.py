"""Bounded, paid visual-direction probes. Run only with user authorization.

themes: four existing queries, Director only. paired: two fixed briefs per arm.
transfer: the same two briefs with one selected auto theme. No repair or retry agent.
compose: one growth-rate interaction, two style directions x two palettes; recolor via modify.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from hashlib import sha256
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
from core import builder, director, llm, planner, skills, theme
from scripts.style_e2e import hashes, now, save

BASELINE = '4cefcc9a'
FIXTURE = RUNS_ROOT / 'style-e2e-0909a-reference'
TOPICS = RUNS_ROOT / 'four-topics-0909-171933-report/experiment.json'


def old_file(path):
    return subprocess.check_output(['git', 'show', f'{BASELINE}:notale-v2/{path}'], cwd=ROOT).decode()


def prepare_pages(label, source, baseline, report, *, run=None, page_ids=('page-02', 'page-03')):
    original = json.loads((FIXTURE / 'briefs.json').read_text())
    run = run or planner.Run('指数增长 / Exponential Growth', 5, '中英混排的课堂读者', label)
    planner.seed(run, ROOT / 'vendor/chassis', ROOT / 'vendor/chassis/lib')
    css, _ = theme.import_input(source, run.assets) if source != run.assets else ((run.assets / 'theme.css').read_text(), [])
    if source == FIXTURE / 'pages/assets':
        # Identical CSS in both arms; the reference is metadata, not a visual edit.
        css = css.replace('==== /INTERFACE ====', 'reference style:19-hand-drawn\n==== /INTERFACE ====')
    if source != run.assets:  # compose's Director already validated and published this theme
        errors = theme.validate(css, run.assets)
        if errors:
            raise ValueError('; '.join(errors))
        theme.publish(css, run.assets / 'theme.css')
    shutil.copytree(FIXTURE / 'pages/plan', run.pages / 'plan')
    briefs = [b for b in original if b['description'] in {f'Build {pid}' for pid in page_ids}]
    if run.style:  # composition probe uses identical slide terminology in all four arms
        briefs = [{**b, 'prompt': b['prompt'].replace('微课', 'slides')} for b in briefs]
    save(run.root / 'briefs.json', briefs)
    old_prompts = report / 'baseline-prompts'
    if baseline:
        old_prompts.mkdir(exist_ok=True)
        (old_prompts / 'tech.md').write_text(old_file('prompts/tech.md'))
    refs = [] if baseline else builder.theme_ref_images(run.root)
    chapters = builder.chapter_preloads(run.root, 3)
    tasks = []
    for raw in briefs:
        page = builder.route_page(run.root, builder.page_from_brief(raw))
        blocks = builder.instruction_blocks(run.root, 3, page.workflow, samples='mini',
                                           include_aux=True, notes='notes',
                                           prompts=old_prompts if baseline else None)
        if baseline:
            current = (ROOT / 'workflows/scrub-visual-slop.md').read_text().strip()
            blocks['anti_slop'] = blocks['anti_slop'].replace(current, old_file('workflows/scrub-visual-slop.md').strip())
        instructions = '\n\n'.join(blocks.values())
        page.prompt = (builder.environment_context(run.pages, page, skills.WORKFLOWS / page.workflow)
                       + '\n\n' + page.prompt + '\n\n' + chapters[page.pid])
        tasks.append((run, page, instructions, refs))
    return run, tasks


def run_pages(tasks, profile):
    def one(task):
        run, page, instructions, refs = task
        start = time.monotonic()
        try:
            result = builder.build_one(page, run.pages, run.root / 'trace.jsonl', skills.WORKFLOWS,
                                       instructions, profile.reasoning_effort, True,
                                       llm.ModelRuntime(profile), refs)
            record = {**asdict(result), 'termination': result.termination,
                      'args': result.steps_arg, 'reference_reads': result.reference_reads}
        except Exception as exc:
            record = {'error': f'{type(exc).__name__}: {exc}', 'calls': page.calls,
                      'artifact_present': (run.pages / f'{page.pid}.html').is_file()}
        record.update(seconds=round(time.monotonic()-start, 2),
                      input_reference_images=sum(x['type']=='input_image' for x in refs))
        save(run.root / f'{page.pid}-result.json', record)
        print(json.dumps({'label': run.label, 'page': page.pid, 'calls': page.calls,
                          'seconds': record['seconds'], 'artifact_present': record['artifact_present']}), flush=True)
        return {**record, 'label': run.label, 'page': page.pid}
    with ThreadPoolExecutor(max_workers=len(tasks)) as pool:
        return list(pool.map(one, tasks))


def composition(prefix, report, profile):
    """Four new model-authored pages; no Planner call or manual HTML repair."""
    def pair(style_id, short):
        tasks, records = [], []
        source = None
        for palette in ('blue', 'red'):
            query = ('指数增长 / Exponential Growth：5分钟 slides；本金100，增长率0..50%，默认20%，'
                     '显示0..5年曲线与第5年金额，支持重置。只需原生图形，不用外部媒体。')
            request = style_id
            if source is None:
                query += ' 配色采用蓝色与青色，底色、文字色和强调面积由你协调。'
            else:
                request = ('仅改配色为砖红与金色，并协调必要的前景/背景对比；'
                           '保留原字体、形体、笔触、材质、类名和其他未要求改变的决定。')
            run = planner.Run(query, 5, '理解百分比的中英混排读者', f'{prefix}-{short}-{palette}',
                              template=source, style=request)
            started = time.monotonic()
            try:
                result = director.direct(run, profile.reasoning_effort)
                result.update(ok=True, label=run.label, style=style_id, palette=palette,
                              seconds=round(time.monotonic()-started, 2))
                save(run.root / 'director-result.json', result)
                _, prepared = prepare_pages(run.label, run.assets, False, report,
                                            run=run, page_ids=('page-03',))
                tasks.extend(prepared)
                records.append(result)
                if source is None:
                    source = run.assets
            except Exception as exc:
                result = {'ok': False, 'label': run.label, 'style': style_id, 'palette': palette,
                          'seconds': round(time.monotonic()-started, 2), 'error': f'{type(exc).__name__}: {exc}'}
                save(run.root / 'director-result.json', result)
                records.append(result)
                break  # no fresh retry or fabricated recolor source
        return tasks, records
    tasks, themes = [], []
    with ThreadPoolExecutor(max_workers=2) as pool:
        for prepared, records in pool.map(lambda x: pair(*x), [('19-hand-drawn', 'hand'), ('05-bento-grid', 'bento')]):
            tasks.extend(prepared)
            themes.extend(records)
    save(report / 'themes.json', themes)
    return run_pages(tasks, profile) if tasks else []


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--prefix', required=True)
    ap.add_argument('--mode', choices=['themes', 'paired', 'transfer', 'compose'], required=True)
    ap.add_argument('--theme-source', type=Path)
    args = ap.parse_args()
    if Path(args.prefix).name != args.prefix or args.prefix in ('.', '..'):
        ap.error('prefix must be a fresh directory name')
    if args.mode == 'transfer' and not args.theme_source:
        ap.error('transfer needs --theme-source pointing to theme assets')
    report = RUNS_ROOT / f'{args.prefix}-report'
    report.mkdir()  # Do not overwrite an earlier experiment.
    profile = llm.resolve_builder_profile(llm.config(), 'gemini38-google-low')
    llm.override(name=profile.model, base_url=profile.base_url, api_key_env=profile.api_key_env,
                 wire_api=profile.adapter)
    frozen = hashes()
    manifest = {'started': now(), 'mode': args.mode, 'baseline': BASELINE,
                'runner_sha256': sha256(Path(__file__).read_bytes()).hexdigest(),
                'profile': asdict(profile), 'code_before': frozen, 'no_model_fallback': True,
                'notes': 'notes', 'samples': 'mini', 'auxiliarySamples': True,
                'comparison': 'Builder handoff only; identical CSS/briefs/tools, not historical model replay'}
    save(report / 'experiment.json', manifest)
    start = time.monotonic()
    if args.mode == 'compose':
        manifest['comparison'] = 'Fixed growth-rate interaction: hand-drawn/Bento x blue-teal/brick-gold; second palette modifies first theme. Not an automatic-selection diversity or full-deck test.'
        save(report / 'experiment.json', manifest)
        results = composition(args.prefix, report, profile)
    elif args.mode == 'themes':
        topics = json.loads(TOPICS.read_text())['topics']
        def one(topic):
            key, title, audience, detail = topic
            run = planner.Run(f'{title}：{detail}', 60, audience, f'{args.prefix}-{key}')
            started = time.monotonic()
            try:
                record = director.direct(run, profile.reasoning_effort)
                record['ok'] = True
            except Exception as exc:
                record = {'ok': False, 'error': f'{type(exc).__name__}: {exc}'}
            record.update(label=run.label, query=run.query, audience=audience,
                          seconds=round(time.monotonic()-started, 2))
            save(run.root / 'director-result.json', record)
            print(json.dumps(record, ensure_ascii=False), flush=True)
            return record
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(one, topics))
    else:
        tasks = []
        arms = [('baseline', True), ('candidate', False)] if args.mode == 'paired' else [('transfer', False)]
        for arm, baseline in arms:
            source = args.theme_source or FIXTURE / 'pages/assets'
            run, prepared = prepare_pages(f'{args.prefix}-{arm}', source.resolve(), baseline, report)
            tasks.extend(prepared)
            manifest.setdefault('inputs', {})[arm] = {
                'theme_sha256': sha256((run.assets/'theme.css').read_bytes()).hexdigest(),
                'briefs_sha256': sha256((run.root/'briefs.json').read_bytes()).hexdigest(),
                'theme_source': str(source), 'pages': [p.pid for _,p,_,_ in prepared],
                'reference_images': sum(x['type']=='input_image' for x in prepared[0][3])}
        save(report / 'experiment.json', manifest)
        results = run_pages(tasks, profile)
    save(report / 'result.json', {'seconds': round(time.monotonic()-start, 2), 'results': results,
                                 'inputs_unchanged': frozen == hashes()})


if __name__ == '__main__':
    main()
