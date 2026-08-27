#!/usr/bin/env python3
"""plan 阶段判据的仪器 —— **build 之前就能读的那几条**。

    python3 plan_quality.py ape-g14 ape-g11 ape-mm      # 多路横着比

为什么单独写一个而不是塞进 check_coverage:那一份量的是**交付之后**的页面
(覆盖、时长、无交互名册),而这一份量的是**规格本身**。两者的输入不同 ——
这一份只读 `PLAN.md` / `CONTRACT.md` / `plan/pNN.md` / `assets/theme.css`,
所以规划一跑完就能读,不必等 3 小时的 build。

每一条判据的定义都来自 `PLAN-QUALITY.md` 里先读到的原文,不是先造指标 ——
那份报告之前的同一天,我凭想象造了六个代理量,六个全部失效。
"""

import re
import statistics
import sys
from pathlib import Path

from core.artifacts import parse_table
# **接口块的正则和小节表从 planner 取,不抄第二份。** 这里原来复制了一份 `_IFACE`,
# 块格式一改两边必然漂移,而漂移出来的判据会安静地读一个恒定值 —— 这条流水线上
# 已经撞见过三次同款(handoff 计数找一节已删的标题、BASELINE_CHARS 按字节定按字符比、
# strip_skills 的 BLOCK 正则匹配的是过时措辞)。
from core.planner import IFACE_SECTIONS, _IFACE, _chassis_names, _iface_section

ROOT = Path(__file__).parent

DIGIT = re.compile(r"\d")
UTIL = re.compile(r"^(gap|pad|py|px|mt|mb|ml|mr|ta|fs|items|justify|self|grow|"
                  r"shrink|flex|w-|h-|max|text-|order|basis|round|op|z-)")
# 仪表:读数与控件。上一轮这一批一个都没有,于是每页自己发明按钮
GAUGES = (".big", ".num", ".hint", ".btn", ".tag", ".legend", ".cvbox", ".quiz")

# ── 交互那一节的三件事(2026-08-23 加,验四标签闸拆掉之后有没有塌) ──
# 「有正确状态」是这一轮要**降下去**的:上一轮 66 个交互页 100% 都有一个要达到的
# 正确答案,而同类任务里协调者那条线是 1/33。滑块和游标本来是仪器,没有对错。
RIGHT = re.compile(r"做对了|正确时|答对|放对|吸附到正确|达到目标|过关|通关|全部放对|正确答案|±")
# 「什么跟着变」和「怎么复位」是要**保住**的 —— 拆掉格式闸之后它们最容易一起消失
# 「立即」原来不在这条里,而 `prompts/spec.md` 的交互节原话就是「哪些数值或图形**立即**变化」——
# 判据认 `立刻` 不认 `立即`,于是它一直在低报。2026-08-26 实测:同一批规格,
# 旧模式 net-g2 26% / trim-net 0%,放宽到等价措辞后是 73% / 81%。**0% 那个数是假的。**
CHANGE = re.compile(r"随之|跟着变|同步|实时|立刻|立即|即时"
                    r"|同时(更新|变化|显示)|一并(更新|变化)|随(滑块|拖动|之)")
RESET = re.compile(r"复位|重置|重来|一键|恢复初|回到初始|重看|重新")


# 「交给下一页的问题」原来是规格里的一个独立小节,现在 prompts/spec.md:66 把它
# 作为 `## 照这个写` 表里的 `下一问` 行交付。旧判据只认那个已经不存在的小节标题,
# 于是「有『交给下一页』的份」在每一轮都读 0 —— 实测 runs/wf2-... 是
# `## 交给下一页的问题` 0/21、`下一问` 21/21。**一个恒读 0 的判据只会掩盖它本该
# 验的那次修复**(PLAN-QUALITY.md:151-169 把这一项从 0% 修到了 100%)。两种写法都认。
_HANDOFF_ROW = re.compile(r"^\|\s*下一问\s*\|\s*(\S[^|]*?)\s*\|", re.M)


def _has_handoff(t: str) -> bool:
    return "## 交给下一页的问题" in t or bool(_HANDOFF_ROW.search(t))


def interact(t: str) -> tuple:
    """(这一节的字符数, 有正确状态, 说清什么跟着变, 有复位) —— 没有这一节返回 None。"""
    m = re.search(r"##\s*交互[^\n]*\n(.*?)(?=\n##\s|\Z)", t, re.S)
    if not m:
        return None
    b = m.group(1)
    if re.match(r"\s*无[\s——-]", b[:24]):
        return None
    return len(b), bool(RIGHT.search(b)), bool(CHANGE.search(b)), bool(RESET.search(b))


