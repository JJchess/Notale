"""去偏成对评测（judge 经 ports.LLMClient）：位置互换双跑 + 一致性检查 + 反长度偏。

对应 `ce-advanced-evaluation` 的 bias landscape：
- 位置偏 → A-vs-B 与 B-vs-A 各跑一次，映射回后不一致即判平局（position swap + consistency）。
- 长度偏 → 提示词显式要求"别因更长而偏好"。
- 自偏 → 评委用非被测模型（Gemini，配置在 configs/llm/judge_gemini.yaml）。

主观质量（哪份讲义更好）用成对比人类偏好相关性更高；最终排名以两两胜率为准，direct-score 三维（ppteval）
仅作逐维诊断。
"""

from __future__ import annotations

import asyncio
from itertools import combinations
from typing import Any

from ...ports.llm import LLMClient
from ...utils.jsonio import parse_json
from .ppteval import summarize

_SYS = """你是严格的讲义质量评审，判断两份同题讲义大纲 A / B 哪份整体更适合教学。评分维度：内容准确充实、由浅入深连贯、教学呈现（交互放在该放的知识点、难度贴合受众、克制不塞满）、以及**首尾页与末页是否紧扣课题**。

关键去偏纪律（务必遵守）：
- **不要因为某份更长/信息更多就偏好它**；简洁完整与详尽同等有价值，冗余堆砌应扣分。
- 只依据教学质量，不看呈现顺序位置。
- 若出现与课题无关的封面/收尾/整页内容，视为严重缺陷。

只输出 JSON：{ "winner": "A" | "B" | "tie", "why": "一句话依据（指出决定性差异）" }"""


def _prompt(topic: str, audience: str, a: str, b: str) -> str:
    aud = f"（受众：{audience}）" if audience else ""
    return (
        f"课题：{topic}{aud}\n\n=== 讲义 A ===\n{a}\n\n=== 讲义 B ===\n{b}\n\n"
        "判断 A / B 哪份整体更好，输出 winner JSON。"
    )


_FLIP = {"A": "B", "B": "A", "tie": "tie", "TIE": "tie", "": "tie"}


async def _one(judge: LLMClient, topic: str, audience: str, a: str, b: str) -> str:
    try:
        r = parse_json(
            await judge.complete(
                [
                    {"role": "system", "content": _SYS},
                    {"role": "user", "content": _prompt(topic, audience, a, b)},
                ],
                purpose="pairwise",
            )
        )
        w = str(r.get("winner", "tie")).strip().upper()
        return w if w in ("A", "B") else "tie"
    except Exception:  # noqa: BLE001 —— 单次评判失败按平局，不拖垮排名
        return "tie"


async def compare(
    judge: LLMClient, doc_a: dict[str, Any], doc_b: dict[str, Any], *, topic: str, audience: str = ""
) -> dict[str, Any]:
    """位置互换双跑：返回 {winner: 'A'|'B'|'tie', position_consistent: bool}。

    第二次把 B 放前、A 放后；映射回后与第一次一致才认，不一致=位置偏在作祟→判平局。
    """
    sa, sb = summarize(doc_a), summarize(doc_b)
    ab, ba_raw = await asyncio.gather(
        _one(judge, topic, audience, sa, sb),  # A 在前
        _one(judge, topic, audience, sb, sa),  # B 在前
    )
    ba = _FLIP[ba_raw]  # 映射回"A/B"语义
    if ab == ba:
        return {"winner": ab, "position_consistent": True}
    return {"winner": "tie", "position_consistent": False}


async def rank(
    judge: LLMClient,
    decks: dict[str, dict[str, Any]],
    *,
    topic: str,
    audience: str = "",
    concurrency: int = 3,
) -> dict[str, Any]:
    """同题内多模型两两成对（去偏）→ 胜率排名。decks: {model_name: doc}。

    每对 1 分制：胜=1、平=0.5。返回 {ranking:[(model,score,wins,ties,losses)], matrix, inconsistencies}。
    """
    names = list(decks)
    pairs = list(combinations(names, 2))
    sem = asyncio.Semaphore(concurrency)
    results: dict[tuple[str, str], dict[str, Any]] = {}

    async def run_pair(x: str, y: str) -> None:
        async with sem:
            results[(x, y)] = await compare(
                judge, decks[x], decks[y], topic=topic, audience=audience
            )

    await asyncio.gather(*(run_pair(x, y) for x, y in pairs))

    score = dict.fromkeys(names, 0.0)
    wins = dict.fromkeys(names, 0)
    ties = dict.fromkeys(names, 0)
    losses = dict.fromkeys(names, 0)
    inconsistencies = 0
    matrix: dict[str, dict[str, str]] = {n: {} for n in names}
    for (x, y), r in results.items():
        if not r["position_consistent"]:
            inconsistencies += 1
        w = r["winner"]
        if w == "A":
            score[x] += 1
            wins[x] += 1
            losses[y] += 1
            matrix[x][y], matrix[y][x] = "win", "loss"
        elif w == "B":
            score[y] += 1
            wins[y] += 1
            losses[x] += 1
            matrix[x][y], matrix[y][x] = "loss", "win"
        else:
            score[x] += 0.5
            score[y] += 0.5
            ties[x] += 1
            ties[y] += 1
            matrix[x][y], matrix[y][x] = "tie", "tie"

    ranking = sorted(
        ((n, score[n], wins[n], ties[n], losses[n]) for n in names), key=lambda t: -t[1]
    )
    return {
        "ranking": ranking,
        "matrix": matrix,
        "inconsistencies": inconsistencies,
        "pairs": len(pairs),
    }
