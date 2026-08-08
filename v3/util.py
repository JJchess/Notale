"""小工具：LLM 输出的 JSON 提取、HTML 可见文本剥离、shingle 近重复。"""

from __future__ import annotations

import json
import re
from typing import Any


def extract_json(text: str) -> Any:
    """从 LLM 输出里提取第一个 JSON 对象/数组（容忍前后散文与 ```json 围栏）。"""
    m = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.S)
    candidate = m.group(1) if m else text
    start = None
    for i, ch in enumerate(candidate):
        if ch in "{[":
            start = i
            break
    if start is None:
        raise ValueError(f"输出中找不到 JSON：{text[:200]}")
    opener = candidate[start]
    closer = "}" if opener == "{" else "]"
    depth = 0
    in_str = False
    esc = False
    for j in range(start, len(candidate)):
        c = candidate[j]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == opener:
            depth += 1
        elif c == closer:
            depth -= 1
            if depth == 0:
                return json.loads(candidate[start : j + 1])
    raise ValueError(f"JSON 未闭合：{text[:200]}")


_TAG = re.compile(r"<[^>]+>")
_SCRIPT_STYLE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.S | re.I)


def visible_text(html: str) -> str:
    """剥掉 script/style/标签后的可见文本（供 L0 lint 用）。"""
    body = _SCRIPT_STYLE.sub(" ", html)
    body = _TAG.sub(" ", body)
    return re.sub(r"\s+", " ", body).strip()


def shingles(text: str, n: int = 5) -> set[str]:
    """字符级 n-gram 集合（中文按字、英文按词混在一起也够用）。"""
    compact = re.sub(r"\s+", "", text)
    if len(compact) < n:
        return {compact} if compact else set()
    return {compact[i : i + n] for i in range(len(compact) - n + 1)}


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)
