#!/usr/bin/env python3
"""Inspect rendered images or build a run index; no model calls."""
import argparse
import asyncio
import os
import re
from pathlib import Path


KINDS = {"file": "assets/img 文件", "data": "内嵌 base64", "remote": "远程 URL"}


def kind(src: str) -> str:
    if src.startswith("data:"):
        return "data"
    return "remote" if src.startswith(("http://", "https://")) else "file"


async def inspect_images(root: Path) -> None:
    from playwright.async_api import async_playwright

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


def write_index(root: Path) -> None:
    pages = sorted(root.glob('page-*.html'))
    rows = []
    for p in pages:
        s = p.read_text(encoding='utf-8', errors='replace')
        n = len(re.findall('<img\\b', s))
        t = re.search('class="lec-title"[^>]*>([^<]{0,80})', s) or re.search('<title>([^<]{0,80})', s)
        kb = p.stat().st_size / 1024
        rows.append((p.name, n, kb, t.group(1).strip() if t else ''))
    cards = '\n'.join((f'''<a class="c{(' img' if n else '')}" href="{name}"><b>{name.removeprefix('page-').removesuffix('.html')}</b><span class="t">{title or '&nbsp;'}</span><span class="m">{kb:.0f} KB{(f' · {n} 图' if n else '')}</span></a>''' for name, n, kb, title in rows))
    withimg = sum((1 for _, n, _, _ in rows if n))
    total = sum((n for _, n, _, _ in rows))
    (root / 'index.html').write_text(f'<!doctype html><meta charset=utf-8>\n<title>{root.parent.name} · {len(pages)} 页</title>\n<style>\n:root{{--bg:#0f1319;--fg:#e9e7e2;--dim:#8a93a1;--line:#242c38;--accent:#c9a227}}\n*{{box-sizing:border-box}}\nbody{{margin:0;background:var(--bg);color:var(--fg);\n font:15px/1.55 system-ui,"Noto Sans SC",sans-serif;padding:36px 30px 60px}}\nh1{{font:600 20px ui-monospace,Menlo,monospace;margin:0 0 4px;letter-spacing:.02em}}\np.l{{color:var(--dim);margin:0 0 28px;font-size:13.5px}}\n.g{{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}}\n.c{{display:flex;flex-direction:column;gap:3px;padding:11px 13px;text-decoration:none;\n color:inherit;border:1px solid var(--line);border-radius:5px;background:#141a22}}\n.c:hover{{border-color:var(--accent)}}\n.c.img{{border-left:3px solid var(--accent)}}\n.c b{{font:600 13px ui-monospace,Menlo,monospace;color:var(--accent)}}\n.c .t{{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}\n.c .m{{font-size:11.5px;color:var(--dim);font-variant-numeric:tabular-nums}}\n</style>\n<h1>{root.parent.name}</h1>\n<p class=l>{len(pages)} 页 · 带图 {withimg} 页 / 共 {total} 张(左侧金边)</p>\n<div class=g>\n{cards}\n</div>\n', encoding='utf-8')
    print(f'{root}/index.html  {len(pages)} 页,带图 {withimg} 页 / {total} 张')


def main():
    parser = argparse.ArgumentParser(description="检查讲义图片或生成页面索引。")
    commands = parser.add_subparsers(dest="command", required=True)
    images = commands.add_parser("images", help="浏览器检查图片，仅打印结果")
    images.add_argument("directory", type=Path, nargs="?", default=Path("."))
    index = commands.add_parser("index", help="生成或覆盖目录中的 index.html")
    index.add_argument("directory", type=Path)
    args = parser.parse_args()
    if args.command == "images":
        asyncio.run(inspect_images(args.directory))
    else:
        write_index(args.directory)


if __name__ == "__main__":
    main()
