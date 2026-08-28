"""planner —— 固定流水线。

步骤顺序不是设计的,是从 nn-06 主 agent 的动作时间线抄下来的:

    探环境 → theme.css → lec.js → PLAN.md → CONTRACT.md → 建骨架 → 出 brief

nn-03 走的是同一条线,两轮完全一致。跨两轮稳定复现的行为才固定成流水线;
builder 那边每页 16–73 次调用、相差 4.6 倍,所以那边只能是循环。

    python3 -m core.planner --query "…" --minutes 90 --label orbit-01
"""

from __future__ import annotations

import argparse
import base64
import collections
import functools
import math
import json
import re
import os
import shutil
import urllib.request
import sys
from concurrent.futures import ThreadPoolExecutor
from functools import partial
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from . import skills
from . import imgcut
from . import tools
from .artifacts import Brief
from . import llm
from .llm import ROOT, ask, config, fill, strip_fence

# harness 的全部外部输入(底盘、库、技法文档)都在这下面,**不指向 notale-v2 外面**。
# 以前是三条写死的绝对路径,指向同级的 `notale/zzz` 和 `notale/zero`;那两个目录
# 一消失,一天里三次中断:图池 0/12、规格的技法文档全空、expand 静默抛异常。
VENDOR = Path(__file__).resolve().parent.parent / "vendor"
from .trace import Writer
from .wire import ImageBlock, Message, Request, TextBlock

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
    scenario: str = ""
    canvas: tuple[int, int] = (1600, 900)
    # 提示词目录可换。理由同下面 --skills 那段注释:三个外部依赖要么都能换,要么都不能换。
    # 这一条是为了能一键切两套模板做对照臂,而不必对 prompts/ 做 git 体操。
    prompts: Path = PROMPTS
    # 两张选项菜单表接不接回 direction 块。**有期限的开关**,见 skills.direction_block。
    direction_menus: bool = False
    root: Path = field(init=False)
    log: Writer = field(init=False)

    def __post_init__(self) -> None:
        self.root = ROOT / "runs" / self.label
        self.assets.mkdir(parents=True, exist_ok=True)
        self.log = Writer(self.root / "trace.jsonl", str(uuid.uuid4()))

    pages = property(lambda self: self.root / "pages")
    assets = property(lambda self: self.root / "pages" / "assets")

    def prompt(self, name: str, **kw: object) -> str:
        return fill((self.prompts / f"{name}.md").read_text(encoding="utf-8"),
                    _where=f"{name}.md", **kw)


# 每一步产物的最小**字符**数(不是字节 —— 中文 3 字节/字,按字节定会差三倍)。
# 低于它就是没生成出来,不是"生成得简洁"。
#
# 三轮实测的字符数:
#     PLAN.md      24,056 / 20,440 / 21,964
#     CONTRACT.md  11,591 / 14,602 / 10,413
#     theme.css    20,979 / 21,566 / 20,777
# 阈值取实测最小值的**约 1/6**。刻意定得这么松:这道闸只该抓
# "0 字符 / out=229 tok" 那种灾难性空响应,不该去评判 Sonnet 写得简不简洁 ——
# 换模型后产物合理地小一截是可能的,把正常产出判死的代价比漏判高得多。
# 走工具之后两份产物各有各的下限。CSS 约 12k 字符、散文 20 页约 7k。
# 取实测的约 1/3,只抓灾难性空响应,不评判写得简不简洁。
# pages.md 2026-08-28 从「每页一段散文」改成「一个标签加一句话」,合理体量从
# 8,000 掉到约 1,300(22 页 × 60 字符),旧的 2500 会把合格产物判死。
# **截断真正靠的不是字数,是 `_valid_pages` 的页号连续性检查** —— 那条与格式无关,
# 半截产物一定缺尾部页号。这里留 400 只为挡住「几乎什么都没输出」。
MIN_CHARS = {"theme.css": 3000, "pages.md": 400}
# 产物**字符数**的上限,和 MIN_CHARS 对称。`MAX_OUT` 管的是输出 token,
# 从来没有管过产物有多长 —— 而产物长度才是下游成本:CONTRACT.md 会被每个建页 agent
# 各读两遍,一份 31,493 字符的契约在 50 页上就是 3.1MB 的重复输入。
#
# 取值有实测依据,**一律按字符算,不按字节** —— 中文 3 字节/字,两个单位混用会差三倍
# (我第一版就把 nn-11 的 SHARED.md 写成「9,463」,那是字节,字符只有 5,220)。
#
#     nn-11(Opus)  PLAN.md 7,501 + plan/SHARED.md 5,220 = 12,721 字符
#     ape-g6       deck.md 11,713 + CONTRACT.md 13,549  = 25,262  (2.0×)
#     ape-ds3      deck.md  8,960 + CONTRACT.md 18,881  = 27,841  (2.2×)
#     ape-dspro3   CONTRACT.md 6,796                     (本来就精简,不该被拒)
#
# CONTRACT.md 提示词现在明确要求 ≤6,000，闸与产物契约保持一致。
# 这个上限仍高于 nn-11 的 5,220 字符共享契约，并能拒掉 13.5k 和 18.9k 的跑飞产物。
# **注意这一条只治了一半** —— g6 的共享文本大头有一半在 deck.md(11,713 字符),
# 那要靠「给每页切 deck 片」来治,是另一个改动,不在这一轮。
# 逐页 spec 的 1,600:Opus 中位 1,178,我们是 3,116 / 1,998 / 1,984。
# **字数上限已经去掉。** 它拦掉的从来不是跑飞的产物,而是「差 1.9%」——
# CONTRACT.md 连续三次 6,190 / 6,057 / 6,115,上限 6,000,整轮就停在这里。
# 长度是成本问题,该由提示词里的目标字数去引导(那是模型能配合的),
# 不该由一条硬闸去终止一轮实验。真正跑飞的产物会被 MAX_OUT(输出 token)
# 和 MIN_CHARS(空响应)兜住,那两条各有实测依据。
MAX_CHARS: dict[str, int] = {}
# CONTRACT.md 从 16,000 提到 60,000。**它是全流程最重的一份提示词** ——
# 18,222 字符,注入了 CHASSIS 全文 + LIBS.md + lec_api + lec_dom + 受众场合。
# 实测 DeepSeek-V4-Flash 在这一步:
#     effort=low     52s   out= 5,101 tok  正文  8,842 字符  completed
#     effort=medium 184s   out=23,600 tok  正文 12,891 字符  completed
# medium 要 23,600(一万多是推理),而上限 16,000 直接打满、自动升到 32,000 仍打满。
# 我先前把 spec 提到 60,000 时漏了这一项 —— 那一轮 51 份 pNN.md 全部正常,
# 唯一的截断在这里,而我一直以为死在 spec 那步(看错了调用栈:call() 不是 expand())。

