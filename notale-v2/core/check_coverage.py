#!/usr/bin/env python3
"""覆盖闸:规划了的东西,交付里到底有没有。

    python3 -m core.check_coverage --label s5-orb
    python3 -m core.check_coverage --label s5-orb --minutes 90
    python3 -m core.check_coverage --label s5-orb --pages pages.no-skills   # 消融的另一臂
    python3 -m core.check_coverage --label s5-orb --json

## 为什么需要这条闸

三条已有的闸(机制 / 死代码 / 字号地板)加 measure_forms / measure_register,
**没有一条管「讲够了没有」**。而这恰好是弱模型最大的实测短板:nn-06 和 nn-07
的指令 md5 逐字相同、同样要求「撑起一堂 90 分钟的课」,结果 Opus 做了 20 页、
Sonnet 只做了 14 页。三条闸对此全部沉默 —— 14 页每一页都合格,只是不够。

它符合装闸的判据:翻遍 nn-03 / nn-06 / nn-07 三轮轨迹,**没有一次**主动回头
数过页数够不够。这是模型自己永远不会发现的盲区。
而且它有确定性修法(少了就补页),所以进 harness,不像 measure_register 那样
只当分析仪器。

## 硬判的两项,都在真数据上校准过

  缺页 / 空页   PLAN.md 规划了 N 页,pages/ 下是否真有 N 页且都 >1KB
  锚点缺失      每页的 kicker 和标题是否真出现在那一页里

锚点这条经 64 页实测:标题 64/64、kicker 62/64 命中(gpt-nn 那 2 个是真缺失,
不是匹配器的误报)。**两侧都要去标记再比** —— PLAN 里的标题带 `<em>`,页面里
也带,只去一侧会得到 0/64 这种假结果,我第一版就栽在这。

锚点一共三个:kicker、标题、take。三个都是逐字硬判,64 页实测
标题 64/64、take 64/64、kicker 62/64。

take 原本想做成「关键词覆盖率」这种软指标,实测发现 **2/4/6-gram 三种粒度
在三轮上全部读 100%** —— 因为 take 本来就被逐字写在页面上(和 kicker 同一机制)。
一个到处都读 100% 的指标只会给假信心,所以直接改成硬锚点,不留那个比率。

## 只报不判的一项

  时长   PLAN.md 第 0 节的章表自带每章分钟数(实测形如
         `| Ⅰ　把问题问对 | 01–03 | 12 分钟 | … |`),把它们加起来和 --minutes 比。
         这比「页数 × 每页 2.5–3 分钟」靠谱 —— 后者是拍的,前者是模型自己的预算。
         章表不是必有的(gpt-nn 那轮就没有),没有就跳过这一项。
         仍然只报不判:预算对不对得上是判断题,不是对错题。
"""

from __future__ import annotations

import argparse
import json
import re
import statistics as st
import sys
from pathlib import Path

from .artifacts import parse_plan, parse_table

ROOT = Path(__file__).resolve().parents[1]
EMPTY_BYTES = 1000          # 小于这个算空页 —— 骨架本身约 212 字节

# PLAN.md 第 0 节的章表行。**必须带 re.M** —— 不带的话 `^` 只在整段开头匹配,
# 结果是静默的 0 条(第一版就是这么错的,而 0 条看起来很像「这轮没有章表」)。
# 单页停留上限,**单位是秒**。改这个数就改页数下限:{minutes}*60/STAY_CEILING。
#
# 从 2.5 分钟改成 150 秒,不是换个写法 —— 是换单位。用分钟写,模型把粒度锁在
# 半分钟一档,实测最小值只到 90 秒,而一个只有课名和一句主张的标题页 10 秒就够。
# 9 页这类页面按 90 秒算,白占约 10 分钟。
STAY_CEILING = 150.0

# 名册页(只承担开场/路线图/转场/综合/迁移,不带交互)的停留上限,秒。
ROSTER_CEILING = 60.0

_ROSTER = re.compile(r"无交互（[^）]*）\s*[:：]\s*([0-9\s,，、]+)")


