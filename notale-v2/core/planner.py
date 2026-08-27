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
from .artifacts import (Brief, _JS_BUILTIN, _fn_body, lec_api, lec_values,
                        parse_table)
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
#     lec.js       40,517 / 41,924 / 47,851
# 阈值取实测最小值的**约 1/6**。刻意定得这么松:这道闸只该抓
# "0 字符 / out=229 tok" 那种灾难性空响应,不该去评判 Sonnet 写得简不简洁 ——
# 换模型后产物合理地小一截是可能的,把正常产出判死的代价比漏判高得多。
MIN_CHARS = {"lec.js": 6000, "PLAN.md": 3500, "theme.css": 3500,
             "CONTRACT.md": 1800, "spec": 400}
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
# lec.js 从 40,000 提到 64,000:DeepSeek-V4-Flash 实测打满 39,999 被截断闸拦下 ——
# 它把几万 token 花在正文里推演,代码写到一半就断。100 tok/s × 900s ≈ 90,000 的
# 天花板,64,000 仍在其下。**这是最后一次单纯加额度** —— 再截断就说明
# 这个模型在这条链路上不适合当 planner,而不是额度不够。
MAX_OUT = {"lec.js": 64000, "PLAN.md": 64000, "theme.css": 28000,
           "CONTRACT.md": 60000, "spec": 60000}
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
SPEC_CONCURRENCY = 50
# 从 50 降到 20。端点整体支持 100 并发,但**这一步不是瓶颈在端点,而在单模型配额**:
# 77 路一起打上去,DeepSeek 那边大面积 RateLimitError,退避 5s→15s→40s 全是白等墙钟。
# 展开这一步每路都带 deck 全文(约 6KB),比 builder 的单页调用重得多,所以单独降一档。
# builder 那边保持 50 —— 它每页是一串小调用,压力形态不一样。

# 单页停留上限,秒。和 core/check_coverage.py 里那个是同一个数 —— 从那里取,
# 别抄第二份:抄两份必然漂移,而漂移出来的闸没人会怀疑。
from .check_coverage import STAY_CEILING  # noqa: E402


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


def _valid_js_syntax(text: str) -> str:
    """`node --check` 真跑一遍。语法不过的 lec.js 会让每一页静默失效 ——
    页面照样出 200,只是 `Lec` 这个全局根本不存在。"""
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                     encoding="utf-8") as f:
        f.write(text)
        tmp = f.name
    try:
        r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
        if r.returncode:
            first = (r.stderr.strip().splitlines() or ["?"])[-1][:160]
            return f"node --check 不过:{first}"
    except FileNotFoundError:
        pass                      # 没装 node 就不查,别把闸变成环境依赖
    finally:
        os.unlink(tmp)
    return ""


def _valid_js(text: str) -> str:
    """lec.js 的闸。

    **mount 那条已经删掉。** 2026-08-21 起 lec.js 只提供 `Lec.K` / `Lec.P`,
    不再生成页眉页脚 —— 标题写在哪、组件摆在哪全由建页的 agent 决定。
    所以「mount() 必须返回内容容器」和配套的 `_repair_lec` 都没有对象了。

    **但那次只删了一半,代价两个月后才量出来。** `artifacts.py: lec_api()` 末尾还留着
    一行 `out.append("Lec.mount({index, kicker, title, take})")`,而那份 API 清单
    被注入写规格那一步 —— 于是 48/48 份规格照抄了这个不存在的调用,48 个页面
    一个都没调用,结果**主标题到达 46/48 页,而每页那句「要让读者信什么」只到达 5/48**
    (删 chrome 之前那一轮是 48/48)。2026-08-23 删掉了那一行。
    教训:删一个接口,要连**广告它的那张清单**一起删。

    留下的两条和版面归谁定无关:是不是推理稿、语法过不过,
    以及**页码不许被拼成字符串印出来**。后者是量出来的,两种写法都出现过:
        `ui: { pageLabel: 'Page' }`  → 每页印着「Page 38」
        `page + '/' + total`         → 每页印着「50/50」
    `data-page` / `data-total` 只该用来算进度和键盘翻页。
    """
    bad = _looks_like_prose(text)
    if bad:
        return bad
    bad = _valid_js_syntax(text)
    if bad:
        return bad
    if re.search(r"""(?x)
            (page|index)\s*\+\s*['"]\s*/\s*['"]        # page + '/' + total
          | ['"]\s*/\s*['"]\s*\+\s*(total|count)         # '/' + total
          | pageLabel | takeLabel | kickerLabel            # 字段名当标签
        """, text):
        return ("lec.js 把页码或字段名拼成了要显示的字符串"
                "(page+'/'+total 或 pageLabel/takeLabel 之类)—— "
                "页码总数一概不显示,data-page/data-total 只用来算进度和翻页")
    return ""


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
    return ""


def _chassis_names(theme_api: str) -> tuple:
    """从 theme.css 的 INTERFACE 块里取出可点名的 class。

    只取 `.foo` 形式的类名,不取 token(`--fs-body`)—— 规格点名的是版面骨架和读数组件,
    token 是 CSS 内部的事。返回元组以便 partial 绑定后仍可哈希。
    """
    return tuple(sorted(set(re.findall(r"\.([a-z][a-z0-9-]{2,})", theme_api or ""))))




