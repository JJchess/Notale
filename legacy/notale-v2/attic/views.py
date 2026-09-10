"""投影:从 Deck 里切出某一次模型调用能看到的那一块。

模型调用只经由这里拿输入。这是刻意的:

- 「subagent 不许读别的页面」在 notale 那一版是写在指令里的一句话,靠模型自觉。
  实测发现它做不到 —— 加了检测器才发现真的有跨页读取。这里改成 build_view 的
  返回值里根本没有别页的任何东西,做不到不是靠自觉,是没有那条路径。
- 每个 view 的 prefix 段逐字节相同,cache 才命中,brief 才不用逐字重写。
  prefix 里绝不能出现页数、页序、或任何会随规划变动的量。
"""

from __future__ import annotations

from .schema import Deck, Finding, PagePlan, Term


class View:
    """一次调用的输入。prefix 和 body 分开存,前者是全套共享、逐字节相同的那段。"""

    def __init__(self, prefix: str, body: str):
        self.prefix = prefix
        self.body = body

    def text(self) -> str:
        return self.prefix + "\n\n" + self.body

    def __len__(self) -> int:
        return len(self.text())


# ---------------------------------------------------------------- prefix


def _prefix(deck: Deck) -> str:
    """所有构建调用共享的那一段。只依赖 Invariant,不依赖任何页。"""
    inv = deck.invariant
    s = inv.style
    L: list[str] = []

    L.append(f"QUERY: {inv.query}")
    L.append(f"这套讲义要撑起 {inv.minutes} 分钟的一堂课,读者是{inv.audience}。")
    L.append("")

    L.append("## 画布")
    L.append(
        f"逻辑尺寸 {inv.canvas.w} × {inv.canvas.h},所有页完全一致,铺满显示、不出现滚动条。"
    )
    L.append(
        f"铺满时会被整体缩放,1366 宽的屏上系数约 0.85。字号下限:"
        f"刻度类不小于 {inv.floor.tick:g}px,标签图注类不小于 {inv.floor.label:g}px,"
        f"正文不小于 {inv.floor.body:g}px,折行文本行高不小于 {inv.floor.line_height:g} 倍。"
    )
    L.append("装不下就说装不下,不许压字号、压行高、压间距。")
    L.append("")

    L.append("## 视觉(全套共用,不要另起一套)")
    L.append("配色:" + "、".join(f"{k} {v}" for k, v in s.palette.items()))
    L.append(f"标题字体 {s.display_font};正文字体 {s.body_font}" + (f";等宽 {s.mono_font}" if s.mono_font else ""))
    L.append("字阶:" + "、".join(f"{k} {v:g}px" for k, v in s.type_scale.items()))
    L.append("间距阶梯:" + "、".join(str(x) for x in s.spacing))
    L.append(f"这套讲义的标志性元素:{s.signature}")
    L.append("")

    L.append("## 底盘")
    L.append(
        f"`{inv.chassis.css_path}` 和 `{inv.chassis.js_path}` 里只有与主题无关的机制:"
        "固定画布缩放、canvas 在高分屏下的适配、指针坐标换算、可访问性基线。"
        "没有任何配色字体字号。用不用、改不改,自己判断。"
    )
    L.append("")

    L.append("## 可用的库(已就位,不需要下载或检查)")
    for lib in inv.libs:
        after = f",要在 {' / '.join(lib.after)} 之后引" if lib.after else ""
        caveat = f" ⚠ {lib.caveat}" if lib.caveat else ""
        L.append(f"- {lib.use_for} → `{lib.file}` (`{lib.globals}`, {lib.version}){after}{caveat}")
    L.append("按上面写的版本写代码,不要去文件里查版本 —— 压缩构建里查不到。")
    L.append("")

    if inv.env:
        L.append("## 已装好的运行时(不需要检查)")
        L.append("、".join(f"{k} {v}" for k, v in inv.env.items()))

    return "\n".join(L).rstrip()


# ---------------------------------------------------------------- views


