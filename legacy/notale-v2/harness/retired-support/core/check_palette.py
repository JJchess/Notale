#!/usr/bin/env python3
"""主题配色落在哪套 AI 默认里。

    python3 -m core.check_palette                    # 扫全部 runs
    python3 -m core.check_palette --label a --label b
    python3 -m core.check_palette --json

## 为什么需要这条

2026-08-27 把全仓 58 份 `theme.css` 按底色分类,结果是:

    奶油纸张   26  45%      暗底科技   27  47%      其他   5  9%

**53/58 = 91% 落在两套已被公开记录的模型默认里**(这个数由本工具自己算出,
别在注释里另写一个 —— 早先那份一次性脚本按 57 轮报的 93% 就和这里对不上),
而在此之前这件事在这个仓库里完全不可观测 ——
`plan_quality` 数的是字符数和类名覆盖率,`selfcheck` 数的是越界和占用比,
没有任何一条判据看过"这套颜色是不是模型的条件反射"。

判据一律取自现成实现,不自己发明:

  cream   `pbakaus/impeccable` 的 `isCreamColor()` 原式(checks.mjs)——
          min(R,G,B) ≥ 209 且 R ≥ G ≥ B 且 6 ≤ R−B ≤ 48。**它可以口算**,
          所以适合当判据;那个仓库里别的阈值是检测器代码,不搬。
  dead    R=G=B 的死中性。中性色没有冷暖倾向,整套会读成逐组件生成的。
  timid   `avoid-ai-design` C4 / Anthropic 官方都列的 P0:几个颜色明度接近、
          没有主色也没有锐利强调。这里量的是语义色明度的极差。

**只报不判。** 这是一张体检表,不是闸 —— 一个题目确实需要暖米白时不该被拦下,
而"需不需要"这件事只有看过 `## 视觉论点` 才能判断。
"""

from __future__ import annotations

import argparse
import colorsys
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.llm import RUNS_ROOT  # noqa: E402

# 语义色 token 的名字不固定(每轮由模型自己定),所以按"不是中性名"来筛。
NEUTRAL = re.compile(r"--(bg|paper|surface|text|ink|muted|rule|line|border|"
                     r"grid|shadow|focus)\b")


def _rgb(h: str) -> tuple[int, int, int]:
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


def is_cream(h: str) -> bool:
    """`impeccable` 的 isCreamColor() 原式,逐字照搬。"""
    r, g, b = _rgb(h)
    return min(r, g, b) >= 209 and r >= g >= b and 6 <= r - b <= 48


def lightness(h: str) -> float:
    r, g, b = (c / 255 for c in _rgb(h))
    return colorsys.rgb_to_hls(r, g, b)[1] * 100


def hue_sat(h: str) -> tuple[float, float]:
    r, g, b = (c / 255 for c in _rgb(h))
    H, _, S = colorsys.rgb_to_hls(r, g, b)
    return H * 360, S * 100


def one(css_path: Path) -> dict | None:
    if not css_path.is_file():
        return None
    raw = css_path.read_text(encoding="utf-8")
    css = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)   # 接口块里全是散文,先剥掉
    m = re.search(r"--bg\s*:\s*(#[0-9A-Fa-f]{6})", css)
    if not m:
        return None
    bg = m.group(1).upper()

    tokens = {n: v.upper() for n, v in
              re.findall(r"(--[a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})", css)}
    neutrals = {n: v for n, v in tokens.items() if NEUTRAL.search(n)}
    semantic = {n: v for n, v in tokens.items() if n not in neutrals}
    dead = [n for n, v in neutrals.items() if v[1:3] == v[3:5] == v[5:7]]
    ls = sorted(lightness(v) for v in semantic.values())
    # 语义色只有一两个时谈不上"平均分色",极差没有意义。
    spread = (ls[-1] - ls[0]) if len(ls) >= 3 else None
    cyan = [n for n, v in semantic.items() if 165 <= hue_sat(v)[0] <= 205
            and hue_sat(v)[1] > 40]

    if is_cream(bg):
        family = "奶油纸张"
    elif lightness(bg) < 20:
        family = "暗底科技"
    else:
        family = "其他"

    return {
        "label": css_path.parents[2].name, "bg": bg, "family": family,
        "neutrals": len(neutrals), "dead": len(dead),
        "semantic": len(semantic), "cyan": len(cyan),
        "spread": spread,
        "glow": len(re.findall(r"box-shadow[^;]*rgba?\(", css)),
        "gradient_text": len(re.findall(r"background-clip\s*:\s*text", css)),
        "blur": len(re.findall(r"backdrop-filter|filter:\s*blur", css)),
    }


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--label", action="append")
    a.add_argument("--json", action="store_true")
    n = a.parse_args()

    labels = n.label or sorted(p.name for p in RUNS_ROOT.iterdir() if p.is_dir())
    rows = [r for r in (one(RUNS_ROOT / x / "pages" / "assets" / "theme.css")
                        for x in labels) if r]
    if not rows:
        raise SystemExit("✗ 没找到任何 theme.css")

    if n.json:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
        return

    w = max(len(r["label"]) for r in rows) + 2
    print(f"\n  {'run':<{w}}{'--bg':>9}  {'家族':<9}{'死中性':>8}{'语义色':>8}"
          f"{'明度极差':>10}{'青':>4}{'glow':>6}{'渐变字':>7}")
    print("  " + "─" * (w + 63))
    for r in rows:
        sp = f"{r['spread']:.0f}pp" if r["spread"] is not None else "—"
        print(f"  {r['label']:<{w}}{r['bg']:>9}  {r['family']:<9}"
              f"{str(r['dead']) + '/' + str(r['neutrals']):>8}{r['semantic']:>8}{sp:>10}"
              f"{r['cyan']:>4}{r['glow']:>6}{r['gradient_text']:>7}")

    if len(rows) > 3:
        from collections import Counter
        c = Counter(r["family"] for r in rows)
        tot = len(rows)
        print(f"\n  {tot} 轮：" + "   ".join(
            f"{k} {v} ({v / tot * 100:.0f}%)" for k, v in c.most_common()))
        hit = c["奶油纸张"] + c["暗底科技"]
        print(f"  落在两套已记录的模型默认里：{hit}/{tot}  {hit / tot * 100:.0f}%")


if __name__ == "__main__":
    main()