def _valid_spec(text: str, chassis: tuple = (),
                workflow_names: tuple = skills.PAGE_WORKFLOWS) -> str:
    """逐页规格的最低限度:不能是推理稿,而且必须带上必填小节。

    这一步原来没有闸,后果实测很实:DeepSeek-V4-Flash 43 份 pNN.md 全部是推理稿
    开头 —— `p01.md` 第一句是「我们需要输出p01规格。需要遵循模板。…短标题如"尺度两端"」,
    而 p04/p05/p06 分别 66,197 / 60,106 / 51,681 字节的斟酌。
    spec 的上限从 8,000 一路加到 40,000 每一档都打满,**加额度只是让它写得更长**。
    lec.js / theme.css 那两步早就有同款闸,漏了这一步。
    """
    bad = _looks_like_prose(text)
    if bad:
        return bad
    if len(text) < MIN_CHARS.get("spec", 400):
        # **提取之后必须再查长度。** MIN_CHARS 只在 ask() 里对原始回复生效,
        # 而从推理稿里切出来的候选可能是一个被丢弃的草稿标题:实测 p05/p06
        # 分别被切成 293 / 209 字符,小节齐全但内容是空的。
        return f"只有 {len(text)} 字符(要求 ≥{MIN_CHARS.get('spec', 400)}),像是切到了草稿"
    # 「场景构图」2026-08-23 拿掉了:它和「知识结构」各描述一遍画面、互不引用,
    # 建页只能把两套叠起来 —— 实测页面上互不相干的定位系统中位 4 个(协调者那条线 2 个),
    # 而叠压里 4/5 处是「做完了」的提示条砸在内容标签上。母题并进了知识结构。
    # 内容契约的通用必填是四节；`主工作流` 在下方单独校验。
    # 「动效」2026-08-23 从这里拿掉了 —— 提示词已经改成
    # 「静态页整节不要出现」,而这道闸还在要它,两边打架的代价是实的:
    # 重跑 50 份规格,十几份因为「缺必填小节 动效」被退回,每份白烧 3 次重试。
    # 更早的例子同理:7 节必填 → 50/50 份全填满 → 静态页也有动效、
    # 没有正确答案的交互页也有复位按钮、没东西可填的 `必用skill` 被填上库名。
    # **可算的约束会被贴边满足,所以只该把真的每页都要的东西放进来。**
    need = ["照这个写", "知识结构", "表征形式", "不许碰"]
    miss = [k for k in need if f"## {k}" not in text and f"## {k}：" not in text]
    if miss:
        return f"缺必填小节 {'/'.join(miss)}"
    m = re.search(r"^##\s*主工作流\s*$\n(.*?)(?=^##\s|\Z)", text, re.S | re.M)
    if not m:
        return "缺必填小节 主工作流"
    lines = [line.strip().lstrip("-* ") for line in m.group(1).splitlines()
             if line.strip()]
    if len(lines) != 1:
        return f"主工作流必须且只能有一行，实际 {len(lines)} 行"
    route = re.match(r"^([a-z0-9][a-z0-9.-]*)\s*(?:←|<-)\s*(.+)$", lines[0])
    if not route or not route.group(2).strip():
        return "主工作流格式必须是 `workflow-name ← 本页主要实现难点`"
    if route.group(1) not in set(workflow_names):
        return f"未知主工作流 {route.group(1)}"
    # 指针格这条闸 2026-08-24 **整条删掉了**(当场退回、事后硬判、报表行,三处都删)。
    # 判据分不开两种情况:
    # 测试里那个真缺陷(`| C | `Lec.K.values` 中对应条目 | m |`,和 12/18 同列)
    # 和 p09 里合法的 `| loss(w₁) | 对两样本的 `Lec.P.bce` 取平均 |`(loss 是函数不是常量,
    # 下一张表就给了 8 个采样值)—— 表格几何上一模一样,区别在语义,判据看不见。
    # 退回的代价还不止浪费 token:p16 被退回后指针格从 1 个变成 5 个,
    # **模型在按一个说不清的判据瞎改**,那比漏过更坏。
    # 事后统计留在 `plan_quality` 的 HARD 里(它只影响退出码,不改产物)。
    return ""




CHECKS = {"lec.js": _valid_js, "theme.css": _valid_css, "spec": _valid_spec}
REPAIRS = {}

_FENCE = re.compile(r"```[a-zA-Z]*\n(.*?)```", re.S)


def _extract_spec(text: str, check) -> str:
    """从可能夹着推理稿的回复里把**逐页规格**捞出来。

    和 `_extract_code` 同一套「候选 + 校验」做法,但候选不一样:规格是 markdown,
    它的可靠锚点是首行那个 `# page-NN · …`,而不是 ``` 围栏或 `(function`。

    这一步的必要性是量出来的:DeepSeek-V4-Flash 43 份 pNN.md **全部**是推理稿开头,
    而正文就跟在后面 —— 直接判死等于白丢 43 份可用的规格。

    候选顺序:
      1. 整段(最常见:模型只给了规格)
      2. 从最后一个 `# page-NN` 切到末尾(越靠后越可能是「最终答案」)
      3. 从第一个 `# page-NN` 切到末尾
      4. markdown 围栏里的内容
    """
    cands = [text.strip()]
    hits = list(re.finditer(r"(?m)^#\s+page-\d+", text))
    for m in reversed(hits):
        cands.append(text[m.start():].strip())
    for blk in re.findall(r"```(?:markdown|md)?\n(.*?)```", text, re.S):
        cands.append(blk.strip())
    for c in cands:
        if c and not check(c):
            return c
    return cands[1] if len(cands) > 1 else text.strip()


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


def seed(run: Run, chassis: Path, lib: Path) -> str:
    """探环境。nn-06 在这里花了 4 次模型调用去 Read 文件 —— 纯读取没有判断,
    harness 直接做掉。返回库清单,后面三步都要用。"""
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
    return (lib / "LIBS.md").read_text(encoding="utf-8")


_IFACE = re.compile(r"/\*\s*=+\s*INTERFACE\s*=+(.*?)=+\s*/?INTERFACE\s*=+\s*\*/",
                    re.S | re.I)


def _interface(css: str):
    """theme.css 自报的 INTERFACE 块。两处要用同一份:追加进 CHASSIS.md(给建页),
    以及注入写规格那一步(给规划)。后者是 2026-08-23 加的 —— 在那之前
    `theme.css` 排在 `expand()` **之后**,规格点名版面类在因果上不可能,
    实测五种骨架类全都生成了、页面 46/48 在用,而 48 份规格一份都没点过名。"""
    return _IFACE.search(css)


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
           '<script src="assets/base.js"></script>\n'
           '<script src="assets/lec.js"></script>\n</body>\n</html>\n')
    for i in range(1, n + 1):
        p = run.pages / f"page-{i:02d}.html"
        if not p.exists():
            p.write_text(tpl.format(i=i, n=n), encoding="utf-8")
    print(f"  skeletons    {n} 个骨架,已接 base/theme/lec,data-total={n:02d}")


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