def plan_view(deck: Deck) -> View:
    """规划调用。看得到约束和库表,看不到任何页 —— 页还不存在。"""
    body = "\n".join(
        [
            "先把整套讲义的结构规划出来。",
            "",
            "- 分成若干 segment,每个 segment 写清它要让读者获得什么、占多少分钟。",
            "- 每个 segment 拆成若干页。**不要先定页数**:内容装不下就拆,",
            "  页数是拆出来的结果,不是先设的数。",
            "- 每一页要写明:读者带走的那一句、内容拍子、读者具体动手做什么并看到什么变化、",
            "  这一页背后真正在跑的算法是什么、以及你考虑过并否决了哪些其它形式和各自的理由。",
            "- 页与页之间会共享一些记号和约定。把它们登记成 term,写清由哪一页引入、",
            "  哪些页沿用。构建时各页互相看不见,这张表是唯一的对齐手段。",
        ]
    )
    return View(_prefix(deck), body)


def build_view(deck: Deck, pid: str) -> View:
    """单页构建调用。

    这里只放三样东西:共享 prefix、这一页自己的规划、它 assume 的 term 的完整定义。
    别的页的规划、别的页的产物、总页数,一律不出现 —— 不是过滤掉的,是没被取。
    """
    p = deck.page(pid)
    body = _page_body(deck, p)
    return View(_prefix(deck), body)


def repair_view(deck: Deck, pid: str, findings: list[Finding]) -> View:
    """修复调用。在构建 view 基础上,只追加这一页自己的闸门结论。

    实测里返工吃掉 12:08,大头是模型拿到模糊反馈后自己重新找问题。
    所以这里给的是定位到行的确定性结论,不是「再检查一下」。
    """
    v = build_view(deck, pid)
    L = ["## 这一页没过闸,下面每条都要修掉", ""]
    for f in findings:
        hint = f"\n  怎么改:{f.fix_hint}" if f.fix_hint else ""
        L.append(f"- [{f.gate}] {f.where}:{f.what}{hint}")
    L += ["", "只改这些,别顺手重做其它部分。"]
    return View(v.prefix, v.body + "\n\n" + "\n".join(L))


# ---------------------------------------------------------------- 页正文


def _page_body(deck: Deck, p: PagePlan) -> str:
    L: list[str] = []
    L.append(f"## 你负责 `{p.id}`,只写这一个文件")
    L.append("")
    L.append(f"这一页的作用:{p.role}")
    L.append(f"读者带走的那一句:{p.takeaway}")
    L.append("")
    L.append("内容拍子:")
    for b in p.beats:
        L.append(f"- {b}")
    L.append("")
    L.append(f"读者动手做什么:{p.interaction}")
    L.append("")

    c = p.computation
    if c.method == "none":
        L.append(f"这一页不需要实时计算:{c.what}")
    else:
        lib = f",用 `{c.lib}`" if c.lib else ",手写"
        L.append(
            f"背后真正在跑的:{c.what}({c.method}{lib})。"
            f"每帧预算 {c.frame_budget_ms:g}ms。这是真算,不是预录动画。"
        )
    L.append("")

    L.append("已经否决过的形式,不要再回到这些上面:")
    for r in p.rejected:
        L.append(f"- {r.form} —— {r.why}")
    L.append("")

    if p.avoid:
        L.append("相邻页已经用过的形式,这一页换一种:" + "、".join(p.avoid))
        L.append("")

    b = p.budget
    L.append(
        f"文本上限:正文 {b.body_chars} 字,标签图注合计 {b.label_chars} 字,"
        f"可操作控件不超过 {b.controls} 个。超了说明这一页内容多了,"
        "回报给协调方拆页,不要自己压字号塞进去。"
    )
    L.append("")

    if p.assumes:
        L.append("## 前面的页已经建立、这一页直接沿用的记号(逐字照用,不要另起写法)")
        for k in p.assumes:
            t: Term = deck.terms[k]
            unit = f",单位 {t.unit}" if t.unit else ""
            L.append(f"- **{t.name}**({t.kind}{unit}):{t.definition}")
        L.append("")

    if p.establishes:
        L.append("## 这一页负责第一次引入下面这些,后面的页会沿用,写法要立住")
        for k in p.establishes:
            t = deck.terms[k]
            unit = f",单位 {t.unit}" if t.unit else ""
            L.append(f"- **{t.name}**({t.kind}{unit}):{t.definition}")
        L.append("")

    if p.libs:
        L.append("这一页要用的库:" + "、".join(f"`{f}`" for f in p.libs))
        L.append("")

    L.append(
        "骨架文件已经建好,`data-page` / `data-total` 已经盖过章,不要改动它们。"
        "别的页正被并发写着,不要去读任何 `page-*.html`。"
    )
    return "\n".join(L)