# 每一步的输出上限。config 里的 128,000 对这条链路是**跑飞的空间**:
# 实测这个端点约 70 tok/s(小请求 52 tok/3.6s、中请求 4,587 tok/65.2s),
# 而 http_timeout_sec 是 900s —— 也就是一次请求最多只来得及吐约 63,000 token。
# 上限给到 128,000,模型就可以生成到永远也回不来:ape-01 的 PLAN.md 连续三次
# 900s 超时、累计死等 1,806s 毫无进展,端点本身却是健康的。
#
# 这些数取实测需求的 1.3–1.6 倍(冒烟那轮:PLAN.md 35,749 / theme.css 17,377 /
# CONTRACT.md 6,659 / lec.js 27,136 tok),都远在 63,000 的天花板之下。
# 撞上上限不会静默 —— llm.py 会把 status=incomplete 抛出来。
# PLAN.md 从 48,000 提到 64,000:DeepSeek-V4-Flash 实测打满 47,998 被截断闸拦下。
# 86–107 tok/s × 900s 超时 ≈ 77,000 的天花板,64,000 仍在其下。
# theme.css 从 28,000 提到 48,000。**接口块改成八节之后这一步的产物几乎全是中文,
# 而中文和 CSS 的 token 密度差四倍以上** —— 拿整份文件的均值去估会算少三倍:
#     sol-low-20260827   out= 6,048 tok  产物 16,457 字符  均值 2.72 字符/tok
#     其中 CSS 14,483 字符 ≈ 3,900 tok(约 3.9 字符/tok)
#         接口块 1,929 字符 ≈ 2,100 tok(约 0.85 字符/tok)
# 八节接口块目标约 13,600 字符,几乎全是中文 ≈ 16,000 tok,加 CSS 约 4,100,
# 合计约 20,100 —— 对 28,000 只剩 1.4× 余量,而**推理 token 也算在这个额度里**
# (同一步 sonnet-full 吐 8,870 tok 只产出 17,897 字符,比 Sol 高 47%)。
# 48,000 在 70 tok/s × 900s 超时的天花板(约 63,000)之下。
# `deck` 定 28,000 而不是 48/64k:`llm.py` 只在 `cap*2 <= OUTPUT_CEILING(60,000)`
# 时自动升一档,28k 保住了一级升额空间(→56k);64k 一级都没有,而且本身已超过
# 这条链路能吐的量(最慢实测 70 tok/s × 900s 超时 ≈ 63,000)。
# 实测需求:CSS 6,048 tok + 页表 5,583 tok,合并后约 10–12k,加推理仍在 28k 之下。
MAX_OUT = {"deck": 28000}
# CONTRACT.md 从 16,000 提到 60,000。**它是全流程最重的一份提示词** ——
# 18,222 字符,注入了 CHASSIS 全文 + LIBS.md + lec_api + lec_dom + 受众场合。
# 实测 DeepSeek-V4-Flash 在这一步:
#     effort=low     52s   out= 5,101 tok  正文  8,842 字符  completed
#     effort=medium 184s   out=23,600 tok  正文 12,891 字符  completed
# medium 要 23,600(一万多是推理),而上限 16,000 直接打满、自动升到 32,000 仍打满。
# 我先前把 spec 提到 60,000 时漏了这一项 —— 那一轮 51 份 pNN.md 全部正常,
# 唯一的截断在这里,而我一直以为死在 spec 那步(看错了调用栈:call() 不是 expand())。
# spec 一路 8,000 → 20,000 → 40,000。
# 8,000 是按 GPT-5.6-Sol 的实测量定的(48 份 pNN.md 2,161–9,168B,
# 合计 out=110,283 tok,平均约 2,300 tok/份),而 DeepSeek-V4-Flash 直接打满被截断闸
# 拦下 —— 它把推理也算在输出里。20,000 下它能跑,再翻一倍留足余量。
# 40,000 在 100 tok/s × 900s 超时的天花板(约 90,000)之下,并发 8 下最坏一轮约 400s。
#
# 这是同一形状的第三次:**按一个模型实测定的数,换模型就不够**
# (max_output_tokens 128k → 按步收紧;lec.js 40k → 64k;spec 8k → 40k)。
# 这些数不该当常量,该当「按最慢的模型定」的下界。

# 逐页展开的并发。端点(llmapi.paratera)支持到 100 并发,两路实验同时跑时各给 50(合计 100,打满)。
#
# 先前压到 8 是我拿错了教训:config.yaml 里那条「20 并发累计空等 84 分钟」
# 归因的是**旧端点 api.999555999**(实测 6/8 成功、2 次超时),
# 而 paratera 那次是 8/8 成功、37.4 次/分。压低并发换不来稳定,只是白等墙钟。
# 20 → 50。实测:44 份规格 177s、52 份 419s —— 后者要排三批,时间翻倍多。
# 而 builder 那边并发 50、排队实测 0 秒(墙钟严格等于最慢那一页),
# 说明端点吃得下,瓶颈不在这里。
# 从 50 降到 20。端点整体支持 100 并发,但**这一步不是瓶颈在端点,而在单模型配额**:
# 77 路一起打上去,DeepSeek 那边大面积 RateLimitError,退避 5s→15s→40s 全是白等墙钟。
# 展开这一步每路都带 deck 全文(约 6KB),比 builder 的单页调用重得多,所以单独降一档。
# builder 那边保持 50 —— 它每页是一串小调用,压力形态不一样。

# 单页停留上限,秒。原来从 `core/check_coverage.py` 取(那边是同一个数,不抄第二份),
# 2026-08-28 那个模块整个删掉了,所以内联到这里 —— 现在这是唯一一份。
# **这个数要留着**:把页数从 18 推到 41 的正是它,而不是页表的九列。
STAY_CEILING = 150.0


def call(run: Run, step: str, prompt: str, min_chars: int = 1,
         sheet: Path | None = None) -> str:
    m = config()["model"]
    body: list = [TextBlock(text=prompt)]
    if sheet and sheet.exists():
        # 同类任务里协调者在写 deck.css 之前把要当底图用的插画拼成一张联系表、
        # 然后**看了那张图**(它的第 22 次调用),才定下底色。它没看那 14 张照片。
        body.append(ImageBlock(
            data=base64.b64encode(sheet.read_bytes()).decode(), media_type="image/jpeg"))
    req = Request(model=m["name"], system=[TextBlock(text=IDENTITY)],
                  messages=[Message(role="user", content=body)],
                  max_tokens=MAX_OUT.get(step, m["max_output_tokens"]),
                  output_config={"effort": config()["planner"]["reasoning_effort"]})
    t0, started = time.time(), _now()
    r = ask(req, min_chars=min_chars)
    run.log.add([b.model_dump() for msg in req.messages for b in msg.content], r.text,
                # 键名照 wire.Usage —— trace.usage_of() 只认它声明过的字段。
                {"input_tokens": r.input_tokens, "output_tokens": r.output_tokens,
                 "cache_read_input_tokens": r.cached_tokens},
                getattr(r.raw, "id", None) or f"req_{uuid.uuid4().hex[:16]}",
                started, _now(), {"step": step})
    # planner 这一侧的六步各写各的提示词,前缀几乎不共享,所以 cached 通常接近 0;
    # 打出来是为了能一眼看出「这一步是不是重试撞上了缓存」,以及跟 builder 那侧对照。
    print(f"  {step:<12} {time.time()-t0:6.1f}s  in={r.input_tokens:>7,}"
          f"{'(cached ' + format(r.cached_tokens, ',') + ')' if r.cached_tokens else '':>16}"
          f"  out={r.output_tokens:>6,} tok  {len(r.text):>7,} 字符")
    return strip_fence(r.text)


def _looks_like_prose(text: str) -> str:
    """产物是不是把思考过程当成文件内容写出来了。返回原因,空串表示没问题。

    实测(ape-ds / DeepSeek-V4-Flash):`lec.js` 整个 23,351 字符是模型的推理稿 ——
    开头「我们被要求为互动讲义规划一个计算模块…题目是什么?可能是关于"猿人"…」,
    中间「现在,我们应规划好完整的输出…这是最终答案。但在输出前,让我们再检查一遍代码」。
    提示词里写着「只输出 JS 文件内容本身,不要任何解释」——**散文约束不起作用**,
    而 MIN_CHARS 和截断闸都放行了,因为两万多字符的散文在字数上完全合格。
    """
    head = text.lstrip()[:400]
    for pat in ("我们被要求", "我们需要", "首先,", "首先，", "让我们", "题目要求",
                "这是最终答案", "现在,我们", "现在，我们"):
        if pat in head:
            return f"开头像推理稿(命中「{pat}」)"
    return ""


# `lec.js` 及其两道闸(`_valid_js_syntax` / `_valid_js`)2026-08-28 整条删除。
#
# **删的时候连"广告它的那张清单"一起删了** —— 这是上一次只删一半的教训:
# 2026-08-21 去掉 `Lec.mount` 时,`artifacts.py: lec_api()` 末尾还留着一行
# `out.append("Lec.mount({index, kicker, title, take})")`,而那份 API 清单被注入
# 写规格那一步,于是 48/48 份规格照抄了这个不存在的调用、48 个页面一个都没调用,
# 结果**主标题到达 46/48 页,而每页那句「要让读者信什么」只到达 5/48**。
# 代价两个月后才量出来。所以这一次同步清掉了:`prompts/lec.md`、
# `artifacts.py` 的 `lec_api`/`lec_values`/`lec_dom`、`{lec_api}` 三个槽位、
# `skills.FLOORS` 里的 Lec 口径、`scrub-visual-slop.md` 里那条。
#
# 数值一致性改由**每页散文自带真实数值、单位与出处**承担;
# 「禁止预录结果或伪造数据、随机过程固定种子」那半条规则本身与 Lec 无关,
# 已经留在静态技术契约里,没有跟着删。


