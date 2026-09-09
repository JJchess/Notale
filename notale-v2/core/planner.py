"""Planner: fetch and inspect media, then submit the compact page list.

The harness materializes only deterministic planning artifacts.  Page HTML is
intentionally absent until the routed Builder creates it.

    python3 -m core.planner --query "…" --minutes 90 --label orbit-01
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from . import skills
from . import media, tools
from .artifacts import Brief
from . import llm
from .llm import ROOT, config, fill, strip_fence

# harness 的全部外部输入(底盘、库、技法文档)都在这下面,**不指向 notale-v2 外面**。
# 以前是三条写死的绝对路径,指向同级的 `notale/zzz` 和 `notale/zero`;那两个目录
# 一消失,一天里三次中断:图池 0/12、规格的技法文档全空、expand 静默抛异常。
VENDOR = Path(__file__).resolve().parent.parent / "vendor"
from .trace import Writer

PROMPTS = ROOT / "prompts"
IDENTITY = "你在为一套内容做规划。只输出被要求的东西,不写说明、不写总结、不加围栏。"

# 实验开关 --visual-focus:页表每页多一行「视觉焦点」,把主证据场的决定从 builder 挪到 planner。
# 默认不注入,deck.md 里的 {visual_focus} 槽位填空串,基线一字不变。
VISUAL_FOCUS_SPEC = """
### 视觉焦点

每页主题之后再写一行 `视觉焦点：…`：一句话说清读者第一眼落在哪一个画面、它让哪一个关系可见。
它是这一页的主证据场，不是布局说明——写「什么东西、显示什么关系」，不写位置、尺寸、配色和操作。
一页只有一个焦点；`[标题页]` 写主视觉；`[代码页]` 不写这一行。

    # page-NN [内容页]
    袋外评估：未进入某棵树训练样本的观测可形成无需额外验证集的近似评估
    视觉焦点：一张样本×树的 in-bag/OOB 矩阵，每行约三分之一格子是 OOB，由此汇出每个样本的袋外预测
