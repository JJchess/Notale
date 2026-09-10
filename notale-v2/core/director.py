"""Independent Style Director, with continuous pick / theme / repair history."""
from __future__ import annotations
import argparse
import base64
import json
import hashlib
import uuid
from pathlib import Path
from . import llm, planner, skills, font_library, style_catalog, theme as theme_io
from tools import media, runtime as tools

TRIES = 3


def _write_spec(path):
    return [{'type': 'function', 'name': 'Write', 'description': '提交完整文件，不是补丁',
             'parameters': {'type': 'object', 'properties': {
                 'file_path': {'type': 'string', 'description': f'只能是 {path}'},
                 'content': {'type': 'string'}}, 'required': ['file_path', 'content'], 'additionalProperties': False}}]


def _one_write(r, target):
    calls = [o for o in r.output if getattr(o, 'type', '') == 'function_call' and o.name == 'Write']
    if len(calls) != 1:
        return None, [f'每次提交恰好一个 Write；实际 {len(calls)} 个']
    try:
        args = json.loads(calls[0].arguments)
        if not isinstance(args, dict) or set(args) != {'file_path', 'content'}:
            raise ValueError('Write 参数必须是含 file_path/content 的 JSON 对象')
        if not isinstance(args['file_path'], str) or not isinstance(args['content'], str):
            raise ValueError('Write 路径和内容必须是字符串')
        if Path(args['file_path']).resolve() != target.resolve():
            raise ValueError(f'只能写 {target}')
        if not args['content'].strip():
            raise ValueError('Write 内容不能为空')
        return args['content'], []
    except (ValueError, TypeError, OSError) as exc:
        return None, [str(exc)]


def _call(content, spec, effort, run, tag, history):
    if content is not None:
        history.append({'role': 'user', 'content': content})
    started = planner._now()
    r = llm.respond(planner.IDENTITY, history, spec, effort, tag=tag)
    run._style_calls = getattr(run, '_style_calls', 0) + 1
    tin, tout, cached = llm.usage_of(r)
    calls = [o for o in r.output if getattr(o, 'type', '') == 'function_call']
    recent = content if isinstance(content, str) else '\n'.join(x.get('text', '[image supplied]') for x in (content or []))
    feedback = [x for x in history if x.get('type') == 'function_call_output'][-5:]
    run.log.add([{'type': 'text', 'text': recent or json.dumps(feedback, ensure_ascii=False)}], llm.text_of(r),
        {'input_tokens': tin, 'output_tokens': tout, 'cache_read_input_tokens': cached or 0},
        getattr(r, 'id', None) or uuid.uuid4().hex, started, planner._now(),
        {'step': tag, 'tools': [{'name': c.name, 'arguments': c.arguments} for c in calls]})
    history.extend(llm.replay_item(item) for item in llm.ModelRuntime.replay(r))
    print(f'  {tag} in={tin:,} out={tout:,}', flush=True)
    return r, calls


def _result(history, call, output):
    history.append({'type': 'function_call_output', 'call_id': call.call_id, 'output': output})


def pick(run, effort, history=None, workflow_root=None):
    history = history if history is not None else []
    out = run.root / 'style-picks.tsv'
    index, images = style_catalog.selection_inputs()
    prompt = run.prompt('style-pick', query=run.query, audience=run.audience, scenario=run.scenario or '（没写）',
                        request=run.style or '按本次交流目的选择', index=index, out_path=out,
                        theme_bans=skills.theme_slop_block(workflow_root or skills.WORKFLOWS))
    by = {r[0]: r for r in style_catalog.rows()}
    content = [{'type': 'input_text', 'text': prompt}] + images
    for attempt in range(TRIES):
        r, calls = _call(content if attempt == 0 else None, _write_spec(out), effort, run, 'style-pick', history)
        text, bad = _one_write(r, out)
        ids = [line.split('\t')[0].strip() for line in (text or '').splitlines() if line.strip()]
        if not ids or len(set(ids)) != len(ids) or any(i not in by for i in ids):
            bad.append('需要真实且唯一的风格 ID，首行为主方向')
        if any(c.name != 'Write' for c in calls):
            bad.append('选样只使用 Write')
        if not bad:
            try:
                _images([{'id': i, 'shot': str(style_catalog.read_path(i))} for i in ids])
            except (OSError, ValueError) as exc:
                bad.append(f'参照图片不可读: {exc}')
        for c in calls:
            _result(history, c, '；'.join(bad) if bad else '选样已接收，下一步读取图片写主题')
        if not bad:
            out.write_text(text.strip() + '\n', encoding='utf-8')
            return ids
        if not calls:
            history.append({'role': 'user', 'content': '；'.join(bad)})
    raise RuntimeError('选参照失败: ' + '；'.join(bad))


