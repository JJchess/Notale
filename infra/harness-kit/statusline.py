#!/usr/bin/env python3
"""给分屏顶部状态栏用的一行摘要。**必须快** —— 每几秒被 tmux 调一次。

    ./statusline.py <runs目录> <label> [实验名]

抓包文件会长到几百个、每个几 MB,每次全量解析会让状态栏卡住。
所以这里做增量:解析过的文件记进 /tmp 的缓存,下次只读新增的那些。
"""

import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "measure"))
import price   # 唯一的价格表

THINK = re.compile(r'"thinking_delta","thinking":"((?:[^"\\]|\\.)*)"')


def human(n):
    return f"{n/1e6:.1f}M" if n >= 1e6 else (f"{n/1e3:.0f}k" if n >= 1e3 else str(n))


def main():
    if len(sys.argv) < 3:
        return
    runs, label = sys.argv[1], sys.argv[2]
    exp = sys.argv[3] if len(sys.argv) > 3 else ""
    d = os.path.join(runs, label)
    if not os.path.isdir(d):
        print(f" {exp} · {label}   等待第一次调用… ")
        return

    # 必须用稳定哈希 —— Python 的 hash() 每个进程都不一样(PYTHONHASHSEED 随机化),
    # 用它算出来的缓存名每次都变,等于每次全量重解析。实测差 5.2 秒 vs 0.02 秒。
    key = hashlib.md5(os.path.abspath(runs).encode()).hexdigest()[:10]
    cache_path = f"/tmp/.motale-status-{label}-{key}.json"
    # ⚠ schema 一变就丢弃旧缓存。否则已解析过的文件不会重算,
    # 而新加的字段(分类 token / 金额)在那些文件上永远是 0 —— 金额会静默偏低。
    SCHEMA = 2
    cache = {"schema": SCHEMA, "seen": [], "out": 0, "think": 0, "money": 0.0,
             "t0": None, "t1": None, **{k: 0 for k in price.KEYS}}
    try:
        old = json.load(open(cache_path))
        if old.get("schema") == SCHEMA:
            cache.update(old)
    except Exception:
        pass
    seen = set(cache["seen"])

    names = [f for f in os.listdir(d) if f.endswith(".json")]
    for f in names:
        if f in seen:
            continue
        p = os.path.join(d, f)
        try:
            j = json.load(open(p))
        except Exception:
            continue          # 还在写,下一轮再算
        seen.add(f)
        u = ((j.get("response") or {}).get("usage")) or {}
        if u:
            # 五类分开。cache_read($0.50/MTok) 和 1h 缓存写($10/MTok) 差 20 倍,
            # 加在一起就没法算钱了 —— 这里曾经就是加在一起的。
            for k, v in price.split(u).items():
                cache[k] += v
            c = price.cost_of((j.get("request") or {}).get("model"), u)
            if c: cache["money"] += c
        cache["out"] = cache["out"]
        raw = j.get("raw_response")
        if isinstance(raw, str):
            cache["think"] += sum(len(x) for x in THINK.findall(raw) if x)
        mt = os.path.getmtime(p)
        cache["t0"] = mt if cache["t0"] is None else min(cache["t0"], mt)
        cache["t1"] = mt if cache["t1"] is None else max(cache["t1"], mt)

    cache["seen"] = sorted(seen)
    try:
        json.dump(cache, open(cache_path, "w"))
    except Exception:
        pass

    mins = int((cache["t1"] - cache["t0"]) / 60) if cache["t0"] and cache["t1"] else 0
    bits = [f"{exp} · {label}" if exp else label,
            f"{mins}分",
            f"{len(seen)}次",
            f"读{human(cache['read'])}",
            f"出{human(cache['out'])}"]
    if cache["money"]:
        bits.append(f"\033[1m${cache['money']:.2f}\033[0m")
    if cache["think"]:
        bits.append(f"思考{human(cache['think'])}")
    else:
        bits.append("思考—")
    print(" " + "  ".join(bits) + " ")


if __name__ == "__main__":
    main()
