from __future__ import annotations
from pathlib import Path
import json
import re
from ..shared.result import Out


SCHEMA = {"name": "Patch", "description":
        "批量修改页面：先确认每个 old 在原文件中存在，否则整批不写；"
        "然后按顺序将每个 old 的全部匹配替换为 new。",
     "parameters": {"type": "object", "properties": {
         "page": {"type": "string", "description": "页面文件名,例 page-07.html"},
         "edits": {"type": "array", "description": "要替换的若干处,按顺序应用",
                   "items": {"type": "object", "properties": {
                       "old": {"type": "string", "description": "原文,要能在文件里找到"},
                       "new": {"type": "string", "description": "替换成什么"}},
                       "required": ["old", "new"], "additionalProperties": False}},
         },
         "required": ["page", "edits"], "additionalProperties": False}}

_WS = re.compile(r"\s+")


def _classify_miss(old: str, src: str) -> tuple[str, str, float]:
    """返回 (类别, 文件里最接近的一段, 相似度)。类别直接对应修法:
    空白差异 → 匹配时归一化空白就能过;转义差异 → old 里带了 JSON 转义;
    近似 → 改了字;不存在 → 引用了从没有过的内容。"""
    import difflib
    if not old.strip():
        return "空 old", "", 0.0
    if _WS.sub("", old) in _WS.sub("", src):
        return "空白差异", "", 1.0
    unescaped = old.replace('\\"', '"').replace("\\n", "\n").replace("\\/", "/")
    if unescaped != old and unescaped in src:
        return "转义差异", "", 1.0
    lines = src.splitlines()
    probe = next((l for l in old.splitlines() if l.strip()), old)[:200]
    best_i = max(range(len(lines)), key=lambda i: difflib.SequenceMatcher(
        None, probe.strip(), lines[i].strip()).ratio(), default=0)
    ratio = difflib.SequenceMatcher(None, probe.strip(), lines[best_i].strip()).ratio() if lines else 0.0
    lo, hi = max(0, best_i - 2), min(len(lines), best_i + 3)
    near = "\n".join(f"{j+1}│{lines[j]}" for j in range(lo, hi))
    return ("近似" if ratio >= 0.6 else "不存在"), near, round(ratio, 3)


def _log_patch_miss(cwd: Path, page: str, index: int, old: str, src: str) -> None:
    try:
        kind, near, ratio = _classify_miss(old, src)
        row = {"page": page, "edit": index, "kind": kind, "ratio": ratio,
               "old_len": len(old), "old_lines": old.count("\n") + 1,
               "old": old[:400], "nearest": near[:600]}
        with (cwd.parent / "patch-misses.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    except Exception as exc:  # 仪表不能把工具本身弄挂
        print(f"      ⚠ patch-miss 记录失败:{type(exc).__name__}: {exc}", flush=True)


def _patch(cwd: Path, a: dict) -> str | Out:
    """一次改好几处。

    照 lab 那条线的做法:每处 `s.replace(old, new)` 替换**全部**出现处,
    但**任何一处的 old 找不到就整批不写** —— 那就是它 279 条里 109 条
    `assert old in s` 干的事。逐处回报命中几次,免得一个 old 意外命中五处而没人看见。
    """
    page = str(a["page"])
    p = cwd / page
    if not p.exists():
        return f"失败:{page} 不存在。页面文件名形如 page-07.html"
    edits = a.get("edits") or []
    if not edits:
        return "失败:edits 是空的,没有要改的东西"

    s = p.read_text(encoding="utf-8")
    hits, miss = [], []
    for i, e in enumerate(edits, 1):
        old = e.get("old", "")
        n = s.count(old) if old else 0
        hits.append(n)
        if n == 0:
            miss.append(f"第 {i} 处:«{(old or '')[:60]}…» 在 {page} 里找不到")
            _log_patch_miss(cwd, page, i, old, s)
    if miss:
        return ("失败,一处都没改(整批不写,免得改一半):\n  " + "\n  ".join(miss) +
                "\n先 Read 一下当前内容,照原文一字不差地给 old。")

    for e in edits:
        s = s.replace(e["old"], e.get("new", ""))
    p.write_text(s, encoding="utf-8")
    tail = "、".join(f"第 {i} 处 {n} 次" for i, n in enumerate(hits, 1) if n != 1)
    msg = (f"{page} 改了 {len(edits)} 处,共 {sum(hits)} 次替换"
           + (f"(注意有的不止一次:{tail})" if tail else "") + "。")

    return msg
