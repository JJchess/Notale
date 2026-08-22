#!/usr/bin/env python3
"""生成 ARCHITECTURE.html —— notale-v2 流水线的架构框图。

用脚本算坐标,不手写 SVG。**三条都是踩过才定下来的:**

  · 框高按内容算,不手填。手填的第一版里 `seed()` 的产物条压在说明文字上
    (分隔线 y=94、说明 y=114),`lec.js` 同样 —— 框装不下「名字 + 说明 + 产物」。
  · 连线锚在框的实际边上(`R/L/T/B/CX/CY`),不写字面坐标。
  · 竖向转折一律走**列间空隙**。手算的那版里 expand→theme.css 的竖段从
    y=367 升到 280,正好穿过 CONTRACT.md 的框。空隙里没有东西,穿不着。

图上每个数在 `core/` 里有出处或在 `runs/` 里量过。没量过的不写。
流水线改了就重跑这个脚本。
"""

from pathlib import Path

OUT = Path(__file__).parent / "ARCHITECTURE.html"
svg: list[str] = []

# ── 版面常量 ────────────────────────────────────────────────
W, H = 1560, 830
CW, CGAP = 158, 26                      # 列宽 / 列间空隙
COL = [228 + i * (CW + CGAP) for i in range(6)]
ROW_A, ROW_B = 76, 300                  # 两行的顶
IN_X, IN_W = 20, 166
PL_X, PL_W = 210, 1104
BD_X, BD_W = 1338, 196
GRP_T, GRP_B = 44, 530


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def tw(s: str, size: float) -> float:
    """估文字宽。**不能用 len()** —— 中文一个字算一格,而它渲染出来是 ASCII 的近两倍,
    于是徽标框比实际字窄一半,名字和徽标撞在一起(`CONTRACT.md一次调用`、
    `每页一个 agent50 路` 都是这么来的)。全角按 1em,其余按 0.58em。
    """
    return sum(size if ord(c) > 0x2E80 else size * 0.58 for c in s)


# ── 图元 ────────────────────────────────────────────────────
def group(x, y, w, h, cap):
    svg.append(f'<rect class="grp" x="{x}" y="{y}" width="{w}" height="{h}" rx="8"/>')
    svg.append(f'<rect class="gcap-bg" x="{x+14}" y="{y-9}" '
               f'width="{tw(cap, 11.5)+16:.0f}" height="18" rx="3"/>')
    svg.append(f'<text class="gcap" x="{x+22}" y="{y+4}">{esc(cap)}</text>')


KIND = {"det": ("▤", "det"), "one": ("●", "one"),
        "par": ("⧉", "par"), "art": ("", "art")}


def h_of(notes, out, extra=0) -> int:
    """框高由内容决定。名字块 30 + 每行说明 15 +（产物条 9 + 每行 15 + 底 9）。
    徽标装不进名字那一行时会另占一行,extra 就是那 22px。"""
    h = 30 + extra + 15 * len(notes)
    if out:
        h += 9 + 15 * len(out) + 9
    return max(h, 54)


