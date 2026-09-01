#!/usr/bin/env python3
"""一轮花了多少 token,以及(配了价才算)多少钱。

    python3 -m core.cost --label trim-net-20260826
    python3 -m core.cost --label a --label b        # 多轮并排
    python3 -m core.cost --label a --json

## 为什么钱要单独一层,而且默认不算

**这条路由不报费用,而且查不到价。** 2026-08-26 实测:
`usage.cost` 恒为 `null`;`/dashboard/billing/usage`、`/usage`、`/pricing` 全部 404;
`/model/info`(LiteLLM 通常在这里带价格)回 403 —— 接口在,这个 key 没权限。
而它是代理路由,上游厂商的公开价目**不一定就是这里的结算价**。

所以这个模块只做两件事:
  1. 把四类 token 精确加总(这部分是硬数据,来自每次响应的 usage);
  2. **只有在 config.yaml 里配了 `pricing:` 时**才乘出金额。没配就只报 token。

不猜价。一个猜出来的成本数字比没有更糟 —— 它会被当成真的拿去做决策。

## 四类 token 为什么要分开

    输入(未命中)   全价
    输入(命中缓存) 便宜(OpenAI 侧约一折)
    输入(写入缓存) 通常带溢价(Anthropic 5 分钟档 1.25×)
    输出           另一个价,通常最贵

混成一个「输入总量」会把账算错,而且方向不定:缓存命中率高的轮次会被高估,
写入多的轮次会被低估。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.llm import ROOT, config  # noqa: E402


def tally(label: str) -> dict:
    """Read per-page token totals from the current Builder result artifact."""
    f = ROOT / "runs" / label / "builder-results.json"
    if not f.is_file():
        raise SystemExit(f"✗ 找不到 {f}")
    d = json.loads(f.read_text(encoding="utf-8"))
    tin = sum(v.get("tok_in", 0) for v in d.values())
    cached = sum(v.get("tok_cached", 0) for v in d.values())
    write = sum(v.get("tok_write", 0) for v in d.values())
    out = sum(v.get("tok_out", 0) for v in d.values())
    reported = any(v.get("cache_reported") for v in d.values())
    # 有 tok_in 但没有 cache_reported,说明这一轮跑在不报缓存的路由上,
    # 或者跑在 2026-08-26 加这几个字段之前 —— 两种都不能拿命中率说事。
    return {"label": label, "pages": len(d),
            "in_total": tin, "in_cached": cached, "in_fresh": max(tin - cached, 0),
            "cache_write": write, "out": out,
            "peak": max((v.get("tok_max", 0) for v in d.values()), default=0),
            "cache_reported": reported,
            "has_token_fields": tin > 0}


def price(t: dict) -> dict | None:
    """配了价才算。单位:每百万 token 的价格,币种由使用者自己定,这里不假设。"""
    p = (config().get("pricing") or {})
    need = ("in_fresh", "in_cached", "cache_write", "out")
    if not all(p.get(k) is not None for k in need):
        return None
    per = {k: t[k] / 1e6 * float(p[k]) for k in need}
    return {**per, "total": sum(per.values()), "unit": p.get("unit", "")}


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--label", action="append", required=True)
    a.add_argument("--json", action="store_true")
    n = a.parse_args()
    rows = [tally(x) for x in n.label]

    if n.json:
        print(json.dumps([{**r, "cost": price(r)} for r in rows],
                         ensure_ascii=False, indent=1))
        return

    print(f"\n  {'run':<28}{'页':>4}{'输入合计':>12}{'其中命中':>12}{'命中率':>7}"
          f"{'缓存写入':>11}{'输出':>10}{'峰值':>9}")
    print("  " + "─" * 93)
    for r in rows:
        if not r["has_token_fields"]:
            print(f"  {r['label']:<28}{r['pages']:>4}  —— 这一轮没有 token 字段"
                  f"(跑在 2026-08-26 加账之前)")
            continue
        hr = "未报" if not r["cache_reported"] else f"{r['in_cached']/max(r['in_total'],1)*100:.0f}%"
        print(f"  {r['label']:<28}{r['pages']:>4}{r['in_total']:>12,}{r['in_cached']:>12,}"
              f"{hr:>7}{r['cache_write']:>11,}{r['out']:>10,}{r['peak']:>9,}")

    costs = [(r, price(r)) for r in rows]
    if any(c for _, c in costs):
        print()
        for r, c in costs:
            if c:
                print(f"  {r['label']:<28}{c['total']:>12,.2f} {c['unit']}"
                      f"   (未命中 {c['in_fresh']:,.2f} / 命中 {c['in_cached']:,.2f}"
                      f" / 写入 {c['cache_write']:,.2f} / 输出 {c['out']:,.2f})")
    else:
        print("\n  金额未算:config.yaml 里没有 `pricing:`。")
        print("  这条路由不报 cost,也查不到价目(/model/info 403),所以**价格必须你来填**。")
        print("  填法(每百万 token):")
        print("    pricing:")
        print("      in_fresh: 0.0      # 未命中的输入")
        print("      in_cached: 0.0     # 命中缓存的输入")
        print("      cache_write: 0.0   # 写入缓存的输入")
        print("      out: 0.0           # 输出")
        print("      unit: CNY")


if __name__ == "__main__":
    main()
