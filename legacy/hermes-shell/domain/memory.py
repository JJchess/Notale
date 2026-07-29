"""记忆的纯逻辑（无 I/O）：情景召回排序 select_recall + 会话蒸馏 distill_session。

I/O（读 ledger/corpus、写 USER/MEMORY）在 adapters/memory；这里只做确定性的选择与结构化，可纯测。
本轮（P7）落 select_recall + 一个确定性的 distill_session（去重/裁剪）；LLM 驱动的复盘提取留待 evolve 环（C 组）。
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

_TOK = re.compile(r"[一-鿿]{2}|[A-Za-z]{3,}")


def _tokens(s: str) -> set[str]:
    """粗分词：中文 2-gram + 英文词，用于主题重叠打分（够排序用，无需精确）。"""
    s = s or ""
    zh = {s[i : i + 2] for i in range(len(s) - 1) if re.match(r"[一-鿿]{2}", s[i : i + 2])}
    return zh | set(_TOK.findall(s))


def select_recall(records: list[dict[str, Any]], topic: str, *, k: int = 5) -> list[str]:
    """按与 topic 的词重叠给情景记忆排序，回 top-k 摘要串。确定性（同分按 topic 名 tie-break）。"""
    tq = _tokens(topic)
    scored = [
        (len(tq & _tokens(str(r.get("topic", "")))), r)
        for r in records
    ]
    scored = [(s, r) for s, r in scored if s > 0]
    scored.sort(key=lambda sr: (-sr[0], str(sr[1].get("topic", ""))))
    return [
        f"『{r.get('topic')}』{r.get('pages')}页·theme={r.get('theme')}·{'ok' if r.get('ok') else 'err'}"
        for _, r in scored[:k]
    ]


@dataclass
class MemoryEdits:
    user_notes: list[str] = field(default_factory=list)
    memory_notes: list[str] = field(default_factory=list)


def distill_session(
    *, user_notes: Iterable[str] = (), memory_notes: Iterable[str] = ()
) -> MemoryEdits:
    """把候选笔记去重/去空/保序，产出 MemoryEdits（确定性结构化步；语义提取见 C 组 review）。"""

    def _clean(xs: Iterable[str]) -> list[str]:
        out: list[str] = []
        for x in xs:
            x = (x or "").strip()
            if x and x not in out:
                out.append(x)
        return out

    return MemoryEdits(user_notes=_clean(user_notes), memory_notes=_clean(memory_notes))
