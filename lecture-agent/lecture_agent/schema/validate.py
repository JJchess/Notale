"""LectureDoc 语义校验（L0 kernel，纯函数、不做 I/O）。

移植自旧 `demo/schema/validate.mjs` 中 pydantic 无法声明式表达的部分：
受限表达式白名单、inline-md（禁原始 HTML / $ 配对）、freeform/widget HTML 安全、
反 AI-slop 美学 lint、跨场景规则（scene id 去重 / kind↔block / latex 禁 $）。

结构/类型/枚举/长度由 `document.py` 的 pydantic 负责；这里只补语义。
返回 {errors, warnings, freeform_uses}，不打印、不退出——供 agent 自修循环读错误→改→重跑。

已知差异：widget 内嵌 <script> 的 JS 语法检查（旧代码用 `new Function`）此处不做——
Python 无 JS 解析器；留给 `adapters/render`（真机渲染）作权威第二道关。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from pydantic import TypeAdapter, ValidationError

from .document import Block

_block_adapter: TypeAdapter[Any] = TypeAdapter(Block)


def _structural(block: Any, path: str, r: Result) -> None:
    """用 pydantic 判别联合做单块结构校验，把错误定位成 path.field 交给自修循环。"""
    if not isinstance(block, dict):
        r.err(path, "block 应为对象")
        return
    try:
        _block_adapter.validate_python(block)
    except ValidationError as e:
        for err in e.errors():
            loc = ".".join(str(x) for x in err["loc"] if not str(x).startswith("literal"))
            where = f"{path}.{loc}" if loc else path
            r.err(where, err["msg"])


_MATH_IDS = frozenset(
    [
        "sin",
        "cos",
        "tan",
        "exp",
        "log",
        "sqrt",
        "abs",
        "pow",
        "min",
        "max",
        "floor",
        "round",
        "PI",
        "E",
    ]
)
_EXPR_CHARS = re.compile(r"^[\w\s+\-*/%(),.<>=!?:&|]*$")
_IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_INLINE_HTML = re.compile(r"<[a-zA-Z/][^>]*>")
# 裸 LaTeX = 没有 $…$ 包起来的 LaTeX 记号。渲染器只对 $…$ 内的内容调 KaTeX，
# 分隔符外的一律按散文 escape 输出，于是 \texttt{"ababc"}、ρ_{密度} 会原样印在幻灯片上。
# 旧检查只数 $ 的奇偶，零个 $ 即偶数即通过，这类缺陷完全无人拦截。
_MATH_SPAN = re.compile(r"\$[^$]*\$")
_CODE_SPAN = re.compile(r"`[^`]*`")
_WRONG_DELIM = re.compile(r"\\[(\[\])]")
_BARE_TEX_CMD = re.compile(r"\\[a-zA-Z]+\s*\{")
_BARE_TEX_MACRO = re.compile(
    r"\\(pi|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|omega|Delta|Sigma|Omega"
    r"|sum|prod|int|lim|max|min|log|ln|exp|sin|cos|tan|sqrt|frac|infty|partial|nabla"
    r"|cdot|times|div|pm|leq?|geq?|neq|approx|equiv|sim|in|notin|subset|supset|cup|cap"
    r"|emptyset|forall|exists|land|lor|neg|to|rightarrow|leftarrow|Rightarrow|Leftarrow"
    r"|mapsto|langle|rangle|lfloor|rfloor|lceil|rceil|quad|qquad|text|texttt|textbf"
    r"|textit|mathrm|mathbb|mathcal|mathbf|operatorname)\b"
)
_BARE_SCRIPT = re.compile(r"[_^]\{[^}]*\}")
_DANGEROUS_HTML = re.compile(
    r"<script\b|<style\b|<iframe\b|<object\b|<embed\b|\son\w+\s*=|javascript:", re.I
)
_REMOTE_IMG = re.compile(r"""<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?//""", re.I)
_REMOTE = re.compile(r"^\s*(https?:)?//", re.I)
_FF_COLORISH = frozenset(
    [
        "color",
        "background",
        "background-color",
        "border",
        "border-color",
        "outline",
        "fill",
        "stroke",
        "font-family",
        "box-shadow",
        "text-shadow",
    ]
)
_STYLE_ATTR = re.compile(r"""style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'""", re.I)


