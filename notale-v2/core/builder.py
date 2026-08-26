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

终止照抄 Claude Code:模型不再要求调工具就结束。Skill 是提示和事后观测项,
不在模型停止之后再补催或反过来判交付失败。

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

按 brief 说的做:先读契约和规划,再施工,完工前用 Check 自检到干净为止。
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
    if c.name == "Check":
        n = len(a.get("after") or [])
        return str(a.get("page", "")) + (f" +after×{n}" if n else "") + (
            " +shot" if a.get("shot") else "")
    if c.name == "Patch":
        return f"{a.get('page','')} ×{len(a.get('edits') or [])}"
    if c.name == "Look":
        return f"{a.get('page','')} @{a.get('box')}"
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
    required: tuple = ()          # 旧 brief 的多 skill 兼容字段
    primary_workflow: str = ""
    skill_mode: str = "legacy"
    calls: int = 0
    steps: list[str] = None
    ok: bool = False
    why: str = ""
    seconds: float = 0.0

    images: int = 0      # 这一页进上下文的图片张数(Opus 那条线是每页 6.0 张)
    evicted: int = 0     # 被挤出上下文的图片张数

    # token 账。2026-08-26 之前这三个数一个都没记,于是「前缀缓存到底生效没有」
    # 只能靠离线探针 —— 而实测这条路由自动缓存能到 99.9%,一次淘汰却会把它打回 0。
    # 没有这三个数就看不见那件事,所以先记再谈优化。
    tok_in: int = 0      # 累计输入 token(每步都含被重发的全部历史)
    tok_cached: int = 0  # 其中命中前缀缓存的部分(读,便宜)
    tok_write: int = 0   # 其中写进缓存的部分(写,通常带溢价 —— 和读不是一个价)
    tok_out: int = 0     # 累计输出 token
    tok_max: int = 0     # 单步输入峰值 —— 判 CONTEXT_SOFT 用
    cache_seen: bool = False   # 这条路由到底报不报 cached;不报和没命中要分得开

    def __post_init__(self):
        self.steps = []
        self.steps_arg = {}
        self.stray = []
        self.loaded_skills = []
        self.reference_reads = []
        self.workflow_script_runs = []
        self.termination = ""


def _section_items(prompt: str, heading: str) -> list[str] | None:
    """Read bullet names from one explicit Markdown section."""
    m = re.search(rf"^##\s*{re.escape(heading)}\s*$\n(.*?)(?=^##\s|\Z)",
                  prompt, re.S | re.M)
    if not m:
        return None
    return [x for x in re.findall(r"^\s*-\s*([a-z0-9][a-z0-9.-]*)\b", m.group(1), re.M)]


def page_from_brief(raw: dict, workflow_root: Path = skills.WORKFLOWS,
                    legacy_root: Path = skills.DEFAULT) -> Page:
    """Parse new single-workflow briefs and old multi-skill briefs."""
    pid = raw["description"].replace("Build ", "")
    prompt = raw["prompt"]
    routed = _section_items(prompt, "主工作流")
    if routed is not None:
        if len(routed) != 1:
            raise ValueError(f"{pid} 的 `## 主工作流` 必须且只能有一项，实际 {routed}")
        name = routed[0]
        allowed = set(skills.available(workflow_root)) & set(skills.PAGE_WORKFLOWS)
        if name not in allowed:
            raise ValueError(f"{pid} 指派了未知主工作流 {name!r}")
        return Page(pid, prompt, (name,), primary_workflow=name, skill_mode="workflow")

    old = _section_items(prompt, "必用skill")
    if old is None:
        # 旧版 brief 没有小节标题，只把指派项作为缩进 bullet 插进正文。
        known = set(skills.available(legacy_root))
        old = [x for x in re.findall(r"^\s{2,}-\s+(\S+)$", prompt, re.M) if x in known]
    return Page(pid, prompt, tuple(dict.fromkeys(old)))


KEEP_IMAGES = 2  # 真触发淘汰时,hist 里留几张图