def _secs(v: str) -> float | None:
    r"""把停留字段读成秒。**必须认单位** —— 原来只 `re.search(r"\d+")` 取数字,
    写「20 秒」会被当成 20 分钟加进总和,然后对不上账,而人会以为是模型算错了。"""
    m = re.search(r"(\d+(?:\.\d+)?)\s*(秒|s\b|分钟?|min)?", v)
    if not m:
        return None
    n = float(m.group(1))
    unit = m.group(2) or ""
    return n * 60 if unit.startswith(("分", "min")) else n

CHAPTER = re.compile(r"^\|[^|]*\|\s*(\d+)\s*[–—-]\s*(\d+)\s*\|\s*(\d+)\s*分钟?\s*\|", re.M)


def flat(s: str) -> str:
    """去标记、去空白。锚点比对必须两侧都过这一道。"""
    return re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", s))


def _anchors(e, pages: Path, tbl) -> tuple:
    """取这一页的三个逐字锚点(kicker / 标题 / take)。

    **两种格式取的地方不同**:
      旧格式 —— 逐页条目在 PLAN.md 里,直接 e.value(...)
      新格式 —— 页表里没有这三样,它们在 plan/pNN.md 里(B 段展开时定):
          标题   在 `# page-NN · <标题> · **N 秒**` 那一行
          take   在 `## 必须点出来的…` 小节下第一段
          kicker 形式不固定,尽量捞;捞不到就不查这一项
    取不到返回空串 —— 上游用 has_* 判断,空的那一项不计入锚点分母。
    """
    if not tbl:
        return ((e.value("kicker") or ""), (e.value("标题") or ""), (e.value("take") or ""))
    f = pages / "plan" / ("p" + e.nn + ".md")
    if not f.is_file():
        return ("", "", "")
    t = f.read_text(encoding="utf-8", errors="replace")
    # **标题和 take 在新格式下不做逐字锚点。** 实测这两条都是假阳性:
    #   `# page-NN · <短标题>` 是规格文件自己的标识,页面显示的是 B 段另拟的主标题
    #     —— p02 规格里是「三种人，同一副身体」,页面上是「换了环境，没有换掉基本身体」,
    #     两者本来就不必逐字相同,我却拿它做匹配,报出「标题 6/48」;
    #   take 那一节 spec.md 明确写了「可以润色」,润色过就匹配不上,报出「take 23/48」。
    # **kicker 也不再做锚点了。** 上一版留着它,理由是「它会原样传给 `Lec.mount`,
    # 是真契约」—— 而 2026-08-21 起 mount 和页眉页脚整套删掉了,版面全由建页的
    # agent 自己定,kicker 不再是任何东西的参数。前提没了,这条就成了纯假警:
    # 实测第一路就报「✗ kicker 没出现在页面上: page-01」,而那一页根本没有理由有 kicker。
    #
    # 三条逐字锚点(标题/take/kicker)于此全部退役。留下的教训是同一个:
    # **锚点只有在两头真的共享一个契约时才成立**,契约一撤,锚点就变成噪音,
    # 而噪音比没有更坏 —— 它让人以为有东西坏了。
    return ("", "", "")