_IFACE = re.compile(r"/\*\s*=+\s*INTERFACE\s*=+(.*?)=+\s*/?INTERFACE\s*=+\s*\*/",
                    re.S | re.I)

# 八节 `IFACE_SECTIONS` 和 `_iface_section` / `_chassis_names` 2026-08-28 一起删。
#
# 它们那一轮解决的问题是真的:接口块 1,929 字符只点到 33/61 个类、18/23 个 token,
# 于是页面内联 CSS 长出 466 个自造类 / 86,411 字符(共享主题的 5.3 倍),
# `.btn` 被 10 页各自重定义。但那个问题的成因是**建页 agent 读不到 CSS 源码**,
# 而现在源码整份进了 builder 的 system 块 —— 病根没了,这副药也就不用吃了。
# 接口块本身留着,只是不再需要八节格式、也不再有硬闸。


def _interface(css: str):
    """theme.css 自报的 INTERFACE 块 —— 注入写规格那一步,让规格点得出版面类。

    2026-08-23 加的:在那之前 `theme.css` 排在 `expand()` **之后**,
    规格点名版面类在因果上不可能,实测五种骨架类全都生成了、页面 46/48 在用,
    而 48 份规格一份都没点过名。
    (追加进 CHASSIS.md 那一路 2026-08-28 去掉了 —— CSS 源码现在直接给 builder。)
    """
    return _IFACE.search(css)


def _valid_css(text: str) -> str:
    """theme.css 的闸:得是 CSS,而且**必须把 `#stage` 设成 flex 列**。

    后面这一条是全套里最要紧的一行 CSS,也是量出来的干净二分:
        Opus 那条线 44 页  `#stage` 是 flex   子元素高度之和 = 900px 的 100%(44/44)
        我们        52 页  `#stage` 是 block  中位只有 89%(0/52 达 95%)
    block 布局下子元素按内容取高,剩下的就是死空间、没有任何东西要求填它;
    flex 列布局下子元素必须把 900px 分完 —— 「填满版心」从判断变成几何后果。
    占用比 51% 对 63% 的差距,一大块就是这 11%。
    而且 block 下「填满」要靠人一遍遍量高度,实测建页 agent 平均 17 次 Edit/页。

    所以它值得一道闸:一行 CSS,可算,漏了整套 44 页都填不满。
    """
    bad = _looks_like_prose(text)
    if bad:
        return bad
    # **首行是 markdown 围栏 = 这份 CSS 是坏的,必须判死。** 这条是量出来的,
    # 代价是一整轮 20 页(runs/deck-sol-low-20260828 第一版):
    # 文件首行 ```css,浏览器把它当选择器,注释被跳过后它和紧随的 `:root` 连成一个
    # 非法选择器 —— **整个 `:root` 块被丢弃**,所有 token(版心 padding、字阶、
    # 配色)一起失效。页面本身完全正确,但渲染出来没有版心、字号全是默认值。
    #
    # 旧流程不会撞上:`call()` 末尾 `strip_fence(r.text)`,而那时整个回复就是这一份
    # 产物。塌缩成一次调用之后回复是复合文档、围栏在**内层**,整篇 strip 不掉。
    #
    # 判死而不是顺手剥掉,是因为 `_extract_code` 的候选机制已经处理了剥离
    # (候选 1 整段、候选 2 strip_fence):这里诚实地说"整段不是 CSS",
    # 候选 2 就自动接手。**闸接受一份坏产物,比没有闸更坏** —— 它让 20 页
    # 全部无样式地跑完、还报了 0 失败。
    if text.lstrip().startswith("```"):
        return ("首行是 markdown 代码围栏 —— 它会让浏览器把第一条规则连同 `:root` "
                "一起当成非法选择器丢掉,整套 token 失效。只输出 CSS 本身,不要围栏")
    if text.count("{") < 8 or ":" not in text:
        return f"不像 CSS(只有 {text.count('{')} 个规则块)"
    # **先剥注释再找。** 这一条是踩出来的:INTERFACE 块里有一句
    # 「版心 内容区 1488×844,由 `#stage { padding:28px 56px }` 定死」,
    # 而 `re.search` 取第一个匹配 —— 它抓到的是注释里那段样例(没有 display:flex),
    # 真正的规则在第 54 行、写得完全正确。结果 theme.css 三次全被退回、整轮死掉,
    # 而模型没做错任何事。**闸要判 CSS,不该判散文。**
    bare = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    body = " ".join(m.group(1) for m in re.finditer(r"#stage\s*\{([^}]*)\}", bare, re.S))
    if not (re.search(r"display\s*:\s*flex", body)
            and re.search(r"flex-direction\s*:\s*column", body)):
        return ("`#stage` 没有设成 flex 列 —— 必须有 "
                "`#stage { display: flex; flex-direction: column; }`。"
                "缺了它子元素按内容取高、剩下的画布就是死空间,"
                "实测这样的一轮 52 页里 0 页把 900px 用满(对照:另一条线 44/44 页用满)")
    if not re.search(r"padding\s*:", body):
        return ("`#stage` 没有设置 padding —— 主题必须在共享层定义统一版心，"
                "否则每页会各自决定外边距。至少保留 "
                "`padding: var(--pad-y) var(--pad-x)`")
    # **接口完整性闸(2026-08-29)。** 建页 agent 从此只拿到 INTERFACE 注释块,
    # 拿不到规则体(见 builder._theme_interface)—— 所以接口写漏一个类,那个类
    # 对所有页都等于不存在。这里逐个校验:正文里定义的每个类名都必须出现在
    # 接口块文本里。按基名判(.btn:hover/.btn.active 都算 .btn),
    # svg 防覆盖那行的选择器豁免(它是保护规则,不是供页面选用的组件)。
    if "==== INTERFACE ====" not in text or "==== /INTERFACE ====" not in text:
        return ("缺 INTERFACE 接口块 —— 文件第一段必须是 "
                "`/* ==== INTERFACE ==== … ==== /INTERFACE ==== */`。"
                "建页 agent 只拿到这个块,拿不到规则体,没有它整套类都没法用")
    iface = text.split("==== /INTERFACE ====", 1)[0]
    svg_guard = set(re.findall(r"svg\s+\.([A-Za-z][\w-]*)", bare))
    defined = {m for m in re.findall(r"\.([A-Za-z][\w-]*)", bare)} - svg_guard
    missing = sorted(c for c in defined if f".{c}" not in iface and c not in iface)
    if missing:
        return ("接口块不完整,正文里定义了但 INTERFACE 没列的类: "
                + " ".join("." + c for c in missing[:20])
                + " —— 建页 agent 只拿到接口块,没列的类等于不存在。"
                  "每个都补一行「组件/版式 名字 一句用法或几何」,或者删掉那个类")

    # 接口块的八节结构闸 2026-08-28 删除,和 `prompts/theme.md` 的八节模板一起。
    #
    # 那道闸的前提是「接口块是 theme.css 到建页 agent 的**唯一通道**」——
    # 因为 brief 明令不许读 assets/ 下的 CSS 源码。现在源码整份直接进 builder 的
    # system 块,那个前提没有了:块里没写的类,agent 自己能在源码里看到。
    # 接口块本身保留(它写的是源码里读不出来的东西:用途、关系、什么时候拿哪个),
    # 但它不再是唯一通道,也就不值得用一道会把整轮判死的硬闸去守
    # —— `cached()` 重试是原样重发,拦住了模型也收不到反馈。
    return ""