# 淘汰的触发线:上一次调用的真实输入 token 超过它才清图,否则**一个字节都不动历史**。
#
# 2026-08-26 改的。原来是「图片数 > KEEP_IMAGES 就淘汰」,于是淘汰频率≈截图张数
# (wf2 那轮 143 张图、102 次挤出)。而 evict_images 是原地改写 hist[i],
# 实测「未改写 100% 命中 → 淘汰当次 0% → 下一次 99.9%」——
# **每次淘汰 = 一次全价重算整段前缀**,按 trace 里的真实 input_tokens 折算,
# 图多的轮次有 28–34% 的输入 token 是这么烧掉的。
#
# 换成按上下文大小判,理由是三条实测:
#   · 上下文窗口 ≥375,011 token(超额请求回 context_length_exceeded,逐级试到 375k 仍通过);
#     而实测输入峰值只有 36k–70k,不到 19%。
#   · evict_images 的 docstring 里那句「11/16 个 subagent 上下文撑爆」写的是
#     **lab 那条线** —— 那条线有自动压缩、是另一个 harness。这条路由上从没发生过。
#   · 缓存命中的 input token 按折扣计费。留着旧图 = 每轮多花「几千 token × 折扣价」;
#     淘汰 = 下一次全价重算约两万 token。**自动缓存生效时,留着比扔掉便宜。**
#
# 150k 是峰值的两倍多,仍不到已验证下限的 40%。正常轮次一次都不触发。
# 判据晚一步(先调用才知道大小)无害:150k → 155k 离 375k 仍很远。
CONTEXT_SOFT = 150_000


def _is_image_msg(m) -> bool:
    return (isinstance(m, dict) and m.get("role") == "user"
            and isinstance(m.get("content"), list)
            and any(isinstance(b, dict) and b.get("type") == "input_image"
                    for b in m["content"]))


