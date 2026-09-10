"""Native CSS inspection and local input copying. No theme schema or compiler."""
from __future__ import annotations

import html
import os
import re
import shutil
import tempfile
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

import tinycss2 as cssparser

INTERFACE = re.compile(r"/\*\s*==== INTERFACE ====(.*?)==== /INTERFACE ====\s*\*/", re.S)
SURFACE = re.compile(r"--(?:surface|panel|card|board|tile|box|chip|well|sheet|plate)(?:-|$)", re.I)
IMAGES = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'}
FONTS = {'.woff', '.woff2', '.ttf', '.otf'}


def walk(nodes):
    for node in nodes:
        yield node
        for attr in ('prelude', 'content', 'arguments', 'value'):
            children = getattr(node, attr, None)
            if isinstance(children, list):
                yield from walk(children)


def urls(nodes):
    for node in walk(nodes):
        if node.type == 'url':
            yield node, node.value
        elif node.type == 'function' and node.lower_name == 'url':
            args = [x for x in node.arguments if x.type not in ('whitespace', 'comment')]
            if len(args) != 1 or args[0].type != 'string':
                raise ValueError('url() 必须是本地文件或 fragment')
            yield node, args[0].value
        elif node.type == 'function' and node.lower_name in ('image-set', '-webkit-image-set'):
            # Quoted image-set sources need the same checks as url(), not a bypass.
            for child in node.arguments:
                if child.type == 'string':
                    yield child, child.value


def local_url(value: str, origin: Path, boundary: Path) -> tuple[Path | None, str]:
    u = urlsplit(value)
    if value.startswith('#'):
        return None, value
    if u.scheme or u.netloc or u.query or not u.path or '\\' in value or u.path.startswith('/'):
        raise ValueError(f'只支持本地相对资源及 fragment: {value}')
    path = (origin / unquote(u.path)).resolve()
    if not path.is_relative_to(boundary.resolve()):
        raise ValueError(f'资源越界: {value}')
    if not path.is_file():
        raise ValueError(f'缺少资源: {path}')
    if path.suffix.lower() not in IMAGES | FONTS:
        raise ValueError(f'不支持的资源类型: {path.name}')
    return path, ('#' + u.fragment if u.fragment else '')


def rules_of(nodes):
    for node in nodes:
        if node.type == 'qualified-rule':
            yield node
        elif node.type == 'at-rule' and node.content is not None and node.lower_at_keyword in (
                'media', 'supports', 'layer', 'container', 'scope', 'starting-style'):
            yield from rules_of(cssparser.parse_rule_list(node.content, skip_whitespace=True, skip_comments=True))


def selector_branches(prelude):
    """Split only top-level commas; functions and attribute blocks are CSS tokens."""
    branch = []
    for token in prelude:
        if token.type == 'literal' and token.value == ',':
            yield cssparser.serialize(branch).strip()
            branch = []
        else:
            branch.append(token)
    yield cssparser.serialize(branch).strip()


