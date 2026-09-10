from __future__ import annotations


READ_SPEC = {'type': 'function', 'name': 'Read',
    'description': '选择并读取风格详情、中英字体用法和原始参考图；file_path 填风格 ID 或 details/<ID>.md。可同轮读取多个风格进行组合。',
    'parameters': {'type': 'object', 'properties': {'file_path': {'type': 'string'}},
                   'required': ['file_path'], 'additionalProperties': False}}

def detail(value):
    from core import style_catalog as catalog, font_library
    from core.director import _images
    key = catalog.identify(value)
    text = (catalog.ROOT / 'details' / f'{key}.md').read_text(encoding='utf-8')
    keys = catalog.font_keys(text)
    if not keys:
        raise ValueError(f'风格详情没有字体资源: {key}')
    text += '\n\n## 已备妥的字体声明（按实际选择使用，不需全用）\n```css\n'
    text += font_library.snippets(keys) + '\n```\n'
    text += ('以上字体文件由宿主按最终 CSS 引用复制进 run，不需另调下载工具。'
             '样图只作参考；字体搭配是本项目建议，不声称识别了样图原字体。')
    shot = catalog.read_path(key)
    return text, _images([{'id': key, 'shot': str(shot)}], width=1600)
