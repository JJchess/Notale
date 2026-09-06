#!/usr/bin/env python3
"""把 proxy.py 抓到的一堆 json 渲染成能读的东西。

每次调用都会重发全量上下文,所以直接看单个 json 是浪费的 —— 真正的新信息只有
「这次新追加的输入」+「这次的输出」。默认视图就是按这个思路把整轮拼成一份对话。

并行 subagent 的调用会和主 agent 交错落盘,各自是独立上下文,所以「新增输入」
必须按 lane 分开算,混在一条线上算出来的增量是错的。proxy 已经在每个文件里写了
lane(main/sub)和 lane_id(system prompt 哈希),这里据此分组渲染。

    python3 view.py llm_calls/run-01                  # 每次调用一行摘要(带 lane 列)
    python3 view.py llm_calls/run-01 --transcript      # 按 lane 分组的可读对话(常用)
    python3 view.py llm_calls/run-01 --transcript -o run-01.md
    python3 view.py llm_calls/run-01 --lane main       # 只看主 agent
    python3 view.py llm_calls/run-01 --lane sub-2      # 只看第 2 个 subagent
    python3 view.py llm_calls/run-01/0002-main-ab12cd34.json   # 单次调用完整渲染
    python3 view.py ... --full                         # 不截断长文本
    python3 view.py ... --system                       # 连 system prompt 一起打印
"""

import argparse
import json
import re
import sys
from pathlib import Path

W = 100          # 分隔线宽度
LIMIT = 1200     # 单块文本截断长度


def trunc(s: str, limit=LIMIT, full=False) -> str:
    s = s or ""
    if full or len(s) <= limit:
        return s
    return s[:limit] + f"\n  … [还有 {len(s) - limit:,} 字符,加 --full 看全部]"


def sys_text(req) -> str:
    s = req.get("system")
    if isinstance(s, list):
        return "".join(b.get("text", "") for b in s)
    return s or ""


def sys_chars(req) -> int:
    return len(sys_text(req))


def is_aux(req) -> bool:
    """辅助调用(标题生成之类):没有工具、system 明显偏短。"""
    return not req.get("tools") and sys_chars(req) < 5000


def lane_of(d):
    """(lane, lane_id)。优先读 proxy 写好的字段;旧抓包没有就现场判定。"""
    lane, lane_id = d.get("lane"), d.get("lane_id")
    if lane and lane_id:
        return lane, lane_id
    import hashlib
    st = sys_text(d.get("request") or {})
    lane = "sub" if "cc_is_subagent=true" in st else "main"
    return lane, hashlib.sha256(st.encode("utf-8")).hexdigest()[:8]


def first_user_text(req) -> str:
    """取首条 user 消息里真正的任务文字。
    注入的 <system-reminder> 会占据第一个 text 块,跳过它才看得到实际任务。"""
    cands = []
    for m in req.get("messages") or []:
        if m.get("role") != "user":
            continue
        c = m.get("content")
        if isinstance(c, str):
            cands.append(c)
        else:
            cands += [b.get("text", "") for b in c or []
                      if isinstance(b, dict) and b.get("type") == "text"]
        if cands:
            break
    for s in cands:
        t = s.strip()
        if t and not t.startswith("<system-reminder>") and not t.startswith("<session>"):
            return t
    return cands[0] if cands else ""


def blocks(content):
    """把 message.content 归一成 [(type, text)]。"""
    if isinstance(content, str):
        return [("text", content)]
    out = []
    for b in content or []:
        if not isinstance(b, dict):
            continue
        t = b.get("type")
        if t in ("text", "thinking"):
            out.append((t, b.get(t) or ""))
        elif t == "tool_use":
            out.append((t, f"{b.get('name')}  {json.dumps(b.get('input'), ensure_ascii=False)}"))
        elif t == "tool_result":
            c = b.get("content")
            if isinstance(c, list):
                parts = []
                for x in c:
                    if not isinstance(x, dict):
                        continue
                    if x.get("type") == "image":
                        src = x.get("source") or {}
                        parts.append(f"[图片 {src.get('media_type','?')},"
                                     f" base64 {len(src.get('data') or ''):,} 字符,已省略]")
                    else:
                        parts.append(x.get("text") or "")
                c = "\n".join(parts)
            out.append((t, c if isinstance(c, str) else json.dumps(c, ensure_ascii=False)))
        else:
            out.append((t or "?", json.dumps(b, ensure_ascii=False)[:400]))
    return out