class Box:
    def __init__(self, x, y, name, kind="one", badge=None, notes=(), out=(),
                 stack=0, w=CW):
        self.x, self.y, self.w = x, y, w
        lab0 = badge if badge is not None else KIND[kind][0]
        self.h = h_of(notes, out,
                      0 if (not lab0 or 11 + tw(name, 13) + tw(lab0, 9.5) + 26 <= w)
                      else 22)
        self.stack = stack
        for i in range(stack, 0, -1):
            d = 6 * i
            svg.append(f'<rect class="ghost" x="{x+d}" y="{y+d}" '
                       f'width="{w}" height="{self.h}" rx="6"/>')
        cls = {"par": "bx par", "det": "bx det", "art": "bx art"}.get(kind, "bx")
        svg.append(f'<rect class="{cls}" x="{x}" y="{y}" '
                   f'width="{w}" height="{self.h}" rx="6"/>')
        svg.append(f'<text class="nm" x="{x+11}" y="{y+21}">{esc(name)}</text>')
        lab = badge if badge is not None else KIND[kind][0]
        cy = y + 30
        if lab:
            bw, k = tw(lab, 9.5) + 12, KIND[kind][1]
            fits = 11 + tw(name, 13) + bw + 14 <= w
            bx, by = (x + w - bw - 9, y + 8) if fits else (x + 11, y + 34)
            if not fits:
                cy = y + 52
            svg.append(f'<rect class="kd kd-{k}" x="{bx:.0f}" y="{by}" '
                       f'width="{bw:.0f}" height="17" rx="3"/>')
            svg.append(f'<text class="kdt kdt-{k}" x="{bx+bw/2:.0f}" '
                       f'y="{by+12.5}" text-anchor="middle">{esc(lab)}</text>')
        for ln in notes:
            cy += 15
            svg.append(f'<text class="nt" x="{x+11}" y="{cy}">{esc(ln)}</text>')
        if out:
            sy = cy + 9
            svg.append(f'<line class="sep" x1="{x+1}" y1="{sy}" '
                       f'x2="{x+w-1}" y2="{sy}"/>')
            for i, ln in enumerate(out):
                yy = sy + 15 * (i + 1) - 3
                if i == 0:
                    svg.append(f'<text class="olb" x="{x+11}" y="{yy}">产物</text>')
                svg.append(f'<text class="oa" x="{x+38}" y="{yy}">{esc(ln)}</text>')

    L = property(lambda s: s.x)
    R = property(lambda s: s.x + s.w)
    T = property(lambda s: s.y)
    B = property(lambda s: s.y + s.h)
    CX = property(lambda s: s.x + s.w / 2)
    CY = property(lambda s: s.y + s.h / 2)


def arrow(pts, label=None, dashed=False, at=None):
    d = " ".join(f"{x:.0f},{y:.0f}" for x, y in pts)
    svg.append(f'<polyline class="{"ed dash" if dashed else "ed"}" points="{d}" '
               f'marker-end="url(#{"arD" if dashed else "arS"})"/>')
    if label:
        mx, my = at if at else ((pts[0][0] + pts[-1][0]) / 2,
                                (pts[0][1] + pts[-1][1]) / 2 - 8)
        bw = tw(label, 10) + 12
        svg.append(f'<rect class="elb-bg" x="{mx-bw/2:.0f}" y="{my-11:.0f}" '
                   f'width="{bw:.0f}" height="16" rx="3"/>')
        svg.append(f'<text class="elb" x="{mx:.0f}" y="{my+1:.0f}" '
                   f'text-anchor="middle">{esc(label)}</text>')


def hop(a: Box, b: Box, gap_x, label=None, at=None):
    """从 a 的右边走到 b 的左边,竖向转折落在列间空隙 gap_x 上 —— 空隙里没有框。"""
    arrow([(a.R, a.CY), (gap_x, a.CY), (gap_x, b.CY), (b.L, b.CY)], label, at=at)


GAP = [COL[i] + CW + CGAP / 2 for i in range(5)]     # 五条列间中线
# 两条空带:A 行框底与 B 行框顶之间、B 行框底与底轨之间。
# 连线标签一律放这里 —— 放在连线中点会盖住框里的说明文字(实测盖了 4 处)。
BAND_A, BAND_B = 272, 462

# ── 输入 ────────────────────────────────────────────────────
group(IN_X, GRP_T, IN_W, GRP_B - GRP_T, "输入")
b_arg = Box(IN_X + 10, GRP_T + 24, "run 参数", "art", w=146,
            notes=("--query", "--minutes 90", "--audience  --scenario"))
b_ch = Box(IN_X + 10, b_arg.B + 20, "--chassis", "art", w=146,
           notes=("base.css · base.js", "CHASSIS.md", "selfcheck.py"))
b_lib = Box(IN_X + 10, b_ch.B + 20, "--lib", "art", w=146,
            notes=("20 个库 + LIBS.md",))
b_sk = Box(IN_X + 10, b_lib.B + 20, "skills/", "art", w=146,
           notes=("53 份技法文档",))

