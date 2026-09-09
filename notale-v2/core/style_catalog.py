"""Light style index; selected Markdown detail, original image, and local fonts."""
from pathlib import Path
import re
from . import font_library

ROOT = Path(__file__).resolve().parents[1] / 'references/styles'
READ_SPEC = {'type': 'function', 'name': 'Read',
    'description': '选择并读取风格详情、中英字体用法和原始参考图；file_path 填风格 ID 或 details/<ID>.md。可同轮读取多个风格进行组合。',
    'parameters': {'type': 'object', 'properties': {'file_path': {'type': 'string'}},
                   'required': ['file_path'], 'additionalProperties': False}}


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


def detail(value):
    from .director import _images
    key = identify(value)
    text = (ROOT / 'details' / f'{key}.md').read_text(encoding='utf-8')
    keys = font_keys(text)
    if not keys:
        raise ValueError(f'风格详情没有字体资源: {key}')
    text += '\n\n## 已备妥的字体声明（按实际选择使用，不需全用）\n```css\n'
    text += font_library.snippets(keys) + '\n```\n'
    text += ('以上字体文件由宿主按最终 CSS 引用复制进 run，不需另调下载工具。'
             '样图只作参考；字体搭配是本项目建议，不声称识别了样图原字体。')
    shot = read_path(key)
    return text, _images([{'id': key, 'shot': str(shot)}], width=1600)


def inputs(request=None):
    key = match(request)
    if key:
        return detail(key)
    table = '\n'.join(' | '.join(r[:4]) for r in rows())
    return ('风格轻索引：ID | 名称 | 简述 | 详情。先选主要方向并 Read 对应 ID，'
            '收到详细资料和参考图后再写主题。用户要求组合可同轮读取多项。'
            '这些不是风格上限；自定义方向可借用最接近的资料再创作，不必强称某流派。\n' + table, [])
