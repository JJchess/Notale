#!/usr/bin/env python3
"""把抓包里的 token 用量换成美元。**价格表只有这一份**,别抄。

    python3 price.py <runs>/<label> [更多 label 目录…]     # 分类表 + 总额
    python3 price.py <runs>/<label> --json                 # 给别的脚本吃

`statusline.py` / `watch.py` / `trajectory.py` 都 import 这里,
所以改单价只改这个文件。抄三份必然漂移,而漂移出来的金额没人会怀疑。

## 为什么不能只看总 token 数

同一个模型内部,**最贵和最便宜的差 20 倍**(Opus 5:输出 $25 vs 缓存读 $0.50)。
实测四轮:缓存读占 43-69% 的 token,输出只占 1% 上下的 token 却吃掉 18-28% 的钱。
把 cache_read 和 cache_creation 加在一起(旧 trajectory.py 干的事)是最坏的合并。

## 没算进去的

只覆盖**走过我们 proxy 的调用**。429 之类没有 usage 的不计价,单独报数 ——
算成 0 会让它们悄悄消失,而「限流了几次」本身是要看的。
"""

import json
import os
import sys

# ── 单价 USD / MTok ────────────────────────────────────────────────────────
# 2026-08-17 取自 https://platform.claude.com/docs/en/about-claude/pricing
#   顺序:新输入, 5分钟缓存写, 1小时缓存写, 缓存读, 输出
# 三条已核对的事实:
#   · 1M 上下文**没有溢价** —— 官方原话「900k token 的请求与 9k token 同单价」
#   · inference_geo 为 "us" 才有 1.1× 乘数;我们抓到的是 "not_available"(= global)
#   · service_tier "standard" 且无 speed:"fast" → 既非 batch 折扣也非 fast 溢价
RATES = {
    "claude-opus-5":   (5.0,  6.25, 10.0, 0.50, 25.0),
    "claude-opus-4-8": (5.0,  6.25, 10.0, 0.50, 25.0),
    "claude-sonnet-5": (2.0,  2.50,  4.0, 0.20, 10.0),
    "claude-haiku-4-5-20251001": (1.0, 1.25, 2.0, 0.10, 5.0),
}
KEYS = ("fresh", "w5m", "w1h", "read", "out")
M = 1_000_000


def rate_for(model):
    """未知 model 返回 None。**不要猜价** —— 报「未计价」比报一个编的数好。"""
    if not model:
        return None
    if model in RATES:
        return RATES[model]
    # claude-opus-5-20260xxx 这类带日期后缀的,退回前缀匹配
    for name, r in RATES.items():
        if model.startswith(name):
            return r
    return None


def split(usage):
    """usage → 五类 token。cache_creation 必须按 TTL 拆:5m 和 1h 单价差 60%。"""
    cc = usage.get("cache_creation") or {}
    w5 = cc.get("ephemeral_5m_input_tokens")
    w1 = cc.get("ephemeral_1h_input_tokens")
    if w5 is None and w1 is None:
        # 老抓包没有明细。整块归到 1h(取贵的那个),宁可高估不要低估。
        w5, w1 = 0, usage.get("cache_creation_input_tokens") or 0
    return {
        "fresh": usage.get("input_tokens") or 0,
        "w5m":   w5 or 0,
        "w1h":   w1 or 0,
        "read":  usage.get("cache_read_input_tokens") or 0,
        "out":   usage.get("output_tokens") or 0,
    }


def cost_of(model, usage):
    """单次调用多少钱。model 不认识就返回 None。"""
    r = rate_for(model)
    if r is None:
        return None
    t = split(usage)
    return sum(t[k] * r[i] for i, k in enumerate(KEYS)) / M


