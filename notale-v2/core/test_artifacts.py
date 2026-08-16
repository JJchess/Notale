"""拿 nn-06 的真实产物验:解析回结构再渲染回去,必须逐字节相同。

这是「学格式」和「预设格式」的分界线。只要我偷偷规范化了空白、重排了小节、
或者把自由散文塞进了固定字段,round-trip 就会当场对不上。

    python3 core/test_artifacts.py
"""

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from core.artifacts import REQUIRED, Brief, parse_contract, parse_plan

SRC = pathlib.Path("/data1/home/zhuyifan/ws2/Notale/lab/derived-nn-06")


def roundtrip(name, text, parse):
    obj = parse(text)
    out = obj.render()
    if out == text:
        print(f"  ok  {name} round-trip 逐字节相同 ({len(text):,} 字符)")
        return obj
    # 不同就把第一处差异指出来,不许含糊过去
    i = next((k for k in range(min(len(out), len(text))) if out[k] != text[k]),
             min(len(out), len(text)))
    print(f"  ✗   {name} 不一致: 原 {len(text)} → 渲染 {len(out)},首个差异在第 {i} 字符")
    print(f"      原文 {text[max(0,i-60):i+60]!r}")
    print(f"      渲染 {out[max(0,i-60):i+60]!r}")
    raise SystemExit(1)


print("1. 无损 round-trip")
plan = roundtrip("PLAN.md", (SRC / "PLAN.md").read_text(), parse_plan)
roundtrip("CONTRACT.md", (SRC / "CONTRACT.md").read_text(), parse_contract)

print("\n2. 骨架是量出来的,不是定出来的")
entries = plan.entries
print(f"  ok  解析出 {len(entries)} 页")
bad = {e.pid: e.missing() for e in entries if e.missing()}
print(f"  {'ok ' if not bad else '✗  '} 8 项骨架齐全的页: {len(entries) - len(bad)}/{len(entries)}"
      + (f"  缺失: {bad}" if bad else ""))
print(f"      骨架 = {'、'.join(REQUIRED)}")

print("\n3. 访问器只暴露实际存在的东西")
e = next(x for x in entries if x.pid == "page-16")
print(f"  page-16 章       = {e.value('章')}")
print(f"  page-16 kicker   = {e.value('kicker')}")
print(f"  page-16 take     = {(e.value('take') or '')[:40]}…")
print(f"  page-16 独占     = {e.value('独占')}")
print(f"  page-16 内容     = {len(e.section('内容') or '')} 字符自由文本")
print(f"  page-16 否决的形式 = {len(e.section('否决的形式') or '')} 字符自由文本")
for absent in ("role", "budget", "libs", "establishes"):
    assert e.value(absent) is None
print(f"  ok  role / budget / libs / establishes 一律取不到 —— 它们不在页里")

print("\n4. 顶层小节按原文保留")
for h, _ in plan.sections:
    if h:
        print(f"      {h.strip()}")

print("\n5. brief 就是 Agent 工具的入参,一个字段不多")
briefs = [Brief(**{k: v for k, v in b.items() if k in ("description", "prompt", "subagent_type")})
          for b in json.loads((SRC / "briefs.json").read_text())]
lens = sorted(len(b.prompt) for b in briefs)
print(f"  ok  {len(briefs)} 份 brief,prompt 最短 {lens[0]} / 中位 {lens[len(lens)//2]} / 最长 {lens[-1]} 字符")
assert all(set(b.as_tool_input()) == {"description", "prompt", "subagent_type"} for b in briefs)
print("  ok  as_tool_input() 的键与实测抓包完全一致")

print("\n全部通过")