def _skill_list_row(run: Run, r) -> str:
    """从并行展开出来的 `plan/pNN.md` 里读这一页指派的技法文档。

    指派为什么放到展开那一步:页表那一层还不知道这个交互具体要怎么做,
    而 skill 该按「这个交互缺哪一块知识」来指派 —— 那是展开时才有的信息。
    页表只管全局(停留加总、交互不撞车),不管这种逐页判断。
    """
    f = run.pages / "plan" / f"p{r.nn}.md"
    if not f.is_file():
        return ""
    m = re.search(r"^##\s*必用skill\s*\n(.*?)(?=^##\s|\Z)",
                  f.read_text(encoding="utf-8"), re.S | re.M)
    if not m:
        return ""
    # **逐行取 `←` 左边。** 规格现在的格式是
    #     mini-game  ← 「传话链」那一局的回合结构、判定与复位
    # 整节按空白切分会把落点那句话切成一串「假名字」,日志被假警刷满。
    raw, unbound = [], []
    for line in m.group(1).splitlines():
        if not line.strip():
            continue
        head, sep, tail = re.split(r"(←|<-|→|:|：)", line, 1) + ["", ""] if False else (
            (lambda parts: (parts[0], parts[1] if len(parts) > 1 else "",
                            parts[2] if len(parts) > 2 else ""))(
                re.split(r"(←|<-)", line, 1)))
        names = [x.strip(" `、,，。-*") for x in re.split(r"[,，、\s]+", head.strip())]
        names = [x for x in names if x and x not in ("无", "None", "-", "——", "、")]
        raw += names
        if not tail.strip():
            # **落点这条只管真 skill。** 不然整句散文(「无交互 纯静态收束页」)
            # 会既被报成「没写落点」又被报成「两处都没有」,同一件事说两遍。
            unbound += [x for x in names if x in _skill_names()]
    # 只报不判:一项没有落点 = 这份规格没想清楚它要那份文档干什么。
    if unbound:
        print(f"  规格 p{r.nn}      必用skill 有 {len(unbound)} 项没写落点"
              f"({' '.join(unbound)}) —— 格式是 `名字 ← 这一页的哪一块用它`")
    real, libs, junk = [], [], []
    for x in raw:
        if x in _skill_names():
            real.append(x)
        elif x.split(".")[0] in _lib_stems():
            libs.append(x)
        else:
            junk.append(x)
    # 「散文」和「假名字」要分开报。**这是量出来的**:改完拿 1,196 份规格重跑,
    # 38 份「剔完变成空指派」里绝大多数是 DeepSeek 那两轮把整句话写进了这一栏
    # (「无交互 纯静态收束页」、「纯静态排版页 没有动画 图表 插画...」)——
    # 那是模型**正确地**说了「这页不需要」,只是没写「无」。按空白切分会把一句话
    # 切成五个「名字」,报成「两处都没有 5 个」就把「说对了」误报成「写错了」。
    prose = bool(junk) and not real and not libs and (
        len(" ".join(junk)) > 24 or any(len(x) > 12 for x in junk))
    if prose:
        print(f"  规格 p{r.nn}      必用skill 写成了整句散文,视作无指派:"
              f"「{' '.join(junk)[:44]}」")
    elif libs or junk:
        bits = []
        if libs:
            bits.append(f"{len(libs)} 个是库名({' '.join(libs)})，应写进 `## 表征形式`")
        if junk:
            bits.append(f"{len(junk)} 个两处都没有({' '.join(junk)[:40]})")
        print(f"  规格 p{r.nn}      必用skill 里 " + "、".join(bits)
              + (" —— 已剔除" if real else " —— 已剔除,这一页变成空指派"))
    return "\n".join(f"  - {n}" for n in real)


def _workflow_row(run: Run, r, workflow_root: Path) -> str:
    """Read the one validated route from a new pNN spec."""
    f = run.pages / "plan" / f"p{r.nn}.md"
    if not f.is_file():
        raise FileNotFoundError(f)
    text = f.read_text(encoding="utf-8")
    m = re.search(r"^##\s*主工作流\s*$\n(.*?)(?=^##\s|\Z)", text, re.S | re.M)
    if not m:
        return ""
    lines = [line.strip().lstrip("-* ") for line in m.group(1).splitlines()
             if line.strip()]
    if len(lines) != 1:
        raise ValueError(f"p{r.nn} 的主工作流必须且只能有一行")
    hit = re.match(r"^([a-z0-9][a-z0-9.-]*)\s*(?:←|<-)\s*(.+)$", lines[0])
    if not hit or not hit.group(2).strip():
        raise ValueError(f"p{r.nn} 的主工作流格式错误")
    name = hit.group(1)
    allowed = set(skills.available(workflow_root)) & set(skills.PAGE_WORKFLOWS)
    if name not in allowed:
        raise ValueError(f"p{r.nn} 指派了未知主工作流 {name!r}")
    return f"  - {name}"


def _assignment_block(run: Run, r, workflow_root: Path) -> str:
    """New runs route one workflow; cached old runs keep their legacy skills."""
    routed = _workflow_row(run, r, workflow_root)
    if routed:
        return "## 主工作流\n" + routed
    legacy = _skill_list_row(run, r)
    return "## 必用skill\n" + (legacy or "  (无)")


def split_deck(run: Run, text: str) -> str:
    """把 PLAN.md 原样落成 `plan/deck.md` —— 整套共享的部分(主线/页表/归属/口径)。

    现在 PLAN.md 里已经没有逐页正文了(第 1 节只是一张表),所以这一步只是复制。
    逐页规格由 expand() 并行写成 plan/pNN.md。
    """
    d = run.pages / "plan"
    d.mkdir(parents=True, exist_ok=True)
    (d / "deck.md").write_text(text.rstrip() + "\n", encoding="utf-8")
    return text


def spine(plan_text: str) -> str:
    """从 PLAN.md 里取出「主线」那一节（含章表和证据链）。

    这一节要到 `CONTRACT.md`。**它原来到不了** —— 契约那一步只收到
    `n_pages / canvas_w / canvas_h / libs / lec_api / audience / scenario`,
    于是全课主张根本传不进契约。而同类任务里协调者把它放在共享契约的**第 1 节**,
    标题就叫「这堂课在讲什么（你那一页必须服务于这个主张）」。
    我们这一节一直只在 `deck.md` 里,而 2026-08-24 我把 brief 里的 deck.md 降成
    「需要时才读」之后,实测 6/6 页一次都没读 —— 主张对建页 agent 直接消失了。
    """
    m = re.search(r"^#{2,3}\s*[\d.]*\s*(?:这套讲义的)?主线\s*$(.*?)(?=^#{2,3}\s|\Z)",
                  plan_text, re.S | re.M)
    return m.group(0).strip() if m else ""


def visual_world(plan_text: str) -> str:
    """从 PLAN.md 里取出「视觉世界」那一节。

    这一节要到两处:每一份逐页规格(`expand()` 已经把 deck 全文传过去,免费到达),
    以及 `theme.css` 那一步 —— **后者原来收不到 deck**,它在独立发明主题。
    结果是逐页规格只能写「用全页唯一强调色」,因为规格写在 theme.css 之前、
    主题还不存在,它无从专属。
    """
    m = re.search(r"^#{2,3}\s*[\d.]*\s*视觉世界\s*$(.*?)(?=^#{2,3}\s|\Z)",
                  plan_text, re.S | re.M)
    return m.group(0).strip() if m else ""