@dataclass
class Result:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    freeform_uses: list[dict[str, str]] = field(default_factory=list)

    def err(self, path: str, msg: str) -> None:
        self.errors.append(f"{path} — {msg}")

    def warn(self, path: str, msg: str) -> None:
        self.warnings.append(f"{path} — {msg}")


# ------------------------------------------------------------------ 受限表达式 / inline


def _check_expr(expr: Any, var_names: list[str], path: str, r: Result) -> None:
    if not isinstance(expr, str):
        r.err(path, "表达式应为字符串")
        return
    if not _EXPR_CHARS.match(expr):
        r.err(path, f"表达式含非法字符: {expr}")
        return
    allowed = set(var_names) | _MATH_IDS
    for ident in _IDENT.findall(expr):
        if ident not in allowed:
            r.err(
                path,
                f'表达式标识符不在白名单: "{ident}"（允许: {", ".join(var_names)} + 数学函数）',
            )


def _check_inline(s: Any, path: str, r: Result) -> None:
    """inline-md 字段的语义闸。

    与 viewer/schema/validate.mjs::checkInline 保持一致——两边同时改。
    所有检查只看 ``$…$`` 与 ```code``` 之外的部分：里面本来就该是 LaTeX / 原样代码，
    渲染器的 inlineMd 会先把它们摘出来单独处理（讲 XML 的课件写 `<catalog>` 完全合法）。
    """
    if not isinstance(s, str):
        return
    if s.count("$") % 2 != 0:
        r.err(path, "行内公式 $ 未配对")
        return
    outside = _CODE_SPAN.sub(" ", _MATH_SPAN.sub(" ", s))
    if _INLINE_HTML.search(outside):
        r.err(path, "inlineMd 禁止原始 HTML 标签（用 **b** / *em* / `code` / $latex$）")
    if _WRONG_DELIM.search(outside):
        r.err(path, r"行内公式请用 $…$ 分隔符，不要用 \( \) / \[ \]（渲染器只识别 $…$）")
    elif _BARE_TEX_CMD.search(outside) or _BARE_TEX_MACRO.search(outside):
        r.err(path, "出现未被 $…$ 包裹的裸 LaTeX 命令 —— 会原样印在页面上，请补齐 $…$ 或改写成纯文本")
    elif _BARE_SCRIPT.search(outside):
        r.err(path, "出现未被 $…$ 包裹的上/下标 _{…} / ^{…} —— 会原样印在页面上，请补齐 $…$ 或改用纯文本")


# ------------------------------------------------------------------ freeform / widget


def _check_freeform_html(html: str, path: str, r: Result) -> None:
    if _DANGEROUS_HTML.search(html):
        r.err(path, "html 含危险标签/属性（script/style/iframe/object/embed/内联事件/javascript:）")
    if _REMOTE_IMG.search(html):
        r.err(path, "img src 必须是本地路径（vendor/ 或 assets/ 或 data:image/），禁远程 URL")
    for m in _STYLE_ATTR.finditer(html):
        decls = m.group(1) or m.group(2) or ""
        for d in decls.split(";"):
            i = d.find(":")
            if i < 0:
                continue
            prop, val = d[:i].strip().lower(), d[i + 1 :].strip()
            if not prop or not val:
                continue
            if re.search(r"url\(", val, re.I):
                r.err(path, f"style 里禁用 url()（外链/追踪风险）: {prop}")
                continue
            if (
                prop in _FF_COLORISH
                and not re.search(r"var\(\s*--", val)
                and not re.match(
                    r"^(currentcolor|transparent|none|inherit|initial|unset)$", val, re.I
                )
            ):
                r.err(
                    path,
                    f'style 的 {prop} 用了裸色值/裸字体（"{val}"）——只接受 var(--token)',
                )


