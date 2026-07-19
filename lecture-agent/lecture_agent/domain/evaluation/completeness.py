"""确定性完整性门（纯函数，无 LLM）：先于 LLM 评委抓最贵的共性 bug——零 token。

对应实验里评委反复点名的三类流水线缺陷：
- 内容截断 / 占位符残留（结尾断句、未闭合公式、占位标记）。
- 首/末页 hero 跑题（封面/收尾标题与课题无关）。
- 页数不遵循目标。

schema.validate 已保证结构最小量（数组 min_length 等），故这里只补它抓不到的**值级**缺陷：
占位文本、断句截断、公式花括号不配对。`ce-evaluation` 纪律：能机器判的先判、失败快、不花评委 token。
"""

from __future__ import annotations

import re
from typing import Any

# 各 block 类型里"该有实质自然语言文本"的标量字段（对齐 schema/document.py）。
_TEXT_FIELDS: dict[str, list[str]] = {
    "hero": ["title", "subtitle"],  # title 是 str 列表
    "statement": ["statement"],
    "callout": ["label", "text"],
    "formula": ["caption"],
    "pullquote": ["quote", "attribution"],
    "code": ["source"],  # 代码：只做占位检测，不做断句判定
}
# 占位符 / 未完成标记
_PLACEHOLDER = re.compile(r"(TODO|待补|占位|placeholder|lorem ipsum|xxxx)", re.I)
_ELLIPSIS_END = re.compile(r"(\.\.\.|…)\s*$")
# 高精度"硬截断"信号：以悬挂标点/连接符收尾 = 明显没写完（比"无句号"精确得多，避免误伤合法短标签/副标题）。
# 只留最不可能合法收尾的：标点/反斜杠/开括号 + "的"（"和与及"作名词尾太常见，剔除避免误伤如"之和"）。
_DANGLING_END = re.compile(r"[，,、;\\（(【\[\{：:]\s*$|的\s*$")
# 不做断句判定的字段（代码/表达式本就不以句号结尾）
_NO_SENTENCE = {"source"}


def _nl_texts(block: dict[str, Any]) -> list[tuple[str, bool]]:
    """抽 (文本, 是否自然语言句子) 列表；后者决定是否套用断句截断判定。"""
    out: list[tuple[str, bool]] = []

    def add(v: Any, sentence: bool) -> None:
        if isinstance(v, str) and v.strip():
            out.append((v.strip(), sentence))

    t = str(block.get("type"))
    for f in _TEXT_FIELDS.get(t, []):
        v = block.get(f)
        sentence = f not in _NO_SENTENCE
        if isinstance(v, list):
            for x in v:
                add(x, sentence)
        else:
            add(v, sentence)
    # 数组里逐项的文本字段（list.items / agenda.rows / flow.nodes / grid.items / timeline.events）
    for key in ("items", "rows", "nodes", "events"):
        for it in block.get(key) or []:
            if isinstance(it, dict):
                for f in ("text", "label", "title", "caption", "sub", "desc"):
                    add(it.get(f), True)
            elif isinstance(it, list):  # table.rows 是二维
                for cell in it:
                    add(cell, False)
            else:
                add(it, True)
    return out


def _looks_truncated(s: str) -> bool:
    """高精度硬截断：悬挂标点/连接符收尾，或未闭合的行内数学 $。（不再用"无句号"这类噪声规则。）"""
    s = s.strip()
    if len(s) < 6:
        return False
    if _DANGLING_END.search(s):
        return True
    return s.count("$") % 2 == 1  # 行内数学 $ 落单 = 公式被截断


def _formula_unbalanced(block: dict[str, Any]) -> bool:
    """formula.latex 花括号不配对 → 疑似被截断（latex 本身不含 $，$ 检查在 validate.py）。"""
    if block.get("type") != "formula":
        return False
    latex = str(block.get("latex", ""))
    return latex.count("{") != latex.count("}")


def block_issues(block: dict[str, Any]) -> list[str]:
    """单个 block 的截断/占位问题（块生成器自修时用；空 = 干净）。"""
    out: list[str] = []
    if _formula_unbalanced(block):
        out.append("formula latex 花括号未闭合（疑截断）")
    texts = _nl_texts(block)
    bad = next((t for t, _ in texts if _PLACEHOLDER.search(t) or _ELLIPSIS_END.search(t)), None)
    if bad:
        out.append(f"含占位/省略号收尾: “{bad[:30]}”")
    trunc = next((t for t, sent in texts if sent and _looks_truncated(t)), None)
    if trunc:
        out.append(f"疑似截断（结尾断句）: “…{trunc[-24:]}”")
    return out


def detect_truncation(doc: dict[str, Any]) -> list[str]:
    """返回截断/占位问题清单（空 = 干净）。定位到 block id 方便回炉。"""
    issues: list[str] = []
    for si, s in enumerate(doc.get("scenes", [])):
        for b in s.get("blocks") or []:
            bid = b.get("id", f"s{si}")
            for msg in block_issues(b):
                issues.append(f"[{bid}] {msg}")
    return issues


def _flat_hero_text(b: dict[str, Any]) -> str:
    t = b.get("title")
    parts = list(t) if isinstance(t, list) else [t]
    parts.append(b.get("subtitle"))
    return " ".join(str(p) for p in parts if p)


def hero_on_topic(doc: dict[str, Any], topic: str) -> list[str]:
    """封面+收尾 hero 标题与课题关键词的重叠检查（抓"末页跑题"）。返回跑题清单。"""
    # 关键词：括号前的主词（即使单字如"树"也保留）+ 括号内 len≥2 的词 + 主词的 2/3 字前缀
    # （让"遗传学定律"也能匹配"遗传学"、"电磁感应"匹配"电磁"，避免同义短形被误判跑题）。
    head = re.split(r"[（(]", str(topic))[0].strip()
    kw = [w for w in re.split(r"[（）()\s，,、/]+", str(topic)) if len(w) >= 2]
    if head:
        kw.append(head)
        if len(head) >= 3:
            kw += [head[:2], head[:3]]
    kw = list(dict.fromkeys(kw))  # 去重保序
    if not kw:
        return []
    problems: list[str] = []
    scenes = doc.get("scenes", [])
    for i, s in enumerate(scenes):
        if s.get("kind") != "hero":
            continue
        blob = " ".join(
            _flat_hero_text(b) for b in (s.get("blocks") or []) if b.get("type") == "hero"
        )
        blob += " " + str(s.get("headline") or "")
        if blob.strip() and not any(k in blob for k in kw):
            where = "封面" if i == 0 else ("收尾" if i == len(scenes) - 1 else f"第{i + 1}页")
            problems.append(f"{where} hero 与课题「{topic}」无关键词重叠: “{blob.strip()[:40]}”")
    return problems


def page_adherence(doc: dict[str, Any], target: int) -> int:
    """|实际页数 - 目标|（越小越好）。"""
    return abs(len(doc.get("scenes", [])) - int(target))


def gate(doc: dict[str, Any], *, topic: str, target_pages: int, page_tol: int = 2) -> dict[str, Any]:
    """汇总确定性门：报告 + pass 布尔。评委前先跑，失败即高信号缺陷。"""
    trunc = detect_truncation(doc)
    offtopic = hero_on_topic(doc, topic)
    dpages = page_adherence(doc, target_pages)
    return {
        "pass": not trunc and not offtopic and dpages <= page_tol,
        "truncation": trunc,
        "hero_offtopic": offtopic,
        "page_delta": dpages,
        "pages": len(doc.get("scenes", [])),
    }