def check_visual_world(block: str) -> None:
    """只报不判。判据是可算的:有几个 hex、有几条母题。

    「给具体取值不要形容词」是散文,而散文的服从度因模型而异 ——
    所以这里把它变成两个能数出来的数。缺了不判死:这一节是给下游做参照的,
    没有它下游会退回「用强调色」那种写法,但不会建不出页来。
    """
    if not block:
        print("  \033[33m⚠ PLAN.md 里没有「视觉世界」一节 —— "
              "逐页规格将无从引用母题,场景构图会退回通用分栏\033[0m")
        return
    hexes = set(re.findall(r"#[0-9a-fA-F]{6}\b", block))
    # **母题不一定分行写。** 我第一版按行数数,而实测模型是一行用「；」隔开五条 ——
    # 于是数出 0 条、报了个假警。分隔符按分号/顿号/换行一起算,别假定排版。
    # 取「母题」之后到下一个字段名或小节为止。两种排版都要认:
    #   一行分号隔开(实测 gpt-5.6-sol 就是这样) / 每条一行(我第一版只认这种)
    # 别假定排版 —— 假定一次就报一次假警。
    m = re.search(r"母题[^\S\n]*[:：]?(.*)", block, re.S)
    body = (m.group(1) if m else "").strip()
    # 阈值 2 而不是 3:「星空」「火光」这种两字母题完全正常,
    # 卡 3 会把它们滤掉 —— 判据本身错了,不是产物错了。
    n_motif = len([x for x in re.split(r"[;；、\n]+", body) if len(x.strip()) >= 2])
    # 「现实参照」和「形状语言」是 2026-08-24 加的两项,加它们是因为量到:
    # 只要求一组颜色,辨识度就只能靠强调色,而那条路的终点是「近黑底 + 一个
    # 高饱和荧光色」——满街可见的那个样子。**只报不判**,和上面两项一个规格:
    # 这一节是给下游做参照的,缺了下游会退化,但不影响能不能建出页来。
    has_ref = bool(re.search(r"现实参照|视觉传统", block))
    m2 = re.search(r"形状语言[^\S\n]*[:：]?(.*?)(?=\n\s*\n|\Z)", block, re.S)
    n_shape = len([x for x in re.split(r"[;；、\n]+", (m2.group(1) if m2 else ""))
                   if len(x.strip()) >= 2])
    ok = len(hexes) >= 3 and n_motif >= 3 and has_ref and n_shape >= 3
    print(f"  验视觉世界   {len(hexes)} 个 hex、{n_motif} 条母题、"
          f"{'有' if has_ref else '无'}现实参照、{n_shape} 条形状语言"
          + ("  ✓" if ok else "  \033[33m⚠ 要求 ≥3 个 hex、≥3 条母题、"
                             "点名一个现实参照、≥3 条形状语言\033[0m"))