def images(pages_dir: Path, plan_dir: Path) -> dict:
    """图的四条账,全是文本可查的 —— 2026-08-23 加,因为这四件都在上一轮真的发生了。

    这一轮之前没有任何一条被查过,而实测的样子是:
      · 同一张图的 base64 被内联两遍 —— sol47 的 p11,8 张其实是 4 张,1.4MB 一半是重复
      · `<img>` 全部没有 `title` —— 8/8 缺,而契约要求出处与许可写在那里
      · 规格要图 10 页,页面只出 2 页(g11 全建 48 页)
      · 整页底图压到 `opacity:.72`/`.78` —— 同类任务里协调者写的是 `.18`,差 4 倍
    """
    import base64 as _b64
    pages = sorted(pages_dir.glob("page-*.html"))
    dup = tot = notitle = 0
    seen_hash: dict = {}
    bright = []
    got = set()
    for f in pages:
        t = f.read_text(encoding="utf-8", errors="replace")
        # **`<image href>` 也算。** 只查 `<img>` 是判据比它声称的语义窄的又一例:
        # sol50 的 p27 把抠好的彗星当交互 SVG 里的一个精灵用
        # (`<image class="comet-img" href="assets/img/comet-67p.png" … title="…">`,
        # 外面是代码画的轨道和尘尾),这一层报的却是「这一页漏图」。
        for m in re.finditer(r'<(?:img|image)\b[^>]*>', t):
            tag = m.group(0)
            tot += 1
            got.add(f.name[5:7])
            if 'title="' not in tag:
                notitle += 1
            src = re.search(r'(?:src|href)="data:[^;]+;base64,([^"]{64,})"', tag)
            if src:
                h = hash(src.group(1))
                seen_hash[h] = seen_hash.get(h, 0) + 1
        # 整页底图压到多暗:铺满层(inset:0)上的 opacity
        for m in re.finditer(r'\{[^{}]*inset:\s*0[^{}]*\}', t):
            o = re.search(r'opacity:\s*([\d.]+)', m.group(0))
            if o and float(o.group(1)) > .35:
                bright.append((f.name[5:7], float(o.group(1))))
    dup = sum(v - 1 for v in seen_hash.values() if v > 1)
    # **只统计真的建过的页。** 第一版拿「规格要图的页」直接比「有图的页」,
    # 于是部分 build(只建 12/50 页)时把 38 个空骨架全算成失败,报出 7/23 的假警,
    # 而 12 个已建页里 7 页要图、7 页都出了图 —— 真值是 7/7。
    built = {f.name[5:7] for f in pages if f.stat().st_size > 1000}
    want = set()
    for f in sorted(plan_dir.glob("p[0-9][0-9].md")):
        t = f.read_text(encoding="utf-8")
        if re.search(r'##\s*媒体', t) or re.search(r'assets/img/[\w.-]+\.(jpg|jpeg|png|webp)', t):
            want.add(f.stem[1:])
    return dict(tot=tot, dup=dup, notitle=notitle, bright=bright,
                want=sorted(want & built), want_all=sorted(want),
                built=len(built), got=sorted(got))


def hand_drawn_svg(pages_dir: Path) -> dict:
    """数「模型手画的静态 SVG」—— **只报不判,不接进 gate()。**

    为什么要数它:sol48+sol49 的 24 页里 22 个 `<svg>`,元素构成是 40 个 `<ellipse>`、
    30 个 `<path>`、29 个 `<circle>`,而 `<line>` 只有 3 个、`<text>` 5 个 ——
    不是在画图表,是在画圆的东西(行星、轨道、盘、彗尾)。按「有没有被 JS 碰过」分开,
    **16 个是纯静态的手画物体**(各 3–7 个圆/椭圆/路径,350–750 字符,全部连
    `title`/`desc` 都没有),6 个是被交互驱动的(滑块驱动的原行星盘、d3 容器、量尺)。
    后一类是 SVG 的正当用法,抠图替不了会变的东西。

    判「静态」的办法是查 id/class 有没有在页内脚本里被引用。这比「有没有
    `<script>`」准:一页里既有 d3 容器又有手画装饰是常态。

    **为什么只报不判:** 这一轮配套的改动是提示词里一句引导(「先看图池里有没有它」),
    不是硬闸 —— 那是定下来的口径。留这个数是为了下一轮有据:引导有效就有数据支持,
    无效就有数据说该上闸。本项目里引导性措辞失效过("不要太满"×4 换来 7 轮零变化)。
    """
    pages = sorted(pages_dir.glob("page-*.html"))
    n_static = n_live = 0
    per_page: dict = {}
    for f in pages:
        if f.stat().st_size < 1000:
            continue
        txt = f.read_text(encoding="utf-8", errors="replace")
        scripts = " ".join(re.findall(r"<script\b[^>]*>(.*?)</script>", txt, re.S))
        for m in re.finditer(r"<svg\b.*?</svg>", txt, re.S):
            s = m.group(0)
            toks = set(re.findall(r'\bid="([\w-]+)"', s))
            toks |= set(" ".join(re.findall(r'\bclass="([^"]+)"', s)).split())
            live = any(re.search(r"[\"'.#]" + re.escape(x) + r"\b", scripts) for x in toks)
            shapes = len(re.findall(r"<(?:ellipse|circle|path)\b", s))
            if live:
                n_live += 1
            elif shapes >= 3:
                n_static += 1
                per_page[f.name[5:7]] = per_page.get(f.name[5:7], 0) + 1
    return dict(static=n_static, live=n_live, per_page=per_page,
                pages=len([f for f in pages if f.stat().st_size >= 1000]))


