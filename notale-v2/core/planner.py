"""planner —— 固定流水线。

步骤顺序不是设计的,是从 nn-06 主 agent 的动作时间线抄下来的:

    探环境 → theme.css → lec.js → PLAN.md → CONTRACT.md → 建骨架 → 出 brief

nn-03 走的是同一条线,两轮完全一致。跨两轮稳定复现的行为才固定成流水线;
builder 那边每页 16–73 次调用、相差 4.6 倍,所以那边只能是循环。

    python3 -m core.planner --query "…" --minutes 90 --label orbit-01
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from . import skills
from .artifacts import OURS, Brief, lec_api, parse_plan
from . import llm
from .llm import ROOT, ask, config, fill, strip_fence
from .trace import Writer
from .wire import Message, Request, TextBlock

PROMPTS = ROOT / "prompts"
IDENTITY = "你在为一套互动讲义做规划。只输出被要求的东西,不写说明、不写总结、不加围栏。"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass
class Run:
    query: str
    minutes: int
    audience: str
    label: str
    canvas: tuple[int, int] = (1600, 900)
    root: Path = field(init=False)
    log: Writer = field(init=False)

    def __post_init__(self) -> None:
        self.root = ROOT / "runs" / self.label
        self.assets.mkdir(parents=True, exist_ok=True)
        self.log = Writer(self.root / "trace.jsonl", str(uuid.uuid4()))

    pages = property(lambda self: self.root / "pages")
    assets = property(lambda self: self.root / "pages" / "assets")

    def prompt(self, name: str, **kw: object) -> str:
        return fill((PROMPTS / f"{name}.md").read_text(encoding="utf-8"), **kw)


def call(run: Run, step: str, prompt: str) -> str:
    m = config()["model"]
    req = Request(model=m["name"], system=[TextBlock(text=IDENTITY)],
                  messages=[Message(role="user", content=[TextBlock(text=prompt)])],
                  max_tokens=m["max_output_tokens"],
                  output_config={"effort": config()["planner"]["reasoning_effort"]})
    t0, started = time.time(), _now()
    r = ask(req)
    run.log.add([b.model_dump() for msg in req.messages for b in msg.content], r.text,
                {"input_tokens": r.input_tokens, "output_tokens": r.output_tokens},
                getattr(r.raw, "id", None) or f"req_{uuid.uuid4().hex[:16]}",
                started, _now(), {"step": step})
    print(f"  {step:<12} {time.time()-t0:6.1f}s  out={r.output_tokens:>6,} tok  {len(r.text):>7,} 字符")
    return strip_fence(r.text)


def cached(run: Run, step: str, path: Path, prompt: str) -> str:
    """产物已经在就跳过。单步就是几分钟(theme.css 实测 220s),后面挂掉时
    没有理由把前面全部重烧一遍。删掉对应文件即可强制重做。"""
    if path.exists() and path.stat().st_size:
        text = path.read_text(encoding="utf-8")
        print(f"  {step:<12} 已存在,跳过        {len(text):>7,} 字符")
        return text
    text = call(run, step, prompt)
    path.write_text(text, encoding="utf-8")
    return text


def seed(run: Run, chassis: Path, lib: Path) -> str:
    """探环境。nn-06 在这里花了 4 次模型调用去 Read 文件 —— 纯读取没有判断,
    harness 直接做掉。返回库清单,后面三步都要用。"""
    for f in ("base.css", "base.js"):
        if (chassis / f).exists():
            shutil.copy2(chassis / f, run.assets / f)
    shutil.copy2(ROOT / "tools_selfcheck.py", run.assets / "selfcheck.py")
    if not (run.assets / "lib").exists():
        (run.assets / "lib").symlink_to(lib)
    print(f"  seed         底盘已就位,库 {len(list(lib.glob('*.js')))} 个")
    return (lib / "LIBS.md").read_text(encoding="utf-8")


def skeletons(run: Run, n: int) -> None:
    """建骨架。

    比 nn-06 的空骨架多了资源接线和 `#stage` —— 这几行没有任何判断成分,
    而漏掉的代价很实:base.js 的契约是「页面里只要有 #stage 就开始工作」,
    没有它整套缩放和 canvas 适配都不生效。nn-03 里还有三个 subagent 各自把
    data-page 写成 "3" 再改成 "03",白花 8 次编辑。确定性的事 harness 做掉。
    """
    tpl = ('<!doctype html>\n<html lang="zh">\n<head>\n<meta charset="utf-8">\n'
           '<link rel="stylesheet" href="assets/base.css">\n'
           '<link rel="stylesheet" href="assets/theme.css">\n</head>\n'
           '<body data-page="{i:02d}" data-total="{n:02d}">\n<div id="stage"></div>\n'
           '<script src="assets/base.js"></script>\n'
           '<script src="assets/lec.js"></script>\n</body>\n</html>\n')
    for i in range(1, n + 1):
        p = run.pages / f"page-{i:02d}.html"
        if not p.exists():
            p.write_text(tpl.format(i=i, n=n), encoding="utf-8")
    print(f"  skeletons    {n} 个骨架,已接 base/theme/lec,data-total={n:02d}")


def _skill_list(entry) -> str:
    """把「必用skill」那一项拆成逐行清单。写「无」的就是没指派 —— 允许为空,
    否则会出现为了填满而硬塞一份不相干技法文档的情况。"""
    raw = (entry.value("必用skill") or "").strip()
    if not raw or raw in ("无", "None", "-"):
        return ""
    names = [n.strip(" `、,,") for n in re.split(r"[、,,\s]+", raw) if n.strip(" `、,,")]
    return "\n".join(f"  - {n}" for n in names)


def briefs(run: Run, entries: list) -> list[Brief]:
    """按模板填。

    **全流程唯一一处没照抄 Claude Code 的地方**,理由是量出来的:nn-03 里主 agent
    逐字手写 14 份 brief,派发时刻拉开 6:24,而 brief 之间七成内容一样。
    要换回原样,把这里改成一次模型调用即可 —— 信息一致,只是慢。
    """
    out = [Brief(f"Build {e.pid}", run.prompt(
        "brief", minutes=run.minutes, query=run.query, num=int(e.pid.split("-")[1]),
        page=run.pages / f"{e.pid}.html", pid=e.pid, total=len(entries),
        contract=run.root / "CONTRACT.md", plan=run.root / "PLAN.md", assets=run.assets,
        kicker=e.value("kicker") or "''", title=e.value("标题") or "''",
        take=e.value("take") or "''", content=(e.section("内容") or "").strip(),
        form=e.value("采用的形式") or "", rejected=(e.section("否决的形式") or "").strip(),
        exclusive=e.value("独占") or "",
        layout=e.value("版式") or "split-lr",
        skills=_skill_list(e) or "  (这一页没有指派技法文档,直接动手)")) for e in entries]
    lens = sorted(len(b.prompt) for b in out)
    print(f"  briefs       {len(out)} 份,{lens[0]}–{lens[-1]} 字符,中位 {lens[len(lens)//2]}")
    return out


def plan_run(run: Run, chassis: Path, lib: Path,
             skill_root: Path = None) -> dict:
    skill_root = skill_root or skills.DEFAULT
    print(f"\n▸ planner · {run.label}\n  {run.query}  /  {run.minutes} 分钟\n")
    t0 = time.time()
    libs = seed(run, chassis, lib)
    w, h = run.canvas

    lec = cached(run, "lec.js", run.assets / "lec.js", run.prompt("lec", query=run.query))
    api = lec_api(lec)

    # PLAN 必须在 theme 之前。上一轮是反的,结果写 theme 的模型不知道这 20 页要讲什么,
    # 只能造一个万能两栏 —— 实测 `.split` 在 20/20 页出现。现在 theme 拿得到版式清单。
    text = cached(run, "PLAN.md", run.root / "PLAN.md",
                  run.prompt("plan", query=run.query, minutes=run.minutes,
                             audience=run.audience, libs=libs, lec_api=api,
                             skills=skills.catalog(skill_root)))
    entries = parse_plan(text).entries
    bad = {e.pid: e.missing(OURS) for e in entries if e.missing(OURS)}
    used = sorted({e.value("版式") or "?" for e in entries})
    print(f"  验规划       {len(entries)} 页,骨架齐全 {len(entries)-len(bad)}/{len(entries)}"
          + (f"  ✗ {bad}" if bad else ""))
    print(f"  版式         {len(used)} 种: {' '.join(used)}")

    cached(run, "theme.css", run.assets / "theme.css",
           run.prompt("theme", canvas_w=w, canvas_h=h, layouts="\n".join(f"    {u}" for u in used)))

    cached(run, "CONTRACT.md", run.root / "CONTRACT.md",
           run.prompt("contract", n_pages=len(entries), canvas_w=w, canvas_h=h,
                      libs=libs, lec_api=api))
    skeletons(run, len(entries))
    (run.root / "briefs.json").write_text(
        json.dumps([b.as_tool_input() for b in briefs(run, entries)],
                   ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n  合计 {time.time()-t0:.0f}s  →  {run.root}")
    return {"pages": len(entries), "missing": bad, "root": str(run.root)}


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--query", required=True)
    a.add_argument("--minutes", type=int, default=90)
    a.add_argument("--audience", default="学过一点相关基础、但没系统学过这个题目的读者")
    a.add_argument("--label", required=True)
    a.add_argument("--chassis", default="/data1/home/zhuyifan/ws2/Notale/notale/zzz")
    a.add_argument("--model")
    a.add_argument("--effort")
    a.add_argument("--lib", default="/data1/home/zhuyifan/ws2/Notale/notale/zero/pages/assets/lib")
    n = a.parse_args()
    llm.override(name=n.model)
    if n.effort: config()["planner"]["reasoning_effort"] = n.effort
    plan_run(Run(n.query, n.minutes, n.audience, n.label), Path(n.chassis), Path(n.lib))


if __name__ == "__main__":
    main()