def _aesthetic_lint(html: str, path: str, r: Result, *, require_motion: bool) -> None:
    low = html.lower()
    if require_motion and not re.search(
        r"(transition|animation|@keyframes|requestanimationframe|setinterval)", low
    ):
        r.warn(path, "交互组件缺少动效——控件应有 hover/active 过渡、状态变化应可见地动起来")
    if re.search(r"<h1[\s>]", low):
        r.warn(path, "含 <h1> 自我介绍标题——页面已有标题，组件内不必再自报家门")
    if re.search(r"(提示\s*[:：]|小贴士\s*[:：]|tips?\s*:)", html, re.I):
        r.warn(path, '含"提示:/Tip:"说明胶囊——用设计表达可用性，别贴说明贴纸')
    if "prefers-color-scheme" in low:
        r.warn(path, "用了 @media (prefers-color-scheme)——应走 [data-theme] / 读 --token")
    if "#4fc3f7" in low:
        r.warn(path, "用了样例桩色 #4fc3f7——请从主题 token 取色")


def _check_widget_html(html: Any, path: str, r: Result, spec: Any = None) -> None:
    if not isinstance(html, str) or len(html) < 40:
        r.err(path, "片段过短或缺失（应是自包含 HTML 片段）")
        return
    low = html.lower()
    if re.search(r"<!doctype|<html[\s>]|<head[\s>]|<body[\s>]", low):
        r.err(path, "widget.html 必须是**片段**，不要写 <!doctype>/<html>/<head>/<body>")
    if not re.search(r"(<div|<svg|<canvas|<style)", low):
        r.err(path, "widget.html 至少应含 <div>/<svg>/<canvas>/<style> 之一")
    if re.search(
        r"<script\b[^>]*\bsrc\s*=|<link\b|\bfetch\s*\(|\bxmlhttprequest\b|\bwebsocket\s*\(|"
        r"\bimport\s*\(|(?:^|[;{}\n])\s*import\s+[^;]+\bfrom\b|(?:src|href)\s*=\s*[\"']https?://",
        html,
        re.I,
    ):
        r.err(path, "widget 含外部依赖/网络调用；null-origin iframe 必须使用零依赖 vanilla HTML/CSS/JS")
    hard_colors = re.findall(
        r"(?:color|background(?:-color)?|fill|stroke)\s*:\s*#[0-9a-fA-F]{3,8}\b|"
        r"[\"']#[0-9a-fA-F]{3,8}[\"']",
        html,
        re.I,
    )
    if hard_colors:
        r.err(path, "widget 含硬编码颜色；必须读取 --ink/--accent/--line/--bg 等主题 token")
    if isinstance(spec, dict):
        math_model = spec.get("math_model")
        formula = math_model.get("formula") if isinstance(math_model, dict) else None
        if formula and str(formula).strip().lower() != "none" and "console.assert" not in low:
            r.err(path, "数学 widget 有 math_model 但缺 console.assert 验证例；坐标/方向错误无法自动暴露")
    _aesthetic_lint(html, path, r, require_motion=True)


def _acyclic_without_dashed(edges: list[Any], ids: set[str]) -> bool:
    """去掉 dashed 边后是否无环。flowchart 允许回边，但回边必须显式标虚线。"""
    deg = dict.fromkeys(ids, 0)
    adj: dict[str, list[str]] = {k: [] for k in ids}
    for e in edges:
        if not isinstance(e, dict) or e.get("style") == "dashed":
            continue
        src, dst = e.get("from"), e.get("to")
        if src not in ids or dst not in ids or src == dst:
            continue
        adj[src].append(dst)
        deg[dst] += 1
    queue = [k for k, d in deg.items() if d == 0]
    seen = 0
    while queue:
        cur = queue.pop()
        seen += 1
        for nxt in adj[cur]:
            deg[nxt] -= 1
            if deg[nxt] == 0:
                queue.append(nxt)
    return seen == len(ids)


