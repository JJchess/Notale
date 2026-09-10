#!/usr/bin/env python3
"""把页面本体（index.html + styles.css + app.js）合成一个 lawn-path.html。

    python3 demos/lawn-path/build.py            # 可读版 + 行号地图（默认）
    python3 demos/lawn-path/build.py --min      # 压缩版，输出 lawn-path.min.html

默认产物是**给人和模型读的**：注释、缩进、真实类名和变量名逐字保留。
它要进 skill 当按需参考的范例，压缩会把范例仅有的价值（有意义的名字 + 解释为什么的注释）
恰好压掉，所以默认不压。

整份 990 行读一次约 8,500 token，太贵。所以顺带生成一张**行号地图**：模型想学换幕怎么写，
只读那 54 行（约 500 token）即可。地图同时写进文件开头的注释和单独的 MAP.md
（后者供 SKILL.md 内联，是唯一进上下文的部分）。

底盘和 GSAP（assets/ 下面那三个）不内联，按外部链接引用 —— 它们是环境常备资源，
所以产物要和 assets/ 放在一起用。
"""

import functools
import re
import string
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
LINK = re.compile(r'[ \t]*<link rel="stylesheet" href="\./([^"?]+)[^"]*" />\n')
SCRIPT = re.compile(r'[ \t]*<script src="\./([^"?]+)[^"]*"></script>\n')
INLINE = {"styles.css", "app.js"}          # 这一页自己写的，其余原样保留链接

CSS_COMMENT = re.compile(r'/\*.*?\*/', re.S)
CLASS_ATTR = re.compile(r'class="([^"]*)"')
JS_STRING = re.compile(r'"[^"\\\n]*"|\'[^\'\\\n]*\'|`[^`\\]*`')

# 分段靠源文件里已有的分节注释定位。每一条都会断言找得到 —— 谁改了注释文字，
# 构建直接失败，而不是产出一张错的地图（错地图比没地图更糟：模型会去读错的行）。
MARKS = [
    ("HTML 骨架与依赖",            None),
    ("CSS：定尺舞台与三幕版式",     r'^\s*<style>'),
    ("CSS：读数 / dpad / 棋盘容器", r'/\* --- 幕 2：游玩'),
    ("CSS：结果幕",                r'/\* --- 幕 3：结果'),
    ("HTML：三幕结构",             r'^\s*</style>'),
    ("JS：常量与数据",             r'^\s*<script>'),
    ("JS：像素美术",               r'function hashNoise'),
    ("JS：canvas 接线",            r'function drawLawn'),
    ("JS：场景机（含打断安全）",     r'--- 幕切换'),
    ("JS：游戏流程",               r'--- 流程'),
    ("JS：输入（键盘/指针/dpad）",  r'--- 输入'),
    ("JS：接线 init",              r'function init'),
]


def read(rel):
    return (ROOT / rel).read_text()


def escape(text):
    # 内联脚本里出现 </script 会把标签提前闭合；样式同理
    return text.replace("</script", r"<\/script").replace("</style", r"<\/style")


def inline(html, parts):
    html = LINK.sub(lambda m: parts.get(m.group(1), m.group(0)), html)
    html = SCRIPT.sub(lambda m: parts.get(m.group(1), m.group(0)), html)
    for name in INLINE:
        assert f'"./{name}' not in html, f"{name} 没有被内联进去"
    return re.sub(r'\?v=\d+', '', html)


# --- 可读版（默认）--------------------------------------------------------

def sections(lines, offset):
    """按 MARKS 切段，返回 [(名字, 起行, 止行, 字符数)]，行号已加上表头占的行数。"""
    starts = []
    for name, pat in MARKS:
        if pat is None:
            starts.append((name, 1))
            continue
        hit = next((i for i, l in enumerate(lines, 1) if re.search(pat, l)), None)
        assert hit, f"地图标记找不到：{name} —— 源文件里的分节注释被改过？"
        starts.append((name, hit))
    assert [s for _, s in starts] == sorted(s for _, s in starts), "地图标记顺序乱了"

    out = []
    for (name, a), nxt in zip(starts, [s for _, s in starts[1:]] + [len(lines) + 1]):
        chars = sum(len(l) + 1 for l in lines[a - 1:nxt - 1])
        out.append((name, a + offset, nxt - 1 + offset, chars))
    return out


def render_map(rows, width=34):
    # 中日韩字符占两列，len() 按不了齐 —— 按显示宽度补空格
    def pad(s):
        w = sum(2 if '\u2e80' <= c <= '\uffef' else 1 for c in s)
        return s + ' ' * max(1, width - w)
    return [f"     {pad(name)}L{a}-L{b}  {chars:,} 字符" for name, a, b, chars in rows]