def msg_sig(m):
    """用于跨调用比对「这条 message 是不是已经见过」。"""
    return (m.get("role"), tuple((t, len(s)) for t, s in blocks(m.get("content"))))


def load(d: Path):
    def key(p):
        m = re.match(r"(\d+)", p.name)
        return int(m.group(1)) if m else 0
    return sorted(d.glob("*.json"), key=key)


def build_lanes(files, keep_aux=False):
    """返回 (records, lanes)。
    records: [{f, d, req, resp, lane, lane_id, aux, mtime}] 按 seq
    lanes:   {lane_id: {"label", "lane", "records", "task"}},主在前,subagent 按首次出现排序
    """
    records = []
    for f in files:
        d = json.loads(f.read_text(encoding="utf-8"))
        req, resp = d.get("request", {}), d.get("response", {})
        lane, lane_id = lane_of(d)
        records.append(dict(f=f, d=d, req=req, resp=resp, lane=lane,
                            lane_id=lane_id, aux=is_aux(req),
                            mtime=f.stat().st_mtime))   # 落盘时刻,--study 用它标「第几分钟」

    order, groups = [], {}
    for r in records:
        if r["aux"] and not keep_aux:
            continue
        if r["lane_id"] not in groups:
            groups[r["lane_id"]] = []
            order.append(r["lane_id"])
        groups[r["lane_id"]].append(r)

    # 主 lane 里调用最多的那个当作「主 agent」,其余 main lane 视为附属
    main_ids = [i for i in order if groups[i][0]["lane"] == "main"]
    sub_ids = [i for i in order if groups[i][0]["lane"] == "sub"]
    main_ids.sort(key=lambda i: -len(groups[i]))

    lanes, n = {}, 0
    for i, lid in enumerate(main_ids):
        label = "main" if i == 0 else f"main-{i+1}"
        lanes[lid] = dict(label=label, lane="main", records=groups[lid],
                          task=first_user_text(groups[lid][0]["req"]))
    for lid in sub_ids:
        n += 1
        lanes[lid] = dict(label=f"sub-{n}", lane="sub", records=groups[lid],
                          task=first_user_text(groups[lid][0]["req"]))
    ordered = {lid: lanes[lid] for lid in main_ids + sub_ids}
    return records, ordered


def cmd_summary(files, args):
    records, lanes = build_lanes(files, keep_aux=True)
    label_of = {lid: v["label"] for lid, v in lanes.items()}

    print(f"{'#':>4}  {'lane':<7} {'类型':<5} {'msgs':>4} {'上下文tok':>10} {'out':>6}  输出")
    print("-" * W)
    for r in records:
        u = r["resp"].get("usage") or {}
        ctx = ((u.get("input_tokens") or 0) + (u.get("cache_read_input_tokens") or 0)
               + (u.get("cache_creation_input_tokens") or 0))
        kinds = [s.split("  ")[0] if t == "tool_use" else t
                 for t, s in blocks(r["resp"].get("content"))]
        lab = label_of.get(r["lane_id"], r["lane"])
        print(f"{r['d'].get('seq', 0):>4}  {lab:<7} {'辅助' if r['aux'] else '主':<5} "
              f"{len(r['req'].get('messages') or []):>4} {ctx:>10,} "
              f"{u.get('output_tokens', 0):>6}  {', '.join(kinds) or '-'}")

    subs = [v for v in lanes.values() if v["lane"] == "sub"]
    if subs:
        print(f"\n{len(subs)} 个 subagent:")
        for v in subs:
            n_calls = len(v["records"])
            first = v["records"][0]["d"].get("seq")
            print(f"  {v['label']:<7} {n_calls:>3} 次调用,首次出现在 #{first}"
                  f"   任务: {' '.join(v['task'].split())[:70]}")
    else:
        print("\n没有 subagent —— 全程单线程")