""".strip()
PLANNER_WRITE_SPEC = [{
    "type": "function",
    "name": "Write",
    "description": "写完整文件",
    "parameters": {
        "type": "object",
        "properties": {
            "file_path": {"type": "string", "description": "绝对路径"},
            "content": {"type": "string", "description": "完整内容"},
        },
        "required": ["file_path", "content"],
        "additionalProperties": False,
    },
}]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass
class Run:
    query: str
    minutes: int
    audience: str
    label: str
    scenario: str = ""
    canvas: tuple[int, int] = (1600, 900)
    # 提示词目录可换。理由同下面 --skills 那段注释:三个外部依赖要么都能换,要么都不能换。
    # 这一条是为了能一键切两套模板做对照臂,而不必对 prompts/ 做 git 体操。
    prompts: Path = PROMPTS
    # 两张选项菜单表接不接回 direction 块。**有期限的开关**,见 skills.direction_block。
    direction_menus: bool = False
    # 页表每页多一行「视觉焦点」。实验开关,见 VISUAL_FOCUS_SPEC。
    visual_focus: bool = False
    # theme.css 交给 style director(core/director.py)另起一路并行写,deck 这步只写页表。
    style_director: bool = True
    template: Path | None = None
    style: str | None = None
    root: Path = field(init=False)
    log: Writer = field(init=False)

    def __post_init__(self) -> None:
        from .theme import check_options
        check_options(self.template, self.style, self.style_director)
        self.root = ROOT / "runs" / self.label
        if self.root.exists():
            raise FileExistsError(
                f"run already exists: {self.root}; use a new --label for a fresh test")
        self.assets.mkdir(parents=True, exist_ok=True)
        self.log = Writer(self.root / "trace.jsonl", str(uuid.uuid4()))

    pages = property(lambda self: self.root / "pages")
    assets = property(lambda self: self.root / "pages" / "assets")

    def prompt(self, name: str, **kw: object) -> str:
        raw = (self.prompts / f"{name}.md").read_text(encoding="utf-8")
        # deck.md 里跟 theme.css 有关的段落用 <!--css:…--> 括着,交给 director 时整段剥掉;
        # 只在那时才生效的说明用 <!--pages-only:…--> 括着。两套标记都从同一个文件走,
        # 免得复制出第二份 deck.md 然后两边各自漂移。
        drop = "css" if self.style_director else "pages-only"
        keep = "pages-only" if self.style_director else "css"
        raw = re.sub(rf"<!--{drop}:start-->.*?<!--{drop}:end-->", "", raw, flags=re.S)
        raw = raw.replace(f"<!--{keep}:start-->", "").replace(f"<!--{keep}:end-->", "")
        return fill(raw, _where=f"{name}.md", **kw)


def _valid_css(text: str) -> str:
    """Validate the shared CSS contract that every page depends on."""
    from .theme import inspect
    return '；'.join(inspect(text)[0])


N_CEIL = 60  # resource cap; the Planner otherwise decides page count
PAGE_LABELS = frozenset({"标题页", "内容页", "交互页", "代码页"})

CSS_REL = "pages/assets/theme.css"
PAGES_REL = "pages/plan/pages.md"


def split_pages(text: str) -> dict:
    """`pages.md` → `{nn: 正文}`。复用 `_split_specs`:按页号而非位置映射、
    同页号取最后一次、丢弃前言。"""
    return _split_specs(text, range(1, N_CEIL + 1))


def _valid_pages(text: str) -> str:
    """Validate only the page-list protocol used for routing and materialization."""
    pages = split_pages(text)
    if not pages:
        return "没有 `# page-NN` 块 —— 每页一个,页号两位、从 01 连续编"
    nn = sorted(int(k) for k in pages)
    if nn != list(range(1, len(nn) + 1)):
        miss = sorted(set(range(1, max(nn) + 1)) - set(nn))
        return f"页号不连续,缺 {' '.join(f'page-{x:02d}' for x in miss)} —— 从 01 编到 N,不跳号"
    for key, page in pages.items():
        m = re.match(rf"#\s+page-{key}\s+\[([^\]]+)\]\s*\n(.+)", page, re.S)
        if not m:
            return f"page-{key} 必须只有 `[标签]` 标题行和非空主题"
        label, topic = m.group(1).strip(), m.group(2).strip()
        if label not in PAGE_LABELS:
            return f"page-{key} 使用未知标签 `[{label}]`"
        if not topic:
            return f"page-{key} 的主题为空"
    return ""


def iface_gaps(text: str) -> list[str]:
    """正文里定义了、但 INTERFACE 没列的类。**只报不拦。**

    2026-08-29 这条是硬闸,2026-08-30 降级 —— 它连着杀了两轮 Sonnet:
    第一次是我的正则把 `url(https://fonts.googleapis.com/…)` 里的点当成类
    (报 `.googleapis`,模型永远修不掉,已修);第二次是 Sonnet 写的 CSS 更细碎
    (`.is-active`/`.is-selected` 这类状态类、`.ctl-row`/`.col-text` 这类内部子块),
    13 个漏列它三次都补不齐,而同一条闸 GPT-Sol 一次就过。
    **一条只有某个模型能过的闸,是模型指纹,不是质量判据**(同 selfcheck 密度那条的教训)。

    接口不全的后果是软的:builder 少几个可选的类,自己写页内样式。
    比起为此判死整轮(3 次调用 + 一次规划全废),报出来让人看见更划算。
    """
    if "==== /INTERFACE ==== */" not in text:
        return []
    bare = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    sel = re.sub(r"url\([^)]*\)|\"[^\"]*\"|'[^']*'", " ", bare)
    iface = text.split("==== /INTERFACE ==== */", 1)[0]
    svg_guard = set(re.findall(r"svg\s+\.([A-Za-z][\w-]*)", sel))
    defined = {m for m in re.findall(r"\.([A-Za-z][\w-]*)", sel)} - svg_guard
    # 状态类归它的宿主组件,不单独上表
    defined = {c for c in defined if not c.startswith(("is-", "has-"))}
    return sorted(c for c in defined if f".{c}" not in iface and c not in iface)


def _split_specs(text: str, nns) -> dict:
    """把一次回复里的多份规格按 `# page-NN` 切开,返回 `{nn: 正文}`。

    **按页号映射,不按位置** —— 模型可能乱序输出,按位置对齐会把 p07 的正文
    存进 p05.md,而两份都「看起来正常」,这种错没有任何下游闸能发现。

    同一页号出现多次取**最后一次**:沿用 `_extract_spec` 的同一条经验,
    越靠后越可能是「最终答案」,前面那些是写废的草稿。

    第一个 `# page-` 之前的前言直接丢掉(模型爱写「好的,下面是这一幕的规格」)。
    """
    want = {str(n).zfill(2) for n in nns}
    body = strip_fence(text.strip())
    hits = list(re.finditer(r"(?m)^#\s+page-(\d+)", body))
    out: dict[str, str] = {}
    for i, m in enumerate(hits):
        nn = m.group(1).zfill(2)
        if nn not in want:
            continue
        end = hits[i + 1].start() if i + 1 < len(hits) else len(body)
        out[nn] = body[m.start():end].strip()      # 后出现的覆盖先出现的
    return out


DECK_TRIES = 3  # existing malformed-delivery retries, not a tool/response budget
FINALIZE_SPEC = {
    "type": "function", "name": "FinalizePlan",
    "description": "提交完整页表及选用的图片路径；无图可省略映射。",
    "parameters": {"type": "object", "properties": {
        "pages_md": {"type": "string", "description": "原有页表：每页标签＋一句主题"},
        "media_by_page": {"type": "object", "additionalProperties": {
            "type": "array", "items": {"type": "string"}},
            "description": "页号（如 page-03）到本次工具返回的路径列表；仅列有图页面"}},
        "required": ["pages_md"], "additionalProperties": False},
}


def validate_media(mapping: dict, pages_doc: str, available: dict, pages: Path) -> dict:
    if not isinstance(mapping, dict):
        raise ValueError("media_by_page 必须是页号到路径列表")
    page_ids = {f"page-{nn}" for nn in split_pages(pages_doc)}
    normalized = {}
    for pid, paths in mapping.items():
        match = re.fullmatch(r"(?:page[-_])?([0-9]{1,2})", pid) if isinstance(pid, str) else None
        if match:
            pid = f"page-{int(match.group(1)):02d}"
        if pid not in page_ids or not isinstance(paths, list):
            raise ValueError(f"无效页面或路径列表：{pid}")
        if pid in normalized:
            raise ValueError(f"页面映射重复：{pid}")
        for path in paths:
            if not isinstance(path, str) or path not in available:
                raise ValueError(f"图片尚未在此前工具结果中返回：{path}")
            target = (pages / path).resolve()
            target.relative_to(pages.resolve())
            if not target.is_file():
                raise ValueError(f"图片不存在：{path}")
        normalized[pid] = paths
    return normalized


def deck_call(run: Run, prompt: str, tries: int = DECK_TRIES) -> tuple[str, str, dict]:
    """Free tool loop; one validated final submission, no intermediate page files."""
    hist = [{"role": "user", "content": prompt}]
    separate_theme = getattr(run, "style_director", True)
    specs = [FINALIZE_SPEC, *media.SCHEMAS]
    if not separate_theme:
        specs += PLANNER_WRITE_SPEC
    css, available, rejected = "", {}, 0
    while True:
        started = _now()
        r = llm.respond(IDENTITY, hist, specs, config()["planner"]["reasoning_effort"], tag="deck")
        calls = [o for o in r.output if getattr(o, "type", "") == "function_call"]
        tin, tout, cached = llm.usage_of(r)
        run.log.add([{"type": "text", "text": prompt if len(hist) == 1 else "(tool results)"}],
                    llm.text_of(r), {"input_tokens": tin, "output_tokens": tout,
                    "cache_read_input_tokens": cached or 0}, getattr(r, "id", None) or uuid.uuid4().hex,
                    started, _now(), {"step": "deck", "tools": [
                        {"name": c.name, "arguments": c.arguments} for c in calls]})
        print(f"  deck  in={tin:,} out={tout:,}  {' '.join(c.name for c in calls)}", flush=True)
        if not calls:
            raise RuntimeError("Planner 结束但未提交有效 FinalizePlan")
        hist.extend(llm.replay_item(item) for item in llm.ModelRuntime.replay(r))
        returned, pending_images, final = {}, [], None
        for call in calls:
            if call.name == "FinalizePlan":
                final = None
            try:
                args = json.loads(call.arguments or "{}")
                if call.name in media.NAMES:
                    result = tools.media_call(call.name, args, run.root / "pages", "planner")
                    payload = json.loads(result.text)
                    rows = payload["results"] if call.name == "ImageSearch" else payload
                    returned.update({row["path"]: row for row in rows if "path" in row})
                    query = args.get("query", args.get("prompt", ""))
                    for row, (mime, data) in zip((r for r in rows if "path" in r), result.images):
                        need = query[row["query_index"]] if isinstance(query, list) else query
                        pending_images.extend([
                            {"type": "input_text", "text": json.dumps(
                                {"需求": need, "path": row["path"]}, ensure_ascii=False)},
                            {"type": "input_image", "image_url": f"data:{mime};base64,{data}"},
                        ])
                    output = result.text
                elif call.name == "Write" and not separate_theme:
                    if Path(args["file_path"]).resolve() != (run.root / CSS_REL).resolve():
                        raise ValueError("Write 只用于 theme.css；页表用 FinalizePlan")
                    error = _valid_css(args["content"])
                    if error:
                        raise ValueError(error)
                    css = args["content"]
                    output = "主题已接收"
                elif call.name == "FinalizePlan":
                    pages_doc = args["pages_md"]
                    error = _valid_pages(pages_doc)
                    if error:
                        raise ValueError(error)
                    mapping = validate_media(args.get("media_by_page", {}), pages_doc,
                                             available, run.root / "pages")
                    if not separate_theme and not css:
                        raise ValueError("缺少 theme.css，请先 Write 主题")
                    final = css, pages_doc, mapping
                    output = "定稿已接收"
                else:
                    raise ValueError(f"未知工具：{call.name}")
            except Exception as exc:
                output = f"{type(exc).__name__}: {exc}"
                if call.name not in media.NAMES:
                    rejected += 1
            hist.append({"type": "function_call_output", "call_id": call.call_id, "output": output})
        available.update(returned)
        if pending_images:
            hist.append({"role": "user", "content": pending_images})
        if final is not None:
            return final
        if rejected >= tries:
            raise RuntimeError(f"Planner 交付不合格：{output}")


def seed(run: Run, chassis: Path, lib: Path) -> None:
    """探环境。nn-06 在这里花了 4 次模型调用去 Read 文件 —— 纯读取没有判断,
    harness 直接做掉。

    **2026-08-28 起不再返回 LIBS.md 正文。** 它以前是喂给写 theme/pages 那一步的
    `{libs}`,8,341 字符、占那次提示词的 26%,而里面大半是 API 用法(mlp.js 怎么用、
    katex 必须连 CSS 一起引、精确版本…)—— 那是建页 agent 的事,不是规划的事。
    builder 侧早就切开了:`builder._libs_index()` 只把开头那张「按要做的事查」路由表
    拼进 `prompts/tech.md`(覆盖每一页),细节留给一次 `Read`(`prompts/brief.md` 指路)。
    规划这一步现在只在 deck.md 里读到一句「库由 harness 预置,选型和 API 归建页 agent」。
    代价记在 runs/direction-trim-experiment.json:散文里不再出现
    `MLP.create({sizes:…})` / `renderer:'svg'` 这类 API 级细节,跨页选库一致性会松。
    """
    # 底盘件一律从 --chassis 取,**不留第二份实现**。
    # 以前 selfcheck 在 notale-v2 里另存了一份 tools_selfcheck.py,结果分叉了:
    # 那份 6,984B、zzz 那份 15,220B,密度(占用比/容器数/文本块数/叠压)、
    # --after、KaTeX .katex-mathml、零宽字符跳过、800×450 截图 —— 全都只在 zzz 那份里。
    # nn-08…nn-10 三轮的仪器改进一条都没进到真实 harness。
    for f in ("base.css", "base.js", "CHASSIS.md", "selfcheck.py"):
        src = chassis / f
        if not src.exists():
            raise FileNotFoundError(f"底盘缺 {src} —— 它是 harness 的输入,不能缺")
        shutil.copy2(src, run.assets / f)
    # **拷贝,不做软链接。** 以前这里是 `symlink_to(lib)`,后果是交付出去的 45 页
    # 依赖 harness 目录还在原地 —— 实测有一轮的 lib 软链接指向 /tmp,
    # 那批页面在 /tmp 被清掉之后全部丢库,而 HTML 照样打得开、只是交互死掉。
    # 6.3MB 换掉这个隐患是划算的:一个 run 目录必须能单独拷走还能跑。
    if not (run.assets / "lib").exists():
        shutil.copytree(lib, run.assets / "lib")
    print(f"  seed         底盘已就位,库 {len(list(lib.glob('*.js')))} 个（真拷贝,非软链接）")


def briefs(run: Run, nns: list, mapping: dict | None = None) -> list[Brief]:
    """Keep the existing brief schema; append only this page's selected paths."""
    records = media.sources(run.pages)
    out = []
    for nn in nns:
        pid = f"page-{nn}"
        prompt = run.prompt("brief", query=run.query, pid=pid, total=len(nns))
        paths = (mapping or {}).get(pid, [])
        if paths:
            prompt += "\n\n本页可用素材（按内容需要选用）：\n" + "\n".join(
                media.describe(path, records.get(path, {})) for path in paths)
        out.append(Brief(f"Build {pid}", prompt))
    return out


