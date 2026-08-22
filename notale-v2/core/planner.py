"""planner —— 固定流水线。

步骤顺序不是设计的,是从 nn-06 主 agent 的动作时间线抄下来的:

    探环境 → theme.css → lec.js → PLAN.md → CONTRACT.md → 建骨架 → 出 brief

nn-03 走的是同一条线,两轮完全一致。跨两轮稳定复现的行为才固定成流水线;
builder 那边每页 16–73 次调用、相差 4.6 倍,所以那边只能是循环。

    python3 -m core.planner --query "…" --minutes 90 --label orbit-01
"""

from __future__ import annotations

import argparse
import collections
import json
import re
import os
import shutil
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
from .artifacts import (Brief, _JS_BUILTIN, _fn_body, lec_api, lec_values,
                        parse_table)
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
    scenario: str = ""
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
# 所以 CONTRACT.md 定 9,000:比 Opus 同类文件宽松近一倍,却能拒掉 13.5k 和 18.9k 那两份。
# **注意这一条只治了一半** —— g6 的共享文本大头有一半在 deck.md(11,713 字符),
# 那要靠「给每页切 deck 片」来治,是另一个改动,不在这一轮。
# 逐页 spec 的 1,600:Opus 中位 1,178,我们是 3,116 / 1,998 / 1,984。
MAX_CHARS = {"CONTRACT.md": 9000, "spec": 2400}
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


def call(run: Run, step: str, prompt: str, min_chars: int = 1) -> str:
    m = config()["model"]
    req = Request(model=m["name"], system=[TextBlock(text=IDENTITY)],
                  messages=[Message(role="user", content=[TextBlock(text=prompt)])],
                  max_tokens=MAX_OUT.get(step, m["max_output_tokens"]),
                  output_config={"effort": config()["planner"]["reasoning_effort"]})
    t0, started = time.time(), _now()
    r = ask(req, min_chars=min_chars)
    run.log.add([b.model_dump() for msg in req.messages for b in msg.content], r.text,
                {"input_tokens": r.input_tokens, "output_tokens": r.output_tokens},
                getattr(r.raw, "id", None) or f"req_{uuid.uuid4().hex[:16]}",
                started, _now(), {"step": step})
    print(f"  {step:<12} {time.time()-t0:6.1f}s  out={r.output_tokens:>6,} tok  {len(r.text):>7,} 字符")
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
    m = re.search(r"#stage\s*\{([^}]*)\}", text, re.S)
    body = m.group(1) if m else ""
    if not (re.search(r"display\s*:\s*flex", body)
            and re.search(r"flex-direction\s*:\s*column", body)):
        return ("`#stage` 没有设成 flex 列 —— 必须有 "
                "`#stage { display: flex; flex-direction: column; }`。"
                "缺了它子元素按内容取高、剩下的画布就是死空间,"
                "实测这样的一轮 52 页里 0 页把 900px 用满(对照:另一条线 44/44 页用满)")
    return ""


_PIC = r"照片|图片|插画|图像|影像|示意图|photo|image|illustration|图为|一张"
_MEDIA_SKILL = {"web-media-getter": r"照片|实拍|图为|真实|photo|NASA|Wikimedia|馆藏|标本|遗址",
                "make-illustration": r"插画|画一|绘制|示意|想象|复原|illustration|风格化"}


def _repair_spec(text: str) -> str:
    """写了要图、却没在 `必用skill` 里指派取图 skill —— harness 把 skill 补上。

    量出来的:`ape-g5`(GPT)规划里**指派媒体 skill 的页 0 个**,48 页 0 张图,
    110 次 Skill 调用里一个媒体 skill 都没有;同一份提示词下 `ape-ds2`(Flash)
    指派了 7 页,取到 13 张真实照片 + 9 张生成插画。builder 只读规划指派给它的技法文档,
    规划里没有,skill 路径修得再对也没用。

    根因是判据本身:`必用skill` 原来写「按这个交互要做出来、缺哪一块知识判断」——
    **取图不是交互技法**,按那个判据永远选不中。而 `## 媒体` 那一节是孤立的,
    写了要什么图,却没有任何一步会因此去指派取图 skill。

    只在 `## 媒体` 真的点了图时才补。那一节同时管入场动画 ——
    只写了动画的页不该被塞一个取图 skill,所以先看有没有图的字样。
    """
    m = re.search(r"^##\s*媒体\s*$(.*?)(?=^##\s|\Z)", text, re.S | re.M)
    if not m or not re.search(_PIC, m.group(1)):
        return text
    k = re.search(r"^(##\s*必用skill\s*$)(.*?)(?=^##\s|\Z)", text, re.S | re.M)
    if not k or re.search(r"web-media-getter|make-illustration", k.group(2)):
        return text
    want, blob = "web-media-getter", m.group(1)
    for name, pat in _MEDIA_SKILL.items():
        if re.search(pat, blob):
            want = name
            break
    cur = k.group(2).strip()
    new = want if (not cur or cur in {"无", "无。"}) else f"{cur.rstrip('。,,')}, {want}"
    print(f"      媒体节点了图但没指派取图 skill,已补 {want}", flush=True)
    return text[:k.start(2)] + f"\n{new}\n\n" + text[k.end(2):]


