#!/usr/bin/env python3
"""从一轮实验的轨迹里量出七件事 —— harness 的形状就是从这七个数推出来的。

    python3 trajectory.py --session runs/exp-01.session.jsonl --calls runs/exp-01

只要其中一个也能跑:`--calls` 给成本,`--session` 给动作。两个都给最完整。

七问,以及每一问决定 harness 里的哪一处:

    1. 花了多少          调用数、input/cache/output —— 决定值不值得做,以及缓存有没有生效
    2. 主 agent 干了什么  它的工具序列 —— **两轮之间序列一致就固化成流水线,不一致就只能是循环**
    3. 子 agent 干了什么  每个子任务的步数分布 —— 差 4 倍以上就别想固化,老老实实写循环
    4. 用了哪些工具      main / sub 分开统计 —— 决定 harness 要实现哪几个工具,不要多给
    5. 真的并行了吗      按 requestId 的时间重叠算,不是按行数
    6. 时间花在哪        派发跨度 vs 执行跨度 —— 串行代价往往藏在"把简报写出来"这一段
    7. 产物被改了几次    每个文件的 Write / Edit 次数 —— 收敛靠什么闸,从这里看

三个已经踩过的坑,写进代码免得再踩:

  * 一次 API 响应会落成三四行(thinking / text / tool_use 各一行)。**按行数算并行度
    会得出"其实是串行的"这种错误结论。** 并行度只能按 requestId 分组之后看时间重叠。
  * 同一组 requestId 里只有一行的 usage 是完整的,其余带占位值(见过 out=3 的 Write)。
    取 output_tokens 最大的那一行,不能取第一行,也不能取字面上的最后一行 —— 并发
    写入下行序不保证。
  * 主 transcript 里 Agent 的 tool_result 时间戳是**派发**时刻,不是完成时刻(实测只
    差几毫秒)。用它算子任务时长会得到一片 0:00。完成时刻只能取子 agent 自己的最后一行。
"""

from __future__ import annotations

import argparse
import collections
import json
import statistics
from datetime import datetime
from pathlib import Path

import price   # 唯一的价格表。同目录,脚本模式下直接可 import


def ts(s: str) -> float:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def mmss(sec: float) -> str:
    sec = max(0.0, sec)
    return f"{int(sec // 60)}:{int(sec % 60):02d}"


def load_jsonl(p: Path) -> list[dict]:
    out = []
    for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("timestamp"):
            out.append(d)
    return sorted(out, key=lambda d: ts(d["timestamp"]))


def blocks(row: dict) -> list[dict]:
    c = (row.get("message") or {}).get("content")
    return [b for b in c if isinstance(b, dict)] if isinstance(c, list) else []


def tool_uses(row: dict) -> list[dict]:
    return [b for b in blocks(row) if b.get("type") == "tool_use"]


