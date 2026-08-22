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
  · 密度:画面占用比、容器数、文本块数、文字叠压、占比 <1% 的小容器

密度那几个数是后加的,起因是实测:「版面不空不挤」这种判断以前只能靠反复截图去看,
一轮里 171 张截图约 324k token,而图片随每轮重发、永久占上下文,
结果 11/16 个 subagent 上下文撑爆被自动压缩,整轮墙钟拉长 1.9 倍。
把这个判断变成可读的数之后,不必为了看密度而反复截图。
截图本身仍然有用(看自己的作品然后想是画面质量的来源),所以保留,但缩到 800×450 ——
按像素计费,一张从约 1,900 token 降到约 480。

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
SHOT_W, SHOT_H = 800, 450       # 截图尺寸,只影响截图不影响测量

# 版面密度的下限与区间。实测:Opus 那条线占用比 57–69%(nn-06 69%、nn-11 63%)、
# 文本块中位 29–62;我们三个模型占用比 22–44%,ape-ds3 有 23/50 页低于 20%。
# 45 是留了余量的保守值;文本块超 80 的页人眼一看就太满(nn-10 有 4 页)。
OCC_FLOOR = 45
TEXT_LO, TEXT_HI = 20, 70

PROBE = """() => {
  const num = v => { const f = parseFloat(v); return Number.isFinite(f) ? f : 0; };
  const W = %d, H = %d;
  const clipped = [], escaped = [], sizes = [];
  const boxes = [], texts = [];
  const alpha = c => {
    const m = /rgba?\\(([^)]+)\\)/.exec(c || '');
    if (!m) return 0;
    const p = m[1].split(',').map(x => parseFloat(x));
    return p.length > 3 ? p[3] : 1;
  };

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
    // KaTeX 会给每个公式渲染**两份**:一份可视的 .katex-html,一份给读屏器的
    // .katex-mathml(用 1×1 裁剪隐藏)。那份隐藏副本会让闸每个公式都报一次
    // 「被裁」和「文字叠压」—— 实测一个公式 1 处被裁 + 6 处叠压,全是假的。
    if (el.closest && el.closest('.katex-mathml')) continue;

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
    // 去零宽字符,见 ownText 同样的理由(KaTeX .vlist-s 占位符)
    own = own.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
    if (own.trim()) {
      sizes.push(num(cs.fontSize));
      texts.push({node: el, t: own.trim().slice(0, 50),
                  x: r.left, y: r.top, w: r.width, h: r.height});
    }

    // 容器:自己画了一个盒子(底色/描边/阴影)、面积够大、里面有字。
    // 定义和 lab/measure_register.py 保持一致,这样被试看到的数和事后审计的数可比。
    const hasBg = alpha(cs.backgroundColor) > 0.02 || cs.backgroundImage !== 'none';
    const bw = num(cs.borderTopWidth) + num(cs.borderRightWidth)
             + num(cs.borderBottomWidth) + num(cs.borderLeftWidth);
    const hasBorder = bw > 0 && alpha(cs.borderTopColor) > 0.02;
    const hasShadow = cs.boxShadow && cs.boxShadow !== 'none';
    const tag = el.tagName.toLowerCase();
    if (el !== document.body && (hasBg || hasBorder || hasShadow)
        && r.width * r.height >= W * H * 0.01
        && (el.textContent || '').trim().length > 0
        && tag !== 'canvas' && tag !== 'svg' && tag !== 'img') {
      boxes.push({el: label(el), area: r.width * r.height / (W * H)});
    }
  }

  // 画面占用:把 1600x900 切成 32x18 格,格心被任何内容元素覆盖就算占用。
  // 「不空不挤」原来只能靠看截图判断,这个数把它变成可读的量。
  const GX = 32, GY = 18;
  const occ = new Array(GX * GY).fill(0);
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (num(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    if (r.width >= W * 0.98 && r.height >= H * 0.98) continue;   // 铺满层不算内容
    let own = '';
    for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
    own = own.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');
    const tag = el.tagName.toLowerCase();
    const isContent = own.trim() || tag === 'canvas' || tag === 'svg' || tag === 'img'
                      || tag === 'input' || tag === 'button' || tag === 'select';
    if (!isContent) continue;
    for (let gy = 0; gy < GY; gy++) {
      const cy = (gy + 0.5) * H / GY;
      if (cy < r.top || cy > r.bottom) continue;
      for (let gx = 0; gx < GX; gx++) {
        const cx = (gx + 0.5) * W / GX;
        if (cx >= r.left && cx <= r.right) occ[gy * GX + gx] = 1;
      }
    }
  }
  const used = occ.reduce((a, b) => a + b, 0);

  // 文字叠压:两个文本块的 bbox 相交面积超过较小者一半。
  // **必须排除祖先/后代对** —— 父元素带文字、子元素也带文字时 bbox 必然相交,
  // 不排会满屏误报(实测 page-16 报出 18 处,全是嵌套)。
  // 这个仓库的规矩是宁可漏报不可误报:一条假阳性就会让人不再看这份报告。
  let overlap = 0;
  const pairs = [];
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.node.contains(b.node) || b.node.contains(a.node)) continue;
    const ow = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oh = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ow <= 0 || oh <= 0) continue;
    const small = Math.min(a.w * a.h, b.w * b.h);
    if (small > 0 && ow * oh > small * 0.5) { overlap++; pairs.push([a.t, b.t]); }
  }

  // 页眉页脚带的侵入检查。**这道闸原来不存在,而它不存在是有代价的**:
  // 实测一轮里 17/48 页在 mount() 之后 classList.remove 掉了内容区的定位类,
  // 内容于是从 y=0 开始 —— 标题顶穿画布上边界被切掉、读数面板被主画布压住。
  // 而 escaped 只判「出不出 1600×900」,那些元素的 bbox 仍在画布内,所以一个告警都没有。
  const bands = [];
  document.querySelectorAll('header,footer,[class*="header"],[class*="footer"]')
    .forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > W * 0.4 && r.height > 8 && r.height < H * 0.35) {
        bands.push({el: el, top: r.top, bottom: r.bottom, name: label(el)});
      }
    });
  const intrude = [];
  if (bands.length) {
    document.querySelectorAll('*').forEach(el => {
      if (bands.some(b => b.el === el || b.el.contains(el))) return;
      const t = [...el.childNodes].filter(n => n.nodeType === 3)
        .map(n => n.textContent.replace(/[\u200b-\u200d\ufeff]/g, '').trim()).join('');
      const cv = el.tagName === 'CANVAS' || el.tagName === 'SVG';
      if (!t && !cv) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      for (const b of bands) {
        const ov = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
        if (ov > 4) {
          intrude.push({el: label(el), band: b.name, px: Math.round(ov),
                        text: (t || '(' + el.tagName.toLowerCase() + ')').slice(0, 40)});
          break;
        }
      }
    });
  }
  const tiny = boxes.filter(b => b.area < 0.01).length;
  return {clipped: clipped.slice(0, 25), escaped: escaped.slice(0, 25), sizes,
          canvases: document.querySelectorAll('canvas').length,
          boxes: boxes.length, texts: texts.length, overlap: overlap,
          overlap_pairs: pairs.slice(0, 4), tiny: tiny,
          bands: bands.length, intrude: intrude.slice(0, 12),
          occupied: used, cells: GX * GY};
}""" % (W, H)


