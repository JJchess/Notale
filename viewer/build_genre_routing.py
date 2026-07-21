#!/usr/bin/env python3
"""扫 lecture-agent/data/corpus/*.lecture.json，按 genre_routing 的 interactive/data/prose 分组，
聚合成 viewer/telemetry/genre_routing.json 供 genre-routing.html 消费。

镜像 build_coverage.py 的"results/corpus → viewer/telemetry"桥接手法：纯 stdlib，不依赖
lecture_agent 包。按 doc.title 匹配主题（而非猜 slug/id），直接读 doc 本身统计 block 类型——
不依赖账本 profile 字段，因为 S-013 那类"账本记干净成功但文档实际为空"的记录需要被这里识破。

用法：python viewer/build_genre_routing.py
"""

from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

VIEWER = Path(__file__).resolve().parent
CORPUS = VIEWER.parent / "lecture-agent" / "data" / "corpus"
OUT = VIEWER / "telemetry" / "genre_routing.json"
# 静态服务器一般会拒绝 "../" 跳出 served root(viewer/) 的请求，即便文件确实存在——
# 所以像 console.html 的 experiments/ 那样，把匹配到的 deck 复制进 viewer/ 自己的目录，
# 而不是存一个指回 lecture-agent/ 的相对路径。
DECKS_DIR = VIEWER / "telemetry" / "genre_routing_decks"

# 单一数据源：见 lecture-agent/examples/benchmark_topics.md 的溯源表。
# (topic, group, expect) —— group 用于左侧分组，expect 是该组的路由假设标签。
TOPICS: list[tuple[str, str]] = [
    ("梯度下降与学习率", "interactive"),
    ("二分查找", "interactive"),
    ("快速排序", "interactive"),
    ("简谐振动与阻尼", "interactive"),
    ("傅里叶级数", "interactive"),
    ("贝叶斯定理", "interactive"),
    ("神经网络的反向传播", "interactive"),
    ("供需曲线与市场均衡", "data"),
    ("复利与长期投资", "data"),
    ("全球气候变化的关键数据", "data"),
    ("光合作用的机制", "data"),
    ("宋代文人画的美学", "prose"),
    ("法国大革命的起因", "prose"),
    ("唐诗中的意象", "prose"),
    ("存在主义哲学入门", "prose"),
]
GROUP_LABEL = {
    "interactive": "互动友好 · interactive",
    "data": "数据 · data",
    "prose": "散文 · prose",
}
INTERACTIVE_TYPES = {"sim", "runnable", "formula"}


def _block_type_counts(doc: dict[str, Any]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for scene in doc.get("scenes") or []:
        for b in scene.get("blocks") or []:
            t = b.get("type")
            if t:
                key = f"{t}:{b['engine']}" if t == "sim" and b.get("engine") else t
                counts[key] = counts.get(key, 0) + 1
    return counts


# genre_routing 真跑窗口起点（早于此的 corpus 文件一律不参与匹配，避免误配到无关历史实验）。
# 留半小时余量，早于本次真跑最早的 18:26。
_RUN_FLOOR_TS = datetime(2026, 7, 20, 17, 30, 0).timestamp()


def _find_deck(topic: str) -> dict[str, Any] | None:
    """按题目匹配 corpus 里的 deck：模型写的 title 有时是简称（如"反向传播"对"神经网络的反向传播"），
    doc.title 精确匹配失败也不代表生成失败——用双向子串匹配兜底，同时只在本次真跑窗口内找。
    同题多份（重试）取最近修改的一份。
    """
    candidates = []
    if not CORPUS.is_dir():
        return None
    for path in CORPUS.glob("*.lecture.json"):
        mtime = path.stat().st_mtime
        if mtime < _RUN_FLOOR_TS:
            continue
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        t = doc.get("title") or ""
        if t and (t in topic or topic in t):
            candidates.append((mtime, path, doc))
    if not candidates:
        return None
    candidates.sort(key=lambda c: c[0])
    _, path, doc = candidates[-1]
    return {"path": path, "doc": doc}


def build() -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = {"interactive": [], "data": [], "prose": []}

    for topic, group in TOPICS:
        found = _find_deck(topic)
        if found is None:
            groups[group].append({"topic": topic, "status": "failed"})
            continue
        doc, path = found["doc"], found["path"]
        scenes = doc.get("scenes") or []
        if not scenes:
            groups[group].append(
                {
                    "topic": topic,
                    "status": "empty",
                    "file": path.name,
                    "title_field": doc.get("title"),
                }
            )
            continue
        block_types = _block_type_counts(doc)
        interactive_hits = sum(
            n for k, n in block_types.items() if k.split(":")[0] in INTERACTIVE_TYPES
        )
        # 复制进 viewer/telemetry/genre_routing_decks/，index.html 的 ?doc= 才能在 viewer/ 服务根下 fetch 到。
        DECKS_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, DECKS_DIR / path.name)
        rel_file = f"telemetry/genre_routing_decks/{path.name}"
        groups[group].append(
            {
                "topic": topic,
                "status": "ok",
                "file": rel_file,
                "theme": doc.get("theme"),
                "pages": len(scenes),
                "block_types": dict(sorted(block_types.items(), key=lambda kv: -kv[1])),
                "interactive_hits": interactive_hits,
            }
        )

    return {
        "group_label": GROUP_LABEL,
        "groups": [
            {"key": g, "label": GROUP_LABEL[g], "topics": groups[g]}
            for g in ("interactive", "data", "prose")
        ],
    }


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = build()
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    n_ok = sum(1 for g in data["groups"] for t in g["topics"] if t["status"] == "ok")
    n_total = sum(len(g["topics"]) for g in data["groups"])
    print(f"✓ {n_ok}/{n_total} 题 → {OUT}")
