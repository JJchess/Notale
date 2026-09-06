#!/usr/bin/env python3
"""实验跑的时候盯着看。**只读,不碰任何正在跑的东西。**

    ./watch.py fourier-02              # 每 5 秒刷一次
    ./watch.py fourier-02 --once       # 打一次就退出
    ./watch.py fourier-02 --interval 15

它读的是 proxy 边跑边写的 runs/<label>/*.json,所以能实时反映:
花了多少、上下文涨到哪、在用什么工具、思考抓到没有、产物写出来几个。

写到一半的 json 会解析失败 —— 直接跳过,下一轮刷新自然就补上了。
"""

import argparse
import glob
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "measure"))
import price   # 唯一的价格表

THINK = re.compile(r'"thinking_delta","thinking":"((?:[^"\\]|\\.)*)"')
BLOCKS = "▁▂▃▄▅▆▇█"
C = {"b": "\033[1m", "d": "\033[2m", "g": "\033[32m", "y": "\033[33m",
     "r": "\033[31m", "c": "\033[36m", "x": "\033[0m"}


def spark(vals, width=48):
    if not vals:
        return ""
    if len(vals) > width:
        step = len(vals) / width
        vals = [vals[int(i * step)] for i in range(width)]
    lo, hi = min(vals), max(vals)
    if hi == lo:
        return BLOCKS[0] * len(vals)
    return "".join(BLOCKS[min(7, int((v - lo) / (hi - lo) * 7.99))] for v in vals)


def human(n):
    return f"{n/1e6:.1f}M" if n >= 1e6 else (f"{n/1e3:.0f}k" if n >= 1e3 else str(n))


# 这个进程长期运行,解析过的文件不再重解析。
# 不加缓存的话每次刷新要重扫全部抓包 —— 实测 127 个文件 5 秒,面板里等于一直
# 满 CPU 而且画不出来。抓包文件写完就不变,所以只认文件名做键是安全的。
_CACHE = {}


