#!/usr/bin/env python3
"""质量参照画廊:给 Style Director 当选材台。

    python3 -m core.gallery --index | head        # 204 行索引(第一次调用看的东西)
    python3 -m core.gallery --facts escapement anthems

画廊本体在 `Notale/refs/quality`(gitignore,只在本机)。这里只做两件事:
把 catalog.json 摊成一行一条的索引,以及把首屏截图量成配色事实。

**配色是量出来的,不是标出来的。** 首屏截图缩到 160×90 之后取前 5 个主色,
记 HSL 与面积占比。为什么用截图不用源码:源码只有一部分参照有(金样本和克隆的
仓库),而且 CSS 里的 token 值不等于观感 —— 一个只在角落出现的强调色和一个铺满
底的颜色在 CSS 里长得一样。观感只能从渲染结果上量。

量出来的东西缓存在 `refs/quality/palette.json`,首次运行约 40 秒,之后直接读。
"""
from __future__ import annotations

import argparse
import colorsys
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GALLERY = ROOT.parent / "refs" / "quality"
CACHE = "palette.json"
BANDS = ((0, 20), (20, 40), (40, 60), (60, 80), (80, 101))   # 底色明度分段


def _hsl(rgb) -> tuple[int, int, int]:
    r, g, b = (c / 255 for c in rgb)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return round(h * 360), round(s * 100), round(l * 100)


def _palette(png: Path, k: int = 5) -> list[dict]:
    from PIL import Image
    im = Image.open(png).convert("RGB")
    im.thumbnail((160, 90))
    q = im.quantize(colors=k, method=Image.Quantize.FASTOCTREE)
    pal, total = q.getpalette()[: k * 3], im.width * im.height
    out = []
    for n, i in sorted(q.getcolors(), reverse=True):
        rgb = tuple(pal[i * 3: i * 3 + 3])
        h, s, l = _hsl(rgb)
        out.append({"hex": "#%02X%02X%02X" % rgb, "h": h, "s": s, "l": l,
                    "share": round(n / total * 100)})
    return out


def measure(gallery: Path = GALLERY, force: bool = False) -> list[dict]:
    """每条参照一行:id、来源、标题、首屏配色、截图绝对路径。"""
    cache = gallery / CACHE
    if cache.is_file() and not force:
        return json.loads(cache.read_text(encoding="utf-8"))
    notale = gallery.parents[1]
    rows = []
    for e in json.loads((gallery / "catalog.json").read_text(encoding="utf-8")):
        if not e.get("shots"):
            continue
        # 金样本的路径相对 Notale 根,活页截图的相对 refs/quality —— catalog.json
        # 就是这么写的,这里照它的口径解析,别统一成一种否则一半找不到。
        shot = (notale if e["source"] == "sample" else gallery) / e["shots"][0]
        if not shot.is_file():
            continue
        try:
            pal = _palette(shot)
        except Exception:
            continue
        rows.append({"id": e["id"], "src": e["source"],
                     "title": (e.get("title") or e["id"])[:60],
                     "pal": pal, "shot": str(shot)})
    cache.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    return rows


def band(l: float) -> int:
    for i, (lo, hi) in enumerate(BANDS):
        if lo <= l < hi:
            return i
    return len(BANDS) - 1


def index_text(rows: list[dict] | None = None) -> str:
    """第一次调用看的东西:一行一条,只有标题和量出来的颜色,没有风格标签。

    不给它风格流派词(极简主义/玻璃拟态之类)是刻意的 —— 那种词汇是外来的分类法,
    会把《史记》这样的题目削到最近的西方流派上去。给事实,让它自己判断。
    """
    rows = rows or measure()
    out = []
    for r in rows:
        bg = r["pal"][0]
        acc = " ".join(f"{p['hex']}({p['share']}%)" for p in r["pal"][1:4])
        out.append(f"{r['id']}\t{r['src']}\t{r['title']}\t主色 {bg['hex']} H{bg['h']} S{bg['s']} L{bg['l']}\t次 {acc}")
    return "\n".join(out)


def facts(ids: list[str], rows: list[dict] | None = None) -> list[dict]:
    by = {r["id"]: r for r in (rows or measure())}
    return [by[i] for i in ids if i in by]


def distribution(rows: list[dict] | None = None) -> dict:
    """画廊底色明度的分布,当正面参照用(闸一比的就是它)。"""
    rows = rows or measure()
    ls = [r["pal"][0]["l"] for r in rows]
    n = len(ls)
    return {"n": n,
            "dark": round(sum(1 for l in ls if l < 30) / n * 100),
            "mid": round(sum(1 for l in ls if 30 <= l <= 70) / n * 100),
            "light": round(sum(1 for l in ls if l > 70) / n * 100),
            "median": sorted(ls)[n // 2]}


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--index", action="store_true")
    a.add_argument("--facts", nargs="*")
    a.add_argument("--dist", action="store_true")
    a.add_argument("--remeasure", action="store_true")
    a.add_argument("--gallery", default=str(GALLERY))
    n = a.parse_args()
    rows = measure(Path(n.gallery), force=n.remeasure)
    if n.index:
        print(index_text(rows))
    if n.facts:
        print(json.dumps(facts(n.facts, rows), ensure_ascii=False, indent=1))
    if n.dist or not (n.index or n.facts):
        print(f"{len(rows)} 条  明度分布 {distribution(rows)}")


if __name__ == "__main__":
    main()