def cells(t: str) -> tuple:
    """(真数值格, 总格数) —— 真数值格 = 含数字的单元格。

    第二个数是分母。第一版把分母写成「有数值的份」(23 份),
    于是 110/23 报成 4.8,而真值是 110/48 = 2.3 —— 分母错了两倍多。

    **「指针格」那一项 2026-08-24 整条删了**,连带这里不再判断指针 ——
    判据有假阳性(`| loss(w₁) | 对两样本的 `Lec.P.bce` 取平均 |` 是合法写法,
    loss 是函数不是常量,采样值在下一张核对表里),而它曾经握着当场退回规格
    和把整轮标成失败两项权力。要求本身仍在 `spec.md` 的正文里。
    """
    lit = tot = 0
    for row in re.findall(r"(?m)^\s*\|(.+)\|\s*$", t):
        if re.match(r"^[\s:|-]+$", row):
            continue
        for c in row.split("|"):
            c = c.strip()
            if not c:
                continue
            tot += 1
            if DIGIT.search(c):
                lit += 1
    return lit, tot


def css_classes(text: str) -> dict:
    out = {}
    for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", text):
        if sel.strip().startswith("@"):
            continue
        for c in re.findall(r"\.([a-zA-Z][\w-]*)", sel):
            out[c] = out.get(c, "") + body
    return out


def one(label: str) -> dict | None:
    run = ROOT / "runs" / label
    specs = sorted((run / "pages" / "plan").glob("p[0-9][0-9].md"))
    if not specs:
        print(f"  {label}: 没有 plan/pNN.md")
        return None
    texts = [f.read_text(encoding="utf-8") for f in specs]
    n = len(texts)
    lit_ptr = [cells(t) for t in texts]
    css_path = run / "pages" / "assets" / "theme.css"
    css = css_path.read_text(encoding="utf-8") if css_path.exists() else ""
    cls = css_classes(css)
    iface = _IFACE.search(css)
    iblock = iface.group(1) if iface else ""
    # 八节齐不齐,以及名录点到了 CSS 里几个类 —— 后者是「接口块够不够用」的主判据。
    # 建页 agent 不许读 CSS 源码,块里没点名的类对它们就是不存在的。
    iface_secs = sum(bool(_iface_section(iblock, x).strip()) for x in IFACE_SECTIONS)
    _bare = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    _defined = set(re.findall(r"\.([a-z][a-z0-9-]+)",
                              " ".join(re.findall(r"([^{}]*)\{", _bare))))
    iface_named = len(_defined & set(_chassis_names(iblock)))
    named = [c for c in cls if any(f".{c}" in t for t in texts)]
    plan = (run / "PLAN.md")
    plan_t = plan.read_text(encoding="utf-8") if plan.exists() else ""
    plan_rows = parse_table(plan_t)
    layouts = [r.layout for r in plan_rows if r.layout]
    # 页表「一句话」带数字的比例(第 7 列)
    claims = []
    for ln in plan_t.splitlines():
        c = [x.strip() for x in ln.split("|")]
        if len(c) >= 9 and re.fullmatch(r"\d\d", c[1] or ""):
            claims.append(c[7])
    # 数字口径那一节里的真实数值个数
    m = re.search(r"##\s*3\.\s*数字口径(.*?)(?=\n##\s|\Z)", plan_t, re.S)
    caliber_nums = len(re.findall(r"\d[\d.,]*\s*(?:%|kg|km|m/s|kcal|年|万|亿|mSv|"
                                  r"cc|L|W|°C|吨|s\b|Ma\b)", m.group(1))) if m else 0
    # 填色的容器类 —— 本轮新规则:只许 .panel 填色,骨架原语用线
    # **按类名去重,不是数规则条数。** 第一版数规则,`.panel.active`、
    # `.k-process > .step[aria-current]` 这类状态选择器各算一条,g14 报成 19,
    # 而手数是 5 —— 判据说的是「哪几个类会填色」,不是「有多少条带背景的规则」。
    fill_names = set()
    for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
        if sel.strip().startswith("@"):
            continue
        if not re.search(r"background(-color)?\s*:\s*(?!none|transparent|rgba\(0, ?0, ?0, ?0\))", body):
            continue
        for c in re.findall(r"\.([a-zA-Z][\w-]*)", sel):
            if re.fullmatch(r"panel|box|cvbox|step|it|note|lv|backdrop|k-[a-z]+", c):
                fill_names.add(c)
    fill_cls = len(fill_names)
    stage_pad = bool(re.search(r"#stage[^{]*\{[^}]*padding", css))
    # 规格点名图池文件的份数 —— 这是 2026-08-23 新增图池那一步要验的东西
    named_img = sum(1 for t in texts if re.search(r"assets/img/[\w.-]+\.(jpg|jpeg|png|webp)", t))
    lec = run / "pages" / "assets" / "lec.js"
    lec_t = lec.read_text(encoding="utf-8") if lec.exists() else ""
    p_fns = set(re.findall(r"^\s{2,4}([a-zA-Z_]\w*)\s*:\s*function", lec_t, re.M)) \
        or set(re.findall(r"\bP\.([a-zA-Z_]\w*)\s*=", lec_t))
    I = [x for x in (interact(t) for t in texts) if x]
    ni = max(len(I), 1)
    return dict(
        label=label, n=n,
        n_inter=len(I),
        inter_chars=statistics.median(x[0] for x in I) if I else 0,
        right=sum(x[1] for x in I) * 100 // ni,
        change=sum(x[2] for x in I) * 100 // ni,
        reset=sum(x[3] for x in I) * 100 // ni,
        spec_med=statistics.median(len(t) for t in texts),
        lit=sum(a for a, _ in lit_ptr),
        lit_per_table=(sum(a for a, _ in lit_ptr)
                       / max(sum(1 for _, c in lit_ptr if c), 1)),
        scene=sum("## 场景构图" in t for t in texts),
        check=sum(("## 核对" in t or "核对(" in t or "核对（" in t) for t in texts),
        handoff=sum(_has_handoff(t) for t in texts),
        inter=sum("## 交互" in t for t in texts),
        named=len(named), n_cls=len(cls),
        util=sum(1 for c in cls if UTIL.match(c)),
        gauge=sum(1 for g in GAUGES if g[1:] in cls),
        css=len(css), iface=len(iblock),
        iface_secs=iface_secs, iface_named=iface_named, n_defined=len(_defined),
        plan_chars=len(plan_t),
        layouts=len(set(layouts)),
        layout_missing=sum(not r.layout for r in plan_rows),
        layout_adj=sum(plan_rows[i].layout == plan_rows[i - 1].layout
                       for i in range(1, len(plan_rows)) if plan_rows[i].layout),
        split_lr=sum(x == "split-lr" for x in layouts),
        claim_num=sum(1 for c in claims if DIGIT.search(c)), claims=len(claims),
        caliber=caliber_nums, p_fns=len(p_fns), lec=len(lec_t),
        fill_cls=fill_cls, stage_pad=stage_pad, named_img=named_img,
    )


