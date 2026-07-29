"""可信测量标尺（Phase 0）：对一次矩阵产出的 15 份 deck 跑
① 确定性完整性门（零 token，先行）② Gemini 去偏成对排名（同题两两 + 位置互换）。

用法：
  uv run python scripts/eval_matrix.py                       # 评最新 results/matrix_*
  uv run python scripts/eval_matrix.py --matrix results/matrix_20260718_150051
  uv run python scripts/eval_matrix.py --gate-only           # 只跑确定性门，不调评委

产物：<matrix>/eval_v2/{eval.json, eval.md} —— 作为后续所有优化的冻结对照基线。
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

from lecture_agent.domain.evaluation import gate, rank
from run_matrix import PAGES, TOPICS, audience_of, build_llm, load_env, slug

ROOT = Path(__file__).resolve().parent.parent
SLUG2TOPIC = {slug(t): t for t in TOPICS}


def latest_matrix() -> Path:
    dirs = sorted((ROOT / "experiments" / "results").glob("matrix_*"), key=lambda p: p.stat().st_mtime)
    dirs = [d for d in dirs if d.is_dir() and "smoke" not in d.name]
    if not dirs:
        raise SystemExit("找不到 experiments/results/matrix_* 目录")
    return dirs[-1]


def load_decks(matrix: Path) -> dict[str, dict[str, dict]]:
    """→ {topic: {model_config: doc}}。model_config = 目录名（如 glm_5_2）。"""
    by_topic: dict[str, dict[str, dict]] = {}
    for deck in matrix.glob("*/*/deck.json"):
        model, topslug = deck.parent.parent.name, deck.parent.name
        topic = SLUG2TOPIC.get(topslug, topslug)
        doc = json.loads(deck.read_text(encoding="utf-8"))
        by_topic.setdefault(topic, {})[model] = doc
    return by_topic


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--matrix", default=None)
    ap.add_argument("--gate-only", action="store_true")
    args = ap.parse_args()
    load_env()

    matrix = Path(args.matrix) if args.matrix else latest_matrix()
    if not matrix.is_absolute():
        matrix = ROOT / matrix
    out = matrix / "eval_v2"
    out.mkdir(parents=True, exist_ok=True)
    by_topic = load_decks(matrix)
    print(f"→ 评测 {matrix.name}：{sum(len(m) for m in by_topic.values())} 份 deck，{len(by_topic)} 个课题")

    # ① 确定性门（零 token）
    gates: dict[str, dict] = {}
    for topic, decks in by_topic.items():
        for model, doc in decks.items():
            gates[f"{model}/{slug(topic)}"] = {
                "model": model,
                "topic": topic,
                **gate(doc, topic=topic, target_pages=PAGES),
            }
    npass = sum(g["pass"] for g in gates.values())
    print(f"→ 确定性门通过 {npass}/{len(gates)}")

    # ② Gemini 去偏成对排名（同题内）
    rankings: dict[str, dict] = {}
    if not args.gate_only:
        judge = build_llm("judge_gemini", namespace="judge_gemini")
        for topic, decks in by_topic.items():
            print(f"  评审「{topic}」：{len(decks)} 模型两两成对（位置互换双跑）...")
            rankings[topic] = await rank(
                judge, decks, topic=topic, audience=audience_of(topic)
            )

    _write(out, matrix.name, gates, rankings, npass, len(gates))
    print(f"✓ 基线 → {out / 'eval.md'}")


def _write(out: Path, name: str, gates: dict, rankings: dict, npass: int, total: int) -> None:
    (out / "eval.json").write_text(
        json.dumps(
            {"matrix": name, "gate": gates, "rankings": _rankings_jsonable(rankings)},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    L: list[str] = [f"# 可信基线 · {name}\n", "评委：Gemini 3.5 Flash（非被测，成对+位置互换双跑去偏）\n"]

    L.append("## ① 确定性完整性门（零 token，先于评委）\n")
    L.append(f"**通过 {npass}/{total}**\n")
    L.append("| 模型 | 课题 | 页 | 页Δ | 截断 | 首末页跑题 | 门 |")
    L.append("|---|---|--:|--:|--:|--:|:--:|")
    for g in gates.values():
        L.append(
            f"| {g['model']} | {g['topic'].split('（')[0]} | {g['pages']} | {g['page_delta']} | "
            f"{len(g['truncation'])} | {len(g['hero_offtopic'])} | {'✓' if g['pass'] else '✗'} |"
        )
    # 汇总最常见缺陷
    off = [g for g in gates.values() if g["hero_offtopic"]]
    L.append(f"\n**首/末页跑题：{len(off)}/{total} 份**（最触目的共性 bug）。样例：")
    for g in off[:6]:
        L.append(f"- {g['model']}·{g['topic'].split('（')[0]}：{g['hero_offtopic'][0]}")

    if rankings:
        L.append("\n## ② Gemini 去偏成对排名（同题内两两胜率）\n")
        for topic, r in rankings.items():
            L.append(f"### {topic}（{r['pairs']} 对，位置不一致 {r['inconsistencies']}）\n")
            L.append("| 名次 | 模型 | 胜率分 | 胜 | 平 | 负 |")
            L.append("|--:|---|--:|--:|--:|--:|")
            for i, (m, s, w, t, ls) in enumerate(r["ranking"], 1):
                L.append(f"| {i} | {m} | {s} | {w} | {t} | {ls} |")
            L.append("")
        # 跨题总分
        agg: dict[str, float] = {}
        for r in rankings.values():
            for m, s, *_ in r["ranking"]:
                agg[m] = agg.get(m, 0.0) + s
        L.append("### 跨 3 题总胜率分\n")
        L.append("| 模型 | 总分 |\n|---|--:|")
        for m, s in sorted(agg.items(), key=lambda x: -x[1]):
            L.append(f"| {m} | {round(s, 1)} |")

    (out / "eval.md").write_text("\n".join(L) + "\n", encoding="utf-8")


def _rankings_jsonable(rankings: dict) -> dict:
    return {
        t: {**r, "ranking": [list(x) for x in r["ranking"]]} for t, r in rankings.items()
    }


if __name__ == "__main__":
    asyncio.run(main())
