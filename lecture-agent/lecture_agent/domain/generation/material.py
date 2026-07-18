"""长素材浓缩（LLM pass）：把长文档压成保事实摘要用于 grounding，替代硬截断。

对应旧 src/material.mjs。超长素材按自然边界分块各自浓缩再合并（map-reduce）。任何失败回退截断。
"""

from __future__ import annotations

import re

from ...ports.llm import LLMClient

_CHUNK = 12000
_BOUNDARIES = [re.compile(r"\n\n"), re.compile(r"\n"), re.compile(r"[。！？.!?][」）】\"']?")]


def _truncate(s: str, n: int) -> str:
    return s[:n] if len(s) > n else s


def chunk_text(src: str, size: int) -> list[str]:
    """按自然边界切块：切点回溯到块尾 25% 窗口内最近的段落/换行/句末，避免拦腰截句。"""
    s = str(src)
    if len(s) <= size:
        return [s]
    parts: list[str] = []
    i = 0
    while i < len(s):
        end = min(i + size, len(s))
        if end < len(s):
            floor = i + int(size * 0.75)
            cut = -1
            for rx in _BOUNDARIES:
                for m in rx.finditer(s, floor, end):
                    cut = m.end()
                if cut > floor:
                    break
            if cut > floor:
                end = cut
        parts.append(s[i:end])
        i = end
    return parts


async def _condense_one(llm: LLMClient, text: str, topic: str, target: int) -> str:
    sys = (
        "你是资深教研，负责把课程素材浓缩成保事实的摘要用于备课接地（grounding）。要求：\n"
        "- 保留所有具体事实：定义、公式、数字、关键例子、专有名词、步骤、因果关系。\n"
        "- 删除冗余、寒暄、重复表述、与课题无关的枝节。\n"
        "- 不要评论、不要加元话语，直接给浓缩后的知识内容。\n"
        f"- 中文输出，控制在约 {target} 字以内。只输出摘要正文，不要 JSON、不要标题。"
    )
    user = (
        f"课题：{topic or '(未指定)'}\n\n素材原文：\n{text}\n\n请浓缩为约 {target} 字的保事实摘要。"
    )
    out = await llm.complete(
        [{"role": "system", "content": sys}, {"role": "user", "content": user}],
        json_mode=False,
        purpose="material",
    )
    return str(out or "").strip()


async def condense_material(
    llm: LLMClient, material: str, *, topic: str = "", target_chars: int = 4000
) -> str:
    """material → 浓缩字符串（≈ ≤target_chars）。短素材原样返回；任何失败回退截断。"""
    src = str(material or "")
    if len(src) <= target_chars:
        return src
    try:
        if len(src) <= _CHUNK:
            digest = await _condense_one(llm, src, topic, target_chars)
            return _truncate(digest, target_chars + 400) if digest else _truncate(src, target_chars)
        parts = chunk_text(src, _CHUNK)
        per = max(600, target_chars // len(parts))
        digests: list[str] = []
        for part in parts:
            try:
                digests.append(await _condense_one(llm, part, topic, per))
            except Exception:  # noqa: BLE001
                digests.append(_truncate(part, per))
        merged = "\n\n".join(d for d in digests if d)
        if len(merged) > target_chars * 1.3:
            try:
                d2 = await _condense_one(llm, merged, topic, target_chars)
                return _truncate(d2, target_chars + 400) if d2 else _truncate(merged, target_chars)
            except Exception:  # noqa: BLE001
                return _truncate(merged, target_chars)
        return merged or _truncate(src, target_chars)
    except Exception:  # noqa: BLE001
        return _truncate(src, target_chars)