def check(label: str, pages_dir: str, minutes: int | None) -> dict:
    root = ROOT / "runs" / label
    plan_p = root / "PLAN.md"
    if not plan_p.is_file():
        sys.exit(f"找不到 {plan_p}")
    pages = root / pages_dir
    if not pages.is_dir():
        sys.exit(f"找不到 {pages}")

    plan_txt = plan_p.read_text(encoding="utf-8")
    # 新格式:PLAN.md 第 1 节是一张页表,逐页规格在 plan/pNN.md。
    # 旧格式:PLAN.md 里是 `### page-NN` 条目。两种都要认 ——
    # **不认新格式的后果是静默通过**:实测报出「规划 0 页,交付 0 页 ✓ 硬判全过」,
    # 比报错危险得多,因为看起来是过了。
    tbl = parse_table(plan_txt)          # 别叫 rows —— 本函数里 rows 是交付页的锚点行
    entries = tbl if tbl else parse_plan(plan_txt).entries
    fmt = "页表" if tbl else "逐页条目"
    rows, missing, empty = [], [], []
    for e in entries:
        f = pages / f"{e.pid}.html"
        if not f.is_file():
            missing.append(e.pid)
            continue
        size = f.stat().st_size
        if size < EMPTY_BYTES:
            empty.append(e.pid)
            continue
        html = f.read_text(encoding="utf-8", errors="replace")
        H = flat(html)
        k_raw, t_raw, tk_raw = _anchors(e, pages, tbl)
        kicker = flat(k_raw.strip("`'\" "))
        title = flat(t_raw.strip("`'\" "))
        take = flat(tk_raw.strip("`'\" "))
        rows.append({
            "pid": e.pid,
            "size": size,
            "kicker_ok": bool(kicker) and kicker in H,
            "title_ok": bool(title) and title in H,
            "take_ok": bool(take) and take in H,
            "has_kicker": bool(kicker),
            "has_title": bool(title),
            "has_take": bool(take),
            "skeleton_missing": e.missing(),
        })

    # 交付里有、规划里没有的页 —— 反向也要查,否则「多做了 5 页」看不出来
    planned = {e.pid for e in entries}
    extra = sorted(p.stem for p in pages.glob("page-*.html") if p.stem not in planned)

    # 章表:每章的页区间和分钟数。用来和 --minutes 对账,并看章有没有漏页。
    chapters = [(int(a), int(b), int(m))
                for a, b, m in CHAPTER.findall(parse_plan(plan_p.read_text(
                    encoding="utf-8")).section("0") or "")]
    budget = sum(m for _, _, m in chapters)
    covered: set[int] = set()
    for a, b, _ in chapters:
        covered |= set(range(a, b + 1))
    uncovered = sorted(set(range(1, len(entries) + 1)) - covered) if chapters else []

    # 逐页「停留」求和。这是比章表更权威的来源:章表是模型对自己的概括,
    # 而逐页停留是每一页真正的预算,也是 builder 拿到的那个数。
    # 两者都算,是因为它们**能不一致** —— 章表凑够 90 分钟、逐页加起来不是 90,
    # 说明规划自己没对齐,而 builder 只会看到逐页那个数。
    stays, no_stay = [], []
    for e in entries:
        sec = e.stay if tbl else _secs(e.value("停留") or "")
        (stays.append(sec) if sec is not None else no_stay.append(e.pid))
    stay_sum = round(sum(stays), 1)
    stay_med = st.median(stays) if stays else 0
    # 单页停留上限。**这是唯一逼向细粒度的约束** —— "加起来等于 90 分钟" 是守恒律,
    # 18 页×5 分和 50 页×1.8 分同样满足它,所以它不约束粒度。
    # 2.5 这个数是量出来的:上一轮同题规划把内容分解成 83 条要点却打包进 18 页
    # (14 页恰好 5 条),83 条 ÷ 90 分钟 = 每条约 1.1 分钟,一页一到两条 = 1–2.2 分钟。
    over = [e.pid for e, v in zip(entries, stays) if v and v > STAY_CEILING]
    # 名册:第 0 节那一行「无交互（…）：01 03 12」
    plan_txt = plan_p.read_text(encoding="utf-8")
    m = _ROSTER.search(plan_txt)
    roster = sorted(set(re.findall(r"\d+", m.group(1)))) if m else []
    rmap = {e.pid: v for e, v in zip(entries, stays)}
    roster_over = [f"page-{int(n):02d}" for n in roster
                   if (rmap.get(f"page-{int(n):02d}") or 0) > ROSTER_CEILING]
    roster_same = (len({rmap.get(f"page-{int(n):02d}") for n in roster}) == 1
                   and len(roster) > 1)

    # 用上面算好的绝对路径。第一版写 `Path(pages_dir)` —— 那是相对名("pages"),
    # 相对当前目录去找,结果 tot=0/want=0,而 sol47 的 p11 明明有 8 张图。
    r_img = images(pages, pages / "plan")
    return {
        "img": r_img,
        "label": label, "pages_dir": pages_dir,
        "planned": len(entries), "delivered": len(rows),
        "missing": missing, "empty": empty, "extra": extra,
        "rows": rows, "minutes": minutes,
        "chapters": len(chapters), "budget": budget, "uncovered": uncovered, "fmt": fmt,
        "stay_sum": stay_sum, "stay_n": len(stays), "no_stay": no_stay, "over": over,
        "roster": roster, "roster_over": roster_over, "roster_same": roster_same,
        "stay_med": stay_med,
    }