# ── 一次调用的产物:由模型用 `Write` 工具直接写文件 ──────────────────────
#
# **2026-08-28 从「分隔行 + 从散文里抠」改成走工具。这是根因修复,不是加判据。**
#
# 原来的形状是模型吐一篇复合散文(`=== CSS ===` / `=== PAGES ===` 分隔行),
# harness 再用 `_extract_code` 的候选启发式把 CSS 切出来。代价当天就付了:
# CSS 首行残留一个 markdown 围栏,浏览器把它当选择器、连同紧随的 `:root` 一起
# 丢弃,**整套 token 失效、20 页全部无样式渲染**,而所有既有判据都报绿
# (文件在、HTTP 200、解析出 89 条规则、`_valid_css` 的文本检查全过、
#  selfcheck 报 0 失败、占用比因为元素散开反而更高)。
#
# 走工具之后文件内容是 tool call 的 JSON 字符串字段:**没有围栏可言,
# 没有分隔行要找,没有候选要猜** —— 这一整类 bug 消失,而不是被判据兜住。
#
# 仍然是**一次模型调用**:一个响应里带多个 tool call 在这条路由上是实测可行的
# (builder 日志里的 `步 2 Read Read Read`)。大号工具参数也是实测过的 ——
# builder 常规地把整页 HTML 当 `Write` 的参数写出去,iface8 那轮 21 次 Write
# 输出中位 5,253 tok、最大 7,893,而这里的 theme.css 约 3,110 tok。
#
# **只发两个 Write,不是每页一个。** 一次响应里发 21 个 tool call 在这条路由上
# 没有实测证据(观察到的最大是 5 个小 Read);而按 `# page-NN` 切散文**不是**
# 出过问题的地方 —— 那里没有围栏、没有代码,`_split_specs` 已经跑了很多轮。
# 只把出过事的那一份挪到工具上,改动面最小。
PAGE_MIN = 12          # 一页短于这个字符数就当是被截断的残块。极简格式下一页
                       # 只有一句话(实测 20–60 字符),旧值 60 会把正常页当残块丢掉
N_FLOOR, N_CEIL = 4, 60  # 只兜「模型把页数写飞了」;真正的区间由 --minutes 推

CSS_REL = "pages/assets/theme.css"
PAGES_REL = "pages/plan/pages.md"


def write_targets(run: Run) -> dict:
    """允许模型写的两个目标。**白名单,不是建议。**

    `tools.run` 的 `Write` 会写任意绝对路径 —— 不限死就等于把 run 目录以外
    也交给模型。builder 那边靠 `stray()` 事后扫野文件,这里更严:只许这两个,
    写别处当场拒绝并把理由回喂(和 builder 处理畸形工具参数同一套做法)。
    """
    return {(run.root / CSS_REL).resolve(): "theme.css",
            (run.root / PAGES_REL).resolve(): "pages.md"}


def take_writes(calls, run: Run) -> tuple[dict, list]:
    """把一次响应里的 `Write` 调用收下来。返回({目标名: 内容}, [拒绝原因])。

    只收白名单里的两个目标;别的记成拒绝原因,交给上层决定重试还是报错。
    """
    allow = write_targets(run)
    got, refused = {}, []
    for c in calls:
        if c.name != "Write":
            refused.append(f"只给了 `Write` 工具,不该调 `{c.name}`")
            continue
        try:
            a = json.loads(c.arguments or "{}")
        except json.JSONDecodeError as ex:
            refused.append(f"Write 的参数不是合法 JSON({ex}) —— 多半是被截断了")
            continue
        raw = str(a.get("file_path") or "")
        try:
            target = Path(raw).resolve()
        except OSError:
            target = None
        name = allow.get(target)
        if not name:
            refused.append(f"不许写 `{raw}`;这一步只能写 {CSS_REL} 和 {PAGES_REL}")
            continue
        got[name] = str(a.get("content") or "")
    return got, refused


def split_pages(text: str) -> dict:
    """`pages.md` → `{nn: 正文}`。复用 `_split_specs`:按页号而非位置映射、
    同页号取最后一次、丢弃前言。切散文不是出过问题的地方,原样用。"""
    return _split_specs(text, range(1, N_CEIL + 1))


def _valid_pages(text: str) -> str:
    """`pages.md` 的闸。只拦提示词里给了样例、照抄就能满足的东西 ——
    `cached()` 重试是原样重发、`bad` 只打印不回灌,拦一件模型不知道怎么改的事
    等于三次之后判死整轮。"""
    bad = _looks_like_prose(text)
    if bad:
        return bad
    pages = split_pages(text)
    if not pages:
        return "没有 `# page-NN` 块 —— 每页一个,页号两位、从 01 连续编"
    nn = sorted(int(k) for k in pages)
    if not (N_FLOOR <= len(nn) <= N_CEIL):
        return f"页数 {len(nn)} 不合理(应在 {N_FLOOR}–{N_CEIL} 之间)"
    if nn != list(range(1, len(nn) + 1)):
        miss = sorted(set(range(1, max(nn) + 1)) - set(nn))
        return f"页号不连续,缺 {' '.join(f'page-{x:02d}' for x in miss)} —— 从 01 编到 N,不跳号"
    return ""


CHECKS = {"theme.css": _valid_css, "pages.md": _valid_pages}
REPAIRS = {}

_FENCE = re.compile(r"```[a-zA-Z]*\n(.*?)```", re.S)


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


def _extract_code(text: str, check) -> str:
    """从可能夹着推理稿的回复里把产物捞出来。**只用于代码产物。**

    做法是**候选 + 校验**,不是靠比例或位置去猜:按可能性排好候选,
    返回第一个能通过 `check` 的。校验器本身就是守卫,所以不需要
    "最大块得占全文多少"这种门槛 —— 那个门槛试过,反而把
    「几万字散文 + 一个小围栏」这种正确形状挡在外面。

    候选顺序:
      1. 整段(最常见:模型老老实实只给了文件)
      2. 开头就是围栏 → strip_fence
      3. 所有 ``` 块,按长度从大到小
      4. 每个 `(function` 处切到文件末尾,从最后一个往前

    第 4 条是实测逼出来的:DeepSeek-V4-Flash 连续三次交出几万字符的推理稿,
    真正的代码在**文件末尾**、而且紧接在散文后面同一行开始
    (`…Ensure no markdown.(function (global) {`),所以不能锚在行首。
    越靠后的 `(function` 越可能是"最终答案",前面那些是它写废的草稿。

    **绝不能用在 markdown 产物上** —— PLAN.md / CONTRACT.md 本身就含代码块
    (实测 CONTRACT.md 里有 26 处围栏),取块会把整份文件毁掉。
    所以只在 CHECKS 里那几步上调用。
    """
    t = text.strip()
    cands = [t]
    if t.startswith("```"):
        cands.append(strip_fence(t))
    blocks = sorted(_FENCE.findall(t), key=len, reverse=True)
    cands += [b.strip() + "\n" for b in blocks]
    for m in reversed(list(re.finditer(r";?\(function\b", t))):
        cand = t[m.start():].strip()
        if len(cand) >= 500:
            cands.append(cand + "\n")
    for c in cands:
        if c and not check(c):
            return c
    return t


def cached(run: Run, step: str, path: Path, prompt: str,
           sheet: Path | None = None) -> str:
    """产物已经在就跳过。单步就是几分钟(theme.css 实测 220s),后面挂掉时
    没有理由把前面全部重烧一遍。删掉对应文件即可强制重做。"""
    lo = MIN_CHARS.get(step, 1)
    if path.exists() and path.stat().st_size:
        text = path.read_text(encoding="utf-8")
        # 上一轮留下的残缺产物不能当成"已完成"。空文件和过短文件都重做 ——
        # 否则一次空响应会被缓存下来,后面每次续跑都跳过它。
        if len(text) >= lo:
            print(f"  {step:<12} 已存在,跳过        {len(text):>7,} 字符")
            return text
        print(f"  {step:<12} 已存在但只有 {len(text):,} 字符(<{lo:,}),重做")
    check = CHECKS.get(step)
    for attempt in range(1, 4):
        text = call(run, step, prompt, min_chars=lo, sheet=sheet)
        if check:
            pulled = _extract_code(text, check)
            if pulled != text.strip():
                print(f"  {step:<12} 回复里夹着别的东西,已把产物取出来"
                      f"({len(text):,} → {len(pulled):,} 字符)", flush=True)
                text = pulled
        fix = REPAIRS.get(step)
        if fix:
            text = fix(text)
        bad = check(text) if check else ""
        if not bad:
            path.write_text(text, encoding="utf-8")
            return text
        print(f"  {step:<12} ✗ 第 {attempt} 次产物不是有效的 {step}:{bad}", flush=True)
        (run.assets.parent / f"{step}.rejected{attempt}").write_text(text, encoding="utf-8")

    raise RuntimeError(
        f"{step} 连续 3 次产出的都不是有效内容(最后一次:{bad})。"
        f"被拒的存在 {run.assets.parent}/{step}.rejectedN,看一眼就知道模型在写什么。")


