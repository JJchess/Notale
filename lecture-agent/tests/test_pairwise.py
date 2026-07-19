"""去偏成对评测单测：位置互换一致性 + 胜率聚合（用内容判定的 fake judge，无 LLM）。"""

from __future__ import annotations

import json

from lecture_agent.domain.evaluation import compare, rank
from lecture_agent.ports.llm import Message


class _ContentJudge:
    """据 summary 里的 title 判优（含 'GOOD' 者胜）——顺序无关，两次互换应一致。"""

    async def complete(
        self, messages: list[Message], *, json_mode: bool = True, purpose: str = "chat"
    ) -> str:
        user = messages[-1]["content"]
        a_first = user.index("讲义 A") < user.index("讲义 B")
        # A/B 段各自是否含 GOOD
        seg_a, seg_b = user.split("=== 讲义 B ===")
        a_good, b_good = "GOOD" in seg_a, "GOOD" in seg_b
        if a_good == b_good:
            w = "tie"
        else:
            w = "A" if a_good else "B"
        _ = a_first
        return json.dumps({"winner": w, "why": "test"})


class _PositionBiasedJudge:
    """永远选第一个（位置偏）——互换后必不一致 → compare 应判 tie。"""

    async def complete(
        self, messages: list[Message], *, json_mode: bool = True, purpose: str = "chat"
    ) -> str:
        return json.dumps({"winner": "A", "why": "always first"})


def _doc(title: str) -> dict:
    return {"title": title, "theme": "x", "scenes": [{"kind": "hero", "headline": title, "blocks": []}]}



async def test_compare_consistent_winner() -> None:
    r = await compare(_ContentJudge(), _doc("GOOD deck"), _doc("weak deck"), topic="T")
    assert r["winner"] == "A" and r["position_consistent"] is True



async def test_compare_position_bias_becomes_tie() -> None:
    r = await compare(_PositionBiasedJudge(), _doc("x"), _doc("y"), topic="T")
    assert r["winner"] == "tie" and r["position_consistent"] is False



async def test_rank_orders_by_winrate() -> None:
    decks = {"win": _doc("GOOD one"), "lose1": _doc("a"), "lose2": _doc("b")}
    out = await rank(_ContentJudge(), decks, topic="T")
    names = [row[0] for row in out["ranking"]]
    assert names[0] == "win"  # 唯一含 GOOD 者两胜居首
    assert out["ranking"][0][1] == 2.0
