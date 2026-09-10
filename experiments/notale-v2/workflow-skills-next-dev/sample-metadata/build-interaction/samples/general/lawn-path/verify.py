#!/usr/bin/env python3
"""把归档页面真的跑一遍：三幕切换、输入、canvas 采样率、reduced-motion。

    python3 verify.py index.html

失败就抛 AssertionError。需要 playwright 的 chromium。
"""

import asyncio
import functools
import hashlib
import http.server
import re
import socketserver
import sys
import threading
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).parent / "pages"

# app.js 里那条覆盖 49 格、移动 48 次的最短路线，用来走到「全部修剪完」这个唯一会自动进结果幕的分支
OPTIMAL = [
    (0,0),(0,1),(0,2),(0,3),(0,4),(0,5),(0,6),(1,6),(1,5),(1,4),
    (2,4),(2,5),(2,6),(2,7),(3,7),(4,7),(5,7),(6,7),(7,7),(7,6),
    (6,6),(5,6),(5,5),(4,5),(4,6),(3,6),(3,5),(3,4),(4,4),(4,3),
    (3,3),(2,3),(2,2),(3,2),(3,1),(3,0),(4,0),(4,1),(5,1),(5,0),
    (6,0),(7,0),(7,1),(6,1),(6,2),(7,2),(7,3),(6,3),(6,4),
]
KEYS = {(-1,0): "ArrowUp", (1,0): "ArrowDown", (0,-1): "ArrowLeft", (0,1): "ArrowRight"}
STEPS = [KEYS[(b[0]-a[0], b[1]-a[1])] for a, b in zip(OPTIMAL, OPTIMAL[1:])]


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    handler = functools.partial(Quiet, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    page = sys.argv[1] if len(sys.argv) > 1 else ""
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}/{page}"


async def page(browser, url, **kw):
    pg = await browser.new_page(viewport={"width": 1366, "height": 768}, **kw)  # s≈0.853
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("requestfailed", lambda r: errs.append(f"资源加载失败 {r.url}"))
    await pg.goto(url)
    await pg.wait_for_timeout(400)
    return pg, errs


async def wash_pixels(pg):
    """玩家路线里画成 --player-2 / --player-3 的像素数。

    按精确 RGB 数，不用色域窗口：橙色线的抗锯齿边缘会一路混过任何「深橙/红」的窗口，
    上一版就是这么把「没有重复」的那条路线误判成有重复的。线宽 12，实心内部是精确色。
    """
    return await pg.evaluate("""(() => {
        const probe = document.createElement('canvas').getContext('2d');
        const rgb = name => {
          probe.fillStyle = Deck.token(name);
          const m = probe.fillStyle.match(/^#(..)(..)(..)$/);
          return m.slice(1).map(h => parseInt(h, 16));
        };
        const want = [rgb('player-2'), rgb('player-3')];
        const c = playerResultCanvas, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4)
          if (want.some(w => d[i] === w[0] && d[i+1] === w[1] && d[i+2] === w[2])) n++;
        return n;
    })()""")


