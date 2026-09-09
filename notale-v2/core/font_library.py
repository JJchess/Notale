"""Local font assets and native @font-face snippets; no theme compilation."""
from functools import lru_cache
from hashlib import sha256
import json
from pathlib import Path
import shutil
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1] / 'vendor/fonts'
PREFIX = 'fonts/library/'


def inventory():
    return json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))


def family(key):
    if key not in inventory():
        raise ValueError(f'未知字体: {key}')
    return 'NTF-' + key  # prevent installed fonts masking missing web assets


def snippets(keys):
    rows, result = inventory(), []
    for key in dict.fromkeys(keys):
        if key not in rows:
            raise ValueError(f'未知字体: {key}')
        item = rows[key]
        result.append(f"/* {key}: {item['files'][0]['family']}；字重/字姿须匹配以下真实声明 */")
        for face in item['files']:
            result.append('@font-face {\n'
                f'  font-family: "NTF-{key}";\n'
                f'  src: url("{PREFIX}{key}/{face["file"]}");\n'
                f'  font-weight: {face["weight"]}; font-style: {face["style"]}; font-display: swap;\n'
                '}')
    return '\n'.join(result)


def prepare(css, assets):
    """Copy only allowlisted library files referenced by CSS, plus license notices.

    Imported/user assets are not touched. Different existing files and symlinks
    are errors, not overwritten. No runtime network fetch or font subsetting.
    """
    from . import theme
    nodes = theme.cssparser.parse_stylesheet(css, skip_comments=True, skip_whitespace=True)
    requests = []
    for _, url in theme.urls(nodes):
        u = urlsplit(url)
        relative = unquote(u.path)
        if not relative.startswith(PREFIX):
            continue
        if u.scheme or u.netloc or u.query or u.fragment or '\\' in url:
            raise ValueError(f'字体库引用必须是明确相对文件: {url}')
        requests.append(relative)
    if not requests:
        return []
    rows = inventory()
    allowed = {f'{PREFIX}{key}/{face["file"]}': (key, face)
               for key, row in rows.items() for face in row['files']}
    copied = []
    for relative in dict.fromkeys(requests):
        if relative not in allowed:
            raise ValueError(f'字体库文件未登记: {relative}')
        key, face = allowed[relative]
        source = ROOT / key / face['file']
        if sha256(source.read_bytes()).hexdigest() != face['sha256']:
            raise ValueError(f'字体库文件校验失败: {key}/{face["file"]}')
        for name in [face['file'], rows[key]['license'], *rows[key].get('notices', [])]:
            src = (ROOT / key / name).resolve()
            if not src.is_relative_to((ROOT / key).resolve()):
                raise ValueError('字体来源越界')
            dest = assets / PREFIX / key / name
            if dest.is_symlink() or not dest.resolve().is_relative_to(assets.resolve()):
                raise ValueError(f'字体目标越界: {dest}')
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists():
                if dest.read_bytes() != src.read_bytes():
                    raise ValueError(f'已有字体资源不同，不能覆盖: {dest}')
            else:
                shutil.copy2(src, dest)
        copied.append(relative)
    return copied


@lru_cache(maxsize=64)
def coverage(key):
    from fontTools.ttLib import TTFont
    row = inventory()[key]
    with TTFont(ROOT / key / row['files'][0]['file']) as font:
        return frozenset(font.getBestCmap())


def missing(key, text):
    return ''.join(dict.fromkeys(c for c in text if not c.isspace() and ord(c) not in coverage(key)))
