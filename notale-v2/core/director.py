#!/usr/bin/env python3
"""Style Director —— 只决定这一套内容长什么样,不碰内容本身。

    python3 -m core.director --label <run> --query "《…》" [--audience …] [--scenario …]

两次调用,中间夹一段确定性的取材:

    ① 选参照   画廊 204 行索引(标题 + 量出来的颜色)→ 挑 5 条,每条一句理由
    ② 写主题   5 张截图 + 它们的量化事实 + 字体表 + 配色禁令 → 一份 theme.css

**为什么值得单独一步。** 在此之前 theme.css 是 planner 写页表时顺手的产物:同一次响应、
同一个思路、没有任何视觉证据。结果是 62 套去重后的主题里 57 套浅底、色相挤在两格、
语义色明度极差中位 17.6pp,而画廊那 204 条真人页面是深底 43% / 中间调 13% / 浅底 44%。
明说「风格自适应」不动、换模型不动 —— 因为盲写的结果由模型的默认决定,跟题目无关。

**为什么两次而不是一次。** 第一次只看得见文本索引(26KB),第二次只看得见 5 张图。
合成一次的话要么把 204 条的图全塞进去(做不到),要么让它对着文字凭空定色(等于没有证据)。

**闸在 harness 这边,不在提示词里。** 四条:落进画廊的明度分布、cream/死中性/明度极差、
theme.css 不许出现形状声明、字体必须真的装了。不合格把判据回传重写。
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import subprocess
import time
import uuid
from pathlib import Path

from . import gallery, llm, planner, skills
from .check_palette import is_cream, lightness, hue_sat

TRIES = 3
PICKS = 5
# 只抓真正的形状**属性**。`\b` 会让 `--font-display:` 命中 `display:` —— 实测两个模型
# 都因此被误判打回,而它们写的是合法的字体 token。前面加「不许是字母/连字符」这一条。
SHAPE = re.compile(r"(?<![\w-])(border-radius|border|display|position|box-shadow)\s*:", re.I)


def fonts_installed() -> list[str]:
    """本机装了什么字体。不给这张表它会发明字体名(实测)。"""
    out = []
    for lang in ("zh", "en"):
        try:
            r = subprocess.run(["fc-list", f":lang={lang}", "family"],
                               capture_output=True, text=True, timeout=20).stdout
        except Exception:
            continue
        for line in r.splitlines():
            out += [x.strip() for x in line.split(",") if x.strip()]
    seen, uniq = set(), []
    for f in out:
        if f.lower() not in seen:
            seen.add(f.lower())
            uniq.append(f)
    return uniq


def _write_spec(path: Path) -> list[dict]:
    return [{"type": "function", "name": "Write", "description": "写完整文件",
             "parameters": {"type": "object", "properties": {
                 "file_path": {"type": "string", "description": f"绝对路径,只能是 {path}"},
                 "content": {"type": "string", "description": "完整内容"}},
                 "required": ["file_path", "content"], "additionalProperties": False}}]


def _one_write(r, target: Path) -> tuple[str | None, list[str]]:
    """从一次响应里取出唯一一个 Write 的内容。"""
    bad = []
    got = None
    for c in [o for o in r.output if getattr(o, "type", "") == "function_call"]:
        if c.name != "Write":
            bad.append(f"只给了 Write,不该调 {c.name}")
            continue
        try:
            a = json.loads(c.arguments or "{}")
        except json.JSONDecodeError as ex:
            bad.append(f"Write 参数不是合法 JSON({ex}) —— 多半被截断了")
            continue
        p = Path(str(a.get("file_path") or ""))
        if p.resolve() != target.resolve():
            bad.append(f"不许写 {p};这一步只能写 {target}")
            continue
        got = str(a.get("content") or "")
    if got is None and not bad:
        bad.append("没有调用 Write")
    return got, bad


def _call(instructions: str, content, spec, effort: str, log, tag: str) -> object:
    started = planner._now()
    hist = [{"role": "user", "content": content}]
    r = llm.respond(instructions, hist, spec, effort, tag=tag)
    tin, tout, cached = llm.usage_of(r)
    log.add([{"type": "text", "text": tag}], llm.text_of(r),
            {"input_tokens": tin, "output_tokens": tout,
             "cache_read_input_tokens": cached or 0},
            getattr(r, "id", None) or f"req_{uuid.uuid4().hex[:16]}",
            started, planner._now(), {"step": tag})
    return r, tin, tout


# ── ① 选参照 ────────────────────────────────────────────────────────────────
def pick(run, rows: list[dict], effort: str) -> list[dict]:
    out = run.root / "style-picks.tsv"
    prompt = run.prompt("style-pick", query=run.query, audience=run.audience,
                        scenario=run.scenario or "（没写）", n=len(rows),
                        index=gallery.index_text(rows), out_path=out)
    by = {r["id"]: r for r in rows}
    for attempt in range(1, TRIES + 1):
        t0 = time.time()
        r, tin, tout = _call(planner.IDENTITY, prompt, _write_spec(out), effort,
                             run.log, "style-pick")
        text, bad = _one_write(r, out)
        picks = []
        if text:
            for line in text.splitlines():
                pid = line.split("\t")[0].strip().strip("`\"' ")
                if pid in by and pid not in [p["id"] for p in picks]:
                    picks.append(by[pid])
            unknown = [l.split("\t")[0].strip() for l in text.splitlines()
                       if l.strip() and l.split("\t")[0].strip().strip("`\"' ") not in by]
            if unknown:
                bad.append(f"这些 id 不在画廊里:{unknown[:4]}")
        if len(picks) != PICKS:
            bad.append(f"要 {PICKS} 条,给了 {len(picks)} 条")
        bands = {gallery.band(p["pal"][0]["l"]) for p in picks}
        if len(bands) < 3:
            bad.append(f"5 条只跨了 {len(bands)} 个明度档,至少要 3 个"
                       f"（现在是 {sorted(p['pal'][0]['l'] for p in picks)}）")
        print(f"  选参照 第{attempt}次 {time.time()-t0:5.1f}s in={tin:,} out={tout:,} "
              f"→ {[p['id'] for p in picks] or '无'}")
        if not bad:
            out.write_text(text, encoding="utf-8")
            return picks
        if attempt == TRIES:
            raise RuntimeError(f"选参照失败({TRIES} 次): {'; '.join(bad)}")
        prompt = prompt + "\n\n上一次不合格：" + "；".join(bad) + "。重挑。"
    raise AssertionError("unreachable")


# ── ② 写主题 ────────────────────────────────────────────────────────────────
def _facts_block(picks: list[dict]) -> str:
    out = []
    for p in picks:
        bg = p["pal"][0]
        acc = "、".join(f"{x['hex']} H{x['h']} S{x['s']} L{x['l']} 占 {x['share']}%"
                       for x in p["pal"][1:4])
        out.append(f"- {p['id']}（{p['title']}）底 {bg['hex']} H{bg['h']} S{bg['s']} L{bg['l']}；次 {acc}")
    return "\n".join(out)


def _images(picks: list[dict], width: int = 900) -> list[dict]:
    """截图缩到 900 宽再发。原图 1600×900 的 PNG 单张 1–3MB,五张的 base64 载荷
    十几 MB —— 那不是省钱问题,是有的路由直接打回或者超时。JPEG 72 之后单张约 100KB。"""
    from io import BytesIO
    from PIL import Image
    blocks = []
    for p in picks:
        im = Image.open(p["shot"]).convert("RGB")
        im.thumbnail((width, width))
        buf = BytesIO()
        im.save(buf, "JPEG", quality=72)
        blocks.append({"type": "input_image",
                       "image_url": "data:image/jpeg;base64,"
                                    + base64.b64encode(buf.getvalue()).decode()})
    return blocks


# 语义色明度极差的下限。**这个数是量出来的,不是拍的**:画廊 204 条真人页面的
# 次色(2–4)明度极差中位 37pp、25 分位 21pp,而我们 62 套主题的中位只有 17.6pp。
# 取 20 ≈ 人做的东西的 25 分位 —— 四分之三的真人页面能过,我们的历史中位过不了。
# 早先拍脑袋定的 25 会把 31% 的真人页面判死,实测也让 2/4 个题目三次全废。
SPREAD_MIN = 20
ANCHOR_MAX = 15   # 底色明度必须贴近它自己挑的某一条参照

# 「承载面」token 的黑名单。2026-09-06 实测:ens-sd 那轮主题里只有一个 --surface
# (接口注释写着「内容承载面｜图表底、媒体占位」),24 页里 18 页把它铺成了块,
# var(--surface) 用了 51 次,类名直接叫 .card / .metric-box / .summary-card。
# 建页 agent 画框不是它的癖好,是我们在共享层发了颜料 —— 所以刀落在这里,
# 而不是再去管建页那一步。
SURFACE = re.compile(r"--(surface|panel|card|board|tile|box|chip|well|sheet|plate)\b", re.I)
SURFACE_WORDS = re.compile(r"(承载面|底板|卡片底|面板|容器背景|区块底色)")


def gates(css: str, dist: dict, fonts: list[str], picks: list[dict] | None = None) -> list[str]:
    """闸。判据都能算,不靠读感。

    **不写方向,只写关系。** 一度在提示词里写过「我们 57/62 套是浅底、画廊 43% 是深底」,
    读起来就成了「去深底」:四个题目里三个立刻扎进同一片黑,两两 ΔE 只有 1.6。
    删掉之后又整体退回浅灰(ΔE 5.0)。所以底色的约束改成**跟它自己挑的参照挂钩** ——
    深浅都行,但要贴着这个题目选中的某一条真人页面,而不是贴着一句全局统计。
    """
    bad = []
    if css.lstrip().startswith("```"):
        bad.append("不能有 markdown 代码围栏")
    if "==== INTERFACE ====" not in css or "==== /INTERFACE ====" not in css:
        bad.append("缺少完整的 INTERFACE 接口块")
    bare = re.sub(r"/\*.*?\*/", "", css, flags=re.S)

    m = re.search(r"--bg\s*:\s*(#[0-9A-Fa-f]{6})", bare)
    if not m:
        bad.append("没有定义 --bg")
    else:
        bg = m.group(1)
        L = lightness(bg)
        if is_cream(bg):
            bad.append(f"底色 {bg} 命中奶油纸张判据")
        if "论点" not in css:
            bad.append("接口块缺「论点」行")
        if picks:
            near = [(p["id"], p["pal"][0]["l"]) for p in picks
                    if abs(p["pal"][0]["l"] - L) <= ANCHOR_MAX]
            if not near:
                have = "、".join(f"{p['id']} L{p['pal'][0]['l']}" for p in picks)
                bad.append(f"底色 {bg}（L{L:.0f}）不贴近你自己挑的任何一条参照（{have}）;"
                           f"要么换个明度,要么这一步就不该挑这几条")
    # 语义色明度极差:平均分色是响得最狠的一条
    # 派生 token(反相文字、覆色、浅色变体)不算语义色 —— 它们跟着别人走,
    # 混进来会让极差被一个深色反相值撑大,闸就白设了。
    sem = [v for k, v in re.findall(r"(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})", bare)
           if not re.search(r"bg|paper|surface|text|ink|muted|rule|border|line"
                            r"|tint|soft|on-|-on|shade|fade|dim", k)]
    if len(sem) >= 3:
        ls = sorted(lightness(v) for v in sem)
        if ls[-1] - ls[0] < SPREAD_MIN:
            bad.append(f"语义色明度极差只有 {ls[-1]-ls[0]:.0f}pp,平均分色;"
                       f"要一个主色扛整页 + 一个小面积锐利强调")
    # 死中性
    neut = [v for k, v in re.findall(r"(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})", bare)
            if re.search(r"bg|paper|surface|muted|rule|border|line|text|ink", k)]
    dead = [v for v in neut if len({v[1:3], v[3:5], v[5:7]}) == 1]
    if len(dead) >= 2:
        bad.append(f"{len(dead)} 个中性 token 是死灰(R=G=B):{dead[:3]}")
    # 形状
    shapes = sorted({s.strip(": ").lower() for s in SHAPE.findall(bare)})
    if shapes:
        bad.append(f"共享层不许出现形状声明:{shapes}")
    # 承载面:名字和语义描述两头都堵。只堵名字的话它会改叫 --panel-bg 继续发同一张许可。
    faces = sorted({m.group(0) for m in SURFACE.finditer(bare)})
    if faces:
        bad.append(f"不许定义承载面 token:{faces};分组靠留白与对齐,不靠给每块垫底色")
    words = sorted({m.group(0) for m in SURFACE_WORDS.finditer(css)})
    if words:
        bad.append(f"接口块里不许把 token 说成{words};底只有 --bg 一个")
    # 字体
    low = {f.lower() for f in fonts}
    for fam in re.findall(r"--font-[\w-]+\s*:\s*([^;]+);", bare):
        first = fam.split(",")[0].strip().strip("\"'")
        if first and first.lower() not in low and not first.startswith("var("):
            bad.append(f"字体 `{first}` 本机没装,只能用给出的那张表里的")
    return bad


def theme(run, picks: list[dict], effort: str, workflow_root: Path) -> str:
    out = run.root / "pages" / "assets" / "theme.css"
    dist = gallery.distribution()
    fonts = fonts_installed()
    body = run.prompt("style-theme", query=run.query, audience=run.audience,
                      scenario=run.scenario or "（没写）",
                      canvas_w=run.canvas[0], canvas_h=run.canvas[1], n=len(picks),
                      facts=_facts_block(picks),
                      direction=skills.direction_block(run.prompts, menus=run.direction_menus),
                      theme_bans=skills.theme_slop_block(workflow_root),
                      fonts="、".join(fonts[:60]),
                      font_floor=skills.FONT_FLOOR, out_path=out)
    imgs = _images(picks)
    for attempt in range(1, TRIES + 1):
        t0 = time.time()
        # responses 那条 wire 只认 input_text/input_image;写成 "text" 会 400。
        content = [{"type": "input_text", "text": body}] + imgs
        r, tin, tout = _call(planner.IDENTITY, content, _write_spec(out), effort,
                             run.log, "style-theme")
        css, bad = _one_write(r, out)
        bad += gates(css, dist, fonts, picks) if css else []
        print(f"  写主题 第{attempt}次 {time.time()-t0:5.1f}s in={tin:,} out={tout:,} "
              f"→ {len(css or '')} 字符" + (f"  ✗ {'; '.join(bad)[:110]}" if bad else "  ✓"))
        if not bad:
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(css, encoding="utf-8")
            return css
        if attempt == TRIES:
            (run.root / "style.rejected.json").write_text(
                json.dumps({"bad": bad, "css": css}, ensure_ascii=False, indent=1),
                encoding="utf-8")
            raise RuntimeError(f"主题不合格({TRIES} 次): {'; '.join(bad)}")
        body = body + "\n\n上一次不合格：" + "；".join(bad) + "。重写整份文件。"
    raise AssertionError("unreachable")


def direct(run, effort: str, workflow_root: Path = None) -> dict:
    workflow_root = workflow_root or skills.WORKFLOWS
    t0 = time.time()
    rows = gallery.measure()
    print(f"\n▸ style director · {run.label}\n  画廊 {len(rows)} 条  分布 {gallery.distribution(rows)}\n")
    picks = pick(run, rows, effort)
    css = theme(run, picks, effort, workflow_root)
    print(f"  合计 {time.time()-t0:.0f}s  →  {run.root/'pages/assets/theme.css'}")
    return {"picks": [p["id"] for p in picks], "css_chars": len(css)}


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--label", required=True)
    a.add_argument("--query", required=True)
    a.add_argument("--minutes", type=int, default=90)
    a.add_argument("--audience", default="学过一点相关基础、但没系统学过这个题目的读者")
    a.add_argument("--scenario", default="")
    a.add_argument("--effort", default=None)
    a.add_argument("--model")
    a.add_argument("--base-url")
    a.add_argument("--key-env")
    a.add_argument("--wire", choices=("responses", "chat", "messages"))
    n = a.parse_args()
    cfg = llm.config() if hasattr(llm, "config") else None
    if n.model:
        planner.config()["model"]["name"] = n.model
    if n.base_url:
        planner.config()["model"]["base_url"] = n.base_url
    if n.key_env:
        planner.config()["model"]["api_key_env"] = n.key_env
    if n.wire:
        planner.config()["model"]["wire_api"] = n.wire
    effort = n.effort or planner.config()["planner"]["reasoning_effort"]
    run = planner.Run(n.query, n.minutes, n.audience, n.label, n.scenario)
    print(json.dumps(direct(run, effort), ensure_ascii=False))


if __name__ == "__main__":
    main()