def plan_run(run: Run, chassis: Path, lib: Path,
             workflow_root: Path = None) -> dict:
    """规划页表与素材，主题策略保持原样。

    2026-08-28 之前这里是 7+ 次串行调用(lec.js → PLAN.md → 图池 → theme.css →
    CONTRACT.md → 逐幕规格),外加一整套围绕页表和规格建立的闸与仪器。
    塌缩掉的不只是调用次数:页表那九列、逐页规格的小节格式、以及它们各自的判据,
    都是"为了让下一步能解析上一步"而存在的中间形态。
    """
    workflow_root = workflow_root or skills.WORKFLOWS
    print(f"\n▸ planner · {run.label}\n  {run.query}  /  {run.minutes} 分钟\n")
    t0 = time.time()
    seed(run, chassis, lib)
    w, h = run.canvas

    # style director 与页表并行。两边互不看对方的输出:director 不知道有几页、
    # 讲什么顺序,planner 不知道底色是什么 —— 这是刻意的,删组件词汇那一轮已经
    # 验证过「模型看见什么词就画什么形状」。语义色与概念的绑定由 builder 那边
    # 按 theme.css 的接口块自己认。
    director_err = []
    director_thread = None
    if run.style_director:
        from . import director as _director

        def _run_director():
            try:
                _director.direct(run, config()["planner"]["reasoning_effort"], workflow_root)
            except Exception as exc:            # noqa: BLE001 —— 失败要能报出来,不能吞
                director_err.append(exc)

        import threading
        director_thread = threading.Thread(target=_run_director, daemon=False)
        director_thread.start()

    css, pages_doc, mapping = deck_call(run, run.prompt(
        "deck", query=run.query, minutes=run.minutes,
        audience=run.audience, scenario=run.scenario or "（没写）",
        canvas_w=w, canvas_h=h,
        css_path=run.root / CSS_REL,
        pages_path=run.root / PAGES_REL,
        philosophy=skills.philosophy_block("deck", run.prompts),
        page_skills=skills.page_skill_descriptions(workflow_root),
        direction=skills.direction_block(run.prompts, menus=run.direction_menus),
        theme_bans=skills.theme_slop_block(workflow_root),
        font_floor=skills.FONT_FLOOR,
        visual_focus=VISUAL_FOCUS_SPEC if run.visual_focus else ""))

    if director_thread:
        director_thread.join()
        if director_err:
            raise RuntimeError(f"style director 失败:{director_err[0]}") from director_err[0]
        css = (run.root / CSS_REL).read_text(encoding="utf-8")

    (run.root / PAGES_REL).parent.mkdir(parents=True, exist_ok=True)
    (run.root / PAGES_REL).write_text(pages_doc, encoding="utf-8")
    if not run.style_director:
        (run.root / CSS_REL).write_text(css, encoding="utf-8")
    pages = split_pages(pages_doc)
    gaps = iface_gaps(css)
    if gaps:
        print(f"  ⚠ 接口块漏列 {len(gaps)} 个类(只报不拦,builder 会少几个可选项): "
              f"{' '.join('.' + c for c in gaps[:12])}")
    nns = sorted(pages)

    (run.pages / "plan").mkdir(parents=True, exist_ok=True)
    for nn in nns:
        (run.pages / "plan" / f"p{nn}.md").write_text(pages[nn] + "\n", encoding="utf-8")
    lens = sorted(len(pages[nn]) for nn in nns)
    print(f"  逐页内容     {len(nns)} 页,{lens[0]}–{lens[-1]} 字符,中位 {lens[len(lens)//2]}")

    ch = run.assets / "CHASSIS.md"
    if "Deck.fmt(v, d)" not in ch.read_text(encoding="utf-8"):
        ch.write_text(ch.read_text(encoding="utf-8").rstrip() + '''
`Deck.fmt(v, d)` **给非负数加 `+`**，只用于增量（`+3.2%`）；年代、质量、温度、距离等
绝对量一律 `v.toFixed(d)`。
''', encoding="utf-8")
        print("  接口交接     已知陷阱（Deck.fmt 带符号）→ CHASSIS.md")

    (run.root / "briefs.json").write_text(
        json.dumps([b.as_tool_input() for b in briefs(run, nns, mapping)],
                   ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        media.write_credits(run.pages)
    except (OSError, ValueError) as exc:
        print(f"  素材来源汇总失败（不影响交付）：{exc}")
    print(f"\n  合计 {time.time()-t0:.0f}s  →  {run.root}")
    return {"pages": len(nns), "root": str(run.root)}


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--query", required=True)
    a.add_argument("--minutes", type=int, default=90)
    a.add_argument("--audience", default="学过一点相关基础、但没系统学过这个题目的读者")
    a.add_argument("--label", required=True)
    a.add_argument("--scenario", default="",
                   help="使用场合,例如「课堂授课,教师带着讲;学生课后可以自己重看一遍」")
    a.add_argument("--chassis", default=str(VENDOR / "chassis"))
    a.add_argument("--model")
    a.add_argument("--effort")
    # Anthropic 系必须走 messages 才拿得到 cache_control;走 responses 是全额计费,
    # 而且不会有任何报错。builder 侧同名参数。
    # 路由会挂。2026-08-21 和 08-30 各挂过一次(paratera 配额被砍回 8 个免费模型,
    # 403 team_model_access_denied),而 config.yaml 是共享状态,为一次跑改它不合适。
    # override() 本来就能把任意 kwargs 灌进 model 配置,这里只是把它接到命令行。
    a.add_argument("--base-url", help="覆盖 base_url,路由挂了时切备用线")
    a.add_argument("--key-env", help="覆盖 api_key_env,配合 --base-url")
    a.add_argument("--wire", choices=("responses", "chat", "messages"),
                   help="覆盖 wire_api;Anthropic 系模型要用 messages")
    a.add_argument("--lib", default=str(VENDOR / "chassis" / "lib"))
    # 外部 skill 根可替换；ImageGen 仍依赖其中的生成脚本。
    a.add_argument("--skills", default=str(skills.DEFAULT))
    a.add_argument("--workflows", default=str(skills.WORKFLOWS))
    a.add_argument("--prompts", default=str(PROMPTS),
                   help="提示词模板目录,用来跑模板对照臂;默认 notale-v2/prompts")
    # **有期限的开关**,出了结论就要和 prompts/direction-menus.md 一起删掉。
    # 见 skills.direction_block 的 docstring。
    a.add_argument("--direction-menus", action="store_true",
                   help="把两张选项菜单表接回 direction 块(对照臂用);默认不接")
    a.add_argument("--visual-focus", action="store_true",
                   help="实验开关:页表每页多一行「视觉焦点」(主证据场由 planner 定);默认关")
    a.add_argument("--style-director", action=argparse.BooleanOptionalAction, default=True,
                   help="theme.css 由 core.director 并行产出；默认开启，--no-style-director 关闭")
    a.add_argument("--template", type=Path, help="参考图片或 theme.css / shots 目录")
    a.add_argument("--style", help="风格要求；修改成品主题必须显式指定")
    n = a.parse_args()
    from .theme import check_options
    try:
        check_options(n.template, n.style, n.style_director)
    except ValueError as exc:
        a.error(str(exc))
    if not Path(n.prompts).is_dir():
        raise SystemExit(f"✗ --prompts 指的 {n.prompts} 不是目录")
    missing = [f"{x}.md" for x in ("brief", "deck")
               if not (Path(n.prompts) / f"{x}.md").is_file()]
    if missing:
        raise SystemExit(f"✗ --prompts 指的 {n.prompts} 缺 {', '.join(missing)} —— "
                         f"缺哪份要当场报错,不能等跑到那一步才 FileNotFoundError。")
    if not Path(n.skills).is_dir():
        raise SystemExit(f"✗ --skills 指的 {n.skills} 不是目录，ImageGen 生成脚本不可用")
    workflow_root = Path(n.workflows)
    if not workflow_root.is_dir():
        raise SystemExit(f"✗ --workflows 指的 {workflow_root} 不是目录")
    missing = [name for name in skills.PAGE_WORKFLOWS
               if not (workflow_root / name / "SKILL.md").is_file()]
    if missing:
        raise SystemExit(f"✗ --workflows 缺少建页工作流: {' '.join(missing)}")
    skills.DEFAULT = Path(n.skills)
    for script in ("make-illustration/scripts/gen.py",):
        if not (skills.DEFAULT / script).is_file():
            raise SystemExit(f"✗ 取图脚本不存在：{skills.DEFAULT / script}")
    llm.override(name=n.model, wire_api=n.wire, base_url=n.base_url, api_key_env=n.key_env)
    if n.effort: config()["planner"]["reasoning_effort"] = n.effort
    plan_run(Run(n.query, n.minutes, n.audience, n.label, n.scenario,
                 prompts=Path(n.prompts), direction_menus=n.direction_menus,
                 visual_focus=n.visual_focus, style_director=n.style_director,
                 template=n.template, style=n.style),
             Path(n.chassis), Path(n.lib), workflow_root)


if __name__ == "__main__":
    main()