def _images(picks, width=900):
    from io import BytesIO
    from PIL import Image
    blocks = []
    for p in picks:
        with Image.open(p['shot']) as source:
            im = source.convert('RGB')
        im.thumbnail((width, width))
        buf = BytesIO()
        im.save(buf, 'JPEG', quality=82)
        digest = hashlib.sha256(buf.getvalue()).hexdigest()
        blocks.extend([{'type': 'input_text', 'text': f"参考 {p.get('id', '')}: {p['shot']} ({im.width}×{im.height}, sha256={digest})"},
                       {'type': 'input_image', 'image_url': 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()}])
    return blocks


def gates(css, *, assets, browser=True):
    return theme_io.validate(css, assets, browser=browser)


def theme(run, picks, effort, workflow_root, history=None, original='', shots=()):
    history = history if history is not None else []
    out = run.root / 'pages/assets/theme.css'
    selected = picks or ([style_catalog.match(run.style)] if style_catalog.match(run.style) else [])
    catalog_text, catalog_images = (style_catalog.selected_inputs(selected) if selected
                                    else style_catalog.inputs(run.style))
    body = run.prompt('style-theme', query=run.query, audience=run.audience, scenario=run.scenario or '（没写）',
        canvas_w=run.canvas[0], canvas_h=run.canvas[1],
        direction=skills.direction_block(run.prompts),
        theme_bans=skills.theme_slop_block(workflow_root) if not history else '',
        font_floor=skills.FONT_FLOOR, out_path=out)
    body += '\n\n明确风格要求：' + (getattr(run, 'style', None) or '按内容选择')
    body += '\n\n风格表（创作参考，不是页面资产）：\n' + catalog_text
    if original:
        body += '\n\n待修改完整原主题（按明确要求生成完整新版本）：\n' + original
    imported = out.parent / 'style'
    assets = [p.relative_to(out.parent).as_posix() for p in sorted(imported.rglob('*'))
              if p.is_file() and 'shots' not in p.relative_to(imported).parts]
    if assets:
        body += '\n\n已导入的本地素材，CSS 必须用重定位后的路径（不是来源目录路径）：\n' + '\n'.join(assets)
    refs = [{'id': '用户参考，优先于自动偏好', 'shot': str(p)} for p in shots]
    available = [f'style:{key}' for key in selected] + [f'user:{p.relative_to(out.parent).as_posix()}' for p in shots]
    if available:
        body += '\n\n已加载参考（主参考在 INTERFACE 中用 reference 行指认）：\n' + '\n'.join(available)
    body += '\n\n用户图默认只是参考，不得擅自用作背景。工具媒体路径相对 pages/；CSS URL 相对 assets/。'
    content = [{'type': 'input_text', 'text': body}] + _images(refs) + catalog_images
    specs = _write_spec(out) + media.SCHEMAS + [style_catalog.READ_SPEC]
    rejected = 0
    while rejected < TRIES:
        r, calls = _call(content, specs, effort, run, 'style-theme', history)
        content = None
        if not calls:
            raise RuntimeError('Director 结束但没有有效 Write')
        writes = [c for c in calls if c.name == 'Write']
        css, bad = _one_write(r, out) if writes else (None, [])
        if writes and any(c.name != 'Write' for c in calls):
            bad.append('先接收/查看工具结果，再在下一次响应提交 Write')
        if css and not bad:
            try:
                font_library.prepare(css, out.parent)
                # Missing optional provenance is not an aesthetic rejection. Resolve
                # declared references only, using the existing local-resource boundary.
                theme_io.reference_images(css, out.parent)
                bad.extend(gates(css, assets=out.parent))
            except (ValueError, OSError) as exc:
                bad.append(str(exc))
        pending = []
        for call in calls:
            if call.name == 'Write':
                _result(history, call, '；'.join(bad) if bad else '技术校验通过')
                continue
            try:
                args = json.loads(call.arguments)
                if not isinstance(args, dict):
                    raise ValueError('工具参数必须是 JSON 对象')
                if call.name == 'Read':
                    output, images = style_catalog.detail(args.get('file_path'))
                    output += '\n可在 INTERFACE 指认：reference style:' + style_catalog.identify(args.get('file_path'))
                    pending.extend(images)
                elif call.name in media.NAMES:
                    result = tools.media_call(call.name, args, run.root / 'pages', 'director')
                    output = result.text
                    pending.append({'type': 'input_text', 'text': output})
                    pending.extend({'type': 'input_image', 'image_url': f'data:{mime};base64,{data}'} for mime, data in result.images)
                else:
                    raise ValueError(f'未知工具 {call.name}')
            except (ValueError, OSError, KeyError, TypeError) as exc:
                output = f'{type(exc).__name__}: {exc}'
            _result(history, call, output)
        if pending:
            history.append({'role': 'user', 'content': pending})
        if writes:
            if not bad:
                if not theme_io.references(css) and available:
                    css = css.replace('==== /INTERFACE ====', f'reference {available[0]}\n==== /INTERFACE ====', 1)
                theme_io.publish(css, out)
                return css
            rejected += 1
            (run.root / 'style.rejected.json').write_text(json.dumps(
                {'bad': bad, 'css': css, 'submissions': rejected}, ensure_ascii=False, indent=2), encoding='utf-8')
    raise RuntimeError('主题技术校验失败: ' + '；'.join(bad))