def check_table(run: Run, rows: list, plan_text: str = "") -> None:
    """页表的全局校验。**只报不判 —— 唯一判死的是「一行都读不出来」。**

    降级的理由是成本不对称:页表是一个几 KB 的文本文件,错了改完重跑 PLAN.md
    那一步就行(实测 78.6s,而且后面几步都命中缓存)。而判死的代价是整轮 planner 挂掉。
    真正该判死的是那些**没有便宜手工修法**的东西 —— lec.js 是推理稿、PLAN.md 被截断、
    theme.css 不覆盖 mount 类名 —— 那时 44 个 builder 会照着错的底子并行建页。
    判据就是这一条:下游能不能便宜地撤销。

    每一条不合格都**连原始行一起打出来**。这是必须的:这道闸头两次触发,
    两次都是解析器自己看错了 ——
      · 第 0 节的分章表被当成页表(`| 00 开场 | 01–03 | … |` 第一列以数字开头),
        报出「14 行字段不全」,看着像模型没填;
      · 交互名判重用了整串,`无〔focus〕` 和 `无〔technical-wireframe〕` 被算成撞车。
    原始行一旦印出来,这两种一眼就能和模型的错分开。
    """
    if not rows:
        raise RuntimeError("页表一行都读不出来 —— 六列表头没找到,或者格式对不上。"
                           f"看 {run.root / 'PLAN.md'} 第 1 节")
    want = run.minutes * 60
    tot = sum(r.stay or 0 for r in rows)
    noi = [r.pid for r in rows if not r.interaction_key]
    print(f"  验页表       {len(rows)} 行  停留合计 {tot:g}/{want} 秒"
          + ("  ✓" if tot == want else f"  \033[33m⚠ 差 {tot-want:+g}\033[0m")
          + f"   无交互 {len(noi)} 页")

    def show(title, items):
        print(f"  \033[33m⚠ {title}\033[0m")
        for pid, why, raw in items[:6]:
            print(f"      {pid} {why}\n        {raw}")
        if len(items) > 6:
            print(f"      …另有 {len(items)-6} 行")

    bad = [(r.pid, f"缺 {'/'.join(r.missing())}", r.raw) for r in rows if r.missing()]
    if bad:
        show(f"{len(bad)} 行字段不全", bad)

    # enumeration 2026-08-23 删掉:同类任务里协调者 44 页用了 0 次并写明理由,
    # 我们上一轮 48 页用了 9 次,其中部分-整体的分解被标成并列,规格只好为错的结构辩护。
    legal = {"process", "comparison", "classification", "generalization"}
    ill = [(r.pid, f"知识结构 {r.structure!r} 不在四种之内"
            + ("（enumeration 已删 —— 看着像并列的按 classification 做）"
               if r.structure.lower() == "enumeration" else ""), r.raw)
           for r in rows if r.structure.lower() not in legal]
    if ill:
        show(f"{len(ill)} 行知识结构非法", ill)

    legal_layouts = {"split-lr", "split-tb", "canvas-full", "triptych",
                     "focus", "ledger", "stage-cards"}
    bad_layouts = [(r.pid, f"版式 {r.layout!r} 不在允许集合内", r.raw)
                   for r in rows if r.layout not in legal_layouts]
    if bad_layouts:
        show(f"{len(bad_layouts)} 行版式缺失或非法", bad_layouts)
    used_layouts = {r.layout for r in rows if r.layout in legal_layouts}
    if len(used_layouts) < 4:
        print(f"  \033[33m⚠ 版式只有 {len(used_layouts)} 种: "
              f"{' '.join(sorted(used_layouts)) or '（无）'}；要求至少 4 种\033[0m")
    adj_layout = [rows[i].pid for i in range(1, len(rows))
                  if rows[i].layout and rows[i].layout == rows[i - 1].layout]
    if adj_layout:
        print(f"  \033[33m⚠ 相邻同版式 {len(adj_layout)} 处: "
              f"{' '.join(adj_layout)}\033[0m")
    n_split = sum(r.layout == "split-lr" for r in rows)
    if n_split * 3 > len(rows):
        print(f"  \033[33m⚠ split-lr 使用 {n_split}/{len(rows)} 页，超过三分之一\033[0m")

    over = [(r.pid, f"停留 {r.stay:g} 秒 > 上限 {STAY_CEILING:g}", r.raw)
            for r in rows if r.stay and r.stay > STAY_CEILING]
    if over:
        show(f"{len(over)} 页超过单页上限(装了不止一件事)", over)

    seen = collections.defaultdict(list)
    for r in rows:
        if r.interaction_key:
            seen[r.interaction_key].append(r)
    dup = [(rs[0].pid, f"交互 {k!r} 在 {' '.join(x.pid for x in rs)} 重复", rs[0].raw)
           for k, rs in seen.items() if len(rs) > 1]
    if dup:
        show(f"{len(dup)} 个交互名重复(同一件事会被讲两遍)", dup)

    pids = [r.pid for r in rows]
    if pids != [f"page-{i:02d}" for i in range(1, len(rows) + 1)]:
        print(f"  \033[33m⚠ 页号不连续或跳号: {' '.join(pids)}\033[0m")
    adj = [rows[i].pid for i in range(1, len(rows))
           if rows[i].structure == rows[i - 1].structure]
    if adj:
        print(f"  \033[33m⚠ 相邻同结构 {len(adj)} 处: {' '.join(adj)}\033[0m")
    if len({r.stay for r in rows if r.pid in noi}) == 1 and len(noi) > 1:
        print("  \033[33m⚠ 无交互页停留全是同一个数 —— 标题页和章节转场承担的事不一样\033[0m")
    # ── 证据链与幕的对账 ────────────────────────────────────────
    # 从 Opus 那条线量来的两样。**判死的只有「引用了没声明的节点」** ——
    # 那是唯一有正确答案、且下游撤销不了的一种错:展开那一步会拿着一个不存在的编号
    # 去写规格,而 20 路并行各自都看不见这个矛盾。
    # 「有节点没页覆盖」「幕不连续」只报 —— 缺页要人决定是补页还是改规划,
    # 这是先前有意定下的口径,不改。
    # **不要假定排版。** 第一版写的是 `^\s*(E\d+)\b` —— 要求编号顶在行首,
    # 而实测模型写的是 `- **E1**：…`(列表符 + 加粗 + 全角冒号),于是声明数出 0 个,
    # 45 页全部被判成「引用了不存在的节点」,**整轮在 PLAN.md 就挂了**。
    # 模型写的是对的,判据错 —— 和上面 `_nodes` 那条 `E1–E4` 是同一类。
    # 现在放过行首的列表符 / 引用号 / 表格竖线 / 反引号 / 加粗。
    # 仍然锚在行首:句子中间提到的 E1 不算声明,那是引用。
    declared = set(re.findall(r"^[ \t]*(?:[-*+>]|\|)?[ \t]*[`*_]{0,2}(E\d+)\b",
                              plan_text, re.M))

    def _nodes(cell: str) -> set:
        """一个单元格里引用的全部节点。

        **不能把整格当成一个节点。** 这是踩出来的:一页综合迁移页写了 `E1–E4`
        (它要学生用全部四条证据解释所得系统),而整格比对把 'E1–E4' 当成一个
        没声明的节点,**整轮在 PLAN.md 就判死了** —— 模型写的是对的,判据错。
        区间也展开,否则「有节点没页覆盖」那一行会误报。
        """
        got = set(re.findall(r"E\d+", cell or ""))
        for a, b in re.findall(r"E(\d+)\s*[–—~-]\s*E?(\d+)", cell or ""):
            got |= {f"E{i}" for i in range(int(a), int(b) + 1)}
        return got

    used = set()
    for r in rows:
        if r.evidence not in ("", "—", "-", "无"):
            used |= _nodes(r.evidence)
    if declared or used:
        ghost = [(r.pid, f"证据 {r.evidence!r} 没在证据链里声明"
                         f"(声明过的:{' '.join(sorted(declared)) or '一个都没有'})", r.raw)
                 for r in rows if _nodes(r.evidence) - declared]
        if ghost:
            # **降级成只报。** 原来这一条判死,理由写的是「展开是并行的,各自看不见矛盾」。
            # 实测两次触发,**两次都是判据自己看错了**:一次把 `E1–E4` 整格当成一个节点,
            # 一次是声明写成 `- **E1**：…` 而正则要求编号顶行首 —— 45 页全被判成引用
            # 不存在的节点,整轮在 PLAN.md 就停了。
            # 而真出现幽灵节点的代价其实很小:规格里多一个对不上的编号,页面照样建得出来,
            # 事后改 PLAN.md 一行就行。**判死的成本远大于漏过的成本,那就不该判死。**
            show(f"{len(ghost)} 行引用了没声明的证据节点", ghost)
            print(f"  \033[33m⚠ 页表用到 {sorted(used - declared)},证据链里没声明 —— "
                  f"只报不判。要么补声明,要么改页表的「证据」列\033[0m")
        naked = sorted(declared - used)
        if naked:
            print(f"  \033[33m⚠ 有证据节点没有任何页覆盖: {' '.join(naked)}"
                  f" —— 要么补页,要么这条节点本来就不该在链上\033[0m")
        n_ev = sum(1 for r in rows if r.evidence in used)
        print(f"  验证据链     声明 {len(declared)} 条,页表用到 {len(used)} 条,"
              f"承担论证的页 {n_ev}/{len(rows)}")
    acts = [r.act for r in rows if r.act]
    if acts:
        runs_ = [k for i, k in enumerate(acts) if i == 0 or k != acts[i - 1]]
        if len(runs_) != len(set(runs_)):
            print(f"  \033[33m⚠ 幕不连续(同一幕的页被别的幕隔开): "
                  f"{' '.join(runs_)}\033[0m")
        else:
            print(f"  验幕结构     {len(set(acts))} 幕,页序连续 ✓")

    n_bad = (len(bad) + len(ill) + len(bad_layouts) + len(over) + len(dup)
             + (0 if tot == want else 1))
    if n_bad:
        print(f"  \033[33m  以上 {n_bad} 项都没有判死 —— 页表是个小文本文件,"
              f"改完重跑 PLAN.md 这一步即可(后面几步命中缓存)。\033[0m")