def deck_call(run: Run, prompt: str) -> tuple[str, str]:
    """**一次带 `Write` 工具的调用**,拿回 (theme.css 内容, pages.md 内容)。

    和 `cached()` 同一套重试骨架(三次、写 rejectedN、三次不过就报错),
    但产物来自 tool call 的参数,不经任何文本切分 —— 见 write_targets 上面那段账。

    续跑判据是两份产物都在且都过闸;删掉任一份即可强制重做。
    """
    css_p, pages_p = run.root / CSS_REL, run.root / PAGES_REL
    if css_p.exists() and pages_p.exists():
        css, pages = css_p.read_text(encoding="utf-8"), pages_p.read_text(encoding="utf-8")
        if (len(css) >= MIN_CHARS["theme.css"] and len(pages) >= MIN_CHARS["pages.md"]
                and not _valid_css(css) and not _valid_pages(pages)):
            print(f"  deck         已存在,跳过        CSS {len(css):,} / 散文 {len(pages):,} 字符")
            return css, pages
        print("  deck         已存在但不完整或不过闸,重做")

    spec = [s for s in tools.specs() if s["name"] == "Write"]
    for attempt in range(1, 4):
        t0, started = time.time(), _now()
        r = llm.respond(IDENTITY, [{"role": "user", "content": prompt}],
                        spec, config()["planner"]["reasoning_effort"], tag="deck")
        calls = [o for o in r.output if getattr(o, "type", "") == "function_call"]
        tin, tout, cached_tok = llm.usage_of(r)
        run.log.add([{"type": "text", "text": prompt}], llm.text_of(r),
                    {"input_tokens": tin, "output_tokens": tout,
                     "cache_read_input_tokens": cached_tok or 0},
                    getattr(r, "id", None) or f"req_{uuid.uuid4().hex[:16]}",
                    started, _now(),
                    {"step": "deck", "tools": [{"name": c.name} for c in calls]})
        got, refused = take_writes(calls, run)
        print(f"  deck         {time.time()-t0:6.1f}s  in={tin:>7,}  out={tout:>6,} tok  "
              f"{len(calls)} 个工具调用 → {sorted(got) or '无产物'}")
        for why in refused:
            print(f"               ⚠ {why}")

        bad = []
        if "theme.css" not in got:
            bad.append(f"没有写 {CSS_REL}")
        elif _valid_css(got["theme.css"]):
            bad.append(f"{CSS_REL}: {_valid_css(got['theme.css'])}")
        if "pages.md" not in got:
            bad.append(f"没有写 {PAGES_REL}")
        elif _valid_pages(got["pages.md"]):
            bad.append(f"{PAGES_REL}: {_valid_pages(got['pages.md'])}")

        if not bad:
            css_p.parent.mkdir(parents=True, exist_ok=True)
            pages_p.parent.mkdir(parents=True, exist_ok=True)
            # **逐字节落盘,不做任何剥离。** 内容来自 JSON 字符串字段,
            # 不存在围栏 —— 这正是走工具要换来的那件事。
            css_p.write_text(got["theme.css"], encoding="utf-8")
            pages_p.write_text(got["pages.md"], encoding="utf-8")
            return got["theme.css"], got["pages.md"]

        print(f"  deck         ✗ 第 {attempt} 次不合格:{';'.join(bad)}", flush=True)
        (run.root / f"deck.rejected{attempt}").write_text(
            json.dumps({"refused": refused, "bad": bad,
                        **{k: v for k, v in got.items()}},
                       ensure_ascii=False, indent=1), encoding="utf-8")

    raise RuntimeError(
        f"deck 连续 3 次没能用 `Write` 交付两份合格产物(最后一次:{';'.join(bad)})。"
        f"被拒的存在 {run.root}/deck.rejectedN。")


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
           '<body data-page="{i:02d}" data-total="{n:02d}">\n'
           # 只留 `#stage` —— base.js 靠它做整体缩放,里面是空的。
           # 原来还有 `<main id="main">`,那是给 mount 往前后插页眉页脚用的;
           # 页眉页脚删掉之后它没有对象了,版面由建页的 agent 自己定。
           '<div id="stage"></div>\n'
           '<script src="assets/base.js"></script>\n</body>\n</html>\n')
    for i in range(1, n + 1):
        p = run.pages / f"page-{i:02d}.html"
        if not p.exists():
            p.write_text(tpl.format(i=i, n=n), encoding="utf-8")
    print(f"  skeletons    {n} 个骨架,已接 base/theme,data-total={n:02d}")


@functools.lru_cache(maxsize=1)
def _skill_names() -> frozenset:
    # 也是吃 `skills.DEFAULT` 的一处。`main()` 会按 `--skills` 重绑它,
    # 但这个函数带 lru_cache —— **重绑之后必须清缓存**,否则第一次调用的结果
    # 会一直用下去。目录不在就返回空集:这只是用来校验规格里点的 skill 名对不对,
    # 拿不到清单该是「这一条查不了」,不该是整轮炸掉。
    root = skills.DEFAULT
    if not root.is_dir():
        return frozenset()
    return frozenset(d.name for d in root.iterdir()
                     if (d / "SKILL.md").is_file())


@functools.lru_cache(maxsize=1)
def _lib_stems() -> frozenset:
    """库文件名去掉扩展名。`konva.min.js` → `konva`。"""
    d = VENDOR / "chassis" / "lib"
    return frozenset(p.name.split(".")[0] for p in d.iterdir()) if d.is_dir() else frozenset()


_FIELD = re.compile(r"\s*(?:[-*]\s*)?\*{0,2}[^：:\n]{1,15}[：:]")
_BULLET = re.compile(r"\s*(?:[-*]|\d+[.、)])\s+")


_SOURCES = "wikimedia,nasa,met,loc,internetarchive"


# 两条守卫,都是文本/统计,不是判断:
#   G1 检索词和标题的实词重叠 —— 抓「met 给了一只玛雅陶哨」这种彻底不相干的
#   G2 内容图近白底 —— 抓「拿到的是白底图表不是照片」,那种图放在暗底讲义上很难看
# 都拿真实数据验过:10 个已知案例判对 9 个,唯一漏的那个(Hominin statures 身高图)
# 正好被 G2 拦住(平均亮度 242)。**标题是馆藏编号的放过** ——
# `Galet MHNT PRE.2009.0.200.1.jpg` 是对的图,只是没有词可比,
# 而这个项目为「猜标签里的词」栽过一整轮。
_STOP = set("the a of and in on at for with photo image museum specimen object cast view "
            "detail close up jpg png file wikimedia commons during test".split())


def _words(s: str) -> set:
    return {w for w in re.findall(r"[a-z]{4,}", (s or "").lower()) if w not in _STOP}


def _off_topic(query: str, title: str) -> bool:
    """检索词和标题一个实词都不重叠 → 判为不相干。

    **豁免只给带馆藏编号(≥3 位数字)的标题。** 第一版豁免的是「实词少于 3 个」,
    结果 `Whistling vessel`(一只玛雅陶哨,用在讲用火遗址的页上)靠两个词溜过去了;
    而真正该豁免的是 `Galet MHNT PRE.2009.0.200.1.jpg` 这种 —— 它没有词可比,
    但那串编号本身就是机构标本记录的标志。换成按数字判之后 8 个已知案例判对 7 个,
    唯一漏的那张(白底身高对比图)由 `_too_pale` 拦住。
    """
    if _words(query) & _words(title):
        return False
    return not re.search(r"\d{3,}", title or "")


def _too_pale(path: Path) -> bool:
    """内容图近白底 —— 白底图表贴在暗底讲义上是剪贴画。"""
    try:
        from PIL import Image
        im = Image.open(path).convert("RGB").resize((48, 48))
        px = list(im.getdata()); n = len(px)
        L = sum(round(.2126 * r + .7152 * g + .0722 * b) for r, g, b in px) / n
        return L > 200
    except Exception:
        return False


