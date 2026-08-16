"""builder —— 每页一个循环,并发跑。

planner 能做成固定流水线,是因为 nn-03 和 nn-06 两轮动作序列完全一致。
builder 不行:实测每页 16–73 次调用,相差 4.6 倍,工具配比也各不相同
(page-09 是 Bash×22,page-20 是 Edit×26)。所以这里只能是循环。

循环在什么上收敛也是数出来的:`Write` 恒等于 1,之后全是 Edit + Bash + Read,
而 Bash 的 67% 是 selfcheck。每页跑 3–10 次 selfcheck,中位 8。
**写一次 + 闸驱动收敛。**

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


def build_one(page: Page, pages_dir: Path, trace: Path, skill_root: Path,
              instructions: str, effort: str) -> Page:
    """一页的完整循环。

    历史只增不改 —— 每步追加一个 function_call 和一个 function_call_output。
    Claude Code 每步追加三条,第三条是 `role: system` 的剩余 token 提醒;
    那属于 CLI 自省,状态在 harness 手里,砍掉。
    """
    log = Writer(trace, str(uuid.uuid4()))
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
            args = json.loads(c.arguments or "{}")
            page.steps_arg.setdefault(c.name, []).append(_tag_of(c))
            page.steps.append(c.name if c.name != "Bash"
                              else ("SELFCHECK" if "selfcheck" in str(args.get("command", ""))
                                    else "Bash"))
            hist.append({"type": "function_call_output", "call_id": c.call_id,
                         "output": tools.run(c.name, args, pages_dir, skill_root)})

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
    a.add_argument("--concurrency", type=int, default=20)
    a.add_argument("--effort", default="medium")
    a.add_argument("--skills", default=str(skills.DEFAULT))
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
    instructions = IDENTITY + "\n\n" + skills.catalog(skill_root)
    print(f"\n▸ builder · {n.label}\n  {len(pages)} 页,并发 {n.concurrency},"
          f"effort={n.effort},skill 清单 {len(skills.catalog(skill_root)):,} 字符\n")

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=n.concurrency) as ex:
        done = list(ex.map(lambda p: build_one(p, root / "pages", root / "trace.jsonl",
                                               skill_root, instructions, n.effort), pages))

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
    for p in done:
        if not p.ok:
            print(f"  ✗ {p.pid}: {p.why}")


if __name__ == "__main__":
    main()
