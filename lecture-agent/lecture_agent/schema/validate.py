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
    if not isinstance(s, str):
        return
    if _INLINE_HTML.search(s):
        r.err(path, "inlineMd 禁止原始 HTML 标签（用 **b** / *em* / `code` / $latex$）")
    if s.count("$") % 2 != 0:
        r.err(path, "行内公式 $ 未配对")


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


def _check_widget_html(html: Any, path: str, r: Result) -> None:
    if not isinstance(html, str) or len(html) < 40:
        r.err(path, "片段过短或缺失（应是自包含 HTML 片段）")
        return
    low = html.lower()
    if re.search(r"<!doctype|<html[\s>]|<head[\s>]|<body[\s>]", low):
        r.err(path, "widget.html 必须是**片段**，不要写 <!doctype>/<html>/<head>/<body>")
    if not re.search(r"(<div|<svg|<canvas|<style)", low):
        r.err(path, "widget.html 至少应含 <div>/<svg>/<canvas>/<style> 之一")
    _aesthetic_lint(html, path, r, require_motion=True)


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
    elif t == "hero":
        if b.get("sub"):
            _check_inline(b["sub"], f"{path}.sub", r)
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
        if len(b.get("items", [])) > 8:
            r.warn(f"{path}.items", f"条目数 {len(b['items'])} 偏多（硬顶 12，建议 ≤8）")
    elif t == "agenda":
        for i, row in enumerate(b.get("rows", [])):
            if isinstance(row, dict):
                _check_inline(row.get("text"), f"{path}.rows[{i}].text", r)
    elif t == "timeline":
        for i, e in enumerate(b.get("events", [])):
            if isinstance(e, dict):
                _check_inline(e.get("title"), f"{path}.events[{i}].title", r)
                if e.get("desc"):
                    _check_inline(e["desc"], f"{path}.events[{i}].desc", r)
    elif t == "formula":
        if isinstance(b.get("latex"), str) and "$" in b["latex"]:
            r.err(
                f"{path}.latex", "latex 是纯 LaTeX 源码，不要用 $ 或 $$ 包裹（$ 会被 KaTeX 标红）"
            )
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
            if isinstance(s, dict) and isinstance(s.get("block"), dict):
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
            _check_widget_html(b["html"], f"{path}.html", r)
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
