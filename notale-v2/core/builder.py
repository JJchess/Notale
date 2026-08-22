"""builder —— 每页一个循环,并发跑。

planner 能做成固定流水线,是因为 nn-03 和 nn-06 两轮动作序列完全一致。
builder 不行:实测每页 16–73 次调用,相差 4.6 倍,工具配比也各不相同
(page-09 是 Bash×22,page-20 是 Edit×26)。所以这里只能是循环。

循环在什么上收敛也是数出来的:nn-06 里 `Write` 恒等于 1,之后全是 Edit + Bash + Read,
而 Bash 的 67% 是 selfcheck。每页跑 3–10 次 selfcheck,中位 8。
**写一次 + 闸驱动收敛。**

⚠ 「Write 恒等于 1」这条**已被 nn-09 推翻,不要再当判据用**。同样是 Opus 5、
同样的指令骨架,nn-09 的 subagent 侧是 `Bash 302 / Read 187 / Write 5 / Edit 3`
—— Edit 从 133 掉到 3,页面改用 `cat > page-XX.html <<EOF` 整页重写,
16 页约 156 次整页写入(每页 ~10 次)。

所以收敛机制的可迁移部分只有后半句:**闸驱动**(每页反复 selfcheck 直到干净)。
前半句「写一次」是 nn-06 的偶然形状,不是这类任务的性质。
判「这一页收敛了没有」要看闸过没过,不要看 Write 的次数。

终止照抄 Claude Code:模型不再要求调工具就算交付。另加两道兜底,
因为「模型自己说完了」在没有 schema 约束时是不可验证的。

    python3 -m core.builder --label orbit-01 [--only page-01] [--concurrency 20]
"""

from __future__ import annotations

import argparse
import json
import re
import time
import uuid
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from . import skills, tools
from . import llm
from .llm import ROOT, config, respond, text_of
from .trace import Writer

MAX_STEPS = 100      # 实测最多 73;打满记为失败,不静默交付
MAX_SECONDS = 3600


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


IDENTITY = """你是这套互动讲义的单页构建 agent。你只负责一个 HTML 文件。

按 brief 说的做:先读契约和规划,再施工,完工前用 selfcheck 自检到干净为止。
不写说明文档、不写测试、不写总结。做完直接结束,不要问问题。"""


def _tag_of(c) -> str:
    """一次工具调用的关键参数,用于事后审计。只取能标识「做了什么」的那一个。"""
    try:
        a = json.loads(c.arguments or "{}")
    except Exception:
        return ""
    if c.name == "Skill":
        return str(a.get("skill", ""))
    if c.name == "Bash":
        return str(a.get("command", ""))[:120]
    return str(a.get("file_path", "")).split("/")[-1]


def _replay(item: dict) -> dict:
    """把一个 output item 变成可以回传的形态。

    `model_dump()` 会带上 `status` 这类只出不进的字段,原样回传会被
    400 `Unknown parameter: input[1].status` 打回来。递归剥掉,别的原样保留 ——
    `call_id` 和 reasoning 的 `id` 都是回传必需的,不能一起清掉。
    """
    if isinstance(item, dict):
        return {k: _replay(v) for k, v in item.items() if k != "status" and v is not None}
    if isinstance(item, list):
        return [_replay(x) for x in item]
    return item


@dataclass
class Page:
    pid: str
    prompt: str
    required: tuple = ()          # 规划指派的必用 skill
    calls: int = 0
    steps: list[str] = None
    ok: bool = False
    why: str = ""
    seconds: float = 0.0

    nagged: bool = False

    def __post_init__(self):
        self.steps = []
        self.steps_arg = {}
        self.stray = []


_PAGE_RE = re.compile(r"page-\d+\.html$")


def stray(pages_dir: Path) -> list[str]:
    """`pages/` 下既不是 `page-NN.html`、也不在 `assets/` 里的文件。

    **量出来的:** `ape-ds3` 的 pages/ 里留了 10 个 `test_*.html`
    (`test_upper`、`test_dots`、`test_notransform` —— 某页在调缩放和字符渲染),
    `ape-dspro3` 留了 1 个 `page-22-test.html`。后果是实的:
    覆盖闸把它们当页数、`make_deck.py` 把它们拼成幻灯片(实际拼出过 60 页而不是 50)、
    而 `skeletons()` 又不会覆盖同名文件。

    **不做写入白名单。** 实测这三轮里 `Write` 用了 43/86/72 次、`Bash` 用了 260/630 次,
    两条路都能造文件 —— 只堵 Write 只堵住一半。扫一遍目录能同时盖住两条,
    而且是一处实现。
    """
    out = []
    for f in pages_dir.iterdir():
        if f.is_dir():
            continue
        if _PAGE_RE.search(f.name):
            continue
        out.append(f.name)
    return sorted(out)