def tally(paths):
    """一批抓包 json → {模型: {token 分类, 金额分类, 次数}} + 未计价计数。"""
    per, unpriced, nousage = {}, {}, 0
    for p in paths:
        try:
            d = json.load(open(p))
        except Exception:
            continue
        u = (d.get("response") or {}).get("usage")
        if not u:
            nousage += 1               # 429 / 非 messages 端点 —— 不计价,单独报
            continue
        model = (d.get("request") or {}).get("model")
        r = rate_for(model)
        if r is None:
            unpriced[model] = unpriced.get(model, 0) + 1
            continue
        a = per.setdefault(model, {"calls": 0, "think": 0,
                                   **{k: 0 for k in KEYS}, **{"$" + k: 0.0 for k in KEYS}})
        a["calls"] += 1
        a["think"] += (u.get("output_tokens_details") or {}).get("thinking_tokens") or 0
        t = split(u)
        for i, k in enumerate(KEYS):
            a[k] += t[k]
            a["$" + k] += t[k] * r[i] / M
    return {"per_model": per, "unpriced": unpriced, "no_usage": nousage}


# ── 报告 ───────────────────────────────────────────────────────────────────
def h(n):
    return f"{n/1e6:.1f}M" if n >= 1e6 else (f"{n/1e3:.0f}k" if n >= 1e3 else str(n))


def report(label, res):
    per = res["per_model"]
    if not per:
        print(f"  {label:<16} 没有可计价的调用")
        return 0.0
    total = 0.0
    for model, a in sorted(per.items()):
        money = sum(a["$" + k] for k in KEYS)
        toks = sum(a[k] for k in KEYS)
        total += money
        name = label if model.startswith("claude-opus") else f"  └{model.split('-')[1]}"
        print(f"  {name:<16}{a['calls']:>5}{h(a['fresh']):>9}{h(a['w5m']):>9}{h(a['w1h']):>9}"
              f"{h(a['read']):>10}{h(a['out']):>9}{h(a['think']):>9}{h(toks):>9}{'$'+format(money,'.2f'):>10}")
    notes = []
    if res["no_usage"]:
        notes.append(f"{res['no_usage']} 次无 usage(限流等),未计价")
    for m, n in res["unpriced"].items():
        notes.append(f"{n} 次 {m} 未计价(价格表里没有)")
    if notes:
        print(f"  {'':<16}\033[33m⚠ {'; '.join(notes)}\033[0m")
    return total


def shares(res):
    """钱花在哪。token 的构成和钱的构成不是一回事,这个才是后者。"""
    out = {}
    for k in KEYS:
        out[k] = sum(a["$" + k] for a in res["per_model"].values())
    s = sum(out.values())
    return {k: (v / s if s else 0) for k, v in out.items()}, s


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    as_json = "--json" in sys.argv
    if not args:
        print(__doc__.strip().split("\n\n")[1]); return
    results = []
    for d in args:
        paths = [os.path.join(d, f) for f in os.listdir(d)
                 if f.endswith(".json") and f[0].isdigit()] if os.path.isdir(d) else [d]
        results.append((os.path.basename(d.rstrip("/")), tally(paths)))

    if as_json:
        print(json.dumps({lbl: {**r, "total": sum(sum(a["$" + k] for k in KEYS)
              for a in r["per_model"].values())} for lbl, r in results}, ensure_ascii=False, indent=2))
        return

    print(f"\n\033[1m▸ 花了多少\033[0m  单价见本文件 RATES(2026-08-17 官方文档)")
    print(f"  {'轮次':<14}{'调用':>5}{'新输入':>9}{'5m写':>9}{'1h写':>9}{'缓存读':>10}"
          f"{'输出':>9}{'其中思考':>9}{'总token':>9}{'价格':>10}")
    print("  " + "─" * 96)
    grand = 0.0
    for lbl, r in results:
        grand += report(lbl, r)
    if len(results) > 1:
        print("  " + "─" * 96)
        print(f"  {'合计':<14}{'':>60}{'$'+format(grand,'.2f'):>34}")

    print(f"\n  \033[2m钱花在哪(不是 token 花在哪)\033[0m")
    for lbl, r in results:
        sh, s = shares(r)
        if not s:
            continue
        print(f"    {lbl:<16}" + "  ".join(f"{k} {sh[k]*100:4.1f}%" for k in KEYS) + f"   = ${s:.2f}")
    print(f"\n  \033[33m只覆盖走过 proxy 的调用。要验口径对不对,拿控制台账单对一次。\033[0m")


if __name__ == "__main__":
    main()