def _search(query: str) -> list:
    """跑一次检索,返回 results 列表。输出是 dict 不是 list —— 按 list 迭代会拿到键名。"""
    try:
        r = subprocess.run([sys.executable, str(_WEBMEDIA), query, "--type", "image",
                            "--source", _SOURCES, "--count", "12", "--json"],
                           capture_output=True, text=True, timeout=180)
        return (json.loads(r.stdout or "{}") or {}).get("results") or []
    except Exception:
        return []


_UA = "notale-deck/1.0 (lecture-deck research; +https://github.com/JJchess/Notale)"
_WEBMEDIA = skills.DEFAULT / "web-media-getter" / "webmedia.py"
_GEN = skills.DEFAULT / "make-illustration" / "scripts" / "gen.py"

_IMG_ROW = re.compile(r"^\s*\|\s*([\w.-]+\.(?:jpg|jpeg|png|webp))\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|")


def img_plan(plan_text: str) -> list[dict]:
    """图池表 → 逐行的取图任务。

    只认「第一列是个文件名」的行,所以表头和分隔行自动被跳过,
    也不怕模型多写或少写一列的说明文字。

    2026-08-28 起入参是 `=== IMAGES ===` 那一段(见 `segment()`),
    不再需要先去 PLAN.md 里找 `## 0.7` —— 那一节和 PLAN.md 一起没了。
    """
    out = []
    for line in (plan_text or "").splitlines():
        r = _IMG_ROW.match(line)
        if not r:
            continue
        kind = r.group(2).strip()
        out.append(dict(name=r.group(1).strip(),
                        kind="插画" if "插画" in kind else "照片",
                        query=r.group(3).strip().strip("`"),
                        pages=r.group(4).strip(),
                        use=r.group(5).strip()))
    return out


P95_CEIL = 90        # 整页底图的局部亮度上限。见 _dim_backdrop 的注释。


def _lum_p95(path: Path) -> int:
    """图的 p95 亮度 —— **不是平均色**。

    这是量出来的:`illus-savanna-horizon.png` 平均色 `rgb(53,57,62)` 看着很暗,
    可它有一个亮太阳,那块峰值亮度 167。底图压到 `opacity:.19`(精确命中要求的 .16–.22)
    之后,那一页右下角的正文对比只有 **2.60:1**(WCAG 正文要求 4.5:1)。
    **控制不住结果的不是 opacity,是源图的亮度分布** —— 所以要量峰值,不是均值。
    """
    try:
        from PIL import Image
        im = Image.open(path).convert("RGB").resize((96, 96))
        L = sorted(round(.2126 * r + .7152 * g + .0722 * b) for r, g, b in im.getdata())
        return L[int(len(L) * .95)]
    except Exception:
        return -1


def _dim_backdrop(path: Path) -> tuple:
    """整页底图太亮就压暗后落盘,返回 (压暗前 p95, 压暗后 p95)。

    压暗放在图池这一步,而不是让 `theme.css` 再调 opacity ——
    opacity 已经给对了,再调它是把一个控制不住结果的旋钮拧得更紧。
    """
    before = _lum_p95(path)
    if before < 0 or before <= P95_CEIL:
        return before, before
    try:
        from PIL import Image
        im = Image.open(path).convert("RGB")
        k = P95_CEIL / before
        im.point(lambda v: int(v * k)).save(path)
        return before, _lum_p95(path)
    except Exception:
        return before, before