def _valid_spec(text: str, interactive: bool = False) -> str:
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
    need = ["照这个写", "知识结构", "表征形式", "不许碰", "场景构图", "动效"]
    miss = [k for k in need if f"## {k}" not in text and f"## {k}：" not in text]
    if miss:
        return f"缺必填小节 {'/'.join(miss)}"
    # 交互页另查反馈闭环那四件在不在。**判「在不在」,不判「写得好不好」** ——
    # 后者判不了,而前者能数,而这条项目一贯的规律是能数的才起作用。
    # 实测上一轮 45 页:成功判据 17%、进度 11%、收尾 2%,
    # 也就是「做对了会发生什么、做到哪儿了、做完怎么收」大面积没写。
    if interactive:
        m = re.search(r"^##\s*交互[^\n]*$(.*?)(?=^##\s|\Z)", text, re.S | re.M)
        body = m.group(1) if m else ""
        # **查标签在不在,不要去猜标签里的词。** 这一条是量出来的,代价是一整轮:
        # 我第一版按词汇匹配「进度」(`进度|第\d|\d/\d|已完成`),而模型写的是
        # `已找到／全部分叉`(全角斜杠、一个数字都没有)和`逐条点亮已完成的判读句`——
        # 内容完全合格,词汇对不上。结果 10 多页被判不合格、p03 三次不过、
        # 整个 planner 死掉、44 页全没。
        # 而提示词本来就要求它按这四个标签逐条写,所以查标签是对**我自己指定的格式**
        # 做结构检查,不是对语义做猜测 —— 前者可靠,后者一定会在词汇上翻车。
        for label, pat in (("做对了", r"做对了|正确时|对的时候"),
                           ("做错了", r"做错了|错误时|错的时候"),
                           ("做到哪儿了", r"做到哪儿了|做到哪里了|进度"),
                           ("做完了", r"做完了|完成后|全部完成时")):
            if not re.search(pat, body):
                return (f"交互那一节缺「{label}」那一行 —— 这一页有交互,"
                        f"四行(做对了/做错了/做到哪儿了/做完了)要按提示词给的标签逐行写")
    if not re.match(r"\s*#\s+page-\d+", text):
        return "开头不是 `# page-NN · …` 那一行"
    return ""


CHECKS = {"lec.js": _valid_js, "theme.css": _valid_css, "spec": _valid_spec}
# 能确定性修好的,harness 自己修;修不掉的才交给上面的闸。
# lec.js 的修补器(补 mount 的 return)随页眉页脚一起删了。
REPAIRS = {"spec": _repair_spec}

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


def cached(run: Run, step: str, path: Path, prompt: str) -> str:
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
        text = call(run, step, prompt, min_chars=lo)
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
        hi = MAX_CHARS.get(step)
        if not bad and hi and len(text) > hi:
            bad = (f"太长了:{len(text):,} 字符,上限 {hi:,}(超出 {len(text)-hi:,})。"
                   f"这份产物下游每页都要读,长度直接乘以页数。"
                   f"删掉背景、理由的展开和重复的举例,只留能被违反、能被检查的条款")
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
    names = [x for x in re.split(r"[,，、\s]+", m.group(1).strip()) if x and x != "无"]
    names = [x for x in names if re.fullmatch(r"[a-z0-9][a-z0-9-]*", x)]
    return "\n".join(f"  - {n}" for n in names)


def _skill_list(entry) -> str:
    """把「必用skill」那一项拆成逐行清单。写「无」的就是没指派 —— 允许为空,
    否则会出现为了填满而硬塞一份不相干技法文档的情况。"""
    raw = (entry.value("必用skill") or "").strip()
    if not raw or raw in ("无", "None", "-"):
        return ""
    names = [n.strip(" `、,,") for n in re.split(r"[、,,\s]+", raw) if n.strip(" `、,,")]
    return "\n".join(f"  - {n}" for n in names)