def cmd_transcript(files, args, out=sys.stdout):
    p = lambda *a: print(*a, file=out)
    records, lanes = build_lanes(files, keep_aux=args.aux)
    label_of = {lid: v["label"] for lid, v in lanes.items()}

    # 交错时间线:一眼看出并行结构
    p(f"{'=' * W}\n调用时间线(按发生顺序,看并行结构)\n{'=' * W}")
    line, cur = [], None
    for r in records:
        if r["aux"] and not args.aux:
            continue
        lab = label_of.get(r["lane_id"], "?")
        line.append(f"#{r['d'].get('seq')}:{lab}")
    p("  " + "  →  ".join(line))
    p(f"\n共 {len(lanes)} 条 lane:")
    for lid, v in lanes.items():
        p(f"  {v['label']:<7} ({lid})  {len(v['records']):>3} 次调用"
          f"   任务: {' '.join(v['task'].split())[:70]}")

    for lid, v in lanes.items():
        if args.lane and args.lane not in (v["label"], lid):
            continue
        p(f"\n\n{'█' * W}\n█ lane {v['label']}  ({v['lane']}, {lid})  "
          f"{len(v['records'])} 次调用\n{'█' * W}")

        first = v["records"][0]
        sblocks = (first["req"].get("system") if isinstance(first["req"].get("system"), list)
                   else [{"text": sys_text(first["req"])}])
        p(f"\nSYSTEM PROMPT  ({len(sblocks)} 块 / {sys_chars(first['req']):,} 字符)")
        p(f"TOOLS  ({len(first['req'].get('tools') or [])} 个): "
          f"{', '.join(t['name'] for t in first['req'].get('tools') or [])}")
        if args.system:
            for i, b in enumerate(sblocks):
                p(f"\n--- system[{i}] ({len(b.get('text','')):,} 字符) ---")
                p(trunc(b.get("text", ""), 10 ** 6, args.full))
        else:
            p("(加 --system 打印 system prompt 全文)")

        seen = set()
        for r in v["records"]:
            u = r["resp"].get("usage") or {}
            p(f"\n{'#' * W}\n# call {r['d'].get('seq')}  [{v['label']}]"
              f"{'  [辅助调用]' if r['aux'] else ''}"
              f"   out={u.get('output_tokens', 0)} tok\n{'#' * W}")

            news = [m for m in (r["req"].get("messages") or []) if msg_sig(m) not in seen]
            for m in r["req"].get("messages") or []:
                seen.add(msg_sig(m))
            for m in news:
                for t, s in blocks(m.get("content")):
                    p(f"\n  ▼ 新增输入 · {m.get('role')}.{t}  ({len(s):,} 字符)")
                    p(indent(trunc(s, args.limit, args.full)))

            for t, s in blocks(r["resp"].get("content")):
                mark = {"thinking": "◆ 思考", "text": "◆ 输出",
                        "tool_use": "◆ 工具调用"}.get(t, f"◆ {t}")
                extra = ""
                if t == "thinking" and not s:
                    extra = "  (正文被服务端 redact-thinking 抹除)"
                p(f"\n  {mark}  ({len(s):,} 字符){extra}")
                if s:
                    p(indent(trunc(s, args.limit, args.full)))


# ── 学习视图 ───────────────────────────────────────────────────────────────
# 给人读的。默认的 --transcript 是给「查证」用的:什么都不丢。
# 这个是给「学」用的:**只有思考是完整的**,工具的输入输出全压成一行 ——
# 因为实测 subagent 的思考里 53.8% 是布局坐标推演,那才是要学的东西,
# 而 Read 回来的 495 行 kit.js 你已经知道长什么样了。

_ARG_KEYS = ("file_path", "command", "pattern", "path", "prompt", "url", "query", "description")


def _arg(inp) -> str:
    """一个工具调用最该显示的那个参数。"""
    if not isinstance(inp, dict):
        return ""
    for k in _ARG_KEYS:
        v = inp.get(k)
        if isinstance(v, str) and v.strip():
            v = " ".join(v.split())
            return v if len(v) <= 68 else v[:66] + "…"
    return ""


def _size(inp) -> str:
    """写文件类调用:内容有多大。"""
    if not isinstance(inp, dict):
        return ""
    for k in ("content", "new_string"):
        v = inp.get(k)
        if isinstance(v, str):
            return f"{len(v.splitlines())} 行"
    return ""


def _brief(b) -> str:
    """一块 content → 一行摘要。"""
    t = b.get("type")
    if t == "tool_use":
        return f"{b.get('name')}  {_arg(b.get('input'))}".rstrip() + (
            f"   [{_size(b.get('input'))}]" if _size(b.get("input")) else "")
    if t == "tool_result":
        c = b.get("content")
        imgs = 0
        if isinstance(c, list):
            parts = []
            for x in c:
                if not isinstance(x, dict):
                    continue
                if x.get("type") == "image":
                    imgs += 1
                else:
                    parts.append(x.get("text") or "")
            c = "\n".join(parts)
        c = c if isinstance(c, str) else json.dumps(c, ensure_ascii=False)
        head = " ".join((c or "").split())[:56]
        bits = []
        if c:
            bits.append(f"{len(c.splitlines())} 行 / {len(c):,} 字符")
        if imgs:
            bits.append(f"{imgs} 张图")          # 自己截的图 —— 自检回路的证据
        return (f"{' · '.join(bits)}" + (f"   「{head}…」" if head else "")) if bits else "(空)"
    if t == "text":
        return " ".join((b.get("text") or "").split())[:120]
    return t or "?"


