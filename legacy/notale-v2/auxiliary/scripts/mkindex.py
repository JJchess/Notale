#!/usr/bin/env python3
"""给一轮产出生成一页索引,方便按页翻看。

标出每页的字节数和有没有图 —— 这两个数正好是这一轮要看的:
带图的页会因为内嵌 base64 而比别的页大一个量级(实测 96K–648K 对中位 10.5K)。
"""
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
pages = sorted(root.glob("page-*.html"))
rows = []
for p in pages:
    s = p.read_text(encoding="utf-8", errors="replace")
    n = len(re.findall(r"<img\b", s))
    t = re.search(r'class="lec-title"[^>]*>([^<]{0,80})', s) or re.search(r"<title>([^<]{0,80})", s)
    kb = p.stat().st_size / 1024
    rows.append((p.name, n, kb, (t.group(1).strip() if t else "")))

cards = "\n".join(
    f'<a class="c{" img" if n else ""}" href="{name}">'
    f'<b>{name.removeprefix("page-").removesuffix(".html")}</b>'
    f'<span class="t">{title or "&nbsp;"}</span>'
    f'<span class="m">{kb:.0f} KB{f" · {n} 图" if n else ""}</span></a>'
    for name, n, kb, title in rows)

withimg = sum(1 for _, n, _, _ in rows if n)
total = sum(n for _, n, _, _ in rows)
(root / "index.html").write_text(f"""<!doctype html><meta charset=utf-8>
<title>{root.parent.name} · {len(pages)} 页</title>
<style>
:root{{--bg:#0f1319;--fg:#e9e7e2;--dim:#8a93a1;--line:#242c38;--accent:#c9a227}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--fg);
 font:15px/1.55 system-ui,"Noto Sans SC",sans-serif;padding:36px 30px 60px}}
h1{{font:600 20px ui-monospace,Menlo,monospace;margin:0 0 4px;letter-spacing:.02em}}
p.l{{color:var(--dim);margin:0 0 28px;font-size:13.5px}}
.g{{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}}
.c{{display:flex;flex-direction:column;gap:3px;padding:11px 13px;text-decoration:none;
 color:inherit;border:1px solid var(--line);border-radius:5px;background:#141a22}}
.c:hover{{border-color:var(--accent)}}
.c.img{{border-left:3px solid var(--accent)}}
.c b{{font:600 13px ui-monospace,Menlo,monospace;color:var(--accent)}}
.c .t{{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.c .m{{font-size:11.5px;color:var(--dim);font-variant-numeric:tabular-nums}}
</style>
<h1>{root.parent.name}</h1>
<p class=l>{len(pages)} 页 · 带图 {withimg} 页 / 共 {total} 张(左侧金边)</p>
<div class=g>
{cards}
</div>
""", encoding="utf-8")
print(f"{root}/index.html  {len(pages)} 页,带图 {withimg} 页 / {total} 张")