ROWS = (
    ("规格份数",                  "{n}",                              ""),
    ("规格中位字符",              "{spec_med:.0f}",                   "≤1300"),
    ("表格真数值格(每份有表)",    "{lit_per_table:.1f}",              "≥8"),
    ("表格真数值格合计",          "{lit}",                            ""),
    ("点名底盘类的规格数",        "{named}/{n_cls} 类",               "≥30%"),
    ("有「核对」的份",            "{check}/{n}",                      "≥40%"),
    ("有「交给下一页」的份",      "{handoff}/{n}",                    "≥90%"),
    ("还有「场景构图」的份",      "{scene}/{n}",                      "0"),
    ("有「交互」节的份",          "{inter}/{n}",                      "<n"),
    ("  交互节字符中位",          "{inter_chars:.0f}",                "≥200"),
    ("  有「正确状态」的比率",    "{right}%",                         "≤40%"),
    ("  说清「什么跟着变」",      "{change}%",                        "≥80%"),
    ("  有复位/重来",             "{reset}%",                         "≥70%"),
    # ≤13000 是按更早的产物定的,而实测三轮都在 16,457–17,897 —— 这条一直是红的,
    # 也就一直没起过约束作用。接口块改成八节之后目标产物约 28,000–30,600,阈值跟着走。
    ("theme.css 字符",            "{css:,}",                          "≤34000"),
    ("  其中 utility 类",         "{util}",                           "0"),
    ("  仪表类齐几样(共 8)",      "{gauge}/8",                        "8"),
    # ≥5000。我第一版按 frontend-slides 那 34 份 design.md 的字符中位数推了 ≥8000,
    # **那是英文**:同样的内容中文只要一半字符。实测新模板第一轮 6,233 字,
    # 而它的「字阶与字体角色」442 字里已经塞下了比例、依据、七档角色和中西配对。
    # 拿英文的字符数去卡中文产物,就是又造一条恒红判据。基线 1,929。
    ("  INTERFACE 块字符",        "{iface:,}",                        "≥5000"),
    ("  八节齐几节",              "{iface_secs}/8",                   "8"),
    ("  名录点到 CSS 里几个类",   "{iface_named}/{n_defined}",        "≥90%"),
    ("PLAN.md 字符",              "{plan_chars:,}",                   "≤10000"),
    ("  版式种类 / 缺失 / 相邻重复", "{layouts} / {layout_missing} / {layout_adj}", "≥4 / 0 / 0"),
    ("  split-lr 页数",           "{split_lr}",                      "≤总页数 1/3"),
    ("  数字口径里的真实数值",    "{caliber}",                        "≥20"),
    ("  页表一句话带数",          "{claim_num}/{claims}",             "≥20%"),
    ("lec.js 字符 / P 函数数",    "{lec:,} / {p_fns}",                "函数数↓"),
    ("theme.css 填色的容器类",    "{fill_cls}",                       "≤2"),
    ("规格点名图池文件的份数",    "{named_img}",                      "≥6"),
)