# ── 1. 花了多少 ────────────────────────────────────────────────────────────
def cost(calls_dir: Path) -> None:
    files = sorted(calls_dir.glob("*.json"))
    if not files:
        print(f"  {calls_dir} 里没有 json"); return
    # ⚠ 曾经这里把 cache_read 和 cache_creation 加成一个「缓存 in」。
    # 对计价那是最坏的合并 —— Opus 5 缓存读 $0.50/MTok、1h 缓存写 $10/MTok,差 20 倍。
    # 现在五类分开,金额走 price.py(唯一的价格表)。
    by_lane = collections.defaultdict(lambda: dict(n=0, money=0.0, **{k: 0 for k in price.KEYS}))
    models, truncated, unpriced = collections.Counter(), 0, 0
    for f in files:
        d = json.loads(f.read_text(encoding="utf-8"))
        u = (d.get("response") or {}).get("usage")
        model = (d.get("request") or {}).get("model", "?")
        models[model] += 1
        truncated += bool(d.get("truncated"))
        row = by_lane[d.get("lane", "?")]
        row["n"] += 1
        if not u:
            continue                      # 429 之类,没有 usage —— 不计价
        for k, v in price.split(u).items():
            row[k] += v
        c = price.cost_of(model, u)
        if c is None: unpriced += 1
        else: row["money"] += c

    hdr = f"  {'lane':<6}{'调用':>6}{'新输入':>10}{'5m写':>10}{'1h写':>10}{'缓存读':>12}{'输出':>10}{'价格':>10}"
    print(hdr)
    for lane, r in sorted(by_lane.items()):
        print(f"  {lane:<6}{r['n']:>6}{r['fresh']:>10,}{r['w5m']:>10,}{r['w1h']:>10,}"
              f"{r['read']:>12,}{r['out']:>10,}{'$'+format(r['money'],'.2f'):>10}")
    tot = {k: sum(r[k] for r in by_lane.values()) for k in ("n", "money", *price.KEYS)}
    print(f"  {'合计':<6}{tot['n']:>6}{tot['fresh']:>10,}{tot['w5m']:>10,}{tot['w1h']:>10,}"
          f"{tot['read']:>12,}{tot['out']:>10,}{'$'+format(tot['money'],'.2f'):>10}")
    all_in = tot["fresh"] + tot["w5m"] + tot["w1h"] + tot["read"]
    if all_in:
        print(f"  缓存命中率 {tot['read'] / all_in:.1%}"
              f"   ← 低于 90% 说明前缀被破坏了,查是不是历史被就地改写过")
    if tot["money"]:
        # **钱的构成 ≠ token 的构成。** 缓存读常占 40-70% 的 token 却只花几个点的钱,
        # 输出占 1% 的 token 却吃掉 1/4 的钱。所以这一行按金额算,不按 token 摊。
        res = price.tally([str(f) for f in files])
        sh, s = price.shares(res)
        print("  钱花在哪  " + "  ".join(f"{k} {sh[k]*100:.1f}%" for k in price.KEYS))
    if unpriced:
        print(f"  ⚠ {unpriced} 次调用的 model 不在价格表里,未计价")
    for m, n in models.most_common():
        print(f"    {n:>5}  {m}")
    if truncated:
        print(f"  ⚠ {truncated} 次响应流被截断 —— 这些记录会把故障伪装成正常样本,别拿去算统计")


# ── 2/3/4/7. 动作 ──────────────────────────────────────────────────────────
def actions(main_rows: list[dict], sub_files: dict[str, list[dict]]) -> None:
    def hist(rows):
        c = collections.Counter()
        for r in rows:
            for b in tool_uses(r):
                c[b.get("name", "?")] += 1
        return c

    main_h = hist(main_rows)
    sub_h = collections.Counter()
    for rows in sub_files.values():
        sub_h += hist(rows)

    print(f"  {'工具':<16}{'main':>8}{'sub':>8}")
    for name in sorted(set(main_h) | set(sub_h), key=lambda k: -(main_h[k] + sub_h[k])):
        print(f"  {name:<16}{main_h[name]:>8}{sub_h[name]:>8}")

    # 主 agent 的动作序列。两轮实验跑出同一条序列 = 这一段可以固化成流水线;
    # 不一致 = 只能写成循环,让模型自己决定下一步。这是 harness 分层的唯一依据。
    seq = [b.get("name") for r in main_rows for b in tool_uses(r)]
    print(f"\n  主 agent 动作序列({len(seq)} 步),原样贴出来和另一轮逐项比对:")
    line = "    "
    for i, s in enumerate(seq):
        piece = f"{s} "
        if len(line) + len(piece) > 96:
            print(line); line = "    "
        line += piece
    print(line)

    # 子任务的步数分布。差 4 倍以上就不要指望固化。
    if sub_files:
        steps = sorted(len([b for r in rows for b in tool_uses(r)]) for rows in sub_files.values())
        print(f"\n  子 agent {len(steps)} 个,每个的步数: {steps}")
        print(f"    最少 {steps[0]}  中位 {statistics.median(steps):.0f}  最多 {steps[-1]}"
              f"   极差 {steps[-1] / max(1, steps[0]):.1f}×"
              f"   ← 超过 ~2× 就别固化成流水线,写成循环")

    # 每个文件被写/改几次:收敛过程长什么样。Write 恒等于 1、后面全是 Edit,
    # 说明是"写一次 + 闸驱动收敛";Write 多次说明它在推倒重来。
    touched = collections.Counter()
    for rows in [main_rows, *sub_files.values()]:
        for r in rows:
            for b in tool_uses(r):
                if b.get("name") in ("Write", "Edit", "NotebookEdit"):
                    f = (b.get("input") or {}).get("file_path", "?")
                    touched[(Path(f).name, b["name"])] += 1
    if touched:
        names = sorted({k[0] for k in touched})
        print(f"\n  产物 {len(names)} 个,写/改次数(只列改动最多的 15 个):")
        rank = sorted(names, key=lambda n: -sum(v for k, v in touched.items() if k[0] == n))
        for n in rank[:15]:
            print(f"    {n:<28} Write {touched[(n, 'Write')]:>2}   Edit {touched[(n, 'Edit')]:>3}")


