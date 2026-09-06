#!/usr/bin/env python3
"""从抓包里把模型的思考过程提出来。

    python3 measure/thinking.py --calls runs/<label>              # 概览
    python3 measure/thinking.py --calls runs/<label> --top 8      # 看最长的几段
    python3 measure/thinking.py --calls runs/<label> --dump out.md  # 全文按步导出

为什么单独一个脚本:
    trajectory.py 量的是「它做了什么」—— 动作序列、工具配比、返工次数。
    这个量的是「它为什么这么做」。METHOD.md 分层的判据是:

        一致 → 固化成流水线。**模型在这里没有做决策**,只是按顺序干活。

    「有没有做决策」光看动作序列只能猜。思考长度给了一个直接的代理量:
    某一步前面想了 2000 字,那是决策点;想了 30 字,那是执行。

⚠ 前提:被试必须用 `--thinking-display summarized` 起。
    不加的话上游只回加密 signature,明文全是空串 —— 事件数看着正常,内容全空。
    fourier-01 就是这么丢掉的:1378 个 thinking_delta,明文非空 0 个。
"""

import argparse
import glob
import json
import os
import re
import sys

THINK = re.compile(r'"thinking_delta","thinking":"((?:[^"\\]|\\.)*)"')
SIG = re.compile(r'"signature_delta","signature":"((?:[^"\\]|\\.)*)"')


def unescape(chunks):
    if not chunks:
        return ""
    try:
        return json.loads('"' + "".join(chunks) + '"')
    except Exception:
        # 个别分片可能把转义序列切断,退化成逐片解码
        out = []
        for c in chunks:
            try:
                out.append(json.loads('"' + c + '"'))
            except Exception:
                out.append(c)
        return "".join(out)


def read_call(path):
    """→ {seq, model, thinking, sig_events, tools, text}"""
    try:
        d = json.load(open(path))
    except Exception:
        return None
    raw = d.get("raw_response")
    raw = raw if isinstance(raw, str) else ""
    thinking = unescape(THINK.findall(raw))
    resp = d.get("response") or {}
    blocks = resp.get("content") if isinstance(resp, dict) else None
    tools, text = [], []
    if isinstance(blocks, list):
        for b in blocks:
            if not isinstance(b, dict):
                continue
            if b.get("type") == "tool_use":
                tools.append(b.get("name"))
            elif b.get("type") == "text":
                text.append(b.get("text") or "")
    return {
        "file": os.path.basename(path),
        "seq": d.get("seq"),
        "lane": d.get("lane"),
        "model": (d.get("request") or {}).get("model", "?"),
        "thinking": thinking,
        "sig_events": len(SIG.findall(raw)),
        "tools": tools,
        "text": " ".join(text).strip(),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--calls", required=True, help="runs/<label> 目录")
    ap.add_argument("--top", type=int, default=6, help="列出最长的几段思考")
    ap.add_argument("--dump", help="把全部思考按步导出成 markdown")
    ap.add_argument("--lane", default="main", help="只看某条 lane(默认 main;all 表示全部)")
    a = ap.parse_args()

    files = sorted(glob.glob(os.path.join(a.calls, "*.json")))
    if not files:
        sys.exit(f"{a.calls} 里没有 json")

    calls = [c for c in (read_call(f) for f in files) if c]
    if a.lane != "all":
        calls = [c for c in calls if (c["lane"] or "main") == a.lane]

    withth = [c for c in calls if c["thinking"]]
    sig_only = [c for c in calls if not c["thinking"] and c["sig_events"]]
    total = sum(len(c["thinking"]) for c in calls)

    print("\n\033[1m▸ 思考过程\033[0m")
    print(f"  调用 {len(calls)} 次,其中 {len(withth)} 次有思考明文,合计 {total:,} 字符")

    if sig_only and not withth:
        print("\n\033[31m  ✗ 只有加密 signature,一个字明文都没有。\033[0m")
        print("    被试没带 --thinking-display summarized 起。这一轮的思考过程拿不回来了。")
        return
    if sig_only:
        print(f"  \033[33m⚠ 另有 {len(sig_only)} 次只有 signature 没有明文\033[0m")
    if not withth:
        print("  (这一轮没有扩展思考)")
        return

    lens = sorted(len(c["thinking"]) for c in withth)
    mid = lens[len(lens) // 2]
    print(f"  单次:中位 {mid:,} / 最长 {lens[-1]:,} / 最短 {lens[0]:,} 字符")

    # 决策点 vs 执行:用中位数的 2 倍当门槛
    gate = max(mid * 2, 400)
    heavy = [c for c in withth if len(c["thinking"]) >= gate]
    print(f"\n  \033[1m决策点\033[0m(思考 ≥ {gate:,} 字符,即中位数两倍):{len(heavy)} / {len(withth)}")
    print("  这些步骤模型在权衡;其余是按已定方案执行 —— 执行段才是能固化成流水线的候选。")

    print(f"\n\033[1m▸ 最长的 {a.top} 段\033[0m")
    for c in sorted(withth, key=lambda x: -len(x["thinking"]))[: a.top]:
        tools = ",".join(t for t in c["tools"] if t) or "(无工具调用)"
        head = " ".join(c["thinking"].split())[:150]
        print(f"\n  \033[36m#{c['seq']}\033[0m {len(c['thinking']):>6,} 字符 → {tools}")
        print(f"    {head}…")

    if a.dump:
        with open(a.dump, "w") as f:
            f.write(f"# 思考过程 — {a.calls}\n\n")
            f.write(f"{len(withth)} 次有思考,合计 {total:,} 字符。\n\n")
            for c in withth:
                tools = ",".join(t for t in c["tools"] if t) or "—"
                f.write(f"## #{c['seq']} · {len(c['thinking']):,} 字符 · → {tools}\n\n")
                f.write(c["thinking"].strip() + "\n\n")
        print(f"\n  全文 → {a.dump}")


if __name__ == "__main__":
    main()
