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


# `lec_api` / `lec_values` / `lec_dom` 和它们那套 JS 解析机器 2026-08-28 整条删除,
# 跟着 `lec.js` 一起走。理由见 core/planner.py 里同一天那段注释:
# **删一个接口,要连广告它的那张清单一起删** —— 上一次只删了一半,
# 一行残留的 `Lec.mount(...)` 被 48/48 份规格照抄而零页调用,代价两个月后才量出来。


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

