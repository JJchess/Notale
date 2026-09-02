#!/usr/bin/env python3
"""按页数生成空白页骨架。

只做一件事:把「文件名 ↔ 页码 ↔ 总页数」这三者对齐,并且全套补零方式一致。
除此之外骨架里什么都没有 —— 没有样式、没有结构、没有 <link>、没有 <script>,
版式、配色、组件、要不要用 assets/ 里的东西,全部不在这里决定。

    python3 assets/new-pages.py 14        # 在 pages/ 下建 page-01 … page-14

已经存在且非空的文件不会被覆盖。可以重复跑:后来想加页,再跑一次更大的数字即可
(已有页的 data-total 会被同步更新,不然翻页会指向不存在的页)。
"""

import re
import sys
from pathlib import Path

SKELETON = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title></title>
</head>
<body data-page="{n}" data-total="{total}">
</body>
</html>
"""


def main():
    if len(sys.argv) != 2 or not sys.argv[1].isdigit():
        print(__doc__)
        return 2
    total = int(sys.argv[1])
    if not 1 <= total <= 99:
        print("页数要在 1–99 之间")
        return 2

    here = Path(__file__).resolve().parent
    out = here.parent if here.name == "assets" else here
    pad = 2

    made = kept = synced = 0
    for i in range(1, total + 1):
        num = str(i).zfill(pad)
        f = out / f"page-{num}.html"
        if f.exists() and f.stat().st_size > 0:
            # 已经写过内容的页不动,只把 data-total 对齐 —— 页数变了而这里不更新,
            # 翻页就会走到不存在的页上。
            txt = f.read_text(encoding="utf-8")
            new = re.sub(r'(data-total\s*=\s*["\'])\d+(["\'])',
                         rf'\g<1>{total}\g<2>', txt, count=1)
            if new != txt:
                f.write_text(new, encoding="utf-8")
                synced += 1
            else:
                kept += 1
            continue
        f.write_text(SKELETON.format(n=num, total=total), encoding="utf-8")
        made += 1

    print(f"共 {total} 页:新建 {made},已有 {kept},同步 data-total {synced}")
    print(f"目录: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