def build_readable():
    html = inline(read("index.html"), {
        "styles.css": f"<style>\n{escape(read('styles.css').rstrip())}\n    </style>\n",
        "app.js": f"<script>\n{escape(read('app.js').rstrip())}\n    </script>\n",
    })
    body = html.split('\n')
    assert body[0].lower().startswith('<!doctype'), "首行必须是 doctype，否则浏览器进怪异模式"

    # 表头行数是确定的，先按它算偏移，再把真实行号填进去（数字宽度不影响行数）
    head = (["<!-- 这份文件由 build.py 从 index.html + styles.css + app.js 原样合并而成。",
             "     整份读一次约 8,500 token；按下面的行区间取用需要的那一段即可。", ""]
            + render_map(sections(body[1:], 0)) + ["-->"])
    offset = len(head)
    rows = sections(body[1:], offset + 1)   # +1：doctype 那一行
    head = (head[:3] + render_map(rows) + ["-->"])
    assert len(head) == offset, "表头行数算漂了，地图行号会整体错位"

    return '\n'.join([body[0]] + head + body[1:]), rows


# --- 压缩版（--min）-------------------------------------------------------

def short_names(n):
    letters = string.ascii_lowercase
    return [letters[i] if i < 26 else letters[i // 26 - 1] + letters[i % 26] for i in range(n)]


def rename_map(css, base_css):
    """只改 styles.css 自己定义的类。base.css 的 .min0 / .no-pan / .sr-only 不动 ——
    那份文件不内联，改了 HTML 这边的名字就对不上它了。"""
    theirs = set(re.findall(r'\.([a-z][\w-]*)', base_css))
    mine = sorted({c for c in re.findall(r'\.([a-z][\w-]*)', CSS_COMMENT.sub('', css))
                   if c not in theirs})
    return dict(zip(mine, short_names(len(mine))))


def rename_class_list(value, table):
    return ' '.join(table.get(c, c) for c in value.split())


def rename_js(js, table):
    """只在字符串字面量里改：整串就是类名的、选择器里的 .name、模板串里的 class="…"。"""
    def fix(m):
        quote, inner = m.group(0)[0], m.group(0)[1:-1]
        if inner in table:
            inner = table[inner]
        else:
            inner = CLASS_ATTR.sub(lambda k: f'class="{rename_class_list(k.group(1), table)}"', inner)
            inner = re.sub(r'\.([a-z][\w-]*)',
                           lambda k: '.' + table.get(k.group(1), k.group(1)), inner)
        return quote + inner + quote
    return JS_STRING.sub(fix, js)


def minify_css(css):
    css = CSS_COMMENT.sub('', css)
    css = re.sub(r'\s+', ' ', css)
    css = re.sub(r'\s*([{}:;,>])\s*', r'\1', css)
    return css.replace(';}', '}').strip()


def minify_js(js):
    run = subprocess.run(["terser", "-c", "passes=3,unsafe=true", "-m", "--toplevel"],
                         input=js, capture_output=True, text=True)
    # 压缩失败就退出。静默回退会悄悄产出一个没压过的文件，下次才发现
    assert run.returncode == 0 and run.stdout, f"terser 失败：{run.stderr.strip()[:400]}"
    return run.stdout.strip()


def minify_html(html):
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)
    # 换行连同缩进折成一个空格；同一行里的空格不碰（比如 <span> 格</span> 那个前导空格）
    html = re.sub(r'\s*\n\s*', ' ', html)
    return re.sub(r'> <', '><', html).strip()


def build_min():
    html, css, js = read("index.html"), read("styles.css"), read("app.js")
    table = rename_map(css, read("assets/base.css"))
    html = CLASS_ATTR.sub(lambda m: f'class="{rename_class_list(m.group(1), table)}"', html)
    css = re.sub(r'\.([a-z][\w-]*)', lambda m: '.' + table.get(m.group(1), m.group(1)), css)
    js = rename_js(js, table)

    for old in table:
        assert not re.search(rf'\.{re.escape(old)}\b', css), f"CSS 里还留着 .{old}"
        assert all(old not in v.split() for v in CLASS_ATTR.findall(html)), f"HTML 里还留着 {old}"
        for lit in JS_STRING.findall(js):
            inner = lit[1:-1]
            assert inner != old and not re.search(rf'\.{re.escape(old)}\b', inner), \
                f"JS 里还留着类名 {old}"

    return minify_html(inline(html, {
        "styles.css": f"<style>\n{escape(minify_css(css))}</style>\n",
        "app.js": f"<script>\n{escape(minify_js(js))}</script>\n",
    }))


if __name__ == "__main__":
    if "--min" in sys.argv:
        out, rows = ROOT / "lawn-path.min.html", None
        out.write_text(build_min())
    else:
        out = ROOT / "lawn-path.html"
        text, rows = build_readable()
        out.write_text(text)
        (ROOT / "MAP.md").write_text(
            "# lawn-path.html 行号地图\n\n"
            "完整成品，按需按段读，不必整份读进上下文。\n\n"
            "| 段落 | 行区间 | 字符 |\n|---|---|---:|\n"
            + '\n'.join(f"| {n} | L{a}-L{b} | {c:,} |" for n, a, b, c in rows) + '\n')
        print(f"MAP.md  {len((ROOT / 'MAP.md').read_text()):,} 字符")
    print(f"{out}  {len(out.read_text()):,} 字符 / {out.stat().st_size:,} 字节")
