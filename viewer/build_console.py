#!/usr/bin/env python3
"""扫描 lecture-agent 的实验产出（results/matrix_*），把每份 deck 拷进 viewer/experiments/
并生成 manifest.json，供 console.html 操作台切换预览 / 对比。

用法：  python viewer/build_console.py
之后开   http://127.0.0.1:8778/console.html
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

VIEWER = Path(__file__).resolve().parent
RESULTS = VIEWER.parent / "lecture-agent" / "results"
OUT = VIEWER / "experiments"

DISPLAY = {
    "glm_5_2": "GLM-5.2",
    "kimi_k2_7_code": "Kimi-K2.7-Code",
    "kimi_k2_6": "Kimi-K2.6",
    "deepseek_v4_pro": "DeepSeek-V4-Pro",
    "deepseek_v4_flash": "DeepSeek-V4-Flash",
}


def label_for(run: str, gate_pass: int, total: int) -> str:
    """给实验一个人话标签：日期 + 门通过率（越低越像'修复前基线'）。"""
    m = re.search(r"matrix_(\d{8})_(\d{6})", run)
    when = f"{m.group(1)[4:6]}-{m.group(1)[6:8]} {m.group(2)[:2]}:{m.group(2)[2:4]}" if m else run
    return f"{when}（门 {gate_pass}/{total}）"


def main() -> None:
    runs = sorted(
        [d for d in RESULTS.glob("matrix_*") if (d / "eval_v2" / "eval.json").exists()],
        key=lambda p: p.name,
    )
    if not runs:
        raise SystemExit("没找到带 eval_v2 的实验，先跑 scripts/eval_matrix.py")

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    experiments = []
    models_seen: list[str] = []
    topics_seen: list[str] = []

    for run in runs:
        ev = json.loads((run / "eval_v2" / "eval.json").read_text(encoding="utf-8"))
        gate = ev["gate"]
        rankings = ev["rankings"]
        rid = run.name
        (OUT / rid).mkdir(parents=True, exist_ok=True)

        decks = []
        for deck_path in sorted(run.glob("*/*/deck.json")):
            model_cfg, tslug = deck_path.parent.parent.name, deck_path.parent.name
            key = f"{model_cfg}/{tslug}"
            g = gate.get(key, {})
            topic = g.get("topic", tslug)
            fname = f"{model_cfg}__{tslug}.lecture.json"
            shutil.copyfile(deck_path, OUT / rid / fname)
            decks.append(
                {
                    "modelCfg": model_cfg,
                    "model": DISPLAY.get(model_cfg, model_cfg),
                    "topic": topic,
                    "slug": tslug,
                    "file": f"experiments/{rid}/{fname}",
                    "gate": {
                        "pass": g.get("pass"),
                        "pages": g.get("pages"),
                        "pageDelta": g.get("page_delta"),
                        "truncation": g.get("truncation", []),
                        "heroOfftopic": g.get("hero_offtopic", []),
                    },
                }
            )
            if DISPLAY.get(model_cfg, model_cfg) not in models_seen:
                models_seen.append(DISPLAY.get(model_cfg, model_cfg))
            if topic not in topics_seen:
                topics_seen.append(topic)

        npass = sum(1 for d in decks if d["gate"]["pass"])
        # 跨题聚合胜率分
        agg: dict[str, float] = {}
        rank_by_topic: dict[str, list] = {}
        for topic, r in rankings.items():
            rows = r["ranking"]
            rank_by_topic[topic] = [
                {"model": DISPLAY.get(row[0], row[0]), "score": row[1]} for row in rows
            ]
            for row in rows:
                agg[DISPLAY.get(row[0], row[0])] = agg.get(DISPLAY.get(row[0], row[0]), 0.0) + row[1]

        experiments.append(
            {
                "id": rid,
                "label": label_for(rid, npass, len(decks)),
                "gatePass": npass,
                "total": len(decks),
                "decks": decks,
                "rankByTopic": rank_by_topic,
                "aggregate": sorted(
                    ({"model": m, "score": round(s, 1)} for m, s in agg.items()),
                    key=lambda x: -x["score"],
                ),
            }
        )

    manifest = {
        "experiments": experiments,
        "models": models_seen,
        "topics": topics_seen,
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"✓ {len(experiments)} 个实验 → {OUT / 'manifest.json'}")
    for e in experiments:
        print(f"  · {e['id']}  {e['label']}  ({len(e['decks'])} decks)")
    print("打开 http://127.0.0.1:8778/console.html")


if __name__ == "__main__":
    main()