async def run(files, shot_dir=None, wait=1200, after=()):
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
                out.append((Path(f).name, {"fatal": str(e)[:200]}, errs, bad, None, []))
                await pg.close()
                continue
            png = None
            extra = []
            if shot_dir:
                png = Path(shot_dir) / (Path(f).stem + ".png")
                png.parent.mkdir(parents=True, exist_ok=True)
                # **不许改视口来缩图。** 这里原来 set_viewport_size 到 800×450 再拍,
                # 注释写着「页面本身是按视口整体缩放的,所以改视口重截不失真」——
                # 那个假设是错的,而它污染了所有下游判断:base.js 的缩放只作用于 #stage,
                # 而 mount 注入的页眉页脚是 position:absolute 挂在 body 上、不参与缩放。
                # 视口一改它们就重排 —— 实测 page-38 的标题在 1600 宽下是 1045px 的一行,
                # 在 800 宽下换成三行并溢出到画布顶端之外。于是 builder 自查时看到的是
                # 一张渲染错误的图,48 个 builder 照着错的画面判断,自查完仍留着 29 处叠压。
                #
                # 正确做法:视口保持 1600×900,用 device_scale_factor 缩**图片**。
                # 省的 token 一样(按像素计费,0.5 倍 → 1/4 面积),但布局一模一样。
                sp = await b.new_page(viewport={"width": W, "height": H},
                                      device_scale_factor=SHOT_W / W)
                await sp.goto("file://" + str(Path(f).resolve()), wait_until="load")
                await sp.wait_for_timeout(wait)
                await sp.screenshot(path=str(png))
                await sp.close()
                # --after:先在页面里跑一段 JS(点按钮、拖滑块、切状态),再截一张。
                # 这个能力是补出来的,起因是实测:一轮里 subagent 自己写 playwright
                # 截图 33 次、经 selfcheck 只 16 次 —— 因为 selfcheck 只能截默认状态,
                # 而它要看的是"触发交互之后长什么样"。于是它绕过来自己搭,
                # 截出来的图不受这里的尺寸约束(实测最大一张 567KB base64,
                # 是 selfcheck 那张的 2.6 倍),进上下文的图一轮 88 张 14MB。
                # 把这条路补上,自截就没有理由了,尺寸也就管得住。
                for i, js in enumerate(after, 1):
                    try:
                        await pg.evaluate(f"() => {{ {js} }}")
                    except Exception as e:
                        extra.append(("!" + str(e)[:80], None))
                        continue
                    await pg.wait_for_timeout(600)
                    q = Path(shot_dir) / f"{Path(f).stem}-after{i}.png"
                    await pg.screenshot(path=str(q))
                    extra.append((js[:40], q))
            out.append((Path(f).name, probe, errs, bad, png, extra))
            await pg.close()
        await b.close()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pages", nargs="*", help="页面文件;不给就查当前目录下所有 page-*.html")
    ap.add_argument("--shot", action="store_true", help="另存截图")
    ap.add_argument("--shot-dir", default="/tmp/selfcheck")
    ap.add_argument("--wait", type=int, default=1200, help="打开后等多少毫秒再测")
    ap.add_argument("--after", action="append", default=[], metavar="JS",
                    help="截图前先在页面里跑这段 JS(可多次给,每次多存一张 -afterN.png)。"
                         "例:--after \"document.querySelector('#btn').click()\"")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    files = a.pages or sorted(str(p) for p in Path(".").glob("page-*.html"))
    files = [f for f in files if Path(f).exists()]
    if not files:
        print("没找到页面。用法: python3 assets/selfcheck.py page-01.html")
        return 2
    try:
        res = asyncio.run(run(files, a.shot_dir if a.shot else None, a.wait, a.after))
    except ImportError:
        print("这台机器上 playwright 应该是装好的;若报缺失: pip install playwright")
        return 2

    if a.json:
        print(json.dumps([{"page": n, **(p if isinstance(p, dict) else {}),
                           "errors": e, "failed": b} for n, p, e, b, _, _x in res],
                         ensure_ascii=False, indent=2, default=str))
        return 0

    for name, probe, errs, bad, png, extra in res:
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
        # 密度 —— 「版面不空不挤」以前只能靠看截图判断,这几个数把它变成可读的量。
        #
        # **原来是「只陈述,不判定」,现在给下限。** 理由是量出来的:24 轮统一量完之后,
        # 占用比是离 Opus 最远的一项。而这条项目一贯的规律是:
        # **有可算的数的约束起作用,没数的不起作用** —— 字号地板给了数,
        # 不达标率 66%→20%;「不要太满」写在四处、七轮零改变。
        # 「填满版心」到今天为止一直是后者:契约里只有形容词,没有一个数。
        #
        # 建页的 agent 每轮本来就跑了 219–357 次 selfcheck —— **仪器早在它们手里,
        # 缺的只是目标**。所以判定放在这里,不放在契约里当一句要求。
        occ = probe.get("occupied")
        if occ is not None:
            cells = probe.get("cells") or 1
            print(f"   密度: 画面占用 {occ * 100 // cells}%"
                  f"(32×18 格,铺满层不计)   容器 {probe.get('boxes', 0)} 个"
                  f"   文本块 {probe.get('texts', 0)} 个")
            occ_pct = occ * 100 // cells
            n_text = probe.get("texts", 0)
            if occ_pct < OCC_FLOOR:
                print(f"   ✗ 画面太空:占用比 {occ_pct}% < 下限 {OCC_FLOOR}%。"
                      f"不是让你把字号调大或加装饰 —— 是这一页承载的东西太少,"
                      f"要么把该讲的讲透(多一层结构、多一个维度、把过程展开),"
                      f"要么和相邻页合并")
            if n_text and not (TEXT_LO <= n_text <= TEXT_HI):
                which = "太少" if n_text < TEXT_LO else "太多"
                print(f"   ✗ 文本块 {n_text} 个,{which}(区间 {TEXT_LO}–{TEXT_HI})")
            flags = []
            if probe.get("overlap"):
                flags.append(f"文字叠压 {probe['overlap']} 处")
            # **侵入必须打印出来。** 这一段浏览器侧一直在算,Python 这边却从没输出 ——
            # 于是拿 `grep 侵入` 去数的人得到的是 0,而那不是「量出来的 0」,是没量。
            # 我自己就据此报过「侵入 70 → 0,问题修好了」,而新那两轮根本没被测过。
            # 采集了不打印的指标,比没有这个指标更坏:它会让人以为已经看过了。
            if probe.get("intrude"):
                flags.append(f"侵入页眉页脚带 {len(probe['intrude'])} 处")
            if probe.get("tiny"):
                flags.append(f"占比 <1% 的小容器 {probe['tiny']} 个")
            if flags:
                print("        " + " / ".join(flags))
        if png:
            print(f"   截图 {png}  ({SHOT_W}×{SHOT_H},约 {SHOT_W*SHOT_H//750} token)")
        for js, q in extra:
            if q is None:
                print(f"   ✗ --after 那段 JS 报错: {js[1:]}")
            else:
                print(f"   截图(跑过 «{js}» 之后) {q}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