# ── planner ─────────────────────────────────────────────────
group(PL_X, GRP_T, PL_W, GRP_B - GRP_T, "planner   ·   串行 6 步 + 并行 1 步")

seed = Box(COL[0], ROW_A, "seed()", "det",
           notes=("探环境没有判断成分,", "harness 直接做掉"),
           out=("assets/ 四件",))
lec = Box(COL[1], ROW_A, "lec.js", "one",
          notes=("整套共用的计算层", "Lec.K / Lec.P / mount()"),
          out=("assets/lec.js", "→ lec_api·lec_dom"))
plan = Box(COL[2], ROW_A, "PLAN.md", "one", badge="● A 段",
           notes=("全局约束要看整张表,", "所以这一步不能并行"),
           out=("PLAN.md = 页表",))
split = Box(COL[2], ROW_B, "split_deck()", "det",
            notes=("原样落盘",), out=("plan/deck.md",))
exp = Box(COL[3], ROW_B, "expand()", "par", badge="⧉ 20 路", stack=2,
          notes=("每路的输入 =", "deck 全文 + 自己那一行", "彼此不撞车"),
          out=("plan/p01.md", "… plan/pNN.md"))
theme = Box(COL[4], ROW_A, "theme.css", "one",
            notes=("字号档 · 配色语义", "五种骨架的类"),
            out=("assets/theme.css", "INTERFACE→CHASSIS"))
contract = Box(COL[4], ROW_B, "CONTRACT.md", "one",
               notes=("最重的一份提示词", "输入 18,222 字符"),
               out=("CONTRACT.md",))
skel = Box(COL[5], ROW_A, "skeletons()", "det",
           notes=("#stage + <main id=main>", "base/theme/lec 已接线"),
           out=("page-01…NN.html", "（空骨架）"))
brf = Box(COL[5], ROW_B, "briefs()", "det",
          notes=("模板填充,不问模型", "全流程唯一不照抄的一处"),
          out=("briefs.json",))

# ── builder / 交付 ──────────────────────────────────────────
group(BD_X, GRP_T, BD_W, 250, "builder")
agent = Box(BD_X + 12, GRP_T + 26, "每页一个 agent", "par", badge="⧉ 50 路",
            stack=2, w=160,
            notes=("读 deck + 自己那份 pNN", "+ CONTRACT + CHASSIS",
                   "+ 指派的 skill", "只读写自己那一页"),
            out=("page-NN.html", "assets/img/"))
group(BD_X, GRP_T + 282, BD_W, GRP_B - GRP_T - 282, "交付")
deliv = Box(BD_X + 12, GRP_T + 308, "pages/", "art", w=160,
            notes=("page-01…NN.html", "assets/  ·  plan/", "40–60 页 · 1600×900"))

# ── 闸与修补 ────────────────────────────────────────────────
GY = 566
group(PL_X, GY, PL_W, 96, "闸  ⊘  与确定性修补  ⊕")
GATES = [
    ("⊘", "lec.js", "node --check · mount 必须 return 内容容器 · 页码不许拼成字符串"),
    ("⊕", "lec.js", "缺 return 就补 —— V4-Pro 为这一行连烧 3 次、835s、0 页交付"),
    ("⊘", "PLAN.md", "页表对账**只报不判**:停留合计 5400s · 无交互名册 · 相邻同结构"),
    ("⊘", "spec", "开头像推理稿就退回 · 必填小节齐全 · 首行是 # page-NN"),
    ("⊕", "spec", "媒体节点了图却没指派取图 skill 就补上（实测 0 → 7 页）"),
]
for i, (sym, step, txt) in enumerate(GATES):
    y = GY + 24 + i * 15
    svg.append(f'<text class="gsym {"gs-f" if sym == "⊕" else "gs-g"}" '
               f'x="{PL_X+16}" y="{y}">{sym}</text>')
    svg.append(f'<text class="gstep" x="{PL_X+34}" y="{y}">{esc(step)}</text>')
    svg.append(f'<text class="nt" x="{PL_X+120}" y="{y}">'
               f'{esc(txt.replace("**", ""))}</text>')