def expand(run: Run, rows: list, deck: str, api: str = "", vals: str = "",
           theme_api: str = "", img_pool: str = "", workflow_root=None) -> None:
    """N 路并行把页表每一行展开成 `plan/pNN.md`。

    两段式的理由:全局约束(停留加总、交互不撞车、相邻不同结构、归属不重叠)只有
    看到整张表才能判,所以 A 段必须是**一次**调用;而逐页展开彼此独立,是这条流水线
    上最大的一块串行时间 —— nn-11 (Opus 5 × Claude Code) 那轮 43.7 分钟的规划阶段里,
    逐份写 44 个 pNN.md 就占了约 25 分钟。所以 A 段串行、B 段并行。

    每一路的输入是 **deck 全文 + 自己那一行**,不是整张表的展开 ——
    它要知道邻居是谁(deck 里含页表),但不需要邻居的正文。
    """
    d = run.pages / "plan"
    m = config()["model"]
    eff = config()["planner"]["reasoning_effort"]

    def one(r):
        f = d / f"p{r.nn}.md"
        if f.exists() and f.stat().st_size > 200:
            return f, 0, True
        prompt = run.prompt("spec", num=int(r.nn), nn=r.nn, query=run.query,
                            minutes=run.minutes, audience=run.audience,
                            scenario=run.scenario, deck=deck, row=r.raw,
                            workflows=skills.workflow_catalog(
                                workflow_root or skills.WORKFLOWS),
                            lec_api=api, lec_values=vals,
                            theme_api=theme_api, img_pool=img_pool,
                            stay=f"{r.stay:g}", structure=r.structure,
                            layout=(r.layout or "未指定（旧页表；在 `## 存疑` 中报告）"))
        req = Request(model=m["name"], system=[TextBlock(text=IDENTITY)],
                      messages=[Message(role="user", content=[TextBlock(text=prompt)])],
                      max_tokens=MAX_OUT.get("spec", 8000),
                      output_config={"effort": eff})
        # 闸按这一行绑定:交互页才查反馈闭环那四件。
        # `CHECKS` 只按步名取函数、拿不到行信息,而「这一页有没有交互」只有行里有 ——
        # 所以在这里绑,而不是把 interactive 塞进全局。
        chk = partial(CHECKS["spec"], chassis=_chassis_names(theme_api),
                      workflow_names=tuple(
                          n for n in skills.PAGE_WORKFLOWS
                          if n in set(skills.available(workflow_root or skills.WORKFLOWS))))
        out_tok = 0
        for attempt in range(1, 4):
            rep = ask(req, min_chars=MIN_CHARS.get("spec", 400))
            out_tok += rep.output_tokens
            txt = _extract_spec(rep.text, chk)
            bad = chk(txt)
            if not bad:
                break
            print(f"  展开 p{r.nn}     ✗ 第 {attempt} 次不是有效规格:{bad}", flush=True)
        else:
            # **一页不过不许杀掉整轮。** 实测代价:p03 三次不过,planner 直接死,
            # 43 份已经写好的规格一起没了 —— 而判据本来就是「下游能不能便宜地撤销」:
            # 一份缺了一行的规格,那一页照它建出来最多是那一页差点;
            # 而整轮挂掉是 44 页全无。builder 那边早有 guard() 兜单页崩溃,
            # 这里漏了同一条。
            print(f"  展开 p{r.nn}     ⚠ 3 次都不合格,**保留最后一次**继续往下走"
                  f"(最后一次:{bad})", flush=True)
            f.write_text(txt.rstrip() + "\n", encoding="utf-8")
            return f, out_tok, False
        rep = rep._replace(output_tokens=out_tok) if hasattr(rep, "_replace") else rep
        f.write_text(txt.rstrip() + "\n", encoding="utf-8")
        run.log.add([b.model_dump() for msg in req.messages for b in msg.content], rep.text,
                    {"input_tokens": rep.input_tokens, "output_tokens": rep.output_tokens},
                    getattr(rep.raw, "id", None) or f"req_{uuid.uuid4().hex[:16]}",
                    _now(), _now(), {"step": f"spec-{r.nn}"})
        return f, rep.output_tokens, False

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=SPEC_CONCURRENCY) as ex:
        got = list(ex.map(one, rows))
    n_new = sum(1 for _, _, cached_ in got if not cached_)
    sizes = sorted(f.stat().st_size for f, _, _ in got)
    print(f"  展开规格     {len(rows)} 份({n_new} 新建/{len(rows)-n_new} 复用)"
          f"  {time.time()-t0:.0f}s  out={sum(o for _, o, _ in got):,} tok"
          f"  {sizes[0]:,}–{sizes[-1]:,}B")


# 图池的两个外部工具。**不复制它们的实现** —— 它们是 skill,builder 侧也在用同一份,
# 复制一份出来就会分叉(这个项目为 selfcheck 分叉吃过一次亏:两份实现,三轮仪器改进
# 一条都没进到真实 harness)。
# **只从有出处的机构源取。** 这一条是踩出来的,而且关键不是「无出处图库图质差」——
# 是**限源把「错图」变成「没图」**:机构源 403 的时候(实测 wikimedia/openverse 都 403 过),
# 限了源就返回空、那一行进「没取到」栏、规格不点名它;不限源就只剩无出处图库有结果,
# 于是「取第一个候选」悄悄变成了一张土星照片贴在讲阿舍利手斧的页上。
# 上一轮 10 张照片里 8 张来自无出处图库,3 张语义完全不符。fail-visible 对 fail-wrong。
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
    """PLAN.md 第 0.7 节那张表 → 逐行的取图任务。

    只认「第一列是个文件名」的行,所以表头和分隔行自动被跳过,
    也不怕模型多写或少写一列的说明文字。
    """
    m = re.search(r"##\s*0\.7[^\n]*\n(.*?)(?=\n##\s|\Z)", plan_text, re.S)
    if not m:
        return []
    out = []
    for line in m.group(1).splitlines():
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
        # **「明说不要图」和「这一节写坏了」是两件事,不能报同一句话。**
        # `plan.md` 允许写「本套无需图池」(纯计算/纯示意的题目本来就不需要照片),
        # 模型照做了,而这道闸只会找表格 —— 于是报出「规格将没有文件可点名,
        # 建页只能各自去搜」,而实际上规格根本不该点名任何文件。判据比语义窄。
        sec = re.search(r"^#{2,3}\s*0\.7[^\n]*$(.*?)(?=^#{1,3}\s|\Z)",
                        plan_text, re.S | re.M)
        if sec and re.search(r"无需图池|不需要图池|不用图|无图池", sec.group(1)):
            print("  图池         PLAN.md 声明本套无需图池 —— 跳过取图")
            return ""
        print("  图池         ⚠ PLAN.md 第 0.7 节没有可读的图表 —— "
              "这一轮的规格将没有文件可点名,建页只能各自去搜(实测到达率 20%)。"
              "确实不需要图就在 0.7 节写明「本套无需图池」")
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


