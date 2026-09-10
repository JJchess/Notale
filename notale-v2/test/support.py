"""Shared fixtures; no collected tests or production dependencies on this module."""
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from core import builder, planner

class FakeCall(SimpleNamespace):

    def model_dump(self):
        return {'type': 'function_call', 'name': self.name, 'arguments': self.arguments, 'call_id': self.call_id}

def builder_call(name: str, **args) -> FakeCall:
    return FakeCall(type='function_call', name=name, arguments=json.dumps(args), call_id=f'c-{name}-{abs(hash(json.dumps(args, sort_keys=True))) % 100000}')

def tool_response(*calls: FakeCall, index: int=0):
    return SimpleNamespace(output=list(calls), usage=None, id=f'req-{index}')

def done_response(text: str='done'):
    message = SimpleNamespace(type='message', content=[SimpleNamespace(type='output_text', text=text)])
    return SimpleNamespace(output=[message], usage=None, id='req-done')

def builder_page(pid='page-01', workflow='build-cover', label='标题页') -> builder.Page:
    return builder.Page(pid, 'Build the current target.', workflow=workflow, label=label, spec_text=f'# {pid} [{label}]\nAdaBoosting 算法', total=4)

def media_call(name, **args):
    values = dict(type='function_call', name=name, arguments=json.dumps(args), call_id=name)
    return SimpleNamespace(**values, model_dump=lambda **_: values)

def media_response(*calls):
    return SimpleNamespace(output=list(calls), usage=None, id='test-response')

def make_run(path: Path) -> Path:
    assets = path / 'pages' / 'assets'
    plan = path / 'pages' / 'plan'
    assets.mkdir(parents=True)
    plan.mkdir()
    (assets / 'CHASSIS.md').write_text('chassis', encoding='utf-8')
    (assets / 'theme.css').write_text('/* ==== INTERFACE ====\n组件 .panel 读数容器\n==== /INTERFACE ==== */\n.panel{padding:12px}', encoding='utf-8')
    library = assets / 'lib'
    library.mkdir()
    (library / 'LIBS.md').write_text('# Libraries\n\n## 按「要做的事」查\n\n| task | file |\n|---|---|\n| chart | d3.min.js |\n\n## Details\nAPI details', encoding='utf-8')
    specs = ['# page-01 [标题页]\n整套开场', '# page-02 [内容页]\n历史背景', '# page-03 [交互页]\n交互理解', '# page-04 [代码页]\n代码实操', '# page-05 [标题页]\n第二章', '# page-06 [内容页]\n章节内容']
    (plan / 'pages.md').write_text('本套无需图池\n\n' + '\n\n'.join(specs), encoding='utf-8')
    for index, spec in enumerate(specs, 1):
        (plan / f'p{index:02d}.md').write_text(spec, encoding='utf-8')
    return path
STYLE_CSS = '/* ==== INTERFACE ====\ntoken --bg: 背景\ntoken --text: 正文\ntoken --font-sans: 字体\nclass .nt-title: 标题\nvariant dark: 深色无图\n==== /INTERFACE ==== */\n:root { --bg: #fff; --text: rgb(20 20 20); --font-sans: sans-serif; }\nhtml[data-variant="dark"] { --bg: #111; --text: #eee; }\n.nt-title { font-size: 48px; }\n.nt-controls { --surface: #ffffff80; background: var(--surface); border: 2px solid; }\n'

def make_style_run(root):
    assets = root / 'pages/assets'
    assets.mkdir(parents=True)
    run = SimpleNamespace(root=root, query='固定事实', audience='读者', scenario='', style=None, template=None, style_director=True, canvas=(1600, 900), prompts=planner.PROMPTS, prompt=lambda *args, **kw: json.dumps(kw, default=str), log=Mock())
    return (run, assets)