def evict_images(hist: list, tok_in: int) -> int:
    """输入超过 `CONTEXT_SOFT` 时,`hist` 里只留最近 KEEP_IMAGES 张图,更早的换成一句话。

    **触发条件 2026-08-26 从「图片数」改成「真实输入 token」** —— 理由见 CONTEXT_SOFT
    上面那段账。下面这段是原来的记录,它解释的是**为什么要有这个机制**,仍然成立;
    但「什么时候该动手」已经不再由图片数决定。

    **这不是省钱,是防炸,而且是量出来的**(原始记录在 zzz/selfcheck.py 的 docstring 里):
    lab 那条线一轮 171 张截图约 324k token,而图片随每一步重发、**永久占上下文** ——
    结果 11/16 个 subagent 上下文撑爆被自动压缩,整轮墙钟拉长 1.9 倍。
    我们这条线没有自动压缩,撑爆就是撞 max_output_tokens 或者直接 400。

    换成一句话而不是整条删掉,理由只剩一条:**告诉模型那张图被拿走了**,
    否则它会凭记忆改页面。原先还写着「删元素会让 parentUuid 那条链和步数对不上」——
    2026-08-26 查证不成立:`parentUuid` 在 trace.py 里按**轮次**串(Writer.prev),
    与 `hist` 下标无关;`page.calls` / `page.steps` 也都不由 `hist` 长度推导。
    不过这不构成改写法的理由 —— **删元素和改写元素一样会断前缀缓存**,
    所以保持原样,只把触发条件挪到 CONTEXT_SOFT 上。
    确定的事 harness 做 —— 这属于确定的事。
    """
    if tok_in <= CONTEXT_SOFT:
        # **没超线就一个字节都不碰。** 动了历史(改写或删除都算)前缀缓存就断,
        # 而这条路由的自动缓存实测能到 99.9%。
        return 0
    idx = [i for i, m in enumerate(hist) if _is_image_msg(m)]
    n = 0
    for i in idx[:-KEEP_IMAGES] if len(idx) > KEEP_IMAGES else []:
        hist[i] = {"role": "user", "content": [{"type": "input_text", "text":
            "（这里原来有一张图，为了不撑爆上下文已经拿掉了。要再看就重新 Check/Look 一次。）"}]}
        n += 1
    return n


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
            page.termination = "max_steps"
            break
        if time.time() - t0 > MAX_SECONDS:
            page.why = f"超过单页时限 {MAX_SECONDS}s"
            page.termination = "max_seconds"
            break

        started = _now()
        r = respond(instructions, hist, spec, effort, tag=page.pid)
        page.calls += 1
        tin, tout, cached = llm.usage_of(r)
        page.tok_in += tin
        page.tok_out += tout
        page.tok_write += llm.cache_write_of(r)
        page.tok_max = max(page.tok_max, tin)
        if cached is not None:
            page.cache_seen = True
            page.tok_cached += cached
        calls = [o for o in r.output if getattr(o, "type", "") == "function_call"]
        log.add([{"type": "text", "text": page.prompt if page.calls == 1 else "(tool results)"}],
                text_of(r),
                # 键名用 wire.Usage 已有的那两个 —— trace.usage_of() 会把未知键
                # 静默丢掉(core/trace.py:97),写 `cached_tokens` 读不回来。
                {"input_tokens": tin, "output_tokens": tout,
                 "cache_read_input_tokens": cached or 0,
                 "cache_creation_input_tokens": llm.cache_write_of(r)},
                getattr(r, "id", None) or f"req_{uuid.uuid4().hex[:16]}",
                started, _now(),
                {"page": page.pid,
                 # 记名字也记关键参数:只记工具名的话,「调了 Skill 11 次」查得到,
                 # 「调了哪个 skill」查不到 —— 而后者才是这一轮要观测的东西。
                 "tools": [{"name": c.name, "arg": _tag_of(c)} for c in calls]})

        if not calls:
            # 模型不再要工具 = 它认为做完了(照抄 Claude Code 的终止条件)。
            # Skill 是给 agent 的指导与事后观测项,不是终止闸。
            # 漏读不再补催、不再把已经停止的 agent 重新拉起来。
            page.ok = True
            page.why = (text_of(r)).strip()[:200]
            page.termination = "no_tool_use"
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
            if (c.name == "Skill" and page.skill_mode == "workflow"
                    and args.get("skill") != page.primary_workflow):
                res = (f"本页只装载 `{page.primary_workflow}`；不能读取 "
                       f"`{args.get('skill', '')}`。请继续使用已指派 workflow。")
            else:
                res = tools.run(c.name, args, pages_dir, skill_root)
                if c.name == "Skill" and args.get("skill"):
                    page.loaded_skills.append(str(args["skill"]))

            if page.skill_mode == "workflow" and page.primary_workflow:
                wf_dir = (skill_root / page.primary_workflow).resolve()
                if c.name == "Read" and args.get("file_path"):
                    path = Path(str(args["file_path"]))
                    path = path if path.is_absolute() else pages_dir / path
                    try:
                        rel = path.resolve().relative_to(wf_dir)
                        if rel.parts and rel.parts[0] == "references":
                            page.reference_reads.append(str(rel))
                    except ValueError:
                        pass
                if c.name == "Bash":
                    command = str(args.get("command", ""))
                    for script in sorted((wf_dir / "scripts").glob("*")):
                        if script.is_file() and (str(script) in command
                                                 or f"scripts/{script.name}" in command):
                            page.workflow_script_runs.append(script.name)
            out, imgs = ((res.text, res.images) if isinstance(res, tools.Out)
                         else (res, []))
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
            # 图片走**另一条 user 消息**,不塞进 tool_result —— responses 和 chat
            # 两条 wire 的 tool_result 都只装字符串。Opus 那条线是 Read 一张 png
            # 直接回 image 块(632 次 Read 里 455 次是 png),我们这边等价于
            # 「工具回一句话,紧跟一条带图的消息」。
            for mt, b64 in imgs:
                hist.append({"role": "user", "content": [
                    {"type": "input_image", "image_url": f"data:{mt};base64,{b64}"}]})
                page.images += 1
            page.evicted += evict_images(hist, page.tok_max)

    page.seconds = time.time() - t0
    n_sc = page.steps.count("SELFCHECK") + page.steps.count("Check")
    print(f"  {page.pid}  {'✓' if page.ok else '✗'}  {page.calls:>3} 次调用  "
          f"{page.seconds/60:>5.1f} 分  自检 {n_sc:>2}  "
          f"图 {page.images:>2}  skill {page.steps.count('Skill')}  "
          f"{page.why[:60]}", flush=True)
    return page


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--label", required=True)
    a.add_argument("--only", action="append", help="只跑某几页,可多次给")
    a.add_argument("--concurrency", type=int, default=50)   # 端点支持到 100
    a.add_argument("--effort")
    a.add_argument("--skills", default=str(skills.DEFAULT))
    a.add_argument("--workflows", default=str(skills.WORKFLOWS))
    # **默认不注入设计哲学。** 这条是数出来的,原来的说法(下面留着)是错的。
    #
    # 原来的注释写着「lab 那边它经 CLAUDE.md **逐字到达每一个并行 subagent**(抓包实测)」。
    # 把 lab 那条线**全部** 76 个建页 subagent 的轨迹翻了一遍(3 个会话,
    # ~/.claude/projects/-data1-home-zhuyifan-exp-lecture/*/subagents/):
    #
    #   · 哲学正文在 subagent 的 system 提示里出现 **0/76** 次
    #   · 唯一到达路径是编排者把它写进了 PLAN.md,而 subagent 恰好去 Read 了 ——
    #     **17/76**,且全部集中在 `2a85af6c` **一个会话**里
    #   · brief 里提到 Mayer 的 **1/76**,而且是压成了一条具体的禁令
    #     (「不要做要点回顾/总结清单(Mayer 的完成标准是 transfer 不是 retention)」),
    #     不是发一份纲领下去
    #   · **我们照抄结构的那一轮 nn-11(会话 `1f77c220`,43 个 subagent,
    #     唯一读 SHARED.md 的那个会话)—— 43/43 一个字哲学都没看到**
    #
    # 而代价是确定的:整份 5,665 字符 = system 块的 **93%**,`instructions` 每一步重发,
    # 实测占建页阶段输入 token 的 **22%**(第五态 61 次调用里约 244k/1,092k)。
    #
    # 更硬的一条:最大的那块 `page-rhythm`(823 字符)写着「不要把每一个页面理解成
    # 需要被填满的容器」「允许有意保持内容较少的页面」,而 `selfcheck.py` 对同一页硬判
    # 「✗ 画面太空:占用比 41% < 下限 45%」。**同一次请求里,system 块说可以留空,
    # 闸说留空不合格。** 这不是冗余,是互相矛盾的指令。
    #
    # 文件留着不删,`--philosophy prompts/philosophy.md` 随时能把它加回来做对照。
    a.add_argument("--philosophy", default="",
                   help="设计哲学 12 块的路径。**默认不注入**(见代码里的实测)。"
                        "给了路径就整份注入每页 agent 的 system,用来做对照实验。")
    # 通用地板(占用/字号/底盘机制/Lec 口径)前置到 system 块。**默认关。**
    # 今天 CONTRACT.md 21/21 页都读、上面每条它都有,所以打开只是第三份副本;
    # 它是给「先补 skill 侧覆盖,再砍 CONTRACT」那一步做对照臂用的。
    # 账记在 core/skills.py 的 FLOORS 上面。
    a.add_argument("--skill-floors", action="store_true",
                   help="在指派块前拼上通用地板(对照臂用,默认不拼)")
    a.add_argument("--model")
    # Anthropic 系必须走 messages 才拿得到 cache_control;走 responses 是全额计费,
    # 而且**不会有任何报错** —— 实测 Sonnet 在 responses 上连打三次前缀,三次 cached=0。
    a.add_argument("--wire", choices=("responses", "chat", "messages"),
                   help="覆盖 wire_api;Anthropic 系模型要用 messages")
    a.add_argument("--rebuild", action="store_true", help="已建好的也重做")
    n = a.parse_args()
    cfg = config()
    builder_cfg = cfg.get("builder", {})
    model = n.model or builder_cfg.get("model") or cfg["model"]["name"]
    effort = n.effort or builder_cfg.get("reasoning_effort", "medium")
    llm.override(name=model, wire_api=n.wire)

    root = ROOT / "runs" / n.label
    briefs = json.loads((root / "briefs.json").read_text(encoding="utf-8"))
    legacy_root = Path(n.skills)
    workflow_root = Path(n.workflows)
    if not legacy_root.is_dir():
        raise FileNotFoundError(f"--skills 指的目录不存在: {legacy_root}")
    if not workflow_root.is_dir():
        raise FileNotFoundError(f"--workflows 指的目录不存在: {workflow_root}")
    pages = [page_from_brief(b, workflow_root, legacy_root) for b in briefs]
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

    # 给了 --philosophy 就整份注入,不挑块 —— 挑了就不是一个干净的对照条件。
    # 路径给错要报错:静默跑一个「以为注入了其实没有」的版本,会让整轮对照白做。
    philosophy = ""
    if n.philosophy:
        pp = Path(n.philosophy)
        if not pp.exists():
            raise FileNotFoundError(f"--philosophy 指的 {pp} 不存在 —— "
                                    f"不注入就别给这个参数,给了就必须能读到")
        philosophy = pp.read_text(encoding="utf-8")
    base = IDENTITY + (("\n\n" + philosophy) if philosophy else "")
    skill_blocks = {
        p.pid: (skills.assigned_workflow(p.primary_workflow, workflow_root,
                                         floors=n.skill_floors)
                if p.skill_mode == "workflow"
                else skills.assigned(p.required, legacy_root))
        for p in pages
    }
    roots = {p.pid: workflow_root if p.skill_mode == "workflow" else legacy_root
             for p in pages}
    sb = sorted(len(v) for v in skill_blocks.values()) or [0]
    modes = Counter(p.skill_mode for p in pages)
    print(f"\n▸ builder · {n.label}\n  {len(pages)} 页,并发 {n.concurrency},"
          f"model={model},effort={effort},模式 {dict(modes)}\n"
          f"  指导块 {sb[0]}–{sb[-1]} 字符/页(中位 {sb[len(sb)//2]})"
          f"{'  含通用地板' if n.skill_floors else ''}\n"
          f"  system 块 {len(base):,} 字符"
          f"({'含设计哲学 ' + str(len(philosophy)) + ' 字符' if philosophy else '不含设计哲学'})\n")

    t0 = time.time()
    def guard(p):
        """一页崩掉不许带走整轮。

        实测:一个 subagent 撞上网关的 fallback 型 400,异常经 ThreadPoolExecutor.map
        传出来,**整个 builder 停掉、剩下 38 路一起没了** —— 52 页只交付 21 页。
        每页本来就是独立的一次尝试,单页失败该记下来继续,而不是全局判死。
        """
        try:
            return build_one(p, root / "pages", root / "trace.jsonl",
                             roots[p.pid],
                             base + "\n\n" + skill_blocks[p.pid], effort)
        except Exception as e:                     # noqa: BLE001
            p.why = f"{type(e).__name__}: {str(e)[:90]}"
            p.termination = "agent_exception"
            print(f"  {p.pid}  ✗ 这一页崩了,不影响其它页: {p.why}", flush=True)
            return p

    with ThreadPoolExecutor(max_workers=n.concurrency) as ex:
        done = list(ex.map(guard, pages))

    ok = [p for p in done if p.ok]
    calls = sorted(p.calls for p in done)
    print(f"\n  {len(ok)}/{len(done)} 页交付   墙钟 {(time.time()-t0)/60:.1f} 分")
    print(f"  每页调用数 {calls[0]}–{calls[-1]},中位 {calls[len(calls)//2]}   "
          f"合计 {sum(calls)}")
    print(f"  自检合计 {sum(p.steps.count('SELFCHECK') + p.steps.count('Check') for p in done)}"
          f"(Check {sum(p.steps.count('Check') for p in done)} / "
          f"经 Bash {sum(p.steps.count('SELFCHECK') for p in done)})   "
          f"Patch {sum(p.steps.count('Patch') for p in done)}   "
          f"Edit {sum(p.steps.count('Edit') for p in done)}   "
          f"Skill 合计 {sum(p.steps.count('Skill') for p in done)}")
    n_img = sum(p.images for p in done)
    print(f"  进上下文的图 {n_img} 张(每页 {n_img / max(1, len(done)):.1f};"
          f"Opus 那条线是 6.0),被挤出 {sum(p.evicted for p in done)} 张")
    t_in = sum(p.tok_in for p in done)
    t_ca = sum(p.tok_cached for p in done)
    t_mx = max((p.tok_max for p in done), default=0)
    if not any(p.cache_seen for p in done):
        # 不报和没命中要分得开 —— 报 0% 会让人以为缓存失效,其实是这条路由不给数。
        print(f"  输入 {t_in:,} tok,峰值 {t_mx:,}   ⚠ 这条路由没报 cached_tokens,命中率未知")
    else:
        print(f"  输入 {t_in:,} tok,峰值 {t_mx:,}   缓存命中 {t_ca:,} "
              f"({t_ca / max(t_in, 1) * 100:.0f}%)")
    asg = sum(len(p.required) for p in done)
    hit = sum(len(set(p.required) & set(p.loaded_skills)) for p in done)
    print(f"  指派指导 {asg} 项,实际读到 {hit} 项；reference 读取 "
          f"{sum(len(p.reference_reads) for p in done)} 次，workflow script "
          f"{sum(len(p.workflow_script_runs) for p in done)} 次")
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
                     "images": p.images, "evicted": p.evicted,
                     "tok_in": p.tok_in, "tok_cached": p.tok_cached,
                     "tok_write": p.tok_write, "tok_out": p.tok_out,
                     "tok_max": p.tok_max,
                     "cache_reported": p.cache_seen,
                     "skill_mode": p.skill_mode,
                     "primary_workflow": p.primary_workflow or None,
                     "loaded_workflows": ([x for x in p.loaded_skills
                                           if x == p.primary_workflow]
                                          if p.skill_mode == "workflow" else []),
                     "loaded_skills": p.loaded_skills,
                     "reference_reads": p.reference_reads,
                     "workflow_script_runs": p.workflow_script_runs,
                     "termination": p.termination,
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