def split_deck(run: Run, text: str) -> str:
    """把 PLAN.md 原样落成 `plan/deck.md` —— 整套共享的部分(主线/页表/归属/口径)。

    现在 PLAN.md 里已经没有逐页正文了(第 1 节只是一张表),所以这一步只是复制。
    逐页规格由 expand() 并行写成 plan/pNN.md。
    """
    d = run.pages / "plan"
    d.mkdir(parents=True, exist_ok=True)
    (d / "deck.md").write_text(text.rstrip() + "\n", encoding="utf-8")
    return text


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
    ok = len(hexes) >= 3 and n_motif >= 3
    print(f"  验视觉世界   {len(hexes)} 个 hex、{n_motif} 条母题"
          + ("  ✓" if ok else "  \033[33m⚠ 要求 ≥3 个 hex 且 ≥3 条母题\033[0m"))


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

    legal = {"process", "comparison", "enumeration", "classification", "generalization"}
    ill = [(r.pid, f"知识结构 {r.structure!r} 不在五种之内", r.raw)
           for r in rows if r.structure.lower() not in legal]
    if ill:
        show(f"{len(ill)} 行知识结构非法", ill)

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
    declared = set(re.findall(r"^\s*(E\d+)\b", plan_text, re.M))
    used = {r.evidence for r in rows if r.evidence not in ("", "—", "-", "无")}
    if declared or used:
        ghost = [(r.pid, f"证据 {r.evidence!r} 没在证据链里声明"
                         f"(声明过的:{' '.join(sorted(declared)) or '一个都没有'})", r.raw)
                 for r in rows if r.evidence in used - declared]
        if ghost:
            show(f"{len(ghost)} 行引用了没声明的证据节点", ghost)
            raise RuntimeError(
                f"页表引用了没声明的证据节点 {sorted(used - declared)};"
                f"证据链里声明过的是 {sorted(declared) or '（一个都没有）'}。"
                f"这一条判死,因为展开那一步是 20 路并行、各自看不见这个矛盾。"
                f"改 {run.root / 'PLAN.md'} 的证据链或页表的「证据」列,再重跑这一步。")
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

    n_bad = len(bad) + len(ill) + len(over) + len(dup) + (0 if tot == want else 1)
    if n_bad:
        print(f"  \033[33m  以上 {n_bad} 项都没有判死 —— 页表是个小文本文件,"
              f"改完重跑 PLAN.md 这一步即可(后面几步命中缓存)。\033[0m")


def expand(run: Run, rows: list, deck: str, api: str = "", vals: str = "") -> None:
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
                            skills=skills.catalog(), lec_api=api, lec_values=vals,
                            stay=f"{r.stay:g}", structure=r.structure)
        req = Request(model=m["name"], system=[TextBlock(text=IDENTITY)],
                      messages=[Message(role="user", content=[TextBlock(text=prompt)])],
                      max_tokens=MAX_OUT.get("spec", 8000),
                      output_config={"effort": eff})
        # 闸按这一行绑定:交互页才查反馈闭环那四件。
        # `CHECKS` 只按步名取函数、拿不到行信息,而「这一页有没有交互」只有行里有 ——
        # 所以在这里绑,而不是把 interactive 塞进全局。
        chk = partial(CHECKS["spec"], interactive=bool(r.interaction_key))
        out_tok = 0
        for attempt in range(1, 4):
            rep = ask(req, min_chars=MIN_CHARS.get("spec", 400))
            out_tok += rep.output_tokens
            txt = _extract_spec(rep.text, chk)
            txt = REPAIRS["spec"](txt)      # 媒体点了图却没指派取图 skill,就补上
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