# ── 5/6. 并行度与时间 ──────────────────────────────────────────────────────
def timing(main_rows: list[dict], sub_files: dict[str, list[dict]]) -> None:
    if not main_rows:
        return
    t0, t1 = ts(main_rows[0]["timestamp"]), ts(main_rows[-1]["timestamp"])
    print(f"  会话墙钟 {mmss(t1 - t0)}")

    # 派发时刻:一条消息里的多个 Agent 调用是**边流式输出边派发**的,不是同时起跑。
    # 这批时间戳直接量出了"把 N 份简报写出来"的串行代价 —— 常常是最大的一块隐藏成本。
    dispatch = [ts(r["timestamp"]) for r in main_rows
                for b in tool_uses(r) if b.get("name") == "Agent"]
    if len(dispatch) > 1:
        print(f"  Agent 派发 {len(dispatch)} 次,首尾相差 {mmss(max(dispatch) - min(dispatch))}"
              f"   ← 这段是纯串行的简报生成代价")

    spans = []
    for name, rows in sub_files.items():
        if rows:
            spans.append((name, ts(rows[0]["timestamp"]), ts(rows[-1]["timestamp"])))
    if not spans:
        return
    spans.sort(key=lambda x: x[1])
    print(f"\n  {'子 agent':<26}{'起(相对)':>12}{'时长':>9}")
    for name, a, b in spans:
        print(f"  {name:<26}{mmss(a - t0):>12}{mmss(b - a):>9}")

    # 真实并行度:任一时刻同时在跑的子 agent 数的峰值。按行数猜是猜不出来的。
    events = sorted([(a, 1) for _, a, _ in spans] + [(b, -1) for _, _, b in spans])
    cur = peak = 0
    for _, d in events:
        cur += d
        peak = max(peak, cur)
    busy = sum(b - a for _, a, b in spans)
    print(f"  峰值并发 {peak}   子 agent 忙碌总时长 {mmss(busy)}"
          f"   相对墙钟的加速比 {busy / max(1e-9, t1 - t0):.1f}×")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", help="Claude Code 的 transcript jsonl")
    ap.add_argument("--calls", help="proxy.py 的输出目录")
    a = ap.parse_args()
    if not a.session and not a.calls:
        ap.error("至少给 --session 或 --calls 其中一个")

    if a.calls:
        print("\n\033[1m▸ 1. 花了多少\033[0m")
        cost(Path(a.calls))

    if a.session:
        p = Path(a.session)
        rows = load_jsonl(p)
        # 子 agent 的记录不在主 jsonl 里,而在同名目录的 subagents/ 下。
        # 归档时忘了一起拷,这里就一条子 agent 也看不到 —— 而输出不会报错,只会变短。
        subs: dict[str, list[dict]] = {}
        subdir = p.with_suffix("") / "subagents"
        if subdir.is_dir():
            for f in sorted(subdir.glob("*.jsonl")):
                subs[f.stem] = load_jsonl(f)
        else:
            # 有些版本把 sidechain 行混在主文件里,用 isSidechain 分开
            side = collections.defaultdict(list)
            for r in rows:
                if r.get("isSidechain"):
                    side[r.get("sessionId", "sub")].append(r)
            subs = dict(side)
        main_rows = [r for r in rows if not r.get("isSidechain")]

        print(f"\n\033[1m▸ 2-4,7. 动作\033[0m  (主 {len(main_rows)} 行,子 agent {len(subs)} 个)")
        actions(main_rows, subs)
        print("\n\033[1m▸ 5-6. 并行度与时间\033[0m")
        timing(main_rows, subs)
    print()


if __name__ == "__main__":
    main()