def cmd_study(files, args, out=sys.stdout):
    p = lambda *a: print(*a, file=out)
    records, lanes = build_lanes(files, keep_aux=args.aux)
    t0 = min((r["mtime"] for r in records), default=0)

    p(f"# 轨迹学习视图\n")
    p(f"每一格是一次模型调用,按 **输入增量 → 思考 → 输出** 排。")
    p(f"工具的输入输出压成一行(你已经知道 Read 回来的文件长什么样);"
      f"**思考是完整的**,那是唯一值得逐字读的东西。\n")
    p(f"共 {len(lanes)} 条 lane:  " + "  ".join(
        f"{v['label']}({len(v['records'])} 次)" for v in lanes.values()))

    for lid, v in lanes.items():
        if args.lane and args.lane not in (v["label"], lid):
            continue
        p(f"\n\n{'=' * 78}\n## lane {v['label']}   {len(v['records'])} 次调用")
        task = " ".join(v["task"].split())[:150]
        p(f"任务: {task}\n{'=' * 78}")

        # ── 先给一份导航 ──────────────────────────────────────────────────
        # 一条 lane 动辄一两百格,顺着读会累死在无关的 Bash 上。
        # 这些锚点全是**从数据里算出来的**,不是我挑的:
        rs = v["records"]
        def _tools(r):
            return [b for b in (r["resp"].get("content") or [])
                    if isinstance(b, dict) and b.get("type") == "tool_use"]
        def _think(r):
            u = r["resp"].get("usage") or {}
            return (u.get("output_tokens_details") or {}).get("thinking_tokens") or 0
        marks = {}
        top = sorted(rs, key=lambda r: -_think(r))[:6]
        for i, r in enumerate(top):
            if _think(r):
                marks.setdefault(r["d"].get("seq"), []).append(f"思考第 {i+1} 长({_think(r):,} tok)")
        firsts = {}
        for r in rs:
            for b in _tools(r):
                n = b.get("name")
                if n in ("Write", "Edit", "Agent", "Task") and n not in firsts:
                    firsts[n] = r["d"].get("seq")
                    marks.setdefault(r["d"].get("seq"), []).append(f"第一次 {n}")
        for r in rs:            # 撞 max_tokens = 思考烧光预算,什么都没交出来
            if (r["resp"] or {}).get("stop_reason") == "max_tokens":
                marks.setdefault(r["d"].get("seq"), []).append("★ 撞 max_tokens(纯废)")
        if marks:
            p(f"\n值得先读的几格(从数据里算的,不是挑的):")
            for sq in sorted(marks):
                p(f"  #{sq:<5} {' · '.join(marks[sq])}")
            p("")

        seen, who = set(), {}      # who: tool_use_id → 「工具 参数」,让结果行知道自己是谁的
        for r in v["records"]:
            u = r["resp"].get("usage") or {}
            think = (u.get("output_tokens_details") or {}).get("thinking_tokens") or 0
            mins = (r["mtime"] - t0) / 60 if t0 else 0
            p(f"\n\n{'─' * 78}")
            p(f"#{r['d'].get('seq')}  {v['label']}  ·  +{mins:.1f}分  ·  "
              f"出 {u.get('output_tokens', 0):,} tok" + (f"(思考 {think:,})" if think else ""))
            p(f"{'─' * 78}")

            news = [m for m in (r["req"].get("messages") or []) if msg_sig(m) not in seen]
            for m in r["req"].get("messages") or []:
                seen.add(msg_sig(m))
            for m in news:
                # **跳过 assistant** —— 那是上一格已经读过的自己的输出,回传只是协议要求。
                # 真正的新信息只有外部给它的东西:工具结果、新的用户消息。
                if m.get("role") == "assistant":
                    continue
                c = m.get("content")
                bs = c if isinstance(c, list) else [{"type": "text", "text": c}]
                for b in bs:
                    if not isinstance(b, dict):
                        continue
                    txt = b.get("text") or ""
                    # 平台注入的提醒不是它读到的「内容」,压成一个标签
                    if b.get("type") == "text" and ("<system-reminder>" in txt or "<total_tokens>" in txt):
                        p(f"  ←  [平台注入 {len(txt):,} 字符]")
                        continue
                    line = _brief(b)
                    if b.get("type") == "tool_result":
                        src = who.get(b.get("tool_use_id"), "?")
                        p(f"  ← {src}")
                        p(f"      ↳ {line}")
                        continue
                    if b.get("type") == "text" and len(txt) > 900:
                        line = f"[{len(txt):,} 字符] " + line
                    if line:
                        p(f"  ← {line}")

            for b in (r["resp"].get("content") or []):
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "thinking":
                    txt = b.get("thinking") or ""
                    if not txt:
                        p(f"\n  ◆ 思考  (明文被抹除 —— 启动时没带 --thinking-display summarized)")
                        continue
                    if args.think and len(txt) > args.think:
                        txt = txt[:args.think] + f"\n… [还有 {len(txt)-args.think:,} 字符]"
                    p(f"\n  ◆ 思考 {len(b.get('thinking') or ''):,} 字符")
                    p("\n".join("      " + ln for ln in txt.splitlines()))
                elif b.get("type") == "text":
                    t = " ".join((b.get("text") or "").split())
                    if t:
                        p(f"\n  ▪ 说  {t[:300]}")
                elif b.get("type") == "tool_use":
                    who[b.get("id")] = _brief(b)
                    p(f"  → {_brief(b)}")


