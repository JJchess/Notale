"""Light style index; selected Markdown detail, original image, and local fonts."""
from pathlib import Path
import re
from tools.read.style import READ_SPEC, detail

ROOT = Path(__file__).resolve().parents[1] / 'skills/style-director'


def rows():
    text = (ROOT / 'INDEX.md').read_text(encoding='utf-8')
    return [[x.strip() for x in line.strip('|').split('|')]
            for line in text.splitlines() if re.match(r'\| \d{2}-', line)]


def match(request):
    normalized = (request or '').strip().casefold()
    chosen = [r for r in rows() if normalized in
        {r[0].casefold(), r[0].split('-', 1)[1].casefold(), *[n.strip().casefold() for n in r[1].split('·')]}]
    return chosen[0][0] if len(chosen) == 1 else None


def identify(value):
    if not isinstance(value, str):
        raise ValueError('需要风格 ID / 详情路径')
    ids = {r[0] for r in rows()}
    if value in ids:
        return value
    path = (ROOT / value).resolve()
    for key in ids:
        if path in ((ROOT / 'details' / f'{key}.md').resolve(), (ROOT / 'shots' / f'{key}.png').resolve()):
            return key
    raise ValueError('Read 只允许风格表列出的详情/裁图')


def read_path(value):
    path = ROOT / 'shots' / (identify(value) + '.png')
    if not path.is_file():
        raise ValueError(f'风格裁图缺失: {path}')
    return path


def font_keys(text):
    return list(dict.fromkeys(re.findall(r'\]\(\.\./\.\./\.\./vendor/fonts/([a-z0-9-]+)/\)', text)))




def inputs(request=None):
    key = match(request)
    if key:
        return detail(key)
    table = '\n'.join(' | '.join(r[:4]) for r in rows())
    return ('风格轻索引：ID | 名称 | 简述 | 详情。先选主要方向并 Read 对应 ID，'
            '收到详细资料和参考图后再写主题。用户要求组合可同轮读取多项。'
            '这些不是风格上限；自定义方向可借用最接近的资料再创作，不必强称某流派。\n' + table, [])


def selection_inputs():
    """Full visual coverage, using the generated compact-sheet index (not a fixed count)."""
    from .director import _images
    folder = ROOT / 'contact-sheets'
    names = re.findall(r'!\[[^\]]*\]\(([^)]+\.png)\)', (folder / 'README.md').read_text())
    shots = []
    for name in dict.fromkeys(names):
        path = (folder / name).resolve()
        if not path.is_relative_to(folder.resolve()):
            raise ValueError(f'概览路径越界: {name}')
        shots.append({'id': f'风格概览 {name}', 'shot': str(path)})
    if not shots:
        raise ValueError('风格概览索引为空')
    index = '\n'.join(' | '.join(row[:3]) for row in rows())
    return index, _images(shots, width=1600)


def selected_inputs(ids):
    """Load known selections without an extra model Read response."""
    texts, images = [], []
    for key in dict.fromkeys(ids):
        text, blocks = detail(key)
        texts.append(text)
        images.extend(blocks)
    return '\n\n'.join(texts), images
