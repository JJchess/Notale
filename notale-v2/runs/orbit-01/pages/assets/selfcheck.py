#!/usr/bin/env python3
"""把页面真正渲染一遍,报告渲染时发生了什么。

    python3 assets/selfcheck.py page-09.html        # 一页
    python3 assets/selfcheck.py                     # pages/ 下所有页
    python3 assets/selfcheck.py page-09.html --shot # 另存一张截图,路径会打印出来

按 1600×900 的视口用无头 Chromium 打开,等页面跑起来,然后报告:

  · JS 报错、console.error、加载失败的资源(这些在浏览器里不点开控制台是看不见的)
  · 超出 1600×900 画布的元素(会被裁掉)
  · 自身内容装不下、被 overflow 裁掉的元素
  · 字号的最小值与中位数

只陈述测到了什么,不判定好坏,也不改任何文件。截图默认不存,加 --shot 才存。

判「被裁」时有个坑:一个大号中文标题在 overflow:visible 下经常画到行盒外面,
但根本没被裁。所以只有当容器确实设了 overflow 才比较 scrollWidth/clientWidth,
否则每个大标题都会被误报。
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

W, H = 1600, 900

PROBE = """() => {
  const num = v => { const f = parseFloat(v); return Number.isFinite(f) ? f : 0; };
  const W = %d, H = %d;
  const clipped = [], escaped = [], sizes = [];

  const isClipped = (el, cs) => {
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') return false;
    return (cs.overflowX !== 'visible' && el.scrollWidth  > el.clientWidth  + 1)
        || (cs.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1);
  };
  const label = el => {
    const c = (el.className || '').toString().trim().split(/\\s+/)[0];
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : (c ? '.' + c : ''));
  };

  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;

    if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) {
      escaped.push({el: label(el),
                    out: [Math.round(Math.max(0, -r.left)), Math.round(Math.max(0, -r.top)),
                          Math.round(Math.max(0, r.right - W)), Math.round(Math.max(0, r.bottom - H))],
                    text: (el.textContent || '').trim().slice(0, 40)});
    }
    if (isClipped(el, cs)) {
      clipped.push({el: label(el),
                    need: [el.scrollWidth, el.scrollHeight],
                    have: [el.clientWidth, el.clientHeight],
                    text: (el.textContent || '').trim().slice(0, 40)});
    }
    let own = '';
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
    if (own.trim()) sizes.push(num(cs.fontSize));
  }
  return {clipped: clipped.slice(0, 25), escaped: escaped.slice(0, 25), sizes,
          canvases: document.querySelectorAll('canvas').length};
}""" % (W, H)


async def run(files, shot_dir=None, wait=1200):
    from playwright.async_api import async_playwright
    out = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--allow-file-access-from-files"])
        for f in files:
            pg = await b.new_page(viewport={"width": W, "height": H})
            errs, bad = [], []
            pg.on("pageerror", lambda e: errs.append(f"JS 报错: {e}"))
            pg.on("console", lambda m: m.type == "error" and errs.append(f"console.error: {m.text[:120]}"))
            pg.on("requestfailed", lambda r: bad.append(f"{r.url.split('/')[-1]}  {r.failure}"))
            pg.on("response", lambda r: r.status >= 400 and bad.append(f"{r.url.split('/')[-1]}  HTTP {r.status}"))
            try:
                await pg.goto("file://" + str(Path(f).resolve()), wait_until="load")
                await pg.wait_for_timeout(wait)          # 让动画/初始化跑起来
                probe = await pg.evaluate(PROBE)
            except Exception as e:
                out.append((Path(f).name, {"fatal": str(e)[:200]}, errs, bad, None))
                await pg.close()
                continue
            png = None
            if shot_dir:
                png = Path(shot_dir) / (Path(f).stem + ".png")
                png.parent.mkdir(parents=True, exist_ok=True)
                await pg.screenshot(path=str(png))
            out.append((Path(f).name, probe, errs, bad, png))
            await pg.close()
        await b.close()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pages", nargs="*", help="页面文件;不给就查当前目录下所有 page-*.html")
    ap.add_argument("--shot", action="store_true", help="另存截图")
    ap.add_argument("--shot-dir", default="/tmp/selfcheck")
    ap.add_argument("--wait", type=int, default=1200, help="打开后等多少毫秒再测")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    files = a.pages or sorted(str(p) for p in Path(".").glob("page-*.html"))
    files = [f for f in files if Path(f).exists()]
    if not files:
        print("没找到页面。用法: python3 assets/selfcheck.py page-01.html")
        return 2
    try:
        res = asyncio.run(run(files, a.shot_dir if a.shot else None, a.wait))
    except ImportError:
        print("这台机器上 playwright 应该是装好的;若报缺失: pip install playwright")
        return 2

    if a.json:
        print(json.dumps([{"page": n, **(p if isinstance(p, dict) else {}),
                           "errors": e, "failed": b} for n, p, e, b, _ in res],
                         ensure_ascii=False, indent=2, default=str))
        return 0

    for name, probe, errs, bad, png in res:
        print(f"\n── {name}")
        if probe.get("fatal"):
            print(f"   打不开: {probe['fatal']}")
            continue
        sizes = sorted(probe["sizes"])
        for e in errs[:6]:
            print(f"   ✗ {e}")
        for x in bad[:6]:
            print(f"   ✗ 资源加载失败 {x}")
        for x in probe["escaped"][:6]:
            l, t, r, b2 = x["out"]
            side = ", ".join(s for s, v in (("左", l), ("上", t), ("右", r), ("下", b2)) if v) or "?"
            px = max(x["out"])
            print(f"   ✗ 超出画布 {x['el']} 往{side}出去 {px}px  «{x['text']}»")
        for x in probe["clipped"][:6]:
            print(f"   ✗ 被裁 {x['el']} 内容 {x['need']} 容器只有 {x['have']}  «{x['text']}»")
        if not errs and not bad and not probe["escaped"] and not probe["clipped"]:
            print("   渲染无报错,没有元素超出画布或被裁")
        if sizes:
            print(f"   canvas {probe['canvases']} 个;有文字的元素 {len(sizes)} 个,"
                  f"字号最小 {sizes[0]:g}px 中位 {sizes[len(sizes)//2]:g}px 最大 {sizes[-1]:g}px")
        if png:
            print(f"   截图 {png}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