def report(r: dict) -> int:
    rows = r["rows"]
    print(f"\n\033[1m▸ 覆盖闸\033[0m  {r['label']}/{r['pages_dir']}")
    print(f"  规划 {r['planned']} 页,交付 {r['delivered']} 页  ({r['fmt']})")

    bad = 0
    if r["missing"]:
        print(f"  \033[31m✗ 缺页 {len(r['missing'])}: {' '.join(r['missing'])}\033[0m"); bad += 1
    if r["empty"]:
        print(f"  \033[31m✗ 空页 {len(r['empty'])}(<{EMPTY_BYTES}B): {' '.join(r['empty'])}\033[0m"); bad += 1
    if r["extra"]:
        print(f"  \033[33m⚠ 规划外的页 {len(r['extra'])}: {' '.join(r['extra'])}\033[0m")

    # 锚点那一行删了。三条逐字锚点(kicker/标题/take)已于 2026-08-21 全部退役 ——
    # 它们的前提是「kicker 会原样传给 Lec.mount」,而 mount 和页眉页脚整套删掉了。
    # 前提没了之后这一行恒为 0/N,是纯噪音,而噪音比没有更坏:它让人以为有东西坏了。
    sk = [(x["pid"], x["skeleton_missing"]) for x in rows if x["skeleton_missing"]]
    if sk:
        print(f"  \033[33m⚠ PLAN 骨架不全 {len(sk)} 页: "
              + "; ".join(f"{p}缺{'/'.join(m)}" for p, m in sk[:5]) + "\033[0m")

    if r["uncovered"]:
        print(f"  \033[33m⚠ 章表没覆盖到的页: {' '.join(f'{i:02d}' for i in r['uncovered'])}\033[0m")

    # ── 图的四条账。全是文本可查,而这一轮之前没有一条被查过。
    im = r.get("img") or {}
    if im:
        want, got = set(im["want"]), set(im["got"])
        hit = len(want & got)
        rate = f"{hit}/{len(want)}" if want else "—"
        print(f"  图: 共 {im['tot']} 张   规格要图 {len(im['want_all'])} 页,"
              f"其中已建 {len(want)} 页 → 出图 {rate}（已建 {im['built']}/{r['planned']} 页）")
        if want and hit < len(want) * 0.75:
            print(f"    \033[31m✗ 到达率 {hit}/{len(want)} < 75% —— 没出图的页: "
                  f"{' '.join(sorted(want - got))}\033[0m")
            print("      规格该点名图池里已存在的文件,而不是写检索任务交给建页去搜"
                  "(实测:点名的那条线 44 页出图 16 张,写检索任务的 48 页出 4 张)")
            bad += 1
        if im["dup"]:
            print(f"    \033[31m✗ 同一张图的 base64 重复内联 {im['dup']} 处 —— 纯浪费字节\033[0m")
            bad += 1
        if im["notitle"] and im["tot"]:
            pct = im["notitle"] * 100 // im["tot"]
            tag = "\033[31m✗" if pct > 10 else "\033[33m⚠"
            print(f"    {tag} {im['notitle']}/{im['tot']} 张缺 title —— "
                  f"契约要求出处与许可写在那里\033[0m")
            if pct > 10:
                bad += 1
        if im["bright"]:
            worst = max(o for _, o in im["bright"])
            print(f"    \033[31m✗ 整页底图压得太亮 {len(im['bright'])} 处,最亮 opacity {worst} "
                  f"(要求 ≤.35;同类任务里协调者写 .18)\033[0m")
            bad += 1
    if r["chapters"]:
        gap = "" if not r["minutes"] or r["budget"] == r["minutes"] else \
              f"  \033[33m⚠ 与目标 {r['minutes']} 分差 {r['budget']-r['minutes']:+d}\033[0m"
        print(f"  时长(只报不判): 章表 {r['chapters']} 条,自报预算合计 {r['budget']} 分钟{gap}")
    else:
        print(f"  时长: PLAN 第 0 节没有带分钟的章表,跳过")
    if r["no_stay"]:
        # 这条是硬判:逐页停留是 builder 拿到的数,缺了那一页就没有内容量的依据。
        print(f"  \033[31m✗ 逐页停留: {len(r['no_stay'])} 页没写"
              f"({' '.join(r['no_stay'][:8])})\033[0m")
        bad += 1
    elif r["stay_n"]:
        d = "" if not r["minutes"] or r["stay_sum"] == r["minutes"] * 60 else \
            f"  \033[33m⚠ 与目标 {r['minutes']*60} 秒差 {r['stay_sum']-r['minutes']*60:+g}\033[0m"
        print(f"  逐页停留: {r['stay_n']} 页齐全,合计 {r['stay_sum']:g} 秒{d}"
              f"  中位 {r['stay_med']:g} 秒")
        if r["over"]:
            print(f"  \033[31m✗ 超过单页上限 {STAY_CEILING:g} 秒的有 {len(r['over'])} 页"
                  f"({' '.join(r['over'][:10])}) —— 这些页装了不止一件事,拆开\033[0m")
            bad += 1
        if not r["roster"]:
            print(f"  \033[33m⚠ 第 0 节没有「无交互（…）：…」名册 —— "
                  f"不点名就等于默认每页都得有交互\033[0m")
        else:
            note = ""
            if r["roster_over"]:
                note = f"  \033[31m✗ 其中 {' '.join(r['roster_over'])} 超过 {ROSTER_CEILING:g} 秒\033[0m"
            elif r["roster_same"]:
                note = f"  \033[33m⚠ 名册页停留全是同一个数 —— 标题页和章节转场承担的事不一样\033[0m"
            print(f"  无交互名册 {len(r['roster'])} 页: {' '.join(r['roster'])}{note}")
        if r["chapters"] and r["budget"] != r["stay_sum"]:
            print(f"    \033[33m⚠ 章表说 {r['budget']} 分、逐页加起来 {r['stay_sum']:g} 分 ——"
                  f"规划内部没对齐,而 builder 看到的是逐页那个数\033[0m")

    print(f"  \033[32m✓ 硬判全过\033[0m" if not bad else f"  \033[31m{bad} 类硬判不过\033[0m")
    return bad


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--label", required=True)
    a.add_argument("--pages", default="pages", help="pages 目录名(消融的另一臂用 pages.no-skills)")
    a.add_argument("--minutes", type=int)
    a.add_argument("--json", action="store_true")
    n = a.parse_args()
    r = check(n.label, n.pages, n.minutes)
    if n.json:
        print(json.dumps(r, ensure_ascii=False, indent=1))
        return
    sys.exit(1 if report(r) else 0)


if __name__ == "__main__":
    main()