def _check_graph(b: dict[str, Any], path: str, r: Result) -> None:
    """graph 块的图论完整性。

    结构/类型由 pydantic 管，这里补它表达不了的**关系**约束：边指向不存在的节点、
    孤立节点、tree 的单父/单根、环。不拦住的话渲染出来就是断线与乱穿。
    与 viewer/schema/validate.mjs::checkGraph 保持一致——两边同时改。
    """
    nodes = b.get("nodes") or []
    edges = b.get("edges") or []
    ids: set[str] = set()
    for i, n in enumerate(nodes):
        if not isinstance(n, dict) or not isinstance(n.get("id"), str):
            continue
        if n["id"] in ids:
            r.err(f"{path}.nodes[{i}].id", f"节点 id 重复: {n['id']}")
        ids.add(n["id"])
        _check_inline(n.get("title"), f"{path}.nodes[{i}].title", r)
        if n.get("sub"):
            _check_inline(n["sub"], f"{path}.nodes[{i}].sub", r)
    if len(ids) < 2:
        return

    indeg = dict.fromkeys(ids, 0)
    adj: dict[str, list[str]] = {k: [] for k in ids}
    touched: set[str] = set()
    for i, e in enumerate(edges):
        if not isinstance(e, dict):
            continue
        src, dst = e.get("from"), e.get("to")
        if src not in ids:
            r.err(f"{path}.edges[{i}].from", f'指向不存在的节点 "{src}"（会渲染成断线）')
        if dst not in ids:
            r.err(f"{path}.edges[{i}].to", f'指向不存在的节点 "{dst}"（会渲染成断线）')
        if src == dst:
            r.err(f"{path}.edges[{i}]", "自环边（from===to）无法渲染")
        # 端点合法就先记 touched，免得一条断边把两头都连带报成「孤立节点」
        if src in ids:
            touched.add(src)
        if dst in ids:
            touched.add(dst)
        if src not in ids or dst not in ids or src == dst:
            continue
        adj[src].append(dst)
        indeg[dst] += 1

    orphans = sorted(ids - touched)
    if orphans:
        r.err(f"{path}.nodes", "有节点不连任何边（会孤零零飘着）: " + ", ".join(orphans))

    gtype = b.get("graphType")
    if gtype == "tree":
        multi = sorted(k for k, d in indeg.items() if d > 1)
        if multi:
            r.err(
                f"{path}.edges",
                "tree 每个节点至多一个父，以下有多个: " + ", ".join(multi) + '（多父请用 graphType:"dag"）',
            )
        roots = sorted(k for k, d in indeg.items() if d == 0)
        if len(roots) != 1:
            r.err(f"{path}.edges", f"tree 应恰好一个根（入度 0），实得 {len(roots)} 个: {', '.join(roots) or '无'}")

    # 环检测（Kahn）
    deg = dict(indeg)
    queue = [k for k, d in deg.items() if d == 0]
    seen = 0
    while queue:
        cur = queue.pop()
        seen += 1
        for nxt in adj[cur]:
            deg[nxt] -= 1
            if deg[nxt] == 0:
                queue.append(nxt)
    if seen < len(ids):
        if gtype != "flowchart":
            r.err(
                f"{path}.edges",
                f"存在环（{len(ids) - seen} 个节点在环上），tree/dag 不允许；"
                '确实要回边请用 graphType:"flowchart" 且把回边标 style:"dashed"',
            )
        elif not _acyclic_without_dashed(edges, ids):
            # 判据：把 dashed 边拿掉后必须无环——即「闭合每个环的那条边都已标虚线」。
            # 别用「目标能绕回源头」当回边判据：环上**每**条边都满足它，会把主流程边一起冤枉。
            r.err(
                f"{path}.edges",
                'flowchart 存在未标虚线的回边：请把闭合循环的那条边标 style:"dashed"，'
                "否则读者分不清主流程与回流",
            )

    if b.get("caption"):
        _check_inline(b["caption"], f"{path}.caption", r)


