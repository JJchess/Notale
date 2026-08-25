"""harness 的产物格式。

**这里没有一个字段是设计出来的。** 全部从 nn-06 那一轮 Claude Code 自己写出来的
`PLAN.md` / `CONTRACT.md` / brief 里量出来,存档在 `lab/derived-nn-06/`。

量出来的事实,按证据强度排:

  · 每页条目有 8 项骨架,20/20 页齐全:
      章、kicker、标题、take、内容、采用的形式、否决的形式、独占
  · 骨架之外**全是自由散文**。「内容」下面是若干条要点,「采用的形式」后面跟一段
    没有标签的「理由:」,「否决的形式」下面是若干条带理由的否决项。
  · 跨页去重靠的是**独占**加一张全局归属表(概念 → 唯一负责的那一页),
    不是依赖图。它要防的是「同一件事被讲三遍」,不是「后面的页不知道前面定义了什么」。
  · 数值一致性靠**共享计算模块**(`Lec.P` / `Lec.K`)加一条硬规矩:页面不许写死数字。
  · CONTRACT.md 是**文件**不是 prompt。brief 只给路径,所以 brief 中位仅 1539 字符。

所以这里的模型是「有序的带标签块 + 原文保留」,不是字段化的记录。
任何把自由散文塞进固定字段的做法都会丢东西 —— round_trip_test 会当场抓到。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterator

# 一页条目里 20/20 出现的骨架 —— 这 8 项是从 nn-06 的 PLAN.md 量出来的,不是定的。
REQUIRED = ("章", "kicker", "标题", "take", "内容", "采用的形式", "否决的形式", "独占")

# 我们自己的流水线多要两项,理由是实测出来的缺陷:
#   版式  —— 不指定的话 20 页会全挤进 theme.css 里唯一那个布局(实测 .split 20/20,
#           而 nn-06 给的是 row/col/grow 这类原子、各页自己组合)
#   必用skill —— 按这一页交互的真实需要指派技法文档,让 builder 必须先读
#   停留   —— 这一页预计停留几分钟,全课加总等于课时。**这是唯一对页数起作用的
#           可算约束**:同一份逐字相同的指令下,Opus 出 20 页、Sonnet 出 14 页,
#           而三条已有的闸(机制/死代码/字号)没有一条管「讲够了没有」。
#           lab 那边七轮的规律是「有可算的数的约束起作用,没数的不起作用」——
#           「不要太满」写在四处、七轮零改变;字号地板一加,不达标率 66%→20%。
# 这三项 nn-06 没有,所以不能混进 REQUIRED —— 那会让 nn-06 的 round-trip 验证失真。
#
# 反过来,`独占` 和 `否决的形式` 从**我们的**硬判里去掉了(REQUIRED 原样留着,
# 它是 nn-06 那份的基准,动了那个测试就失真):
#   · 独占 —— 它要求"每页独占一个概念",而 CLAUDE.md 的 page-rhythm 逐字写着
#     「不要要求每一页都必须自成闭环」「完整性属于整个学习过程,而不属于单个页面」。
#     硬判赢散文,于是**页数被钉在"有多少个不同概念"上**:上一轮同题 83 条要点
#     被打包进 18 页(14 页恰好 5 条)。防跨页重复另有一套机制 —— PLAN 第 2 节那张
#     归属表,而 brief 本来就要求每个 subagent 通读第 0/1/2/3 节。两套留一套。
#   · 否决的形式 —— 每页现编被否决方案是纯税(中位 80 字符/页),
#     deck 层面留一节就够,不必乘以页数。
#   不许碰 —— 负向围栏,取代原来的 `独占`。两者的差别是**逻辑方向**:
#     独占  「这一页独占概念 X」→ 正向所有权 → 隐含"要把 X 讲完" → 页数被钉在概念数上
#     不许碰「这一页不讲 Y,Y 在 pNN 讲」→ 只画围栏 → 对完整性不作声明 → 概念可跨页展开
#   这个形式是 nn-11 (Opus 5 × Claude Code) 实测用的:44/44 份逐页规格都有它,
#   而且每条都指名了归属("那是 p26 的活"),同时起围栏和转接两个作用。
OURS = (tuple(x for x in REQUIRED if x not in ("独占", "否决的形式"))
        + ("版式", "必用skill", "停留", "不许碰"))

_ENTRY = re.compile(r"^### (page-\d+) · (.+?)\n(.*?)(?=^### |\Z)", re.S | re.M)
_INLINE = re.compile(r"\*\*(.+?)\*\*[：:]")
_HEADING = re.compile(r"^\*\*(.+?)\*\*\s*$")


@dataclass
class Block:
    """条目里的一段。kind 决定它长什么样,text 一律是原文。

    kind='field'   `**标签**：值`,可能一行里并列多个(实测「章」和「kicker」同行)
    kind='heading' `**标签**` 独占一行,后面跟自由内容
    kind='free'    没有标签的行 —— 「理由:」那种,以及分隔线
    """

    kind: str
    text: str  # 原文,含换行,不做任何规范化

    @property
    def labels(self) -> list[str]:
        if self.kind == "field":
            return _INLINE.findall(self.text)
        if self.kind == "heading":
            m = _HEADING.match(self.text.split("\n", 1)[0])
            return [m.group(1)] if m else []
        return []


@dataclass
class Entry:
    """PLAN.md 里的一页。

    刻意不提供 `.role` / `.budget` / `.libs` 这类访问器 —— 实测这些东西
    根本不在页里:role 它从没分过类,budget 和 libs 在 CONTRACT.md 里全局定。
    """

    pid: str
    heading: str  # `### page-16 · 霍曼转移` 里 · 后面那段
    blocks: list[Block] = field(default_factory=list)

    def value(self, label: str) -> str | None:
        """取某个行内字段的值。找不到返回 None,不抛 —— 缺失由 missing() 统一报。"""
        for b in self.blocks:
            if b.kind != "field":
                continue
            # 只在空行之前找。最后一个字段(独占)后面往往直接跟着 `---` 分隔线,
            # 不切断的话值里会拖进一条横线。
            head = b.text.split("\n\n", 1)[0]
            for m in re.finditer(r"\*\*(.+?)\*\*[：:]\s*(.*?)(?=\s*\*\*|$)", head, re.S):
                if m.group(1) == label:
                    return m.group(2).strip()
        return None

    def section(self, label: str) -> str | None:
        """取某个块标签下面的全部原文(内容 / 否决的形式)。"""
        for b in self.blocks:
            if b.kind == "heading" and label in b.labels:
                return b.text.split("\n", 1)[1] if "\n" in b.text else ""
        return None

    def missing(self, required: tuple[str, ...] = REQUIRED) -> list[str]:
        """哪些骨架项没写。take 允许带后缀(实测有一页写作「take(底栏)」)。"""
        seen: set[str] = set()
        for b in self.blocks:
            for l in b.labels:
                seen.add(l)
                if l.startswith("take"):
                    seen.add("take")
        return [k for k in required if k not in seen]

    def render(self) -> str:
        return f"### {self.pid} · {self.heading}\n" + "".join(b.text for b in self.blocks)


@dataclass
class Plan:
    """整份 PLAN.md。顶层小节按原文顺序保留,不重排、不改标题。"""

    title: str  # `# …` 那一行去掉 '# '
    sections: list[tuple[str, str]] = field(default_factory=list)  # (`## …` 原文, 正文原文)

    @property
    def entries(self) -> list[Entry]:
        out: list[Entry] = []
        for head, body in self.sections:
            for pid, heading, raw in _ENTRY.findall(body):
                out.append(Entry(pid, heading, list(_blocks(raw))))
        return out

    def section(self, prefix: str) -> str | None:
        for head, body in self.sections:
            if head.lstrip("# ").startswith(prefix):
                return body
        return None

    def render(self) -> str:
        return f"# {self.title}\n" + "".join(h + b for h, b in self.sections)


def _blocks(raw: str) -> Iterator[Block]:
    """把一页条目切成块。切分只看行首形态,不理解内容 —— 理解内容就等于预设格式。"""
    buf: list[str] = []
    kind = "free"

    def flush() -> Iterator[Block]:
        if buf:
            yield Block(kind, "".join(buf))

    for line in raw.splitlines(keepends=True):
        bare = line.rstrip("\n")
        if _HEADING.match(bare):
            yield from flush()
            buf, kind = [line], "heading"
        elif _INLINE.search(bare) and bare.lstrip().startswith("**"):
            yield from flush()
            buf, kind = [line], "field"
        else:
            buf.append(line)
    yield from flush()


def parse_plan(text: str) -> Plan:
    lines = text.split("\n")
    # 没有 `# ` 标题行也不该炸 —— 新格式的 PLAN.md 有可能整份都是 `## ` 起头,
    # 而这个函数还会被章表那段调用。实测 StopIteration 直接打断了覆盖闸。
    i = next((k for k, l in enumerate(lines) if l.startswith("# ")), -1)
    if i < 0:
        return Plan("", [("", text)])
    title = lines[i][2:]
    rest = "\n".join(lines[i + 1:])
    parts = re.split(r"(?m)^(## .*\n)", rest)
    lead = parts[0]
    sections: list[tuple[str, str]] = []
    if lead:
        sections.append(("", lead))
    for h, b in zip(parts[1::2], parts[2::2]):
        sections.append((h, b))
    return Plan(title, sections)


# --------------------------------------------------------------------------
# CONTRACT.md —— 结构就是「有序的 ## 小节」,再往下全是自由文本。
# 实测 11 节:你只碰一个文件 / HTML 骨架 / 版面预算 / 字号下限 / 用主题 /
# 物理数字从 Lec 取 / canvas 三条必守 / 库 / 交互的标准 / 完工前自检 / 交付。
# 不把这些节名写死 —— 它们是这一轮的产物,不是规范。
# --------------------------------------------------------------------------


@dataclass
class Contract:
    title: str
    sections: list[tuple[str, str]] = field(default_factory=list)

    def render(self) -> str:
        return f"# {self.title}\n" + "".join(h + b for h, b in self.sections)


def parse_contract(text: str) -> Contract:
    p = parse_plan(text)
    return Contract(p.title, p.sections)


# --------------------------------------------------------------------------
# brief —— 发给单页 subagent 的那段。字段就是 Agent 工具的入参,一个不多。
# --------------------------------------------------------------------------


@dataclass
class Brief:
    description: str
    prompt: str
    subagent_type: str = "general-purpose"

    def as_tool_input(self) -> dict:
        return {
            "description": self.description,
            "prompt": self.prompt,
            "subagent_type": self.subagent_type,
        }


# 两种写法都要认。实测三轮出现了两种,而下一个模型写哪种不由我们决定:
#   orbit-01/02   P.name = function (a, b) {        ← 逐个挂到 P 上
#   gpt-nn        var P = { name: function (a, b) { ← 对象字面量,一次性定义
# 只支持一种的代价是 API 抽取静默塌成空,页面被迫去读 42KB 源码 —— 那正是要治的病。
_FN_ASSIGN = re.compile(
    r"\bP\.([A-Za-z_$][\w$]*)\s*=\s*(?:function\s*)?\(([^)]*)\)\s*(?:=>\s*)?\{", re.S)
_FN_LITERAL = re.compile(
    r"^\s{2,}([A-Za-z_$][\w$]*)\s*:\s*function\s*\(([^)]*)\)\s*\{", re.M)
_FN_SHORTHAND = re.compile(
    r"^\s{2,}([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{", re.M)
# 第三种:`var P = { name: name, ... }` 只是再导出表,签名在顶层的
# `function name(args)` 上(gpt-nn 就是这样,而它的 P 里一个 function 字面量都没有)。
_REEXPORT = re.compile(r"^\s{2,}([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)\s*,?\s*$", re.M)


def _decl(js: str, name: str) -> tuple[str, int] | None:
    """找顶层声明,返回 (参数串, 函数体起始位置)。"""
    for rx in (rf"\bfunction\s+{re.escape(name)}\s*\(([^)]*)\)\s*\{{",
               rf"\b(?:const|let|var)\s+{re.escape(name)}\s*=\s*"
               rf"(?:function\s*)?\(([^)]*)\)\s*(?:=>\s*)?\{{"):
        m = re.search(rx, js)
        if m:
            return " ".join(m.group(1).split()), m.end()
    return None


def _body(js: str, at: int) -> str:
    """`at` 是函数体第一个 `{` 之后的位置。取到配对的 `}` 为止。

    必须严格按括号配对截断,不能"往后取 N 个字符"。取多了会跨进**下一个函数**,
    于是把邻居的 return 当成自己的 —— 一次实测就抓到 `softmax(values, temperature)`
    被标成返回 `{prediction, error, weights, bias}`(那是后面一个函数的)。
    **一个错的签名比没有签名更坏**:页面会照它写代码,然后在运行时才发现取不到那些键。
    """
    depth, i, n = 1, at, len(js)
    while i < n and depth:
        c = js[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        i += 1
    return js[at:i - 1]


def _returns(js: str, at: int) -> str:
    """这个函数返回什么。只看它体内第一个 `return`,够用就停。

    抽的是**顶层键名**,不是完整类型 —— 目的只是让调用方知道
    `r.speed` 还是 `r.v`,不必去读实现。
    """
    seg = _body(js, at)
    m = re.search(r"\breturn\s*\{", seg)
    if not m:
        m2 = re.search(r"\breturn\s+([^;\n]{1,40})", seg)
        return "" if not m2 else ("→ 数值" if re.search(r"[\d*/+\-]", m2.group(1)) else "")
    depth, keys, i = 0, [], m.end() - 1
    while i < len(seg):
        c = seg[i]
        if c == "{":
            depth += 1
            if depth == 1:
                for k in re.findall(r"([A-Za-z_$][\w$]*)\s*:", _top_level(seg, i)):
                    if k not in keys:
                        keys.append(k)
                break
        i += 1
    return "→ {" + ", ".join(keys[:8]) + "}" if keys else ""


def _top_level(seg: str, start: int) -> str:
    r"""从 `{` 起取到配对的 `}`,但把内层嵌套整段挖掉 —— 只留顶层的 `键:`。

    嵌套块的**开括号要留下**。原来是挖掉的,而闭括号却因为退到 depth==1 被留着 ——
    一开一闭不对称,于是 `name: function(key) {` 在挖完之后成了 `name: function(key) `,
    `_FN_LITERAL` 要匹配的 `\)\s*\{` 永远对不上。
    实测代价:DeepSeek-V4-Pro 用的正是 `Lec.P = { name: function(){} }` 这种写法,
    `lec_api` 抽出 **0 个**签名,40 多页每页被迫去读 10KB 的 lec.js 源码。
    走 `_FN_ASSIGN` 的模型没暴露这条,因为那条路 `body = js`,用的是全文。
    """
    depth, out, i = 0, [], start
    while i < len(seg):
        c = seg[i]
        if c == "{":
            depth += 1
            if depth > 1:
                out.append(c)          # 留下开括号,别和闭括号不对称
                i += 1
                continue
        elif c == "}":
            depth -= 1
            if depth == 0:
                break
        if depth == 1:
            out.append(c)
        i += 1
    return "".join(out)


_JS_BUILTIN = frozenset("""if for while switch return typeof function var let const
 parseInt parseFloat String Number Boolean Array Object Math JSON isNaN
 push split join slice map filter forEach replace match test indexOf
 appendChild insertBefore createElement createTextNode getElementById
 querySelector querySelectorAll setAttribute addEventListener toFixed""".split())


def _fn_body(js: str, name: str) -> str:
    """取 `name` 这个函数的完整函数体。取不到返回空串。"""
    m = re.search(rf"\b{re.escape(name)}\s*[:=]\s*(?:function\s*)?\([^)]*\)\s*\{{", js)
    if not m:
        m = re.search(rf"\bfunction\s+{re.escape(name)}\s*\([^)]*\)\s*\{{", js)
    return _body(js, m.end()) if m else ""


# 页表按**表头名字**取列,不按位置。
#
# 这条是量出来的,代价很大:我原来用一个固定六列的正则从左往右数,而 DeepSeek 写了
# 七列(它自己多加了一列「版式」),77 行全部整齐右移一列 ——
#     读成「交互」的其实是版式(canvas-full / focus / ledger)
#     读成「一句话」的其实是交互(逃逸抛体模拟 / 时间线缩放)
#     读成「不许碰」的其实是那句主张,真正的「不许碰」被丢掉
# 后果不是解析失败,是**语义错位**:spec 那一步收到「这一页的交互是 canvas-full」
# 这种自相矛盾的输入,模型只能反复斟酌怎么圆过去,其中 5 页写到 4 万 token 被截断。
# 而我先后把上限从 8k 抬到 60k、加了三道闸,治的全是症状。
#
# 按名字取列之后,模型多加一列、换列序、改叫法都不会错位,而"它加了什么列"
# 反而成了可见的信息。
_ALIAS = {
    "pid": ("#", "页", "页号", "序号"),
    "stay": ("停留", "秒", "时长", "分钟"),
    "structure": ("知识结构", "结构", "骨架"),
    "layout": ("版式", "布局", "layout"),
    "interaction": ("交互", "交互形式"),
    "claim": ("一句话", "主张", "take", "要让读者信什么"),
    "avoid": ("不许碰", "边界", "不讲"),
    # 这两列是从 Opus 那条线的规划里量来的:它的 PLAN.md 有「三句话的证据链」
    # 和「幕结构与页表」,我们一直只有主线和页表。缺了它们,「页很多但主线漂移」
    # 没有任何东西能对账 —— 实测有一轮规划到 60 页、停留 5650/5400,当时看不出漂在哪。
    "act": ("幕", "幕次", "act"),
    "evidence": ("证据", "证据链", "证据节点", "节点"),
}
ROW_COLS = ("停留", "知识结构", "版式", "交互", "一句话", "不许碰")


def _split_row(line: str) -> list:
    cells = line.strip().strip("|").split("|")
    return [c.strip() for c in cells]


def _header_map(line: str) -> dict:
    """表头 → {字段: 列号}。认不出来的列直接忽略(它们是模型多写的,不是错)。"""
    cells = _split_row(line)
    out = {}
    for idx, name in enumerate(cells):
        n = name.strip().strip("*` ")
        for key, alias in _ALIAS.items():
            if key in out:
                continue
            if any(a == n or (a in n and len(n) <= len(a) + 4) for a in alias):
                out[key] = idx
                break
    return out


@dataclass
class Row:
    """页表里的一行。**全局约束住在这一层** —— 停留加总、交互不撞车、
    相邻不同结构、归属不重叠,都只有看到整张表才能判。

    逐页的展开(plan/pNN.md)是下一步 N 路并行做的,所以这一层必须先定死:
    44 个 agent 各自挑交互,撞车几乎必然 —— 实测连页内冗余都避不开
    (有一页给同一个变量做了滚轮、竖直拖动、拖游标三条输入路径)。
    """

    pid: str
    stay: float | None
    structure: str
    interaction: str
    claim: str
    avoid: str
    # 旧 PLAN.md 没有版式列，保留默认值以支持续跑；新规划会把它作为必填列。
    layout: str = ""
    extra: dict = field(default_factory=dict)   # 模型多写的列,原样留着
    # 带默认值 —— 老的 PLAN.md 没有这两列,续跑旧 run 时不能因此炸掉。
    act: str = ""
    evidence: str = ""

    @property
    def nn(self) -> str:
        return self.pid[5:]

    @property
    def interaction_key(self) -> str:
        """用来判重的交互名。**去掉括注,「无」不参与判重。**

        实测模型会在交互名后面挂括注写版式和库:`无〔focus〕`、
        `拖时间压缩尺〔canvas-full；D3〕`。拿整串判重的话,两个不同的「无」
        会被算成撞车 —— 而无交互的页本来就该排除在判重之外。
        """
        k = re.split(r"[〔（(\[]", self.interaction)[0].strip()
        return "" if k in ("无", "-", "—", "") else k

    @property
    def raw(self) -> str:
        base = (f"| {self.nn} | {self.act or '—'} | {self.evidence or '—'} "
                f"| {self.stay:g} | {self.structure} | {self.layout or '—'} "
                f"| {self.interaction} "
                f"| {self.claim} | {self.avoid} |")
        if self.extra:
            base += "  (表里还有:" + "、".join(f"{k}={v}" for k, v in self.extra.items()) + ")"
        return base

    def missing(self) -> list:
        bad = [] if self.stay else ["停留"]
        for k, v in zip(ROW_COLS[1:], (self.structure, self.layout, self.interaction,
                                       self.claim, self.avoid)):
            if not v.strip():
                bad.append(k)
        return bad


def parse_table(text: str) -> list:
    """从 PLAN.md 第 1 节那张表里读出每一行,**按表头名字映射列**。

    定位:找同时含「知识结构」和「不许碰」的表头行,取到下一个 `## ` 为止。
    取到文末会把后面第 2 节的归属表也吞进来(实测多出 10 行,停留合计因此
    少算成 4715/5400,像是模型算错了帐)。第 0 节的分章表也不能当页表 ——
    它第一列是 `| 00 开场 | 01–03 | … |`,以数字开头,会被行正则整片捞进来。
    """
    head = re.search(r"(?m)^\|[^\n]*知识结构[^\n]*不许碰[^\n]*\|\s*$", text)
    if not head:
        return []
    tail = re.search(r"(?m)^##\s", text[head.end():])
    scope = text[head.end():head.end() + tail.start()] if tail else text[head.end():]
    cmap = _header_map(head.group(0))
    need = ("pid", "stay", "structure", "interaction", "claim", "avoid")
    if any(k not in cmap for k in need):
        print(f"  ⚠ 页表表头缺列 {[k for k in need if k not in cmap]}，"
              f"表头是 {head.group(0).strip()}")
        return []
    names = _split_row(head.group(0))
    known = set(cmap.values())
    out = []
    for line in scope.splitlines():
        if not re.match(r"^\s*\|\s*\d", line):
            continue
        cells = _split_row(line)
        if len(cells) < max(cmap.values()) + 1:
            continue
        g = {k: cells[i] for k, i in cmap.items()}
        sec = re.search(r"(\d+(?:\.\d+)?)", g["stay"])
        num = re.search(r"(\d+)", g["pid"])
        if not num:
            continue
        out.append(Row(pid=f"page-{int(num.group(1)):02d}",
                       stay=float(sec.group(1)) if sec else None,
                       structure=g["structure"], interaction=g["interaction"],
                       claim=g["claim"], avoid=g["avoid"],
                       layout=g.get("layout", "").strip(),
                       act=g.get("act", "").strip(),
                       evidence=g.get("evidence", "").strip(),
                       extra={names[i].strip("*` "): c for i, c in enumerate(cells)
                              if i not in known and c}))
    return out


def lec_dom(js: str) -> str:
    """抽出 `Lec.mount()` **往页面里插什么 DOM** —— 元素和类名。

    这一份必须由 harness 搬运,理由是实测出来的,代价很大:
    `ape-smoke` 的 page-05 花了 **92 次调用、64 分钟、一个字都没写出来**,
    最后撞上单页时限。它那 92 步里反复在 grep
    `lec-header|lec-footer|lec-kicker|lec-title|lec-take|lec-nav|lec-brand|lec-index`,
    第 51 步甚至去 `find -iname "*API*"` 找文档 —— 它要知道这套注入的 DOM
    怎么排版,而当时:
        theme.css 里 .lec- 规则  0 条
        lec.js 里注入 <style>    0 处
    也就是说它在找一个**根本不存在**的东西。

    根因不是模型笨,是三个独立的模型调用之间少了一份契约:
    `lec.md` 让 lec.js 渲染页眉页脚,`theme.md` 也确实要求"页眉页脚的外观",
    但 theme.md 从来不知道 mount 用了哪些类名,于是各自发明一套、对不上。
    `lec_api` 的 docstring 早就写明了这条原则(独立调用之间的接口必须由 harness
    抽出来重新喂进去),只是当时只搬了 P/K 的函数,漏了 DOM 这一半。
    """
    # mount 常常只是薄包装,真正建 DOM 的在它调用的 renderMount 之类里 ——
    # 实测 orbit-01 / orbit-02 / gpt-nn 三轮**都是**这样(mount 体只有 400–700 字符,
    # 一个类名都没有,全部委托给 `renderMount(cfg)`)。所以必须跟着调用往下走,
    # 只看 mount 自己等于什么都看不到。
    seen_fn, todo, chunks = set(), ["mount", "Lec.mount"], []
    while todo:
        name = todo.pop(0)
        if name in seen_fn:
            continue
        seen_fn.add(name)
        b = _fn_body(js, name)
        if not b:
            continue
        chunks.append(b)
        if len(seen_fn) < 8:                     # 深度兜底,别把整个文件走一遍
            for call in re.findall(r"\b([a-z_$][\w$]*)\s*\(", b):
                if call not in seen_fn and call not in _JS_BUILTIN and _fn_body(js, call):
                    todo.append(call)
    body = "\n".join(chunks)
    if not body:
        return ""
    pairs, seen = [], set()
    def add(tag, cls):
        for c in str(cls).split():
            # data-* / aria-* 是**属性名**,不是类名。连字符兜底会把它们捞进来
            # (实测 orbit-02 混进了 .data-lec-header / .aria-valuenow 这些),
            # 而把属性当类名写进 theme.css 的选择器,是给下游埋一个永远不生效的规则。
            if not c or c in seen or c.startswith(("data-", "aria-", "on")):
                continue
            seen.add(c); pairs.append((tag, c))
    for tag, cls in re.findall(r"\bmakeEl\(\s*['\"](\w+)['\"]\s*,\s*['\"]([^'\"]+)['\"]", body):
        add(tag, cls)
    for cls in re.findall(r"\bclassName\s*=\s*['\"]([^'\"]+)['\"]", body):
        add("", cls)
    for cls in re.findall(r"\bclassList\.add\(\s*['\"]([^'\"]+)['\"]", body):
        add("", cls)
    for cls in re.findall(r"class\s*=\s*[\\]?['\"]([^'\"\\]+)", body):
        add("", cls)
    # 类名存在常量里、再拼后缀的写法。gpt-nn 就是这样:
    #   K.UI.HEADER_CLASS: "lec-header"   然后 K.UI.HEADER_CLASS + "__inner"
    # 不解析常量的话这一整套类名一个都看不见(实测那轮直接抽出 0 个)。
    const = dict(re.findall(r"\b([A-Z][A-Z0-9_]*_(?:CLASS|ID))\s*:\s*['\"]([^'\"]+)['\"]", js))
    for k, v in const.items():
        add("", v)
        for suf in set(re.findall(rf"\b{k}\s*\+\s*['\"]([^'\"]+)['\"]", body)):
            add("", v + suf)
    # 兜底:函数体里出现的连字符标识。mount 这一族里出现的基本都是类名。
    for cls in re.findall(r"['\"]([a-z][a-z0-9]*(?:-[a-z0-9]+)+)['\"]", body):
        add("", cls)
    ids = sorted(set(re.findall(r"getElementById\(\s*['\"]([\w-]+)", body)))
    if not pairs:
        print("  ⚠ lec_dom 抽不出 mount 注入的类名。theme.css 将不知道该给"
              "页眉页脚写什么选择器,各页会去 grep 一个不存在的东西 —— "
              "ape-smoke 的 page-05 就是这样烧掉 92 次调用、64 分钟、0 产出。")
        return ""
    rows = [f"  .{c}" + (f"    <{t}>" if t else "") for t, c in pairs]
    out = [f"`Lec.mount()` 会往 <body> 里插入下面这些元素(共 {len(pairs)} 个类名):", *rows]
    if ids:
        out.append("  以 id 定位、重复调用时复用:" + "、".join("#" + i for i in ids))
    out.append("")
    out.append("**这些类名是唯一真相,别改名、别另起一套。** mount 只生成结构,不带任何外观。")
    return "\n".join(out)


def lec_values(js: str) -> str:
    """把 `Lec.K` 的**实际内容**抽出来 —— 值,不是键名。

    这一条是量出来的,而且量的是规划质量:`lec_api` 给的是
    `Lec.K(常量): astronomy、comparison、human、math、…` —— **九个类别名,
    一个数字都没有**。所以写规格那一步就算想写「| 7.0 | 360 | 乍得沙赫人 |」
    也写不出来,只能写「去 `Lec.K.timeline` 里取对应事件」。

    对照 Opus 那条线:它每一页的规格里直接摆着 13 行真实数据
    (`| 距今 Ma | cc | 名 |`,从乍得沙赫人到智人),而那些值在它的共享层里
    **一个字都没有** —— 它根本没有「共享常量 + 页面去取」这一层,
    每页要用的数据就写在那一页的规格里。
    消融实测:换成它的规划之后,同一个建页模型 Edit 6.5→1.1、
    画布占满 24/48→44/44、占用比 51%→63%。

    K 的全部内容实测只有 4,574 字符,而每份规格的提示词约 13,000 字符 ——
    喂得进去,没有理由只给键名。
    """
    out, seen = [], set()
    for m in re.finditer(r"\bK\.([A-Za-z_$][\w$]*)\s*=\s*", js):
        name = m.group(1)
        if name in seen:
            continue
        seen.add(name)
        i, d, j = m.end(), 0, m.end()
        while j < len(js):
            c = js[j]
            if c in "{[":
                d += 1
            elif c in "}]":
                d -= 1
                if d == 0:
                    j += 1
                    break
            elif c == ";" and d == 0:
                break
            j += 1
        out.append(f"K.{name} = " + " ".join(js[i:j].split()))
    if not out:
        # 对象字面量写法:`K = { … }` 一次给完
        m = re.search(r"\bK\s*=\s*\{", js)
        if m:
            # **不能用 `_top_level`** —— 它会把嵌套整段挖掉,那是给「取键名」用的,
            # 对「取值」正好反了。实测 sol-01 那份被挖成
            # `K = { MATH: {}, PHYSICS: {}, PLANETS: [ {}, {}, … ] }` —— 全是空壳。
            i, d, j = m.end() - 1, 0, m.end() - 1
            while j < len(js):
                if js[j] == "{":
                    d += 1
                elif js[j] == "}":
                    d -= 1
                    if d == 0:
                        j += 1
                        break
                j += 1
            out.append("K = " + " ".join(js[i:j].split()))
    return "\n".join(out)


def lec_api(js: str) -> str:
    """从写好的 lec.js 里抽出对外接口。

    后面两步(PLAN.md / CONTRACT.md)是独立调用,模型不「记得」自己刚写了什么,
    接口必须由 harness 抽出来重新喂进去。

    **必须带参数名和返回键,不能只给名字。** 原来这里只抽名字,116 个
    `xxx()` 光秃秃的 —— 调用方不知道参数是什么、返回 `r.speed` 还是 `r.v`,
    于是只能去读 41,924 字符的 `lec.js` 源码,17 页各读一遍。
    这和底盘那边是同一个病:**API 索引不可用,就等于逼所有人读实现**
    (lab 实测 17 个 subagent 无一例外整篇 cat 了底盘源码,中位 3 次)。
    """
    k = sorted(set(re.findall(r"\bK\.([A-Za-z_$][\w$]*)\s*=", js)))
    if not k:
        # 对象字面量写法:`var K = { NAME: 值, ... }`。只取全大写的键,
        # 避免把 UI/MATH 这类嵌套配置块的普通键也当成常量。
        m = re.search(r"\bK\s*=\s*\{", js)
        if m:
            k = sorted(set(re.findall(r"^\s{2,}([A-Z][A-Z0-9_]{2,})\s*:",
                                      _top_level(js, m.end() - 1), re.M)))
    body = js
    m = re.search(r"\bP\s*=\s*\{", js)
    if m and not _FN_ASSIGN.search(js):
        body = _top_level(js, m.end() - 1)          # 只在 P 这个对象里面找
    sigs = []
    for rx in (_FN_ASSIGN, _FN_LITERAL, _FN_SHORTHAND):
        for mm in rx.finditer(body):
            args = " ".join(mm.group(2).split())
            sigs.append((mm.group(1), f"{mm.group(1)}({args})", _returns(body, mm.end())))
        if sigs:
            break
    if not sigs and body is not js:
        for mm in _REEXPORT.finditer(body):
            d = _decl(js, mm.group(2))
            if d:
                sigs.append((mm.group(1), f"{mm.group(1)}({d[0]})", _returns(js, d[1])))
    seen, rows = set(), []
    for name, sig, ret in sorted(sigs):
        if name in seen:
            continue
        seen.add(name)
        rows.append(f"  {sig}{'  ' + ret if ret else ''}")
    out = []
    if k:
        out.append("Lec.K(常量): " + "、".join(k))
    if rows:
        out.append(f"Lec.P({len(rows)} 个函数,参数名和返回键如下,不用再去读 lec.js 源码):")
        out.extend(rows)
    if not rows:
        # 抽不出来必须**吵**。静默给一份空 API,下游 17 页会各自去读 42KB 源码,
        # 而我们只会看到"页面好像有点慢",查不到原因。
        names = sorted(set(re.findall(r"\bP\.([A-Za-z_$][\w$]*)", js)))
        print(f"  ⚠ lec_api 抽不出函数签名(认识两种写法都没匹配上)。"
              f"退回裸名字 {len(names)} 个 —— 各页会被迫去读 lec.js 源码。"
              f"若这一轮慢,先来看这里。")
        if names:
            out.append("Lec.P: " + "、".join(f"{n}()" for n in names))
    return "\n".join(out)