def scan(calls_dir, work):
    files = sorted(glob.glob(os.path.join(calls_dir, "*.json")))
    st = {"n": 0, "bad": 0, "fresh": 0, "cread": 0, "cwrite": 0, "out": 0,
          "w5m": 0, "w1h": 0, "money": 0.0, "unpriced": 0,
          "ctx": [], "tools": [], "think_chars": 0, "think_calls": 0,
          "sig_only": 0, "models": {}, "last_think": "", "t0": None, "t1": None}
    for f in files:
        hit = _CACHE.get(f)
        if hit is not None:
            if hit == "bad":
                st["bad"] += 1
                continue
            st["n"] += 1
            st["models"][hit["m"]] = st["models"].get(hit["m"], 0) + 1
            st["fresh"] += hit["fresh"]; st["cread"] += hit["cread"]
            st["cwrite"] += hit["cwrite"]; st["out"] += hit["out"]
            if hit["ctx"] is not None:
                st["ctx"].append(hit["ctx"])
            st["tools"].extend(hit["tools"])
            if hit["think"]:
                st["think_calls"] += 1
                st["think_chars"] += len(hit["think"])
                st["last_think"] = hit["think"]
            elif hit["sig"]:
                st["sig_only"] += 1
            st["t0"] = hit["mt"] if st["t0"] is None else min(st["t0"], hit["mt"])
            st["t1"] = hit["mt"] if st["t1"] is None else max(st["t1"], hit["mt"])
            continue
        try:
            d = json.load(open(f))
        except Exception:
            st["bad"] += 1
            continue
        st["n"] += 1
        m = (d.get("request") or {}).get("model", "?")
        st["models"][m] = st["models"].get(m, 0) + 1
        u = ((d.get("response") or {}).get("usage")) or {}
        st["fresh"] += u.get("input_tokens", 0)
        st["cread"] += u.get("cache_read_input_tokens", 0)
        # 缓存写必须按 TTL 分开:5m 是 $6.25/MTok、1h 是 $10 —— 差 60%。
        # 实测 subagent 用 5m、主 agent 用 1h,混在一起算不出并行的真实代价。
        _cc = u.get("cache_creation") or {}
        st["w5m"] += _cc.get("ephemeral_5m_input_tokens", 0)
        st["w1h"] += _cc.get("ephemeral_1h_input_tokens", 0)
        st["cwrite"] += u.get("cache_creation_input_tokens", 0)
        st["out"] += u.get("output_tokens", 0)
        if u:
            _c = price.cost_of(m, u)
            if _c: st["money"] += _c
            else: st["unpriced"] += 1
        if "opus" in m and u:
            st["ctx"].append(u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0))
        blocks = (d.get("response") or {}).get("content")
        if isinstance(blocks, list):
            for b in blocks:
                if isinstance(b, dict) and b.get("type") == "tool_use":
                    st["tools"].append(b.get("name"))
        _just_thought = False; _just_sig = False
        raw = d.get("raw_response")
        if isinstance(raw, str):
            parts = [p for p in THINK.findall(raw) if p]
            if parts:
                _just_thought = True
                st["think_calls"] += 1
                joined = "".join(parts)
                st["think_chars"] += len(joined)
                try:
                    st["last_think"] = json.loads('"' + joined + '"')
                except Exception:
                    pass
            elif '"type":"thinking"' in raw or "signature_delta" in raw:
                st["sig_only"] += 1
                _just_sig = True
        mt = os.path.getmtime(f)
        st["t0"] = mt if st["t0"] is None else min(st["t0"], mt)
        st["t1"] = mt if st["t1"] is None else max(st["t1"], mt)
        _CACHE[f] = {
            "m": m, "mt": mt,
            "fresh": u.get("input_tokens", 0),
            "cread": u.get("cache_read_input_tokens", 0),
            "cwrite": u.get("cache_creation_input_tokens", 0),
            "w5m": (u.get("cache_creation") or {}).get("ephemeral_5m_input_tokens", 0),
            "w1h": (u.get("cache_creation") or {}).get("ephemeral_1h_input_tokens", 0),
            "money": (price.cost_of(m, u) or 0.0) if u else 0.0,
            "out": u.get("output_tokens", 0),
            "ctx": (u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0))
                   if ("opus" in m and u) else None,
            "tools": [b.get("name") for b in (blocks or []) if isinstance(b, dict) and b.get("type") == "tool_use"],
            "think": st["last_think"] if _just_thought else "",
            "sig": _just_sig,
        }
    # 产物:工作目录里不在起点清单上的文件
    st["made"] = []
    if work and os.path.isdir(work):
        man = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           ".manifests", work.replace("/", "-") + ".sha256")
        base = set()
        if os.path.exists(man):
            base = {l.split(None, 1)[1].strip() for l in open(man) if l.strip()}
        for root, dirs, fs in os.walk(work):
            dirs[:] = [d for d in dirs if d not in ("materials", ".claude")]
            for fn in fs:
                rel = "./" + os.path.relpath(os.path.join(root, fn), work)
                if rel not in base:
                    st["made"].append(rel)
    return st