# ------------------------------------------------------------------ block 语义


def _check_block(b: dict[str, Any], path: str, r: Result, state: dict[str, Any]) -> None:
    if not isinstance(b, dict):
        return
    t = b.get("type")
    # inline-md 字段
    if t == "statement":
        _check_inline(b.get("statement"), f"{path}.statement", r)
    elif t == "pullquote":
        _check_inline(b.get("text"), f"{path}.text", r)
        if b.get("cite") is not None:
            _check_inline(b["cite"], f"{path}.cite", r)
    elif t == "callout":
        _check_inline(b.get("text"), f"{path}.text", r)
        _check_inline(b.get("label"), f"{path}.label", r)
    elif t == "hero":
        if b.get("sub"):
            _check_inline(b["sub"], f"{path}.sub", r)
        if b.get("tag"):
            _check_inline(b["tag"], f"{path}.tag", r)
        for i, line in enumerate(b.get("title") or []):
            _check_inline(line, f"{path}.title[{i}]", r)
        if isinstance(b.get("image"), str) and _REMOTE.match(b["image"]):
            r.err(f"{path}.image", "只能是本地相对路径或 data:，禁远程 URL（守离线红线）")
    elif t == "video":
        for k in ("src", "poster", "captions"):
            v = b.get(k)
            if isinstance(v, str) and _REMOTE.match(v):
                r.err(f"{path}.{k}", "只能是本地相对路径或 data:，禁远程 URL（守离线红线）")
        if b.get("caption"):
            _check_inline(b["caption"], f"{path}.caption", r)
    elif t == "list":
        for i, it in enumerate(b.get("items", [])):
            if isinstance(it, dict):
                _check_inline(it.get("text"), f"{path}.items[{i}].text", r)
                if it.get("lead"):
                    _check_inline(it["lead"], f"{path}.items[{i}].lead", r)
        if len(b.get("items", [])) > 8:
            r.warn(f"{path}.items", f"条目数 {len(b['items'])} 偏多（硬顶 12，建议 ≤8）")
    elif t == "agenda":
        for i, row in enumerate(b.get("rows", [])):
            if isinstance(row, dict):
                _check_inline(row.get("text"), f"{path}.rows[{i}].text", r)
                _check_inline(row.get("label"), f"{path}.rows[{i}].label", r)
    elif t == "timeline":
        for i, e in enumerate(b.get("events", [])):
            if isinstance(e, dict):
                _check_inline(e.get("title"), f"{path}.events[{i}].title", r)
                _check_inline(e.get("time"), f"{path}.events[{i}].time", r)
                if e.get("desc"):
                    _check_inline(e["desc"], f"{path}.events[{i}].desc", r)
    elif t == "formula":
        if isinstance(b.get("latex"), str) and "$" in b["latex"]:
            r.err(
                f"{path}.latex", "latex 是纯 LaTeX 源码，不要用 $ 或 $$ 包裹（$ 会被 KaTeX 标红）"
            )
        # caption 是散文字段，走 inlineMd —— 里面的数学必须自带 $…$，否则原样印出
        if b.get("caption"):
            _check_inline(b["caption"], f"{path}.caption", r)
    elif t == "code":
        # source 是原样代码（textContent，不过 inlineMd）；filename/caption 是散文
        for k in ("filename", "caption"):
            if b.get(k):
                _check_inline(b[k], f"{path}.{k}", r)
    elif t == "chart":
        if b.get("caption"):
            _check_inline(b["caption"], f"{path}.caption", r)
    elif t == "table":
        for i, h in enumerate(b.get("head") or []):
            _check_inline(h, f"{path}.head[{i}]", r)
        for i, row in enumerate(b.get("rows") or []):
            if isinstance(row, list):
                for j, c in enumerate(row):
                    _check_inline(c.get("text") if isinstance(c, dict) else c, f"{path}.rows[{i}][{j}]", r)
    elif t in ("flow", "diagram"):
        for i, n in enumerate(b.get("nodes") or []):
            if isinstance(n, dict):
                _check_inline(n.get("title"), f"{path}.nodes[{i}].title", r)
                if n.get("sub"):
                    _check_inline(n["sub"], f"{path}.nodes[{i}].sub", r)
    elif t == "graph":
        _check_graph(b, path, r)
    elif t == "quiz":
        for i, c in enumerate(b.get("choices") or []):
            if isinstance(c, dict):
                _check_inline(c.get("text"), f"{path}.choices[{i}].text", r)
        if b.get("explain"):
            _check_inline(b["explain"], f"{path}.explain", r)
    elif t == "freeform":
        if isinstance(b.get("html"), str):
            _check_freeform_html(b["html"], f"{path}.html", r)
            _aesthetic_lint(b["html"], f"{path}.html", r, require_motion=False)
        if isinstance(b.get("rationale"), str):
            state["freeform_uses"].append({"path": path, "rationale": b["rationale"]})
    elif t == "runnable":
        env = b.get("env")
        if isinstance(env, dict) and env.get("kind") == "custom":
            if not isinstance(env.get("pythonPreamble"), str) and not isinstance(
                env.get("jsPreamble"), str
            ):
                r.err(f"{path}.env", "custom 环境需 pythonPreamble 或 jsPreamble 至少一个")
    elif t == "sim":
        _check_sim(b, path, r)
    elif t == "compare":
        for side in ("left", "right"):
            s = b.get(side)
            if isinstance(s, dict):
                if s.get("caption"):
                    _check_inline(s["caption"], f"{path}.{side}.caption", r)
                if isinstance(s.get("block"), dict):
                    _check_block(s["block"], f"{path}.{side}.block", r, state)
    elif t == "grid":
        for i, it in enumerate(b.get("items", [])):
            if isinstance(it, dict) and isinstance(it.get("block"), dict):
                _check_block(it["block"], f"{path}.items[{i}].block", r, state)