def build_one(page: Page, pages_dir: Path, trace: Path, skill_root: Path,
              instructions: str, effort: str) -> Page:
    """一页的完整循环。

    历史只增不改 —— 每步追加一个 function_call 和一个 function_call_output。
    Claude Code 每步追加三条,第三条是 `role: system` 的剩余 token 提醒;
    那属于 CLI 自省,状态在 harness 手里,砍掉。
    """
    log = Writer(trace, str(uuid.uuid4()))
    # 开工前先记下已有的野文件 —— 并发时别人留下的不算这一页的账。
    seen_stray = set(stray(pages_dir))
    hist: list = [{"role": "user", "content": page.prompt}]
    spec = tools.specs()
    t0 = time.time()

    while True:
        if page.calls >= MAX_STEPS:
            page.why = f"打到步数上限 {MAX_STEPS}"
            break
        if time.time() - t0 > MAX_SECONDS:
            page.why = f"超过单页时限 {MAX_SECONDS}s"
            break

        started = _now()
        r = respond(instructions, hist, spec, effort, tag=page.pid)
        page.calls += 1
        u = getattr(r, "usage", None)
        calls = [o for o in r.output if getattr(o, "type", "") == "function_call"]
        log.add([{"type": "text", "text": page.prompt if page.calls == 1 else "(tool results)"}],
                text_of(r),
                {"input_tokens": int(getattr(u, "input_tokens", 0) or 0),
                 "output_tokens": int(getattr(u, "output_tokens", 0) or 0)},
                getattr(r, "id", None) or f"req_{uuid.uuid4().hex[:16]}",
                started, _now(),
                {"page": page.pid,
                 # 记名字也记关键参数:只记工具名的话,「调了 Skill 11 次」查得到,
                 # 「调了哪个 skill」查不到 —— 而后者才是这一轮要观测的东西。
                 "tools": [{"name": c.name, "arg": _tag_of(c)} for c in calls]})

        if not calls:
            # 模型不再要工具 = 它认为做完了(照抄 Claude Code 的终止条件)。
            # 但规划指派的技法文档是硬要求,没读就不算完 —— 补一轮再收尾,
            # 而不是直接判失败:那会白扔掉一整页已经做完的工作。
            got = {t for t in page.steps_arg.get("Skill", [])}
            missed = [x for x in page.required if x not in got]
            if missed and not page.nagged:
                page.nagged = True
                hist.append({"role": "user", "content":
                    "你还没有读规划为这一页指派的技法文档:" + "、".join(missed) +
                    "。先用 Skill 工具逐个读完,按里面的做法检查并改进你刚写的页面,"
                    "再收尾。"})
                continue
            page.ok = not missed
            page.why = ((text_of(r)).strip()[:200] if not missed
                        else f"未读指派的 skill: {' '.join(missed)}")
            break

        print(f"      {page.pid} 步{page.calls:>3}  "
              f"{' '.join(c.name for c in calls)[:52]}", flush=True)
        hist += [_replay(o.model_dump()) for o in r.output]
        for c in calls:
            try:
                args = json.loads(c.arguments or "{}")
            except json.JSONDecodeError as e:
                # 模型把工具参数吐成了畸形 JSON。**这不该让整页死。**
                # 实测:V4-Flash 的 page-24 就是这么丢的 ——
                #   JSONDecodeError: Unterminated string starting at line 1 column 103
                # 参数被截断,通常是那一次输出撞了上限、停在字符串中间。
                # 正常的 agent 循环该把错误当工具输出喂回去,让它重调一次。
                # 而且**必须**喂回去:history 里每个 function_call 都要配一条
                # function_call_output,少一条上游会报 must be passed back to the api
                # (那正好是我们网关抖动特征词里的一条,会被误当成抖动重试八次)。
                print(f"      {page.pid} 工具参数不是合法 JSON,已把错误喂回去让它重调:"
                      f"{e}", flush=True)
                hist.append({"type": "function_call_output", "call_id": c.call_id,
                             "output": f"你这次 {c.name} 的 arguments 不是合法 JSON:{e}。"
                                       f"很可能是参数太长被截断了。把同一个调用重发一次,"
                                       f"内容写短些、分次写。"})
                page.steps.append(f"{c.name}!badjson")
                continue
            page.steps_arg.setdefault(c.name, []).append(_tag_of(c))
            page.steps.append(c.name if c.name != "Bash"
                              else ("SELFCHECK" if "selfcheck" in str(args.get("command", ""))
                                    else "Bash"))
            out = tools.run(c.name, args, pages_dir, skill_root)
            # 野文件当场喂回去,别等到收尾才发现 —— 和畸形工具参数同一套处理方式:
            # 能说清的问题就说给它,让它自己收拾,不要判死也不要事后由人手动清。
            new_stray = [x for x in stray(pages_dir) if x not in seen_stray]
            if new_stray:
                seen_stray.update(new_stray)
                page.stray += new_stray
                out += ("\n\n⚠ 你在 `pages/` 下建了 " + "、".join(new_stray)
                        + "。**那是交付目录**,里面除了 `page-NN.html` 和 `assets/` "
                          "不该有别的东西 —— 多出来的文件会被当成讲义的一页。"
                          "要临时试就写到 `/tmp/` 下,或者现在删掉。")
            hist.append({"type": "function_call_output", "call_id": c.call_id,
                         "output": out})

    page.seconds = time.time() - t0
    n_sc = page.steps.count("SELFCHECK")
    print(f"  {page.pid}  {'✓' if page.ok else '✗'}  {page.calls:>3} 次调用  "
          f"{page.seconds/60:>5.1f} 分  selfcheck {n_sc:>2}  "
          f"skill {page.steps.count('Skill')}  {page.why[:60]}", flush=True)
    return page


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--label", required=True)
    a.add_argument("--only", action="append", help="只跑某几页,可多次给")
    a.add_argument("--concurrency", type=int, default=50)   # 端点支持到 100
    a.add_argument("--effort", default="medium")
    a.add_argument("--skills", default=str(skills.DEFAULT))
    # **notale-v2 自持一份,不再指向 zzz/。** 那里是两条线共用的底盘源,
    # 而 lab 那条线为了做消融把 CLAUDE.md 移除了(存档成 .philosophy-archive)——
    # 结果这里的硬检查直接把 builder 打死:planner 48 页全过,builder 起不来。
    # 两条线现在是不同条件的实验(lab 去哲学 / notale-v2 builder 侧保留),
    # 共用一个文件必然互相打脸。
    a.add_argument("--philosophy", default=str(ROOT / "prompts" / "philosophy.md"),
                   help="设计哲学 12 块,整份注入每页 agent 的 system")
    a.add_argument("--model")
    a.add_argument("--rebuild", action="store_true", help="已建好的也重做")
    n = a.parse_args()
    llm.override(name=n.model)

    root = ROOT / "runs" / n.label
    briefs = json.loads((root / "briefs.json").read_text(encoding="utf-8"))
    pages = [Page(b["description"].replace("Build ", ""), b["prompt"],
                  tuple(re.findall(r"^  - (\S+)$", b["prompt"], re.M))) for b in briefs]
    if n.only:
        pages = [p for p in pages if p.pid in set(n.only)]
    if not n.rebuild:
        # 已经建好的跳过。和 planner 的 cached() 同一条理由:这条链路会中途挂,
        # 断点续跑是刚需,没道理把已完成的页重烧一遍。--rebuild 强制重做。
        done_already = [p for p in pages
                        if (root / "pages" / f"{p.pid}.html").stat().st_size > 1000]
        if done_already:
            print(f"  跳过已建好的 {len(done_already)} 页: "
                  f"{' '.join(p.pid for p in done_already)}")
        pages = [p for p in pages if p not in done_already]

    skill_root = Path(n.skills)
    # 设计哲学 12 块。lab 那边它经 CLAUDE.md **逐字到达每一个并行 subagent**(抓包实测),
    # 加上之后测到:轻页 0→3 页、版式种类 5/16→14/17。真实 harness 一直没有它。
    # **整份注入,不挑块** —— 挑了就不是 lab 的那个实测条件。
    philosophy = (Path(n.philosophy).read_text(encoding="utf-8")
                  if Path(n.philosophy).exists() else "")
    if not philosophy:
        raise FileNotFoundError(f"找不到设计哲学 {n.philosophy} —— 它是每页 agent 的输入,不能缺")
    instructions = IDENTITY + "\n\n" + philosophy + "\n\n" + skills.catalog(skill_root)
    print(f"\n▸ builder · {n.label}\n  {len(pages)} 页,并发 {n.concurrency},"
          f"effort={n.effort},skill 清单 {len(skills.catalog(skill_root)):,} 字符\n")

    t0 = time.time()
    def guard(p):
        """一页崩掉不许带走整轮。

        实测:一个 subagent 撞上网关的 fallback 型 400,异常经 ThreadPoolExecutor.map
        传出来,**整个 builder 停掉、剩下 38 路一起没了** —— 52 页只交付 21 页。
        每页本来就是独立的一次尝试,单页失败该记下来继续,而不是全局判死。
        """
        try:
            return build_one(p, root / "pages", root / "trace.jsonl",
                             skill_root, instructions, n.effort)
        except Exception as e:                     # noqa: BLE001
            p.why = f"{type(e).__name__}: {str(e)[:90]}"
            print(f"  {p.pid}  ✗ 这一页崩了,不影响其它页: {p.why}", flush=True)
            return p

    with ThreadPoolExecutor(max_workers=n.concurrency) as ex:
        done = list(ex.map(guard, pages))

    ok = [p for p in done if p.ok]
    calls = sorted(p.calls for p in done)
    print(f"\n  {len(ok)}/{len(done)} 页交付   墙钟 {(time.time()-t0)/60:.1f} 分")
    print(f"  每页调用数 {calls[0]}–{calls[-1]},中位 {calls[len(calls)//2]}   "
          f"合计 {sum(calls)}")
    print(f"  selfcheck 合计 {sum(p.steps.count('SELFCHECK') for p in done)}   "
          f"Skill 合计 {sum(p.steps.count('Skill') for p in done)}")
    asg = sum(len(p.required) for p in done)
    hit = sum(len([x for x in p.required if x in p.steps_arg.get('Skill', [])]) for p in done)
    print(f"  指派 skill {asg} 项,实际读到 {hit} 项"
          + (f"  (补催过 {sum(1 for p in done if p.nagged)} 页)" if any(p.nagged for p in done) else ""))
    # ── 把每页做过什么落盘。**这是量出来必须补的。** ──────────────
    # `trace.jsonl` 里 2,836 个块**全是 text,一个 tool_use 都没有** —— 它不记工具调用。
    # 于是「哪次 Read 读了哪个文件」磁盘上没有记录,而 `page.steps_arg` 一直只在内存里。
    # 代价是实的:我曾从 trace 里 grep 出「webmedia.py 8 次」当成调用次数,
    # 那其实是这个字符串在**文本块**里出现的次数(提示词、skill 文档正文、模型的散文都算进去了)。
    # 上下文瘦身那条改动的判据是「CHASSIS.md 的引用次数」——
    # 没有这份文件就根本没法判它有没有生效。
    steps = {p.pid: {"ok": p.ok, "calls": p.calls, "seconds": round(p.seconds, 1),
                     "steps": p.steps, "args": p.steps_arg,
                     "required": list(p.required), "stray": p.stray,
                     "why": p.why} for p in done}
    (root / "steps.json").write_text(
        json.dumps(steps, ensure_ascii=False, indent=1), encoding="utf-8")
    reads = Counter()
    for p in done:
        for t in p.steps_arg.get("Read", []):
            reads[t] += 1
    top = "  ".join(f"{k} {v}" for k, v in reads.most_common(6))
    print(f"  读取次数(前 6):{top or '无'}")
    n_stray = sorted({x for p in done for x in p.stray})
    if n_stray:
        print(f"  ⚠ pages/ 下多出 {len(n_stray)} 个非页面文件: {' '.join(n_stray[:8])}"
              f"  —— 会被当成讲义的一页,已在过程中提醒过对应的页")
    for p in done:
        if not p.ok:
            print(f"  ✗ {p.pid}: {p.why}")


if __name__ == "__main__":
    main()