# 硬失败的挑选原则:只挑（a）无歧义的缺陷、（b）改一次提示词或重跑一个产物就能修的。
# 这条流水线的教训是——判据要求模型做一件它无权做的事,代价是 45 次 Edit / 21.4 分钟。
# 随题目变的那些（一句话带数 g14 21% / sol47 3%）只报不失败,否则会被贴边满足。
# **只留一条硬判。** 判据要进这里的条件是:它没有假阳性,而且不合格意味着
# 下游一定拿到错东西。`#stage 有 padding` 满足 —— 缺了整套版心就散。
#
# 「规格表格里的指针格」2026-08-24 从这里拿掉了,降级成报表里的一行数。
# 它的依据本身是实的(消融:规格给实际值而不是键名,同一个建页模型
# Edit 6.5→1.1、画布占满 24/48→44/44、占用比 51%→63%),但**判据有假阳性**:
# `| loss(w₁) | 对两样本的 `Lec.P.bce` 取平均 |` 是合法写法(loss 是函数不是常量,
# 采样值在下一张核对表里,而这正是 spec.md 明文要求的「写公式入口」),
# 和真缺陷「值列里塞指针」在表格几何上无法区分。
# 让一轮正确的规格因为这个被标成失败,代价大于漏报。
HARD = (
    ("#stage 有 padding", lambda g: "有" if g["stage_pad"] else "无", "有", lambda v: v == "有"),
)


def gate(label: str) -> int:
    """打印全表 + 硬判。返回不合格的条数（0 = 全过）。**不删任何产物。**

    planner 和 builder 是两条命令,所以在这里 exit 非零就够了 ——
    操作者在起 builder 之前一定会看到,不需要把几分钟的产物扔掉。
    """
    g = one(label)
    if not g:
        return 1
    bad = []
    print()
    for name, get, want, ok in HARD:
        v = get(g)
        good = ok(v)
        if not good:
            bad.append(name)
        print(f"  {'✓' if good else '✗'} {name:<26} {str(v):>6}   要求 {want}")
    if bad:
        print(f"\n  \033[31m✗ plan 层有 {len(bad)} 条不合格:{'、'.join(bad)}\033[0m")
        print("    产物都在,改完提示词重跑对应那一步即可（cached() 会跳过已好的）")
    else:
        print("\n  \033[32m✓ plan 层硬判全过\033[0m")
    return len(bad)


def main_table(labels: list) -> None:
    """打印判据全表。planner 末尾和命令行都走这一个,不留第二份实现。"""
    got = [r for r in (one(x) for x in labels) if r]
    if not got:
        return
    w = 26
    print("\n  " + "判据".ljust(w) + "".join(g["label"].rjust(15) for g in got)
          + "     目标")
    print("  " + "─" * (w + 15 * len(got) + 10))
    for name, fmt, target in ROWS:
        print("  " + name.ljust(w)
              + "".join(fmt.format(**g).rjust(15) for g in got)
              + "     " + target)
    print()


def main() -> None:
    main_table(sys.argv[1:] or ["ape-g14", "ape-g11", "ape-mm"])


if __name__ == "__main__":
    main()