def _check_sim(b: dict[str, Any], path: str, r: Result) -> None:
    param_names: list[str] = [
        str(p["name"]) for p in b.get("params", []) if isinstance(p, dict) and p.get("name")
    ]
    engine = b.get("engine")
    if engine == "widget":
        if isinstance(b.get("html"), str):
            _check_widget_html(b["html"], f"{path}.html", r, b.get("spec"))
    elif engine == "dynamics1d":
        m = b.get("model")
        if isinstance(m, dict):
            const_names = list((m.get("consts") or {}).keys())
            for ck, cv in (m.get("consts") or {}).items():
                if not isinstance(cv, (int, float)):
                    r.err(
                        f"{path}.model.consts.{ck}",
                        "consts 值必须是数字常量（表达式会算出 NaN）；多状态系统改用 custom 引擎",
                    )
            if isinstance(m.get("update"), str):
                _check_expr(
                    m["update"],
                    [m.get("stateVar", ""), *param_names, *const_names, "xi"],
                    f"{path}.model.update",
                    r,
                )
        for i, reg in enumerate(b.get("regimes", []) or []):
            if isinstance(reg, dict) and isinstance(reg.get("when"), str):
                _check_expr(reg["when"], param_names, f"{path}.regimes[{i}].when", r)
    elif engine == "searchCompare":
        m = b.get("model")
        if isinstance(m, dict) and isinstance(m.get("objective"), str):
            _check_expr(m["objective"], ["x"], f"{path}.model.objective", r)


# ------------------------------------------------------------------ scene / doc

_KIND_REQUIRES = {
    "statement": ("statement", "statement 页应含 statement block"),
    "quiz": ("quiz", "quiz 页应含 quiz block"),
    "section": ("statement", "section 分隔页应含一个 statement block（章节一句话主旨）"),
}