def inspect(css: str) -> tuple[list[str], list, str]:
    bad = []
    interface = INTERFACE.search(css)
    if not interface or not css.lstrip().startswith('/*'):
        bad.append('缺少完整的 INTERFACE 接口块')
    if not css.strip() or css.lstrip().startswith('```'):
        bad.append('主题必须是非空纯 CSS，不能有代码围栏')
    # CSS parsers recover unterminated blocks at EOF; reject that recovery explicitly.
    bare = re.sub(r'/\*.*?\*/|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '', css, flags=re.S)
    stack = []
    for char in bare:
        if char in '([{':
            stack.append(char)
        elif char in ')]}':
            if not stack or stack.pop() != dict(zip(')]}', '([{'))[char]:
                bad.append('CSS 括号不匹配')
                break
    if stack or '/*' in bare:
        bad.append('CSS 块/注释未闭合')
    nodes = cssparser.parse_stylesheet(css, skip_whitespace=True, skip_comments=True)
    for node in walk(nodes):
        if node.type == 'error':
            bad.append(f'CSS 语法错误 {node.source_line}:{node.source_column}: {node.message}')
        if node.type == 'at-rule' and node.lower_at_keyword == 'import':
            bad.append('不支持 @import；资源必须本地自包含')
    selectors, defined, defaults = [], set(), set()
    for rule in rules_of(nodes):
        selector = cssparser.serialize(rule.prelude).strip()
        selectors.append(selector)
        branches = list(selector_branches(rule.prelude))
        for branch in branches:
            if not re.search(r'\.nt-[\w-]+|#stage|:root|\bhtml\b|\bbody\b', branch):
                bad.append(f'共享样式须挂具名 .nt-*，不全局重写: {branch.strip()}')
        declarations = cssparser.parse_blocks_contents(rule.content, skip_whitespace=True, skip_comments=True)
        for d in declarations:
            if d.type == 'error':
                bad.append(f'CSS 声明错误 {d.source_line}: {d.message}')
            if d.type != 'declaration':
                continue
            defined.add(d.name)
            if any(s in (':root', 'html') for s in branches):
                defaults.add(d.name)
            # Any selector branch without a named local class publishes at shared scope.
            public = any(not re.search(r'\.nt-[\w-]+', s) for s in branches)
            if public and SURFACE.match(d.name):
                bad.append(f'不许定义承载面 token 于公共作用域: {d.name}')
            if any(re.search(r'#stage\s*$', s) for s in branches) and d.lower_name in (
                    'transform', 'transform-origin', 'position', 'left', 'top', 'width', 'height', 'overflow'):
                bad.append(f'不覆盖底盘 #stage 的 {d.name}')
    contract = interface.group(1) if interface else ''
    for name in ('--bg', '--text', '--font-sans'):
        if name not in defaults:
            bad.append(f'缺少必需 token: {name}')
    for name in variants(contract):
        if not any(re.search(r'data-variant\s*=\s*[\"\']?' + re.escape(name) + r'(?:[\"\']|\])', s) for s in selectors):
            bad.append(f'接口 variant 未定义: {name}')
    public_tokens = [name for line in contract.splitlines() if re.match(r'\s*\*?\s*token\s+', line)
                     for name in re.findall(r'--[\w-]+', line)]
    for name in public_tokens:
        if name not in defined:
            bad.append(f'接口 token 未定义: {name}')
        if SURFACE.match(name):
            bad.append(f'接口块不发布公共承载面 token: {name}')
    # Prose may describe materials or prohibit panels; keywords cannot infer permission.
    # The public SURFACE names above remain checked; broader semantics belong in guidance.
    for name in re.findall(r'^\s*\*?\s*class\s+(\.nt-[\w-]+)', contract, re.M):
        if not any(re.search(re.escape(name) + r'(?![\w-])', s) for s in selectors):
            bad.append(f'接口 class 未定义: {name}')
    return list(dict.fromkeys(bad)), nodes, contract


def variants(contract: str) -> list[str]:
    return re.findall(r'^\s*\*?\s*variant\s+([\w-]+)', contract, re.M)


REFERENCE = re.compile(r'^\s*\*?\s*reference(?:\s*:\s*|\s+)(style|user):(.+?)\s*$', re.M)


def references(css: str) -> list[tuple[str, str]]:
    interface = INTERFACE.search(css)
    return list(dict.fromkeys(REFERENCE.findall(interface.group(1)))) if interface else []


def reference_images(css: str, assets: Path) -> list[dict]:
    """Resolve declared input pictures, not CSS backgrounds or arbitrary file reads."""
    from . import style_catalog
    images = []
    for kind, value in references(css):
        if kind == 'style':
            path = style_catalog.read_path(value)
        else:
            path, _ = local_url(value, assets, assets)
            if path is None or path.suffix.lower() not in IMAGES - {'.svg'}:
                raise ValueError(f'主题参考须为本地位图: {value}')
        images.append({'id': f'{kind}:{value}', 'shot': str(path)})
    return images


def validate(css: str, assets: Path, *, browser=True) -> list[str]:
    bad, nodes, contract = inspect(css)
    try:
        resources = [local_url(value, assets, assets.parent) for _, value in urls(nodes)]
    except ValueError as exc:
        bad.append(str(exc))
        resources = []
    if bad or not browser:
        return bad
    return browser_check(css, assets, variants(contract), resources)


def browser_check(css: str, assets: Path, names: list[str], resources: list) -> list[str]:
    """Small offline probe, not an automatically authored component showcase."""
    from playwright.sync_api import sync_playwright
    bad = []
    assets.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.theme-check-', dir=assets) as scratch:
        probe = Path(scratch)
        # Keep URL origin at assets, even though the isolated candidate is temporary.
        base = assets / 'base.css'
        if not base.is_file():
            base = probe / 'base.css'
            base.write_text((Path(__file__).resolve().parents[1] / 'vendor/chassis/base.css').read_text())
        (probe / 'index.html').write_text('<!doctype html><base href="' + html.escape(assets.as_uri() + '/') +
            '"><link rel="stylesheet" href="' + base.as_uri() + '"><link rel="stylesheet" href="' +
            (probe / 'candidate.css').as_uri() + '"><div id="stage"><span id="probe">中文 Ag</span>' +
            '<button id="control" class="nt-btn">操作</button><span id="hidden" class="nt-title" hidden>隐藏</span></div>', encoding='utf-8')
        # Rebase only the isolated probe; the delivered CSS stays relative and native.
        parsed = cssparser.parse_stylesheet(css)
        for token, value in urls(parsed):
            path, fragment = local_url(value, assets, assets.parent)
            if path:
                replace_url(token, path.as_uri() + fragment)
        (probe / 'candidate.css').write_text(cssparser.serialize(parsed), encoding='utf-8')
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            def route(request):
                u = urlsplit(request.request.url)
                path = Path(unquote(u.path)).resolve()
                if u.scheme == 'file' and path.is_relative_to(assets.parent.resolve()):
                    request.continue_()
                else:
                    request.abort()
            page.route('**/*', route)
            page.goto((probe / 'index.html').as_uri())
            # Leave compatibility branches and optional declarations to native CSS
            # fallback. Only required resolved tokens and chassis behavior gate delivery.
            no_image = False
            for name in ['', *names]:
                errors = page.evaluate('''(name) => {
                  const root=document.documentElement;
                  if(name) root.dataset.variant=name; else delete root.dataset.variant;
                  const s=getComputedStyle(root), errors=[];
                  for(const [token,prop] of [['--bg','background-color'],['--text','color'],['--font-sans','font-family']]) {
                    const value=s.getPropertyValue(token).trim();
                    if(!value || !CSS.supports(prop,value)) errors.push(`${name||'默认'}: ${token} 缺失或不可用 (${value})`);
                  }
                  return errors;
                }''', name)
                bad.extend(errors)
                await_frame = '() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'
                page.evaluate(await_frame)
                facts = page.evaluate('''() => {const stage=document.querySelector('#stage'),s=getComputedStyle(stage);
                  return {position:s.position,transform:s.transform,overflow:s.overflow,
                    hidden:getComputedStyle(document.querySelector('#hidden')).display,
                    brand:getComputedStyle(stage,'::after').pointerEvents,background:s.backgroundImage};}''')
                if facts['position'] != 'absolute' or facts['transform'] == 'none' or facts['overflow'] != 'hidden':
                    bad.append(f'{name or "默认"}: 覆盖了舞台定位/缩放/裁切机制')
                if facts['hidden'] != 'none' or facts['brand'] != 'none':
                    bad.append(f'{name or "默认"}: 覆盖 hidden 或品牌指针机制')
                no_image |= 'url(' not in facts['background']
            if not no_image:
                bad.append('图片主题必须提供默认或声明的无图状态')
            # Decode every referenced image, including images hidden by inactive variants.
            for path, fragment in resources:
                if path and path.suffix.lower() in IMAGES:
                    ok = page.evaluate('''async url => {let im=new Image();im.src=url;try{await im.decode();return im.naturalWidth>0}catch{return false}}''', path.as_uri() + fragment)
                    if not ok:
                        bad.append(f'图片无法加载: {path.name}')
                elif path:
                    ok = page.evaluate('''async url => {try{const f=new FontFace('probe-font',`url("${url}")`);await f.load();return true}catch{return false}}''', path.as_uri())
                    if not ok:
                        bad.append(f'字体无法加载: {path.name}')
            browser.close()
    return bad


def replace_url(token, value):
    encoded = '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'
    if token.type == 'url':
        token.value, token.representation = value, 'url(' + encoded + ')'
    elif token.type == 'string':
        token.value, token.representation = value, encoded
    else:
        token.arguments = cssparser.parse_component_value_list(encoded)


def check_options(template, style, enabled=True):
    if style is not None and not style.strip():
        raise ValueError('--style 不得为空；修改成品主题请明确填写要求')
    if (template is not None or style is not None) and not enabled:
        raise ValueError('--template/--style 与 --no-style-director 冲突')
    if template is not None and not Path(template).exists():
        raise ValueError(f'--template 不存在: {template}')


def import_input(source: Path | None, assets: Path, *, allow_repair=False, request='') -> tuple[str, list[Path]]:
    if source is None:
        return '', []
    source = source.resolve()
    boundary = source if source.is_dir() else source.parent
    target = assets / 'style'
    def copy(path):
        resolved = path.resolve()
        if not resolved.is_relative_to(boundary):
            raise ValueError(f'资源越界/外部软链接: {path}')
        dest = target / path.relative_to(boundary)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(resolved, dest)
        return dest
    if source.is_file():
        if source.suffix.lower() not in IMAGES - {'.svg'}:
            raise ValueError('--template 文件须为参考图片；CSS 请放在主题目录')
        from PIL import Image
        with Image.open(source) as im:
            im.verify()
        dest = target / 'shots' / source.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)
        return '', [dest]
    shots = [copy(p) for p in sorted((source / 'shots').rglob('*'))
             if p.is_file() and p.suffix.lower() in IMAGES - {'.svg'}]
    # Extra package resources are copied only when explicitly named in the request;
    # no resource manifest, semantic role guessing, package scripts or blanket copy.
    for path in source.rglob('*'):
        relative = path.relative_to(source).as_posix()
        if path.is_file() and path.suffix.lower() in IMAGES | FONTS and relative in request:
            copy(path)
    theme_file = source / 'theme.css'
    if not theme_file.is_file():
        if not shots:
            raise ValueError('目录缺 theme.css 且 shots/ 内没有参考图')
        return '', shots
    if not theme_file.resolve().is_relative_to(boundary):
        raise ValueError('theme.css 外部软链接越界')
    css = theme_file.read_text(encoding='utf-8')
    errors = inspect(css)[0]
    if errors and not allow_repair:
        raise ValueError('导入主题无效（未授权重写）: ' + '；'.join(errors))
    nodes = cssparser.parse_stylesheet(css)
    for token, value in urls(nodes):
        path, fragment = local_url(value, source, boundary)
        if path:
            dest = copy(path)
            if path.suffix.lower() in FONTS:
                # Reused self-contained themes must keep redistribution notices.
                # Only adjacent font notices, not arbitrary package documents/scripts.
                for notice in path.parent.iterdir():
                    if notice.is_file() and (notice.name.upper() in ('OFL.TXT', 'LICENSE', 'LICENSE.TXT',
                            'LICENSE-OFL', 'NOTICE', 'NOTICE.TXT', 'COPYING')):
                        copy(notice)
                notices = path.parent / 'LICENSES'
                if notices.is_dir():
                    for notice in notices.rglob('*.txt'):
                        if notice.is_file():
                            copy(notice)
            replace_url(token, quote(os.path.relpath(dest, assets), safe='/') + fragment)
    imported_css = cssparser.serialize(nodes)
    # A reference is an input picture, so it is not among parsed CSS url() tokens.
    # Relocate only explicitly declared local references through the same sandbox.
    interface = INTERFACE.search(imported_css)
    if interface:
        def relocate(match):
            kind, value = match.groups()
            if kind == 'style':
                return match.group(0)
            path, _ = local_url(value, source, boundary)
            if path is None or path.suffix.lower() not in IMAGES - {'.svg'}:
                raise ValueError(f'主题参考须为本地位图: {value}')
            return 'reference user:' + copy(path).relative_to(assets).as_posix()
        block = REFERENCE.sub(relocate, interface.group(0))
        imported_css = imported_css[:interface.start()] + block + imported_css[interface.end():]
    return imported_css, shots


def publish(css: str, target: Path):
    """Only publish a complete checked candidate; never leave a partial theme on I/O failure."""
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=target.parent,
                                     prefix='.theme-publish-', suffix='.css', delete=False) as f:
        temp = Path(f.name)
        try:
            f.write(css)
            f.flush()
            os.fsync(f.fileno())
        except BaseException:
            temp.unlink(missing_ok=True)
            raise
    try:
        os.replace(temp, target)
    finally:
        temp.unlink(missing_ok=True)