# ── 贯穿层 ──────────────────────────────────────────────────
LY = 694
group(PL_X, LY, PL_W + BD_W + 24, 110,
      "贯穿层   core/llm.py   ·   每一次模型调用都过这里")
for i, t in enumerate((
    "响应形状白名单 —— reasoning 曾被当成正文流进产物、误导约十轮归因;"
    "没见过的 output item 类型一律吵",
    "空响应只在退避梯子前 3 级重试（限流值得等 300s,空响应不值得） · 超时只重试 2 次",
    "输出上限 60,000,被截断自动加倍一次 · "
    "400 网关抖动按命中的特征词重试,并打印命中的是哪一条 + 原文 300 字符",
)):
    svg.append(f'<text class="nt" x="{PL_X+18}" y="{LY+28+i*18}">{esc(t)}</text>')

# ── 连线 ────────────────────────────────────────────────────
# 这三条 hop 本来标了字,又因为躲框被挪进空带,结果离自己那条线一百多像素、
# 看着像飘着的。而它们要说的话框里已经有了(seed 的产物写着 assets/ 四件、
# lec.js 的产物写着 → lec_api·lec_dom、expand 的说明写着「自己那一行」)——
# 删掉,别为了有标签而有标签。
arrow([(IN_X + IN_W, seed.CY), (seed.L, seed.CY)])
hop(seed, lec, GAP[0])
hop(lec, plan, GAP[1])
arrow([(plan.CX, plan.B), (plan.CX, split.T)])
hop(split, exp, GAP[2])
hop(exp, theme, GAP[3], "后定调性", at=(GAP[3], BAND_A - 22))
arrow([(theme.CX, theme.B), (theme.CX, contract.T)])
hop(contract, skel, GAP[4])
arrow([(skel.CX, skel.B), (skel.CX, brf.T)])
arrow([(brf.R, brf.CY), (PL_X + PL_W + 12, brf.CY),
       (PL_X + PL_W + 12, agent.CY), (agent.L, agent.CY)],
      "指针,不是正文", at=(PL_X + PL_W + 12, BAND_A - 22))
arrow([(agent.CX, agent.B + 12), (agent.CX, deliv.T)])

# skills 走一条底轨,喂给 expand 和 builder
RAIL = 494
arrow([(b_sk.CX, b_sk.B), (b_sk.CX, RAIL), (exp.CX, RAIL), (exp.CX, exp.B + 12)],
      "指派", dashed=True, at=(COL[1], RAIL - 8))
arrow([(exp.CX, RAIL), (agent.CX + 40, RAIL), (agent.CX + 40, agent.B + 12)],
      "读技法文档", dashed=True, at=(COL[5] + 40, RAIL - 8))

# 闸带 → 它守得住的那两处（其余在带内逐条标了归属，不再拉线，避免穿框）
arrow([(lec.CX, GY), (lec.CX, lec.B)], dashed=True)
arrow([(exp.CX - 40, GY), (exp.CX - 40, exp.B + 12)], dashed=True)
# 贯穿层 → 两个 ● 步（带头已写「每一次模型调用都过这里」）
arrow([(contract.CX, LY), (contract.CX, GY + 96)], dashed=True)
arrow([(BD_X + 6, LY), (BD_X + 6, agent.B + 12)], dashed=True)

BODY = "\n".join(svg)