def render(label, st, calls_dir):
    o = []
    A = o.append
    elapsed = (st["t1"] - st["t0"]) if st["t0"] and st["t1"] else 0
    idle = time.time() - st["t1"] if st["t1"] else 0
    live = f"{C['g']}● 在跑{C['x']}" if idle < 90 else f"{C['y']}○ 静默 {idle/60:.0f} 分{C['x']}"

    A(f"{C['b']}▸ {label}{C['x']}   {live}   墙钟 {elapsed/60:.0f} 分   调用 {st['n']}"
      + (f"   {C['r']}{st['bad']} 个写到一半{C['x']}" if st["bad"] else ""))

    tot = st["fresh"] + st["cread"] + st["cwrite"]
    hit = st["cread"] / tot * 100 if tot else 0
    A(f"\n  {C['d']}token{C['x']}   非缓存in {human(st['fresh'])}   "
      f"缓存读 {C['b']}{human(st['cread'])}{C['x']}   "
      f"缓存写 {human(st['w5m'])}(5m)+{human(st['w1h'])}(1h)   "
      f"out {human(st['out'])}   命中 {hit:.0f}%")
    if st.get("money"):
        # 钱的构成和 token 的构成不是一回事:缓存读常占七成 token 但单价最低。
        A(f"  {C['d']}花了{C['x']}   {C['g']}${st['money']:.2f}{C['x']}"
          + (f"   {C['y']}({st['unpriced']} 次未计价){C['x']}" if st.get("unpriced") else ""))
    for m, c in sorted(st["models"].items(), key=lambda x: -x[1]):
        tag = "" if "opus" in m else f"  {C['y']}← 非主循环{C['x']}"
        A(f"  {C['d']}{'':7}{C['x']}{c:>4}x  {m}{tag}")

    if st["ctx"]:
        A(f"\n  {C['d']}上下文{C['x']}  当前 {C['b']}{human(st['ctx'][-1])}{C['x']}"
          f"   峰值 {human(max(st['ctx']))}")
        A(f"  {C['d']}{'':8}{C['x']}{C['c']}{spark(st['ctx'])}{C['x']}")

    if st["tools"]:
        cnt = {}
        for t in st["tools"]:
            cnt[t] = cnt.get(t, 0) + 1
        A(f"\n  {C['d']}动作{C['x']}    " + "  ".join(f"{k} {v}" for k, v in sorted(cnt.items(), key=lambda x: -x[1])))
        A(f"  {C['d']}最近{C['x']}    " + " ".join(st["tools"][-16:]))

    if st["think_calls"]:
        A(f"\n  {C['d']}思考{C['x']}    {C['g']}✓{C['x']} {st['think_calls']} 次有明文   "
          f"合计 {human(st['think_chars'])} 字符")
        if st["last_think"]:
            A(f"  {C['d']}最近{C['x']}    {C['d']}" + " ".join(st["last_think"].split())[:150] + f"…{C['x']}")
    elif st["sig_only"]:
        A(f"\n  {C['d']}思考{C['x']}    {C['r']}✗ 只有加密 signature,明文全空{C['x']}"
          f"  —— 被试没带 --thinking-display summarized")
    else:
        A(f"\n  {C['d']}思考{C['x']}    {C['d']}(还没出现){C['x']}")

    if st["made"]:
        A(f"\n  {C['d']}产物{C['x']}    {len(st['made'])} 个文件")
        for f in sorted(st["made"])[:10]:
            A(f"  {C['d']}{'':8}{C['x']}{f}")
        if len(st["made"]) > 10:
            A(f"  {C['d']}{'':8}… 还有 {len(st['made'])-10} 个{C['x']}")
    return "\n".join(o)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("label")
    ap.add_argument("--runs", default=None)
    ap.add_argument("--exp", default=None, help="实验名(用来定位工作目录)")
    ap.add_argument("--work", default=None, help="被试工作目录;不给就从实验定义读")
    ap.add_argument("--interval", type=float, default=5)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()

    kit = os.path.dirname(os.path.abspath(__file__))
    runs = a.runs or os.path.join(kit, "runs")
    work = a.work
    if not work:
        exps = os.path.join(os.path.dirname(kit), "experiments")
        cands = sorted(glob.glob(os.path.join(exps, a.exp or "*", "experiment.sh")))
        for c in cands:
            for line in open(c):
                if line.startswith("EXP_WORK_DEFAULT="):
                    work = os.path.expandvars(line.split("=", 1)[1].strip().strip('"'))
                    work = os.path.expanduser(work.replace("$HOME", "~"))
        if not work:
            work = os.path.expanduser("~/exp/zero")
    calls = os.path.join(runs, a.label)
    if not os.path.isdir(calls):
        sys.exit(f"找不到 {calls}")

    try:
        while True:
            out = render(a.label, scan(calls, work), calls)
            if a.once:
                print(out)
                return
            sys.stdout.write("\033[2J\033[H" + out + f"\n\n{C['d']}  每 {a.interval:.0f} 秒刷新 · Ctrl-C 退出{C['x']}\n")
            sys.stdout.flush()
            time.sleep(a.interval)
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