def _mean_rgb(path: Path) -> str:
    """图的平均色 —— 给写 theme.css 那一步判断底色能不能承托这些图。

    这是「看图」的**文字代理**,不是同一件事:同类任务里协调者在写 CSS 之前
    把 14 张图拼成一张联系表**看了一眼**(它的第 22 次调用),然后才定下暖近黑的底色。
    我们的 wire 层现在只有文本块 —— 端点其实支持图片(探过:它把测试图里的
    748291 读对了、两半颜色也说对了),要真的看图得先给 wire 加图像块,那是另一件事。
    """
    try:
        from PIL import Image
        im = Image.open(path)
        # **抠过的图要只算不透明那部分。** 直接 convert("RGB") 会把透明区按它底下的
        # 原像素算进来,而天体照的底是黑的太空 —— 一张亮木星的抠图会报成近黑,
        # 而这个数正是写 theme.css 那一步用来定底色的。
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA").resize((32, 32))
            px = [c[:3] for c in im.getdata() if c[3] > 128]
            if px:
                n = len(px)
                return "rgb(%d,%d,%d)" % tuple(sum(c[k] for c in px) // n for k in range(3))
        im = im.convert("RGB").resize((32, 32))
        px = list(im.getdata())
        n = len(px)
        return "rgb(%d,%d,%d)" % tuple(sum(c[k] for c in px) // n for k in range(3))
    except Exception:
        return "?"


def assets(run: Run, plan_text: str) -> str:
    """建图池:照 PLAN.md 第 0.7 节把图取好,产出 `img/IMG.md` 索引 + `CREDITS.md`。

    **为什么放在 plan 阶段。** 这是量出来的,而且量的是同一个建页模型:
    同类任务里协调者在第 5–21 次调用就把 20 张图取完了,写规格是第 31–35 次 ——
    所以它的规格能**直接点名已存在的文件**加一句现成的 `title=` 归属,
    建页只需引用,它 44 页出图 16 张。我们上一轮的规格 0/51 份含文件路径,
    写的是检索任务,建页要自己搜挑下内联编归属四步,48 页出图 4 张。
    消融证据是干净的:**拿它的规格配我们的建页模型,出图 16 张。**

    只取 8–14 张公共图池。某一页临时需要、池子里没有的,仍然由 builder 侧并行取 ——
    那边是 8–50 路并行,而这里是串行,不该把全部取图都搬过来。

    一行取不到**不阻断**。照 `expand()` 的先例:一页不过不许杀掉整轮。
    """
    plan = img_plan(plan_text)
    d = run.assets / "img"
    d.mkdir(parents=True, exist_ok=True)
    if not plan:
        # **「明说不要图」和「这一段写坏了」是两件事,不能报同一句话。**
        # 提示词允许写一行「本套无需图池」(纯计算/纯示意的题目本来就不需要照片),
        # 模型照做了,而这道闸只会找表格 —— 于是报出「规格将没有文件可点名,
        # 建页只能各自去搜」,而实际上根本不该点名任何文件。判据比语义窄。
        #
        # 2026-08-28:入参从 PLAN.md 全文换成 `=== IMAGES ===` 那一段,所以不再
        # 先去找 `## 0.7` 小节标题 —— 整段就是那一节。**告警措辞也跟着改**:
        # 原来那句点名「PLAN.md 第 0.7 节」,而那两样都不存在了,照着它去改的人
        # 会去找一个没有的东西。删接口要连广告它的话一起删,这里是同一条。
        if re.search(r"无需图池|不需要图池|不用图|无图池", plan_text or ""):
            print("  图池         声明本套无需图池 —— 跳过取图")
            return ""
        print("  图池         ⚠ `=== IMAGES ===` 段里没有可读的表格 —— "
              "这一轮没有文件可点名,建页只能各自去搜(实测到达率 20%)。"
              "确实不需要图就在那一段写明「本套无需图池」")
        return ""
    got, miss = [], []
    for it in plan:
        out = d / it["name"]
        if out.exists() and out.stat().st_size > 4096:
            got.append(dict(it, path=out, credit="（已存在）", p95=-1, dim=-1))
            continue
        try:
            if it["kind"] == "插画":
                # 组件素材要抠图,所以背景必须可分离 —— **这句由 harness 追加,
                # 不靠模型每次记得写。** 确定的事 harness 做。
                #
                # 措辞是三次实测换来的,前两次都被闸挡下:
                #   `flat chroma magenta 背景` → 白色主体被洋红反光染透,
                #     despill 碰到前景 57%(任何饱和底色都会往白主体上反)
                #   `flat black background, no floor` → 模型加了个受光地面,
                #     上两角 [0,0,0]、下两角 [112,111,116],四角差 208
                #   `floats alone in empty black space` + 逐项否掉 ground/floor/
                #     surface/shadow/horizon → 一次过,1331×419、边界 0%
                # **黑底还有一个好处:不反光,所以走和照片完全同一条路,不需要 despill。**
                q = it["query"]
                if "组件素材" in it["use"]:
                    q += (", the object floats alone in empty black space, "
                          "nothing else in frame, pure #000000 void all around it, "
                          "no ground, no floor, no surface, no shadow, no horizon, "
                          "no stars, no glow, centred, filling the frame, "
                          "no text, no labels, no watermark")
                subprocess.run([sys.executable, str(_GEN), q,
                                "--out", str(out), "--size", "1600x900"],
                               capture_output=True, text=True, timeout=300, check=True)
                credit = "生成插画（非真实照片）"
            else:
                res = _search(it["query"])
                if not res:
                    # **检索词太长会 0 结果,砍短再搜。** 实测:GPT 写的 8 个词
                    # `Laetoli hominin footprints trackway cast museum photograph Tanzania`
                    # 可下 0 个,而 3 个词的 `Laetoli footprints hominin` 有 10 个 ——
                    # 同类任务里协调者写的一直是 3–4 个词。
                    short = " ".join(it["query"].split()[:3])
                    if short != it["query"]:
                        res = _search(short)
                cand = sorted((h for h in res if h.get("dl")
                               and not _off_topic(it["query"], h.get("title") or "")),
                              key=lambda h: -(h.get("w") or 0))
                if not cand:
                    raise RuntimeError(
                        f"{len(res)} 个结果里没有一个既可下载又和检索词沾边")
                h = None
                for c in cand[:6]:
                    try:
                        # **必须带 UA。** Wikimedia 对 Python 的默认 UA 直接 403 ——
                        # 实测:默认 UA 403,带 UA 就通。同类任务里协调者为这件事
                        # 连写了 dl.py / dl2.py / dl3.py / dl4.py 四个下载脚本。
                        req = urllib.request.Request(c["dl"], headers={"User-Agent": _UA})
                        with urllib.request.urlopen(req, timeout=45) as resp:  # noqa: S310
                            out.write_bytes(resp.read())
                        from PIL import Image
                        if max(Image.open(out).size) < 800:
                            continue
                        if it["use"].find("底图") < 0 and _too_pale(out):
                            continue          # 近白底图表,换下一个
                        h = c
                        break
                    except Exception:
                        continue
                if h is None:
                    raise RuntimeError(f"{len(cand)} 个候选都下不下来或太小(长边 <800)")
                # 四项分开存。上一版把它们拼成一个字符串,于是无出处图库那串关键词标签
                # (`planet, saturn, space, galaxy…`)原样成了页面上的图注。
                meta = dict(title=(h.get("title") or "").strip(),
                            author=(h.get("author") or "").strip(),
                            license=(h.get("license") or "").strip(),
                            page=(h.get("page_url") or "").strip())
                credit = " · ".join(x for x in (meta["title"], meta["author"],
                                                meta["license"]) if x)
            if not out.exists() or out.stat().st_size < 4096:
                raise RuntimeError("落地的文件太小")
            p95 = dim = -1
            if "底图" in it["use"]:
                p95, dim = _dim_backdrop(out)
            # 「组件素材」= 要当物体用(可拖、可摆、可点选),所以要透明底。
            # **抠图放在这一步,不放建页侧**,理由和取图同一条:同一套规格配同一个建页模型,
            # 直接点名已存在的文件出图 16 张,让建页自己搜挑下内联出图 4 张。
            # 抠图比取图更容易出坏产物(绿边、抠掉一半、水印残留),更不该在 8–12 路
            # 并行里各赌一次。抠不干净就当「没取到」——fail-visible 对 fail-wrong。
            cut_note = ""
            if "组件素材" in it["use"]:
                # 插画也走 key=None:生成的组件素材背景是黑虚空,和天体照同一种输入。
                # `imgcut` 的 chroma/despill 那条路目前没人用,留着是给「深色主体
                # 抠不出来、只能换浅底」那种情况 —— 出现了再说。
                img, acc = imgcut.cut(out)
                if img is None:
                    raise RuntimeError("抠图不合格:" + acc.get("why", ""))
                png = out.with_suffix(".png")
                img.save(png)
                if png != out:
                    out.unlink()
                    out = png
                cut_note = (f"（已抠成透明底 {acc['size'][0]}×{acc['size'][1]}，"
                            f"不透明 {acc['opaque_frac']:.0%}）")
            got.append(dict(it, name=out.name, path=out, credit=credit,
                            p95=p95, dim=dim, cut_note=cut_note,
                            meta=(meta if it["kind"] != "插画" else {})))
        except Exception as e:
            miss.append(dict(it, why=f"{type(e).__name__}: {str(e)[:70]}"))
    lines = ["# 图池 —— 这一轮已经取好的图", "",
             "**逐页规格直接点名这里的文件,并照抄它给好的 `title=`。**", "",
             "| 文件 | 尺寸 | 平均色 | p95 亮度 | 用法 | 用在哪几页 | `title=` 照抄这个 |",
             "|---|---|---|---|---|---|---|"]
    for g in got:
        try:
            from PIL import Image
            w, h_ = Image.open(g["path"]).size
        except Exception:
            w = h_ = 0
        pl = "—" if g.get("p95", -1) < 0 else (
            f"{g['p95']}" if g["p95"] == g["dim"] else f"{g['p95']}→{g['dim']}（已压暗）")
        lines.append(f"| `assets/img/{g['name']}` | {w}×{h_} | {_mean_rgb(g['path'])} "
                     f"| {pl} | {g['use']}{g.get('cut_note', '')} | {g['pages']} | `{g['credit']}` |")
    if miss:
        lines += ["", "**没取到（规格不要点名这些，需要就自己写检索词交给建页）**", ""]
        lines += [f"- `{m['name']}` —— {m['why']}" for m in miss]
    txt = "\n".join(lines) + "\n"
    (d / "IMG.md").write_text(txt, encoding="utf-8")
    (d / "CREDITS.md").write_text(
        "# 出处与许可\n\n"
        + "\n".join(f"- `{g['name']}` —— {g['credit']}"
                    + (f"  <{g['meta']['page']}>" if g.get("meta", {}).get("page") else "")
                    for g in got) + "\n",
        encoding="utf-8")
    # 底图拼成联系表,交给写 theme.css 那一步**看**。只拼底图 ——
    # 内容图它不需要看(同类任务里协调者也只看了三张要当底图的插画)。
    backs = [g for g in got if "底图" in g["use"]]
    sheet = d / "backdrops.jpg"
    if backs:
        try:
            from PIL import Image
            ims = [Image.open(g["path"]).convert("RGB").resize((360, 203)) for g in backs]
            sh = Image.new("RGB", (360 * len(ims), 203))
            for i, im in enumerate(ims):
                sh.paste(im, (i * 360, 0))
            sh.save(sheet, quality=72)
            print(f"  图池         底图联系表 {len(ims)} 张 → {sheet.name}")
        except Exception as e:
            print(f"  图池         ⚠ 联系表拼不出来:{type(e).__name__}")
    print(f"  图池         {len(got)}/{len(plan)} 张就位"
          + (f"，{len(miss)} 张没取到" if miss else "")
          + f"  → {d.name}/IMG.md")
    return txt


def _img_lines(pool: str, nn: str) -> str:
    """这一页能用哪几张图 —— 从图池表的「用在哪几页」列**确定性**地取。

    **不靠散文去点名文件。** 实测代价:规格写检索任务而不是文件名时,48 页出图 4 张;
    点名已存在的文件时出图 16 张(`assets()` 上面那段账)。页面正文现在是自由散文,
    没有字段可写,所以这条由 harness 接 —— 它本来就是确定的事。
    """
    rows = []
    for task in img_plan(pool or ""):
        pages = {x.strip().zfill(2) for x in task["pages"].replace("，", ",").split(",")}
        if nn in pages:
            rows.append(f"- `assets/img/{task['name']}`（{task['use']}）")
    if not rows:
        return ""
    return ("\n\n## 本页可用的图\n\n" + "\n".join(rows)
            + "\n\n用法和 `title=` 见 `assets/img/IMG.md`。不要另找图,也不要重新生成。")


def briefs(run: Run, nns: list, pool: str = "") -> list[Brief]:
    """按模板填。每页 = 那一段散文 + 该页的图片清单。

    **全流程唯一一处没照抄 Claude Code 的地方**,理由是量出来的:nn-03 里主 agent
    逐字手写 14 份 brief,派发时刻拉开 6:24,而 brief 之间七成内容一样。
    要换回原样,把这里改成一次模型调用即可 —— 信息一致,只是慢。
    """
    out = []
    for nn in nns:
        pid = f"page-{nn}"
        out.append(Brief(f"Build {pid}", run.prompt(
            "brief", query=run.query, pid=pid, total=len(nns),
            assets=run.assets, spec=run.pages / "plan" / f"p{nn}.md")
            + _img_lines(pool, nn)))
    lens = sorted(len(b.prompt) for b in out)
    print(f"  briefs       {len(out)} 份,{lens[0]}–{lens[-1]} 字符,中位 {lens[len(lens)//2]}")
    return out


def plan_run(run: Run, chassis: Path, lib: Path,
             skill_root: Path = None, workflow_root: Path = None) -> dict:
    """**一次模型调用**,产出每页一段散文 + 一份 theme.css。

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
    # 页数预算从 `--minutes` 推。**这个数要留着** —— 把页数从 18 推到 41 的
    # 正是单页 150 秒那条,而不是页表的九列(见 STAY_CEILING 上面那段)。
    total = run.minutes * 60
    n_lo, n_hi = math.ceil(total / STAY_CEILING), int(total / 45)
    css, pages_doc = deck_call(run, run.prompt(
        "deck", query=run.query, minutes=run.minutes,
        audience=run.audience, scenario=run.scenario or "（没写）",
        canvas_w=w, canvas_h=h,
        stay_ceiling=STAY_CEILING, n_lo=n_lo, n_hi=n_hi,
        n_target=round(total / 90), css_path=run.root / CSS_REL,
        pages_path=run.root / PAGES_REL,
        direction=skills.direction_block(run.prompts, menus=run.direction_menus),
        theme_bans=skills.theme_slop_block(workflow_root),
        font_floor=skills.FONT_FLOOR))

    pages = split_pages(pages_doc)
    # 残块照旧丢掉、不判死整轮:散文可分割,交 18/21 页远好过交 0 页。
    short = sorted(k for k, v in pages.items() if len(v) < PAGE_MIN)
    for k in short:
        pages.pop(k)
    if short:
        print(f"  ⚠ 丢掉 {len(short)} 个残块(短于 {PAGE_MIN} 字符): "
              f"{' '.join('page-' + k for k in short)}")
    nns = sorted(pages)
    if not (n_lo <= len(nns) <= n_hi):
        print(f"  ⚠ {len(nns)} 页不在 {n_lo}–{n_hi} 的预算区间内(只报不拦)")

    (run.pages / "plan").mkdir(parents=True, exist_ok=True)
    for nn in nns:
        (run.pages / "plan" / f"p{nn}.md").write_text(pages[nn] + "\n", encoding="utf-8")
    lens = sorted(len(pages[nn]) for nn in nns)
    print(f"  逐页内容     {len(nns)} 页,{lens[0]}–{lens[-1]} 字符,中位 {lens[len(lens)//2]}")

    # 取图排在切分之后:图池表和 CSS 出自同一次调用,所以这一轮 CSS 看不到底图。
    # 那是「一次调用」换来的代价,已知并接受(旧形状里 backdrops.jpg 会作为图片
    # 喂给写 theme 的那一步)。图片本身仍然按表抓、按页发。
    pool = assets(run, pages_doc.split("# page-", 1)[0])

    ch = run.assets / "CHASSIS.md"
    if "已知陷阱" not in ch.read_text(encoding="utf-8"):
        ch.write_text(ch.read_text(encoding="utf-8").rstrip() + '''
`Deck.fmt(v, d)` **给非负数加 `+`** —— 它是给增量用的（`+3.2%`、`余量 +0.42 cm`）。
**绝对量不要用它**：年代、质量、温度、距离一律 `v.toFixed(d)`。
实测代价：一页把年代印成「约 +366 万年前」，19 处。
''', encoding="utf-8")
        print("  接口交接     已知陷阱（Deck.fmt 带符号）→ CHASSIS.md")

    skeletons(run, len(nns))
    (run.root / "briefs.json").write_text(
        json.dumps([b.as_tool_input() for b in briefs(run, nns, pool)],
                   ensure_ascii=False, indent=2), encoding="utf-8")
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
    a.add_argument("--wire", choices=("responses", "chat", "messages"),
                   help="覆盖 wire_api;Anthropic 系模型要用 messages")
    a.add_argument("--lib", default=str(VENDOR / "chassis" / "lib"))
    # --chassis / --lib 一直可以换,skill 根却写死在 skills.DEFAULT 里。
    # 代价实测:skill 目录不在时,`webmedia.py` 和 `gen.py` 一起消失,
    # 图池 0/12、45 份规格的「必用skill」全空,而**这些都只报警不判死**,
    # 一轮跑完才看得出来。三个外部依赖要么都能换,要么都不能换。
    a.add_argument("--skills", default=str(skills.DEFAULT))
    a.add_argument("--workflows", default=str(skills.WORKFLOWS))
    a.add_argument("--prompts", default=str(PROMPTS),
                   help="提示词模板目录,用来跑模板对照臂;默认 notale-v2/prompts")
    # **有期限的开关**,出了结论就要和 prompts/direction-menus.md 一起删掉。
    # 见 skills.direction_block 的 docstring。
    a.add_argument("--direction-menus", action="store_true",
                   help="把两张选项菜单表接回 direction 块(对照臂用);默认不接")
    n = a.parse_args()
    if not Path(n.prompts).is_dir():
        raise SystemExit(f"✗ --prompts 指的 {n.prompts} 不是目录")
    missing = [f"{x}.md" for x in ("brief", "deck")
               if not (Path(n.prompts) / f"{x}.md").is_file()]
    if missing:
        raise SystemExit(f"✗ --prompts 指的 {n.prompts} 缺 {', '.join(missing)} —— "
                         f"缺哪份要当场报错,不能等跑到那一步才 FileNotFoundError。")
    if not Path(n.skills).is_dir():
        raise SystemExit(f"✗ --skills 指的 {n.skills} 不是目录 —— "
                         f"缺了它取图脚本找不到,图池会全空,而那条只报警。")
    workflow_root = Path(n.workflows)
    if not workflow_root.is_dir():
        raise SystemExit(f"✗ --workflows 指的 {workflow_root} 不是目录")
    missing = [name for name in skills.PAGE_WORKFLOWS
               if not (workflow_root / name / "SKILL.md").is_file()]
    if missing:
        raise SystemExit(f"✗ --workflows 缺少建页工作流: {' '.join(missing)}")
    # `_WEBMEDIA` / `_GEN` 是模块级常量,**导入时就绑定了 `skills.DEFAULT`** ——
    # 只加一个 `--skills` 参数,取图那两行仍然指着旧路径,属于「改了参数不生效」。
    # 所以这里显式重绑,并且立刻验证两个脚本真的在。
    global _WEBMEDIA, _GEN
    skills.DEFAULT = Path(n.skills)      # `_skill_names()` 和别处还在读它
    _skill_names.cache_clear()           # 它带 lru_cache,不清就用旧路径的结果
    _WEBMEDIA = Path(n.skills) / "web-media-getter" / "webmedia.py"
    _GEN = Path(n.skills) / "make-illustration" / "scripts" / "gen.py"
    for _p, _why in ((_WEBMEDIA, "取照片"), (_GEN, "生成插画")):
        if not _p.exists():
            raise SystemExit(f"✗ {_why}的脚本不在:{_p}")
    llm.override(name=n.model, wire_api=n.wire)
    if n.effort: config()["planner"]["reasoning_effort"] = n.effort
    plan_run(Run(n.query, n.minutes, n.audience, n.label, n.scenario,
                 prompts=Path(n.prompts), direction_menus=n.direction_menus),
             Path(n.chassis), Path(n.lib), Path(n.skills), workflow_root)


if __name__ == "__main__":
    main()