def briefs(run: Run, rows: list, workflow_root: Path = skills.WORKFLOWS) -> list[Brief]:
    """按模板填。

    **全流程唯一一处没照抄 Claude Code 的地方**,理由是量出来的:nn-03 里主 agent
    逐字手写 14 份 brief,派发时刻拉开 6:24,而 brief 之间七成内容一样。
    要换回原样,把这里改成一次模型调用即可 —— 信息一致,只是慢。
    """
    out = [Brief(f"Build {r.pid}", run.prompt(
        "brief", query=run.query, pid=r.pid, total=len(rows),
        contract=run.root / "CONTRACT.md", assets=run.assets,
        spec=run.pages / "plan" / f"p{r.nn}.md",
        stay=f"{r.stay:g} 秒",
        assignment=_assignment_block(run, r, workflow_root))) for r in rows]
    lens = sorted(len(b.prompt) for b in out)
    print(f"  briefs       {len(out)} 份,{lens[0]}–{lens[-1]} 字符,中位 {lens[len(lens)//2]}")
    return out


def plan_run(run: Run, chassis: Path, lib: Path,
             skill_root: Path = None, workflow_root: Path = None) -> dict:
    skill_root = skill_root or skills.DEFAULT
    workflow_root = workflow_root or skills.WORKFLOWS
    print(f"\n▸ planner · {run.label}\n  {run.query}  /  {run.minutes} 分钟\n")
    t0 = time.time()
    libs = seed(run, chassis, lib)
    w, h = run.canvas

    lec = cached(run, "lec.js", run.assets / "lec.js", run.prompt("lec", query=run.query))
    api = lec_api(lec)
    # mount() 注入的 DOM 契约。theme.css 必须按这些类名写选择器,否则页眉页脚裸着,
    # 而各页会去 grep 一个不存在的东西(实测 ape-smoke 的 page-05:92 次调用、
    # 64 分钟、0 产出)。三个独立调用之间的接线,只能由 harness 搬。

    # PLAN 必须在 theme 之前。上一轮是反的,结果写 theme 的模型不知道这 20 页要讲什么,
    # 只能造一个万能两栏 —— 实测 `.split` 在 20/20 页出现。现在 theme 拿得到版式清单。
    # **规划阶段不再注入设计哲学。** 这是单变量消融量出来的:
    # 同一份 lec.js、同一个模型、只剥掉 CLAUDE.md 那一块(提示词 29,989 → 24,212 字符),
    # 事前写死的每一项判据两臂都无法区分 ——
    #     页数 41 / 40      停留合计 90 / 90     停留中位 2.25 / 2.25
    #     bullet 中位 3 / 3  take 中位字数 31 / 30
    #     版式种类 7 / 7     相邻同版式 0 / 0     字段有缺 0 / 0
    # 无哲学那臂的 take 甚至更锐利(其中一页直接是「把『猿到人』改写成一句不含阶梯的话」
    # 这样的练习题),而这不是哲学要求的。
    #
    # 真正把页数从 18 推到 41 的是「任何一页不超过 2.5 分钟」那一个数 ——
    # 两轮都注入了同一份哲学、一字未改,而 page-rhythm 里逐字写着
    # 「不要为了减少页数,把多个本来应该分开处理的认知步骤压缩到同一页」,
    # 那句话在场,模型照样压成 18 页、14 页恰好 5 条。
    #
    # 注意边界:**只切规划这一步**。builder 侧仍然整份注入 ——
    # pedagogical-restraint / words-and-pictures-one-model / interaction-is-cognitive
    # 都是 scope="page",那一层没测过,不能顺手一起切。
    text = cached(run, "PLAN.md", run.root / "PLAN.md",
                  run.prompt("plan", query=run.query, minutes=run.minutes,
                             audience=run.audience, scenario=run.scenario,
                             libs=libs, lec_api=api))
    rows = parse_table(text)
    if not rows:
        raise RuntimeError("PLAN.md 第 1 节读不出页表 —— 六列的 markdown 表格没匹配上。"
                           f"看 {run.root / 'PLAN.md'}")
    check_table(run, rows, text)
    world = visual_world(text)
    check_visual_world(world)
    used_structures = sorted({r.structure for r in rows})
    used_layouts = sorted({r.layout for r in rows if r.layout})
    print(f"  验页表       {len(rows)} 行,知识结构 {len(used_structures)} 种: "
          f"{' '.join(used_structures)}；版式 {len(used_layouts)} 种: "
          f"{' '.join(used_layouts) or '（未声明）'}")
    deck = split_deck(run, text)
    # 图池排在 theme.css 之前,两个理由:写 theme 的那一步能拿到图的尺寸和平均色;
    # 而更要紧的是排在 expand() 之前 —— 规格要能点名已经存在的文件。
    pool = assets(run, text)

    # **给写 CSS 的那一步的是「一张联系表 + 几行字」,不是整张图池表。**
    # 整张表里「用在哪几页」「title=」这些列是给规格用的,对定配色是冗余;
    # 而底图长什么样看一眼就知道,不必用平均色和 p95 去描述。
    sheet = run.assets / "img" / "backdrops.jpg"
    back_rows = [l for l in (pool or "").splitlines() if "底图" in l]
    # **audience / scenario 以前没传给这一步。** 决定全套长相的就是这一步,
    # 而它收不到「读者是谁、在什么场合看」—— 因果上不可能按受众定风格,
    # 只能照 {world} 抄,或者退回上一次见过的那套。
    # 同一个模型两轮给出过相反的底色(暗教室→暖近黑;开灯的教室大屏→纸色底),
    # 两次的理由都是场合的物理条件。所以这两个字段是这一步的判据,不是背景。
    theme = cached(run, "theme.css", run.assets / "theme.css",
                   run.prompt("theme", canvas_w=w, canvas_h=h, n_pages=len(rows),
                              world=world or "（PLAN.md 没有声明,你自己定）",
                              audience=run.audience, scenario=run.scenario or "（没写）",
                              img_pool=("\n".join(back_rows) or "（这一轮没有底图）"),
                              layouts=("\n".join(f"    {u}" for u in used_layouts)
                                       or "    （页表没有声明版式）")),
                   sheet=sheet if sheet.exists() else None)
    # theme.css 自报的 INTERFACE 块 → 追加进 CHASSIS.md,让它真的到达每一页。
    #
    # 这是 nn-11 (Opus 5 × Claude Code) 的行为:协调者主动往 CHASSIS.md 追加了 7,365B、
    # 9 个小节,第一节就是 `Chrome.mount(cfg) → 返回 <main class="page-main">`。
    # 我们这条链路上各步互不记忆,所以由 harness 搬 —— 但搬的是**模型刻意写出来的接口块**,
    # 不是 harness 去 grep 选择器。后者试过,只能猜到类名,猜不到"这个 token 许用在哪"。
    m = _interface(theme)
    if m:
        ch = run.assets / "CHASSIS.md"
        ch.write_text(ch.read_text(encoding="utf-8").rstrip()
                      + "\n\n---\n\n## 本轮追加:`theme.css` 提供的 token 与 class\n\n"
                      + "```\n" + m.group(1).strip() + "\n```\n", encoding="utf-8")
        n_if = len([l for l in m.group(1).splitlines() if l.strip()])
        print(f"  接口交接     theme.css 的 INTERFACE 块 {n_if} 行 → CHASSIS.md")
    # 已知陷阱也搬过去。**这是绕开改 `base.js` 的办法** —— 那份是两条线逐字节
    # 同一份的冻结层,改了就失去「同一个 base」这个单变量前提,而陷阱是真的:
    # `Deck.fmt` 的签名注释没说它带符号,于是有一页把年代印成「约 +366 万年前」19 处。
    ch = run.assets / "CHASSIS.md"
    if "已知陷阱" not in ch.read_text(encoding="utf-8"):
        ch.write_text(ch.read_text(encoding="utf-8").rstrip() + '''

## 已知陷阱

`Deck.fmt(v, d)` **给非负数加 `+`** —— 它是给增量用的（`+3.2%`、`余量 +0.42 cm`）。
**绝对量不要用它**：年代、质量、温度、距离一律 `v.toFixed(d)`。
实测代价：一页把年代印成「约 +366 万年前」，19 处。
''', encoding="utf-8")
        print("  接口交接     已知陷阱（Deck.fmt 带符号）→ CHASSIS.md")
    else:
        print("  接口交接     ✗ theme.css 里没有 INTERFACE 块 —— "
              "各页只能自己去 grep 选择器,而 token 的适用范围它猜不到")

    # 闸:theme.css 必须真的给 mount 注入的那套类名写了样式。
    #
    # **mount 类名覆盖那道闸删了。** 它查的是「theme.css 有没有给 mount 注入的
    # 每个类名写样式」,而 mount 已经不存在 —— 版面由建页的 agent 自己定,
    # theme.css 给的是可拼装的 token 和骨架类,不再有一份"必须覆盖"的类名清单。
    cached(run, "CONTRACT.md", run.root / "CONTRACT.md",
           run.prompt("contract", n_pages=len(rows), canvas_w=w, canvas_h=h,
                      libs=libs, lec_api=api, minutes=run.minutes,
                      # ↑ minutes 以前没传。`fill()` 是字面 replace,占位符没配上不会报错 ——
                      # 于是 `{minutes}` 原样留在提示词里,模型照抄进产物:
                      # 实测 ape-g18 的 CONTRACT.md §1 里写着「会让 `{minutes}` 分钟塌掉」,
                      # 50 页每页都读到这一句。**占位符对不上必须是可见的错**,见下面的自检。
                      spine=spine(text) or "（PLAN.md 里没读出主线那一节）",
                      world=world or "（PLAN.md 里没读出视觉世界那一节）",
                      audience=run.audience, scenario=run.scenario))
    # 这里原来还传 chassis=CHASSIS.md 全文(约 6KB)。删掉了:契约改成指路,
    # 底盘接口由每页自己读 `assets/CHASSIS.md`。留着传参不会报错(fill 是字面替换),
    # 但那 6KB 会白进一次提示词,而且模型看见了就会想抄。
    # **规格排在 theme.css 和 CONTRACT.md 之后。** 2026-08-23 调的序,理由是量出来的:
    # 原来 expand() 在 theme 之前,所以写规格时 `theme.css` 还不存在 ——
    # 五种骨架类全都生成了、带排版原语、页面 46/48 在用,而 **48 份规格一份都没点过名**,
    # 「这一页用哪套骨架」由 48 个并行建页 agent 各自现场决定一次。
    # 墙钟代价≈0:theme.css 是一次串行调用(实测 ~220 秒),expand 本身 20–50 路并行 98 秒。
    #
    # 喂进去的是三样:lec 的接口签名、常量的**实际值**、theme 的 INTERFACE 块。
    # 值那一样是消融验过的:只给键名时规格只能写「去 Lec.K.timeline 里取」,
    # 给了值之后同一个建页模型 Edit 6.5→1.1、画布占满 24/48→44/44、占用比 51%→63%。
    expand(run, rows, deck, api, lec_values(lec), img_pool=pool,
           theme_api=(m.group(1).strip() if m else
                      "（theme.css 没写 INTERFACE 块,这一轮点不了名）"),
           workflow_root=workflow_root)

    skeletons(run, len(rows))
    (run.root / "briefs.json").write_text(
        json.dumps([b.as_tool_input() for b in briefs(run, rows, workflow_root)],
                   ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n  合计 {time.time()-t0:.0f}s  →  {run.root}")

    # plan 层自检。**纯文本、35 毫秒**,而在接上之前它只是手工习惯 ——
    # 后果很实:`artifacts.py` 里那行 `Lec.mount` 鬼签名躺了两个月、
    # `MAX_CHARS["spec"]` 两个月没生效、`theme.css` 悄悄长出第三级表面,
    # 三件都是文本判据本来就能抓、但没人跑那个判据。
    bad = 0
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        import plan_quality
        plan_quality.main_table([run.label])
        bad = plan_quality.gate(run.label)
    except Exception as e:                      # 自检本身不该弄死一轮
        print(f"  自检         ⚠ 跑不起来:{type(e).__name__}: {str(e)[:80]}")
    return {"pages": len(rows), "root": str(run.root), "gate_failures": bad}


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
    n = a.parse_args()
    if not Path(n.prompts).is_dir():
        raise SystemExit(f"✗ --prompts 指的 {n.prompts} 不是目录")
    missing = [f"{x}.md" for x in ("brief", "contract", "lec", "plan", "spec", "theme")
               if not (Path(n.prompts) / f"{x}.md").is_file()]
    if missing:
        raise SystemExit(f"✗ --prompts 指的 {n.prompts} 缺 {', '.join(missing)} —— "
                         f"缺哪份要当场报错,不能等跑到那一步才 FileNotFoundError。")
    if not Path(n.skills).is_dir():
        raise SystemExit(f"✗ --skills 指的 {n.skills} 不是目录 —— "
                         f"缺了它图池会全空、逐页规格也点不到技法文档,而那两条都只报警。")
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
    r = plan_run(Run(n.query, n.minutes, n.audience, n.label, n.scenario,
                     prompts=Path(n.prompts)),
                 Path(n.chassis), Path(n.lib), Path(n.skills), workflow_root)
    # 退出码带上自检结果:产物全留着,但起 builder 之前必须先看到这个。
    if r.get("gate_failures"):
        sys.exit(1)


if __name__ == "__main__":
    main()