CSS = """
:root{
  --bg:#f3f4f6; --panel:#fff; --panel2:#e9ecf0; --panel3:#f7f8fa;
  --line:#ccd3da; --grp:#a8b2be; --fg:#171b21; --dim:#5b6572;
  --brass:#8a6512; --teal:#1c6a63; --clay:#9c4436; --moss:#4a6d35; --steel:#5f6b78;
  --mono:ui-monospace,SFMono-Regular,Menlo,"DejaVu Sans Mono",monospace;
  --sans:system-ui,-apple-system,"Noto Sans SC","PingFang SC",sans-serif;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#111519; --panel:#1a212a; --panel2:#151b22; --panel3:#1e2630;
  --line:#2c3742; --grp:#3c4854; --fg:#e6e9ec; --dim:#8f99a5;
  --brass:#c8982f; --teal:#4fa79e; --clay:#c9705f; --moss:#8bb26d; --steel:#8795a3;
}}
:root[data-theme="dark"]{
  --bg:#111519; --panel:#1a212a; --panel2:#151b22; --panel3:#1e2630;
  --line:#2c3742; --grp:#3c4854; --fg:#e6e9ec; --dim:#8f99a5;
  --brass:#c8982f; --teal:#4fa79e; --clay:#c9705f; --moss:#8bb26d; --steel:#8795a3;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 var(--sans);
     padding:38px 26px 64px}
.wrap{max-width:1600px;margin:0 auto}
h1{font:600 25px/1.25 var(--sans);margin:0 0 6px;letter-spacing:-.01em}
.sub{color:var(--dim);font-size:14px;margin:0;max-width:72ch}
.sub b{color:var(--fg);font-weight:600}
.legend{display:flex;flex-wrap:wrap;gap:7px 20px;margin:20px 0 0;
        font:12px/1 var(--mono);color:var(--dim)}
.legend span{display:flex;align-items:center;gap:6px}
.legend em{font-style:normal;font-size:13px}
.k-det{color:var(--steel)} .k-one{color:var(--fg)} .k-par{color:var(--teal)}
.k-g{color:var(--clay)} .k-f{color:var(--moss)} .k-a{color:var(--brass)}
.dg{overflow-x:auto;margin:16px 0 0;padding:6px 0 12px}
svg.arch{display:block;width:1560px;height:auto;max-width:none}

.grp{fill:none;stroke:var(--grp);stroke-width:1;stroke-dasharray:5 4}
.gcap-bg{fill:var(--bg)}
.gcap{font:600 11.5px var(--mono);fill:var(--dim);letter-spacing:.04em}
.bx{fill:var(--panel);stroke:var(--line)}
.bx.det{fill:var(--panel2)}
.bx.art{fill:var(--panel3)}
.bx.par{stroke:var(--teal);stroke-width:1.4}
.ghost{fill:var(--panel);stroke:var(--teal);opacity:.3}
.nm{font:600 13px var(--mono);fill:var(--fg)}
.kd{fill:none;stroke:var(--line)}
.kd-par{stroke:var(--teal)}
.kdt{font:9.5px var(--mono);fill:var(--dim)}
.kdt-par{fill:var(--teal)} .kdt-det{fill:var(--steel)}
.nt{font:10.5px var(--sans);fill:var(--dim)}
.sep{stroke:var(--line)}
.olb{font:9px var(--mono);fill:var(--dim);letter-spacing:.09em}
.oa{font:10.5px var(--mono);fill:var(--brass)}
.ed{fill:none;stroke:var(--fg);stroke-width:1.3;opacity:.7}
.ed.dash{stroke:var(--dim);stroke-dasharray:4 4;stroke-width:1.1;opacity:.85}
.elb-bg{fill:var(--bg)}
.elb{font:10px var(--mono);fill:var(--dim)}
.gsym{font:11px var(--mono)} .gs-g{fill:var(--clay)} .gs-f{fill:var(--moss)}
.gstep{font:600 10.5px var(--mono);fill:var(--fg)}

.tw{overflow-x:auto;margin:30px 0 0}
table{border-collapse:collapse;width:100%;min-width:680px;font-size:13px}
caption{text-align:left;font:600 13px/1.5 var(--mono);padding:0 0 8px}
th,td{text-align:right;padding:7px 10px;border-bottom:1px solid var(--line);
      font-variant-numeric:tabular-nums}
th:first-child,td:first-child{text-align:left;font-family:var(--mono);font-size:12.5px}
thead th{color:var(--dim);font-weight:500;font-size:12px;white-space:nowrap}
tbody tr:last-child td{border-bottom:0}
td.hl{color:var(--brass);font-family:var(--mono)}
.note{font-size:12.5px;color:var(--dim);margin:12px 0 0;max-width:82ch}
@media (max-width:640px){body{padding:26px 14px 50px}}
"""