def indent(s: str) -> str:
    return "\n".join("    " + ln for ln in (s or "").splitlines())


def cmd_one(f: Path, args):
    d = json.loads(f.read_text(encoding="utf-8"))
    req, resp = d["request"], d["response"]
    lane, lane_id = lane_of(d)
    print(f"{f.name}   status={d.get('status')}   lane={lane} ({lane_id})   "
          f"{'辅助调用' if is_aux(req) else '主调用'}")
    print(f"model={req.get('model')}   system={sys_chars(req):,} 字符   "
          f"tools={len(req.get('tools') or [])} 个   messages={len(req.get('messages') or [])} 条")
    u = resp.get("usage") or {}
    print(f"usage: input={u.get('input_tokens')} cache_read={u.get('cache_read_input_tokens')} "
          f"cache_write={u.get('cache_creation_input_tokens')} output={u.get('output_tokens')}")
    if args.system:
        s = req.get("system")
        for i, b in enumerate(s if isinstance(s, list) else [{"text": s}]):
            print(f"\n--- system[{i}] ---")
            print(trunc(b.get("text", ""), 10 ** 6, args.full))
    print(f"\n{'=' * W}\n输入 messages\n{'=' * W}")
    for i, m in enumerate(req.get("messages") or []):
        for t, s in blocks(m.get("content")):
            print(f"\n[{i}] {m.get('role')}.{t}  ({len(s):,} 字符)")
            print(indent(trunc(s, args.limit, args.full)))
    print(f"\n{'=' * W}\n输出\n{'=' * W}")
    for t, s in blocks(resp.get("content")):
        print(f"\n{t}  ({len(s):,} 字符)")
        print(indent(trunc(s, args.limit, args.full)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("target", help="proxy 输出目录,或单个 json")
    ap.add_argument("--transcript", action="store_true", help="按 lane 分组渲染可读对话(查证用,什么都不丢)")
    ap.add_argument("--study", action="store_true",
                    help="学习视图:输入增量→思考→输出。工具输入输出压成一行,思考完整")
    ap.add_argument("--think", type=int, default=0,
                    help="--study 里每段思考截断到多少字符(默认 0 = 不截)")
    ap.add_argument("--lane", help="只渲染某条 lane(main / sub-1 / 或 lane_id)")
    ap.add_argument("--system", action="store_true", help="打印 system prompt 全文")
    ap.add_argument("--aux", action="store_true", help="保留辅助调用(标题生成等)")
    ap.add_argument("--full", action="store_true", help="不截断任何文本")
    ap.add_argument("--limit", type=int, default=LIMIT, help=f"单块截断长度(默认 {LIMIT})")
    ap.add_argument("-o", "--out", help="写到文件而不是 stdout")
    a = ap.parse_args()

    t = Path(a.target)
    if t.is_file():
        cmd_one(t, a)
        return
    files = load(t)
    if not files:
        sys.exit(f"{t} 下没有 json")
    render = cmd_study if a.study else (cmd_transcript if a.transcript else None)
    if render is None:
        cmd_summary(files, a)
    elif a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            render(files, a, out=fh)
        print(f"写入 {a.out}  ({Path(a.out).stat().st_size/1024:.0f} KB)")
    else:
        render(files, a)


if __name__ == "__main__":
    main()
