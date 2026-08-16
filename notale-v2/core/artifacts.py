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
# 这两项 nn-06 没有,所以不能混进 REQUIRED —— 那会让 nn-06 的 round-trip 验证失真。
OURS = REQUIRED + ("版式", "必用skill")

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
    i = next(k for k, l in enumerate(lines) if l.startswith("# "))
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


def lec_api(js: str) -> str:
    """从写好的 lec.js 里抽出对外接口。

    后面两步(PLAN.md / CONTRACT.md)是独立调用,模型不「记得」自己刚写了什么,
    接口必须由 harness 抽出来重新喂进去。
    """
    p = sorted(set(re.findall(r"\bP\.([A-Za-z_$][\w$]*)\s*=", js)))
    k = sorted(set(re.findall(r"\bK\.([A-Za-z_$][\w$]*)\s*=", js)))
    out = []
    if k: out.append("Lec.K: " + "、".join(k))
    if p: out.append("Lec.P: " + "、".join(f"{n}()" for n in p))
    out.append("Lec.mount({index, kicker, title, take})")
    return "\n".join(out)
