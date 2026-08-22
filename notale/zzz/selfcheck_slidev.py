#!/usr/bin/env python3
"""Slidev deck 的自检 —— 和 `selfcheck.py` **同一套判据、同一份 PROBE**。

    python3 selfcheck_slidev.py <deck 目录>          # 自动 build 再量
    python3 selfcheck_slidev.py <deck 目录> --no-build   # 复用已有的 dist/

**为什么 import 而不是拷一份 PROBE:** 这个项目因为 selfcheck 分叉吃过一次亏 ——
它曾在 notale-v2 里另存过一份(6,984B vs 15,220B),结果密度检测、`--after`、
KaTeX 处理这三轮的仪器改进,一条都没进到真实 harness。两条线的数要能横着比,
判据就必须是同一份源。所以这里只做三件 Slidev 特有的适配,判据一个字不改。

三件适配都是实测逼出来的:

  · **SPA 要取当前可见的那一页。** `slidev build` 出来是单页应用,翻页之后旧页
    留在 DOM 里、`display:none`。盲取第一个 `.slidev-page` 会一直量到第 1 页。
  · **路由要 fallback。** `/2` `/3` 这些在磁盘上没有对应文件,裸 `http.server`
    直接 404(`dist/_redirects` 是给 Netlify 的)。
  · **画布是缩放的。** Slidev 把 `canvasWidth` 单位的画布用 transform 缩放到视口。
    `getComputedStyle().fontSize` 给的是**缩放前**的 CSS px,而读者看到的是
    乘上缩放比之后的大小。这一条不换算就会得出方向相反的结论 ——
    实测有一轮 `canvasWidth: 980` 渲染到 1598px(缩放 1.63×),正文 13.6px
    实际视觉 22px,我第一次算成了「等效 14px」(除反了),据此差点下了反的结论。
"""

import argparse
import asyncio
import os
import re
import statistics
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from selfcheck import PROBE, H, W                      # noqa: E402  判据同源,不拷

# 只在 PROBE 之外加一层:取当前可见的那一页当根,而不是 document.body。
# PROBE 自己是从 document.body 起算的,所以这里包一层壳把根换掉。
WRAP = r"""() => {
  const vis = [...document.querySelectorAll('.slidev-page')]
    .find(e => { const r = e.getBoundingClientRect(); return r.width > 10 && r.height > 10; });
  if (!vis) return {fatal: '找不到可见的 .slidev-page'};
  const realBody = document.body;
  // PROBE 里写死了 document.body.querySelectorAll —— 临时把 body 的查询范围
  // 换成当前可见页,量完还原。比改 PROBE 安全:判据那段一个字都不动。
  const patched = {
    querySelectorAll: (s) => vis.querySelectorAll(s),
  };
  Object.defineProperty(document, 'body', {value: patched, configurable: true});
  let out;
  try { out = (%s)(); }
  finally { Object.defineProperty(document, 'body', {value: realBody, configurable: true}); }
  const r = vis.getBoundingClientRect();
  // **缩放比要从渲染层自己读,不能拿视口宽当分母。**
  // 我第一版写 r.width / 1600 —— 那算的是「渲染宽 / 视口宽」≈ 1.00,
  // 而真正要的是「渲染宽 / canvasWidth 单位宽」。Slidev 用 transform: scale()
  // 把 canvasWidth 的画布放大到视口,所以缩放比就在那个 transform 里。
  const sc = getComputedStyle(vis).transform;
  let k = 1;
  const m = sc && sc !== 'none' && sc.match(/matrix\(([^,]+)/);
  if (m) k = parseFloat(m[1]) || 1;
  if (k === 1) {                      // 缩放挂在祖先上的情形
    let e = vis.parentElement;
    while (e && k === 1) {
      const t = getComputedStyle(e).transform;
      const mm = t && t !== 'none' && t.match(/matrix\(([^,]+)/);
      if (mm) k = parseFloat(mm[1]) || 1;
      e = e.parentElement;
    }
  }
  out.scale = k;
  out.renderW = Math.round(r.width);
  out.canvasW = Math.round(r.width / k);
  return out;
}""" % (PROBE,)


class _SPA(SimpleHTTPRequestHandler):
    """找不到的路径回落到 index.html —— SPA 路由在磁盘上没有对应文件。"""

    root = ""

    def translate_path(self, path):
        p = super().translate_path(path)
        if not os.path.exists(p) and "." not in os.path.basename(p):
            return os.path.join(self.root, "index.html")
        return p

    def log_message(self, *a):
        pass


def serve(root: Path) -> tuple[int, ThreadingHTTPServer]:
    _SPA.root = str(root)
    srv = ThreadingHTTPServer(("127.0.0.1", 0),
                              lambda *a, **k: _SPA(*a, directory=str(root), **k))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1], srv