def _check_scene(
    s: dict[str, Any], path: str, r: Result, state: dict[str, Any], seen_ids: set[str]
) -> None:
    sid = s.get("id")
    if isinstance(sid, str):
        if sid in seen_ids:
            r.err(f"{path}.id", f"scene id 重复: {sid}")
        seen_ids.add(sid)
    if s.get("headline"):
        _check_inline(s["headline"], f"{path}.headline", r)
    if s.get("lead"):
        _check_inline(s["lead"], f"{path}.lead", r)
    kind = s.get("kind")
    blocks = s.get("blocks") or []
    if kind == "hero" and (len(blocks) != 1 or blocks[0].get("type") != "hero"):
        r.err(f"{path}.blocks", "hero 页应恰好含一个 hero block")
    if kind in _KIND_REQUIRES:
        need_type, msg = _KIND_REQUIRES[kind]
        if not any(isinstance(b, dict) and b.get("type") == need_type for b in blocks):
            r.err(f"{path}.blocks", msg)
    _check_layout(s, path, r)
    for i, b in enumerate(blocks):
        _structural(b, f"{path}.blocks[{i}]", r)  # 结构（pydantic 判别联合）
        _check_block(b, f"{path}.blocks[{i}]", r, state)  # 语义


def _check_layout(s: dict[str, Any], path: str, r: Result) -> None:
    """版式软校验：失效 block id 引用只 warn（渲染器回落默认竖排，绝不丢内容）。"""
    layout = s.get("layout")
    if not isinstance(layout, dict):
        return
    p = f"{path}.layout"
    ids = {b.get("id") for b in (s.get("blocks") or []) if isinstance(b, dict) and b.get("id")}

    def chk(bid: Any, where: str) -> None:
        if bid not in ids:
            r.warn(where, f"引用了不存在的 block id: {bid}（渲染器将回落）")

    for i, st in enumerate(layout.get("steps", []) or []):
        if isinstance(st, dict):
            for bid in st.get("blockIds", []) or []:
                chk(bid, f"{p}.steps[{i}].blockIds")
    for bid in layout.get("anchor", []) or []:
        chk(bid, f"{p}.anchor")
    for i, a in enumerate(layout.get("areas", []) or []):
        if isinstance(a, dict):
            for bid in a.get("blockIds", []) or []:
                chk(bid, f"{p}.areas[{i}].blockIds")


def validate_doc(doc: dict[str, Any]) -> Result:
    """校验整份 LectureDoc 的语义层（结构层用 document.LectureDoc 先过 pydantic）。"""
    r = Result()
    state: dict[str, Any] = {"freeform_uses": r.freeform_uses}
    if doc.get("tutor"):
        for i, k in enumerate(doc["tutor"].get("kb", []) or []):
            if isinstance(k, dict):
                try:
                    re.compile(k.get("pattern", ""), re.I if "i" in (k.get("flags") or "") else 0)
                except re.error as e:
                    r.err(f"$.tutor.kb[{i}].pattern", f"非法正则: {e}")
                _check_inline(k.get("answer"), f"$.tutor.kb[{i}].answer", r)
    seen: set[str] = set()
    for i, s in enumerate(doc.get("scenes", []) or []):
        _check_scene(s, f"$.scenes[{i}]", r, state, seen)
    return r


def validate_block(
    block: dict[str, Any], expect_type: str | None = None, path: str = "$block"
) -> Result:
    """校验单个 block（结构 + 语义），供 generation 逐块自修循环用。"""
    r = Result()
    if expect_type and isinstance(block, dict) and block.get("type") != expect_type:
        r.err(f"{path}.type", f"期望 {expect_type}，实际 {block.get('type')}")
    _structural(block, path, r)
    _check_block(block, path, r, {"freeform_uses": r.freeform_uses})
    return r
