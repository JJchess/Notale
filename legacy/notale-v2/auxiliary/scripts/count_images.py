#!/usr/bin/env python3
"""数一牌里**真正能显示**的图,不是数 `assets/img/` 下的文件。

这条是量出来的,而且量的是我自己的误判:`ape-g6` 的 `assets/img` 是 0,
我据此报「GPT 不会加图片」——而它其实取到了 10 张,全部内嵌成
`data:image/jpeg;base64,…` 写在 HTML 里,5 页各 1–4 张,浏览器里 10/10 正常显示。
数文件的判据看不见内嵌那条路,于是把「换了个存法」读成「一张都没有」。

真正要数的是 `naturalWidth > 0` —— 它同时覆盖文件、内嵌、远程三种存法,
又顺带把坏图暴露出来(src 写了但加载不出来的,数文件一样看不见)。
"""
import asyncio
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

KINDS = {"file": "assets/img 文件", "data": "内嵌 base64", "remote": "远程 URL"}


def kind(src: str) -> str:
    if src.startswith("data:"):
        return "data"
    return "remote" if src.startswith(("http://", "https://")) else "file"


async def main(root: Path) -> None:
    files = sorted(root.glob("page-*.html"))
    if not files:
        print(f"{root}: 没有 page-*.html")
        return
    tally, broken, pages = {k: 0 for k in KINDS}, [], 0
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for f in files:
            pg = await b.new_page(viewport={"width": 1600, "height": 900})
            await pg.goto(f"file://{os.path.abspath(f)}")
            await pg.wait_for_timeout(1500)
            imgs = await pg.evaluate("""() => [...document.images].map(i => ({
                src: i.currentSrc || i.src || '', w: i.naturalWidth}))""")
            if imgs:
                pages += 1
            for x in imgs:
                if x["w"] > 0:
                    tally[kind(x["src"])] += 1
                else:
                    broken.append((f.name, x["src"][:70]))
            await pg.close()
        await b.close()
    print(f"{root}  {len(files)} 页")
    print(f"  能显示的图 {sum(tally.values())} 张,分布在 {pages} 页")
    for k, n in tally.items():
        if n:
            print(f"    {KINDS[k]:<16} {n}")
    if broken:
        print(f"  ✗ 坏图 {len(broken)} 张(src 写了但加载不出来):")
        for name, src in broken[:10]:
            print(f"      {name}  {src!r}")


asyncio.run(main(Path(sys.argv[1] if len(sys.argv) > 1 else ".")))