async def measure(port: int, n_max: int) -> list[dict]:
    from playwright.async_api import async_playwright
    rows = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": W, "height": H})
        errs: list[str] = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:90]))
        await pg.goto(f"http://127.0.0.1:{port}/")
        await pg.wait_for_timeout(2500)
        last_url, stall = "", 0
        for _ in range(n_max):
            url = pg.url
            r = await pg.evaluate(WRAP)
            if r and not r.get("fatal"):
                r["url"] = url
                r["errors"] = list(errs)
                errs.clear()
                rows.append(r)
            await pg.keyboard.press("ArrowRight")
            await pg.wait_for_timeout(420)
            # **不能「URL 出现过就停」** —— Slidev 一页里可以有多个 v-click 步骤,
            # 那几步 URL 不变(或只变 hash 后缀),第一版因此在第 30 页就提前收工,
            # 而手工翻是 38 页。改成连续两次不变才算到底。
            if pg.url == last_url:
                stall += 1
                if stall >= 3:
                    break
            else:
                stall = 0
            last_url = pg.url
        await b.close()
    return rows


def report(rows: list[dict]) -> None:
    if not rows:
        print("  没量到任何页")
        return
    scale = rows[0].get("scale", 1)
    print(f"\n── Slidev deck  {len(rows)} 页   画布缩放 {scale:.2f}×"
          f"(canvasWidth {rows[0].get('canvasW')} → 渲染 {rows[0].get('renderW')}px)")
    if scale > 1.15:
        print(f"   ⚠ 缩放 {scale:.2f}× —— 页面里每一样东西都被放大了这么多倍。"
              f"实测有一轮 canvasWidth:980 导致正文视觉 22px、"
              f"内容页文本块只有 22(同模型同题目的自包含 HTML 那轮是 53)。"
              f"要密度就把 canvasWidth 设成 {W}。")

    def med(key, rs=rows):
        v = [r.get(key) or 0 for r in rs]
        return statistics.median(v) if v else 0

    div = [r for r in rows if (r.get("texts") or 0) < 12]
    con = [r for r in rows if (r.get("texts") or 0) >= 12]
    cells = rows[0].get("cells") or 1
    occ = lambda rs: statistics.median((r.get("occupied") or 0) * 100 // cells
                                       for r in rs) if rs else 0
    print(f"   内容页 {len(con)} 页:  占用比中位 {occ(con):.0f}%   "
          f"文本块中位 {med('texts', con):.0f}   容器中位 {med('boxes', con):.0f}")
    print(f"   近空页 {len(div)} 页({len(div)*100//len(rows)}%):  "
          f"文本块中位 {med('texts', div):.0f}   —— 分节页算进页数预算")
    # 字号:PROBE 给的是缩放前的值,要乘缩放比才是读者看到的
    sizes = sorted(s * scale for r in rows for s in (r.get("sizes") or []))
    if sizes:
        print(f"   正文视觉字号:  最小 {sizes[0]:.0f}px   "
              f"中位 {sizes[len(sizes)//2]:.0f}px   最大 {sizes[-1]:.0f}px")
    lap = sum(r.get("overlap") or 0 for r in rows)
    # **两类假警必须排掉,否则真问题会被噪音淹掉。** 都是实测出来的:
    #   · 侵入 32/32 页,全是 `span.text-lg` / `span.opacity-50` 侵入
    #     `footer.absolute` 7–8px —— 那是 slidev 主题自己的页码角标,
    #     span 本来就该在 footer 里。我们的侵入检测是为「内容压到页眉页脚带上」
    #     设计的,它按 `contains` 排除后代,而 Slidev 的 footer 结构不同,
    #     排除不掉。按「侵入深度 ≤ 12px 且被侵入的是 footer」当噪音滤掉。
    #   · JS 报错「Wake Lock permission request denied」—— Slidev 自己请求
    #     防息屏权限被无头浏览器拒了,和页面质量无关。
    def _real(items):
        return [i for i in items
                if not (str(i.get("band", "")).startswith("footer")
                        and (i.get("px") or 0) <= 12)]
    intr = sum(len(_real(r.get("intrude") or [])) for r in rows)
    esc = sum(len(r.get("escaped") or []) + len(r.get("clipped") or []) for r in rows)
    js = sum(1 for r in rows for e in (r.get("errors") or [])
             if "Wake Lock" not in e)
    print(f"   文字叠压 {lap} 处   侵入 {intr} 处   越界/被裁 {esc} 处   JS 报错 {js} 处")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("deck", help="Slidev 项目目录(含 slides.md)")
    ap.add_argument("--no-build", action="store_true")
    ap.add_argument("--max", type=int, default=200)
    a = ap.parse_args()
    deck = Path(a.deck).resolve()
    dist = deck / "dist"
    if not a.no_build:
        print(f"  build {deck} …", flush=True)
        r = subprocess.run(["npx", "slidev", "build", "--out", "dist"],
                           cwd=deck, capture_output=True, text=True)
        if r.returncode:
            print("  ✗ build 失败:\n" + (r.stderr or r.stdout)[-600:])
            sys.exit(1)
    if not (dist / "index.html").exists():
        print(f"  ✗ 没有 {dist}/index.html —— 先 build,或去掉 --no-build")
        sys.exit(1)
    port, srv = serve(dist)
    try:
        report(asyncio.run(measure(port, a.max)))
    finally:
        srv.shutdown()


if __name__ == "__main__":
    main()