def direct(run, effort, workflow_root=None):
    workflow_root = workflow_root or skills.WORKFLOWS
    source, request = getattr(run, 'template', None), getattr(run, 'style', None)
    theme_io.check_options(source, request, getattr(run, 'style_director', True))
    assets = run.root / 'pages/assets'
    original, shots = theme_io.import_input(Path(source) if source else None, assets,
                                          allow_repair=bool(request), request=request or '')
    run._style_calls = 0
    if original and not request:
        bad = gates(original, assets=assets)
        if bad:
            raise ValueError('导入主题无效（未授权重写）: ' + '；'.join(bad))
        theme_io.publish(original, assets / 'theme.css')
        return {'route': 'reuse', 'model_calls': 0, 'css_chars': len(original)}
    if not llm.default_runtime().profile.vision_input:
        raise ValueError('Style Director 需要启用 vision_input 的模型，不能盲写参考主题')
    history = []
    picks = [] if source or style_catalog.match(request) else pick(run, effort, history, workflow_root)
    css = theme(run, picks, effort, workflow_root, history, original, shots)
    return {'route': 'modify' if original else 'reference' if source else 'auto',
            'picks': picks, 'css_chars': len(css), 'model_calls': run._style_calls}


def main():
    a = argparse.ArgumentParser()
    a.add_argument('--label', required=True)
    a.add_argument('--query', required=True)
    a.add_argument('--minutes', type=int, default=90)
    a.add_argument('--audience', default='学过一点相关基础、但没系统学过这个题目的读者')
    a.add_argument('--scenario', default='')
    a.add_argument('--template', type=Path, help='参考图片或包含 theme.css / shots 的目录')
    a.add_argument('--style', help='风格要求；修改成品主题必须显式指定')
    a.add_argument('--effort')
    a.add_argument('--model')
    a.add_argument('--base-url')
    a.add_argument('--key-env')
    a.add_argument('--wire', choices=('responses', 'chat', 'messages'))
    n = a.parse_args()
    try:
        theme_io.check_options(n.template, n.style)
    except ValueError as exc:
        a.error(str(exc))
    llm.override(name=n.model, base_url=n.base_url, api_key_env=n.key_env, wire_api=n.wire)
    run = planner.Run(n.query, n.minutes, n.audience, n.label, n.scenario, template=n.template, style=n.style)
    print(json.dumps(direct(run, n.effort or planner.config()['planner']['reasoning_effort']), ensure_ascii=False))


if __name__ == '__main__':
    main()