async def flow(browser, url, dpr):
    """完整一轮：开场 → 游玩（键盘/撞墙/dpad/滑动）→ 走满 49 格 → 结果 → 再试一次。"""
    pg, errs = await page(browser, url, device_scale_factor=dpr)

    assert await pg.get_attribute("#stage", "data-scene") == "intro"
    got, want = await pg.evaluate("[introCanvas.width, Math.round(introCanvas.offsetWidth * Deck.ratio())]")
    assert got == want, ("introCanvas", got, want)
    await pg.click("#startButton")
    await pg.wait_for_timeout(900)
    assert await pg.get_attribute("#stage", "data-scene") == "play"

    # canvas 的 backing store 必须是 CSS 尺寸 × Deck.ratio()（dpr×舞台缩放，上限 2）
    got, want = await pg.evaluate("[gameCanvas.width, Math.round(gameCanvas.offsetWidth * Deck.ratio())]")
    assert got == want, ("gameCanvas", got, want)

    # 美术的黄金指纹。精灵改成数据串那次，rgba(...) 里的逗号和分隔符撞了，
    # 被当成矩形去画 fillRect(NaN,…) —— 不报错、不抛异常，只是阴影颜色不对。
    # 交互用例、溢出检查、selfcheck 全都发现不了，只有比像素能。
    # 故意改美术时更新这个值，别绕过它。
    # 只在 dpr=1 下比：backing store 尺寸随 dpr 变，指纹自然跟着变
    if dpr == 1:
        art = hashlib.sha256((await pg.evaluate("gameCanvas.toDataURL()")).encode()).hexdigest()[:16]
        assert art == "3b05b01002829a23", f"棋盘美术变了：{art}"

    await pg.keyboard.press("ArrowRight")
    await pg.keyboard.press("ArrowRight")
    await pg.wait_for_timeout(150)
    assert await pg.inner_text("#moveValue") == "2"
    # 读屏用的实时状态：静态 aria-label 给不出割草机在哪
    status = await pg.eval_on_selector("#boardStatus", "el => el.textContent")
    assert "第 1 行第 3 列" in status and "还剩 46 格" in status, status

    # 方向键必须排成键盘那个倒 T：↑ 在上一行居中，← ↓ → 在下一行从左到右。
    # 这条是补的：CSS 用 [data-direction="…"] 定位，HTML 里的值改过名而选择器忘了跟着改，
    # 网格规则会静默失配、按钮退回按 DOM 顺序排 —— 画布像素比对和溢出检查都发现不了。
    box = {}
    for key in ("ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"):
        b = await pg.locator(f'button[data-direction="{key}"]').bounding_box()
        box[key] = (round(b["x"]), round(b["y"]))
    up, left, down, right = (box[k] for k in ("ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"))
    assert up[1] < left[1], ("↑ 不在上一行", box)
    assert left[1] == down[1] == right[1], ("← ↓ → 不在同一行", box)
    assert left[0] < down[0] < right[0], ("← ↓ → 左右顺序不对", box)
    assert up[0] == down[0], ("↑ 没和 ↓ 对齐", box)

    await pg.keyboard.press("ArrowUp")               # 出界，不计步
    await pg.click('button[data-direction="ArrowDown"]')  # (1,2) 是石块，不计步
    await pg.wait_for_timeout(150)
    assert await pg.inner_text("#moveValue") == "2"

    await pg.click('button[data-direction="ArrowRight"]')
    await pg.wait_for_timeout(150)
    assert await pg.inner_text("#moveValue") == "3"

    # 舞台被 scale 过：拖 120 个屏幕 px，换算回逻辑坐标后仍应判为「向右」
    box = await pg.locator("#gameCanvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    await pg.mouse.move(cx, cy)
    await pg.mouse.down()
    await pg.mouse.move(cx + 120, cy, steps=5)
    await pg.mouse.up()
    await pg.wait_for_timeout(150)
    assert await pg.inner_text("#moveValue") == "4"

    # 走满全场（刷新重开一局，从头照最短路线走）
    await pg.reload()
    await pg.wait_for_timeout(400)
    await pg.click("#startButton")
    await pg.wait_for_timeout(900)
    for key in STEPS:
        await pg.keyboard.press(key)
    await pg.wait_for_timeout(2400)
    assert await pg.get_attribute("#stage", "data-scene") == "result"
    assert await pg.inner_text("#efficiencyValue") == "100%", await pg.inner_text("#efficiencyValue")
    assert "48 步" in await pg.inner_text("#results-title")

    # 一路照最短路线走：图注和底色都得说「没有重复」
    assert "没有重复" in await pg.inner_text("#repeatNote")
    assert await wash_pixels(pg) == 0

    for sel in ("#playerResultCanvas", "#optimalResultCanvas"):
        got, want = await pg.evaluate(
            f"(() => {{ const c = document.querySelector('{sel}');"
            f" return [c.width, Math.round(c.offsetWidth * Deck.ratio())]; }})()")
        assert got == want, (sel, got, want)

    await pg.click("#replayButton")
    await pg.wait_for_timeout(900)
    assert await pg.get_attribute("#stage", "data-scene") == "play"
    assert await pg.inner_text("#moveValue") == "0"

    # 定尺画布：任何时候都不该有滚动
    assert await pg.evaluate("document.documentElement.scrollHeight <= innerHeight + 1")
    assert not errs, errs
    await pg.close()


async def transitions(browser, url):
    """换幕期间和被打断之后，都只能有一幕看得见，且内容在舞台里左右上下对称。

    这两条是真踩过的坑：收尾挂在 onComplete 上，用户在动画没播完时再点一下，
    上一次的收尾会把新幕藏回去（实测出现过整页全空），或者两幕全不透明地叠在一起。
    """
    pg, errs = await page(browser, url)

    async def visible():
        return await pg.evaluate("""[...document.querySelectorAll('#stage > section')]
            .filter(s => !s.hasAttribute('hidden') && +getComputedStyle(s).opacity > 0.15)
            .map(s => s.id)""")

    async def settled(tag):
        v = await visible()
        assert len(v) == 1, (tag, v)
        d = await pg.evaluate("""(() => {
          const s = [...document.querySelectorAll('#stage > section')].find(x => !x.hasAttribute('hidden'));
          let l = 1e9, r = -1e9, t = 1e9, b = -1e9;
          for (const el of s.querySelectorAll('*')) {
            const q = el.getBoundingClientRect();
            if (!q.width || !q.height || +getComputedStyle(el).opacity === 0) continue;
            l = Math.min(l, q.x); r = Math.max(r, q.x + q.width);
            t = Math.min(t, q.y); b = Math.max(b, q.y + q.height);
          }
          const st = stage.getBoundingClientRect(), sc = s.getBoundingClientRect();
          return {id: s.id, dx: Math.abs((l - st.x) - (st.right - r)),
                  dy: Math.abs((t - sc.y) - (sc.bottom - b))};
        })()""")
        assert d["dx"] <= 2 and d["dy"] <= 2, (tag, d)

    async def watch(ms):
        """换幕全程逐帧看有没有叠幕"""
        for _ in range(ms // 30):
            v = await visible()
            assert len(v) <= 1, v
            await pg.wait_for_timeout(30)

    await pg.click("#startButton");   await watch(900);  await settled("play")
    await pg.click('#scenePlay [data-action="skip"]');   await watch(2600); await settled("result")
    await pg.click("#replayButton");  await watch(900);  await settled("play")

    # 打断：换幕才起步就点下一个
    await pg.click('#scenePlay [data-action="skip"]')
    await pg.wait_for_timeout(120)
    await pg.click("#replayButton", force=True)
    await watch(1500)
    await settled("打断后")

    assert not errs, errs
    await pg.close()


async def reduced(browser, url):
    """reduced-motion 下动画时长归零，但内容必须已经就位，而不是停在 opacity 0 / progress 0。"""
    pg, errs = await page(browser, url, reduced_motion="reduce")
    await pg.click("#startButton")
    await pg.wait_for_timeout(300)
    vis = await pg.evaluate(
        "[...document.querySelectorAll('#scenePlay > *')].map(el => +getComputedStyle(el).opacity)")
    assert all(v == 1 for v in vis), vis

    await pg.click('#scenePlay [data-action="skip"]')
    await pg.wait_for_timeout(300)
    assert await pg.get_attribute("#stage", "data-scene") == "result"
    assert "共 6 次" in await pg.inner_text("#repeatNote")
    # 重复的那几段要真的画成深色，不能只在图注里写个数字
    wash = await wash_pixels(pg)
    assert wash > 1000, f"深色段只有 {wash} 像素"   # 3 段 × 约 52×10 px，扣掉圆角与端点

    ink = await pg.evaluate("""(() => {
        const c = playerResultCanvas, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4)
          if (d[i] > 200 && d[i+1] > 120 && d[i+2] < 100) n++;   // 橙色路线的像素
        return n;
    })()""")
    assert ink > 5000, f"路线没画出来，橙色像素只有 {ink}"
    assert not errs, errs
    await pg.close()


def check_map(page):
    """地图必须真的指向它声称的东西。

    错的地图比没有地图更糟 —— 模型会照着去读错的行区间，而页面本身跑得好好的，
    截图比对、selfcheck、交互用例一个都发现不了。所以这里逐段核对首行内容。
    """
    path = ROOT / page
    text = path.read_text() if path.exists() else ""
    rows = re.findall(r'^     (\S.*?)\s+L(\d+)-L(\d+)\s+([\d,]+) 字符$', text, re.M)
    if not rows:
        return "（这份产物没有地图，跳过）"
    lines = text.split("\n")
    assert len(rows) >= 10, f"地图只解析出 {len(rows)} 段"

    ANCHOR = {"CSS：定尺舞台": "<style>", "HTML：三幕结构": "</style>",
              "JS：常量与数据": "<script>", "JS：像素美术": "hashNoise",
              "JS：canvas 接线": "drawLawn", "JS：场景机": "幕切换",
              "JS：游戏流程": "--- 流程", "JS：输入": "--- 输入",
              "JS：接线 init": "function init"}
    # 地图自己那段注释不在覆盖范围内，第一段应当紧接在 `-->` 之后
    prev_end = next(i for i, l in enumerate(lines, 1) if l.strip() == "-->")
    for name, a, b, chars in rows:
        a, b = int(a), int(b)
        assert a == prev_end + 1, f"{name} 与上一段不相接：{prev_end} → {a}"
        prev_end = b
        got = sum(len(l) + 1 for l in lines[a - 1:b])
        assert abs(got - int(chars.replace(",", ""))) <= 1, f"{name} 字符数对不上：{got} vs {chars}"
        for key, anchor in ANCHOR.items():
            if name.startswith(key):
                assert anchor in lines[a - 1], f"{name} 起点 L{a} 不含「{anchor}」：{lines[a-1][:60]}"
    assert prev_end == len(lines) - 1 or prev_end == len(lines), \
        f"地图没覆盖到文件末尾：止于 L{prev_end}，文件 {len(lines)} 行"
    return f"{len(rows)} 段，首尾相接、锚点对得上、覆盖全文件"


async def main():
    page = sys.argv[1] if len(sys.argv) > 1 else "index.html"
    httpd, url = serve()
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            for dpr in (1, 2):
                await flow(browser, url, dpr)
                print(f"  ok  完整流程 dpr={dpr}")
            await transitions(browser, url)
            print("  ok  换幕不叠幕、打断后不丢幕、各幕对称")
            await reduced(browser, url)
            print("  ok  reduced-motion")
            print(f"  ok  行号地图 —— {check_map(page)}")
            await browser.close()
    finally:
        httpd.shutdown()
    print("全部通过")


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