def briefs(run: Run, rows: list) -> list[Brief]:
    """按模板填。

    **全流程唯一一处没照抄 Claude Code 的地方**,理由是量出来的:nn-03 里主 agent
    逐字手写 14 份 brief,派发时刻拉开 6:24,而 brief 之间七成内容一样。
    要换回原样,把这里改成一次模型调用即可 —— 信息一致,只是慢。
    """
    out = [Brief(f"Build {r.pid}", run.prompt(
        "brief", minutes=run.minutes, query=run.query, num=int(r.nn),
        page=run.pages / f"{r.pid}.html", pid=r.pid, total=len(rows),
        contract=run.root / "CONTRACT.md", assets=run.assets,
        deck=run.pages / "plan" / "deck.md",
        spec=run.pages / "plan" / f"p{r.nn}.md",
        stay=f"{r.stay:g} 秒",
        structure=r.structure,
        skills=_skill_list_row(run, r) or "  (这一页没有指派技法文档,直接动手)")) for r in rows]
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
                             libs=libs, lec_api=api,
                             skills=skills.catalog(skill_root)))
    rows = parse_table(text)
    if not rows:
        raise RuntimeError("PLAN.md 第 1 节读不出页表 —— 六列的 markdown 表格没匹配上。"
                           f"看 {run.root / 'PLAN.md'}")
    check_table(run, rows, text)
    world = visual_world(text)
    check_visual_world(world)
    used = sorted({r.structure for r in rows})
    print(f"  验页表       {len(rows)} 行,知识结构 {len(used)} 种: {' '.join(used)}")
    deck = split_deck(run, text)
    # **把 lec 的接口喂给写规格那一步。** 这是量出来的根因:
    # Opus 那条线的规格 100% 带一行字面的 `Chrome.mount({act:1, title:'…'})`,
    # 我们只有 2% —— 而原因不是它更用心,是**我们那次调用根本不知道 mount 的参数名**
    # (expand 传的是 num/nn/query/deck/row/skills/stay/structure,没有 lec_api/lec_dom)。
    # Opus 知道,因为 lec.js 是它自己在同一个上下文里写的。
    # 在缺签名的前提下要求「写字面代码行」,模型做不到 —— 先给接口,再提要求。
    # 连**值**一起喂进去。只给键名的那一版,写规格的模型看到的是
    # 「Lec.K(常量): astronomy、comparison、human、…」—— 九个类别名、一个数字都没有,
    # 所以它写不出「| 7.0 | 360 | 乍得沙赫人 |」,只能写「去 Lec.K.timeline 里取」。
    # 而消融证明:规格里摆着真实数据的那一份,同一个建页模型 Edit 6.5→1.1、
    # 画布占满 24/48→44/44、占用比 51%→63%。K 的全部内容实测 4–8KB,喂得进去。
    expand(run, rows, deck, api, lec_values(lec))

    theme = cached(run, "theme.css", run.assets / "theme.css",
                   run.prompt("theme", canvas_w=w, canvas_h=h, n_pages=len(rows),
                              world=world or "（PLAN.md 没有声明,你自己定）",
                              layouts="\n".join(f"    {u}" for u in used)))
    # theme.css 自报的 INTERFACE 块 → 追加进 CHASSIS.md,让它真的到达每一页。
    #
    # 这是 nn-11 (Opus 5 × Claude Code) 的行为:协调者主动往 CHASSIS.md 追加了 7,365B、
    # 9 个小节,第一节就是 `Chrome.mount(cfg) → 返回 <main class="page-main">`。
    # 我们这条链路上各步互不记忆,所以由 harness 搬 —— 但搬的是**模型刻意写出来的接口块**,
    # 不是 harness 去 grep 选择器。后者试过,只能猜到类名,猜不到"这个 token 许用在哪"。
    m = re.search(r"/\*\s*=+\s*INTERFACE\s*=+(.*?)=+\s*/?INTERFACE\s*=+\s*\*/",
                  theme, re.S | re.I)
    if m:
        ch = run.assets / "CHASSIS.md"
        ch.write_text(ch.read_text(encoding="utf-8").rstrip()
                      + "\n\n---\n\n## 本轮追加:`theme.css` 提供的 token 与 class\n\n"
                      + "```\n" + m.group(1).strip() + "\n```\n", encoding="utf-8")
        n_if = len([l for l in m.group(1).splitlines() if l.strip()])
        print(f"  接口交接     theme.css 的 INTERFACE 块 {n_if} 行 → CHASSIS.md")
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
                      libs=libs, lec_api=api,
                      audience=run.audience, scenario=run.scenario))
    # 这里原来还传 chassis=CHASSIS.md 全文(约 6KB)。删掉了:契约改成指路,
    # 底盘接口由每页自己读 `assets/CHASSIS.md`。留着传参不会报错(fill 是字面替换),
    # 但那 6KB 会白进一次提示词,而且模型看见了就会想抄。
    skeletons(run, len(rows))
    (run.root / "briefs.json").write_text(
        json.dumps([b.as_tool_input() for b in briefs(run, rows)],
                   ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n  合计 {time.time()-t0:.0f}s  →  {run.root}")
    return {"pages": len(rows), "root": str(run.root)}


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--query", required=True)
    a.add_argument("--minutes", type=int, default=90)
    a.add_argument("--audience", default="学过一点相关基础、但没系统学过这个题目的读者")
    a.add_argument("--label", required=True)
    a.add_argument("--scenario", default="",
                   help="使用场合,例如「课堂授课,教师带着讲;学生课后可以自己重看一遍」")
    a.add_argument("--chassis", default="/data1/home/zhuyifan/ws2/Notale/notale/zzz")
    a.add_argument("--model")
    a.add_argument("--effort")
    a.add_argument("--lib", default="/data1/home/zhuyifan/ws2/Notale/notale/zero/pages/assets/lib")
    n = a.parse_args()
    llm.override(name=n.model)
    if n.effort: config()["planner"]["reasoning_effort"] = n.effort
    plan_run(Run(n.query, n.minutes, n.audience, n.label, n.scenario),
             Path(n.chassis), Path(n.lib))


if __name__ == "__main__":
    main()
