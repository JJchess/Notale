#!/usr/bin/env python3
"""第二道保险:轨迹里有没有碰到白名单外的路径。

    python3 measure/leaks.py runs/<label>

jail 是内核层面的第一道(它根本看不见);这一条是事后审计,证明它确实没看见 ——
gallery-deck-01 那轮没有 jail,顺着一个软链就把整套 harness 读了,而当时没人发现。
"""
import glob, json, re, sys
from pathlib import Path

OK = re.compile(r"^(~|/data1/home/\w+|/home/\w+)?/?(ws2/Notale/exp/|tmp/|proc/|usr/|etc/|dev/|bin/)")
PAT = re.compile(r"(?:~|/data1/home/\w+)/[\w./-]+")


def paths(label_dir: Path):
    files = [label_dir.with_suffix(".session.jsonl")] + \
            sorted(Path(str(label_dir) + ".session/subagents").glob("*.jsonl"))
    for f in files:
        if not f.is_file():
            continue
        lane = "main" if "subagents" not in str(f) else "sub:" + f.name[:8]
        for line in f.open():
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get("type") != "assistant":
                continue
            for b in d.get("message", {}).get("content", []) or []:
                if not isinstance(b, dict) or b.get("type") != "tool_use":
                    continue
                i = b.get("input", {})
                text = i.get("file_path") or i.get("command") or i.get("path") or ""
                for m in PAT.findall(str(text)):
                    yield lane, b["name"], m


def main():
    d = Path(sys.argv[1])
    hits = {}
    for lane, tool, p in paths(d):
        home = str(Path.home())
        q = p.replace(home, "~", 1)
        if q.startswith(("~/ws2/Notale/exp/", "~/.claude/projects/", "/tmp/")):
            continue
        hits.setdefault((lane, tool, q), 0)
        hits[(lane, tool, q)] += 1
    if not hits:
        print("  白名单之外的路径:0 处 —— 隔离成立")
        return
    print(f"  \033[31m白名单之外的路径 {len(hits)} 处:\033[0m")
    for (lane, tool, q), n in sorted(hits.items(), key=lambda kv: -kv[1])[:30]:
        print(f"    {lane:12s} {tool:6s} ×{n:<3d} {q}")


if __name__ == "__main__":
    main()
