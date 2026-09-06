#!/usr/bin/env python3
"""字段清单 —— 做减法用的那张表。

harness 的上下文 schema 不该被发明出来,应该是**从 Claude Code 实际发出的东西上
删减**得到的。这个脚本把"实际发出的东西"摊开:每个字段出现过多少次、长什么样。
拿着这张表逐行问一句「我们的 harness 需要它吗」,答案是「不需要」就划掉,
最后剩下的就是 schema。

    python3 fields.py --calls runs/exp-01          # 看请求体(wire 层)
    python3 fields.py --session runs/exp-01.session.jsonl   # 看 transcript(记录层)

两份是**两份记录,不是一份的两种写法**:
    请求体里没有任何时间戳;transcript 里没有完整请求体。
把它们拍成一个扁平结构,两边都会记不全 —— 这个错误已经犯过一次。

输出里的百分比是"多少条记录里出现过这个字段"。100% 的是骨架,个位数的多半是
CLI 自省或界面用的,通常第一批就能划掉。
"""

from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path


def sample(v, n=58) -> str:
    s = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
    s = " ".join(s.split())
    return s if len(s) <= n else s[:n] + "…"


def report(title: str, seen: collections.Counter, total: int,
           examples: dict) -> None:
    print(f"\n\033[1m{title}\033[0m  (共 {total} 条)")
    for k, n in seen.most_common():
        print(f"  {n / total:>6.0%}  {k:<34}{sample(examples.get(k))}")
    print(f"  —— {len(seen)} 个字段")


def scan_calls(d: Path) -> None:
    files = sorted(d.glob("*.json"))
    top, ex = collections.Counter(), {}
    blk, blk_ex = collections.Counter(), {}
    sysk, toolk = collections.Counter(), collections.Counter()
    for f in files:
        rec = json.loads(f.read_text(encoding="utf-8"))
        req = rec.get("request") or {}
        for k, v in req.items():
            top[k] += 1; ex.setdefault(k, v)
        for m in req.get("messages") or []:
            c = m.get("content")
            for b in (c if isinstance(c, list) else []):
                if isinstance(b, dict):
                    blk[b.get("type", "?")] += 1
                    for k in b:
                        blk_ex.setdefault(f"{b.get('type','?')}.{k}", b[k])
        for b in (req.get("system") or []) if isinstance(req.get("system"), list) else []:
            for k in b:
                sysk[k] += 1
        for t in req.get("tools") or []:
            for k in t:
                toolk[k] += 1
    report("请求体顶层字段", top, len(files), ex)
    print(f"\n\033[1mcontent block 类型\033[0m")
    for k, n in blk.most_common():
        print(f"  {n:>8}  {k}")
    print(f"\n\033[1mblock 内的字段\033[0m")
    for k in sorted(blk_ex):
        print(f"  {k:<34}{sample(blk_ex[k])}")
    if sysk:
        print(f"\n\033[1msystem 块字段\033[0m  {dict(sysk)}"
              f"\n  (cache_control 在这里 —— 它是缓存断点,位置动了缓存就废了)")
    if toolk:
        print(f"\n\033[1mtool 定义字段\033[0m  {dict(toolk)}")


def scan_session(p: Path) -> None:
    files = [p]
    subdir = p.with_suffix("") / "subagents"
    if subdir.is_dir():
        files += sorted(subdir.glob("*.jsonl"))
    seen, ex, n = collections.Counter(), {}, 0
    for f in files:
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                d = json.loads(line)
            except ValueError:
                continue
            n += 1
            for k, v in d.items():
                seen[k] += 1; ex.setdefault(k, v)
    report(f"transcript 行字段  ({len(files)} 个文件)", seen, max(n, 1), ex)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--calls")
    ap.add_argument("--session")
    a = ap.parse_args()
    if not a.calls and not a.session:
        ap.error("至少给 --calls 或 --session 其中一个")
    if a.calls:
        scan_calls(Path(a.calls))
    if a.session:
        scan_session(Path(a.session))
    print()


if __name__ == "__main__":
    main()