ROWS = [
    ("ape-g5", "GPT-5.6-Sol", "48", "—", "—", "48/48", "0", {6}),
    ("ape-g6", "GPT-5.6-Sol", "48", "48 份 / 171s", "460s", "48/48 · 5.8 分",
     "10（内嵌）", {3, 4, 5, 6}),
    ("ape-ds2", "DeepSeek-V4-Flash", "50", "—", "—", "49/50", "8（文件）", set()),
    ("ape-dspro", "DeepSeek-V4-Pro", "40", "—", "—", "40/40",
     "12（文件 8 + 远程 4）", set()),
    ("ape-dspro2", "DeepSeek-V4-Pro", "0", "—", "死在 mount 闸 835s", "未起",
     "0", {2, 4}),
    ("ape-dspro3", "DeepSeek-V4-Pro", "60", "60 份 / 159s", "640s", "56/60 进行中",
     "50+（文件）", {3, 4}),
    ("nn-11", "Opus 5 · 裸跑对照", "44", "44 份串行 ≈ 25 分", "43.7 分", "44/44",
     "20", set()),
]
trs = "\n".join(
    "    <tr>" + "".join(
        f'<td{" class=\"hl\"" if i in hl else ""}>{c}</td>'
        for i, c in enumerate(cells)) + "</tr>"
    for *cells, hl in ROWS)

OUT.write_text(f"""<title>notale-v2 流水线</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>{CSS}</style>

<div class="wrap">
<h1>notale-v2 流水线</h1>
<p class="sub">一次完整 run 的阶段、产物和并行度。<b>图上每个数都量过</b> —— 没量过的不写。</p>

<div class="legend">
  <span class="k-det"><em>▤</em> 确定性,零模型调用</span>
  <span class="k-one"><em>●</em> 一次模型调用</span>
  <span class="k-par"><em>⧉</em> N 路并行（框在后面叠）</span>
  <span class="k-g"><em>⊘</em> 闸</span>
  <span class="k-f"><em>⊕</em> 确定性修补</span>
  <span class="k-a"><em>▬</em> 金色 = 产物</span>
  <span><em>⇠</em> 虚线 = 注入/引用,不是流程</span>
</div>

<div class="dg">
<svg class="arch" viewBox="0 0 {W} {H}" role="img"
     aria-label="notale-v2 流水线架构图:输入 → planner 六步串行加一步并行 → builder N 路并行 → 交付">
<defs>
  <marker id="arS" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7"
          markerHeight="7" orient="auto-start-reverse">
    <path d="M0,1 L9,5 L0,9 z" fill="var(--fg)" opacity=".7"/></marker>
  <marker id="arD" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6"
          markerHeight="6" orient="auto-start-reverse">
    <path d="M0,1 L9,5 L0,9 z" fill="var(--dim)" opacity=".85"/></marker>
</defs>
{BODY}
</svg>
</div>

<div class="tw">
<table>
  <caption>实测 · 同题 Apeman – Spaceman / 90 分钟 / 同一套闸</caption>
  <thead><tr><th>轮次</th><th>模型</th><th>页</th><th>规格展开</th>
    <th>planner 合计</th><th>builder</th><th>能显示的图</th></tr></thead>
  <tbody>
{trs}
  </tbody>
</table>
</div>
<p class="note">最后一行不是这条流水线的产物,是 Claude Code × Opus 5 自己搭的 harness,
作对照用。「规格展开」那一栏是全图最大的一处差距:同样的活,串行 25 分钟对并行 171 秒 ——
这一条已经反向落实回 lab 的指令了。</p>
</div>
""", encoding="utf-8")
print(f"{OUT.name}  {len(OUT.read_text(encoding='utf-8')):,} 字符  "
      f"{len(svg)} 个图元")
