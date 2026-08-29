#!/usr/bin/env python3
"""把页面真正渲染一遍,报告渲染时发生了什么。

    python3 assets/selfcheck.py page-09.html        # 一页
    python3 assets/selfcheck.py                     # pages/ 下所有页
    python3 assets/selfcheck.py page-09.html --shot # 另存一张截图,路径会打印出来
    python3 assets/selfcheck.py page-09.html \
        --after "document.querySelector('#go').click()"   # 跑这段 JS 再测一遍

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

`--after` 每给一段就**多测一个状态**,不是只多拍一张。它不需要配 `--shot`。
(以前需要,而且是隐式的:那个循环整个在 `if shot_dir:` 里,不给 `--shot` 就静静地
什么都不做,报告仍然打的是初始状态 —— 实测 ape-g17 的 69 次 `--after` 全部这样。)

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

  // 被点名的元素带上它在 1600×900 里的位置。**这是给 Look 用的** ——
  // 「把 selfcheck 刚点名的那个元素裁出来放大看」需要坐标,而报告以前只给
  // 「往右出去 611px」这种相对量,拿不到绝对位置。
  const at = r => [Math.round(r.left), Math.round(r.top),
                   Math.round(r.width), Math.round(r.height)];

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
      escaped.push({el: label(el), at: at(r),
                    out: [Math.round(Math.max(0, -r.left)), Math.round(Math.max(0, -r.top)),
                          Math.round(Math.max(0, r.right - W)), Math.round(Math.max(0, r.bottom - H))],
                    text: (el.textContent || '').trim().slice(0, 40)});
    }
    if (isClipped(el, cs)) {
      clipped.push({el: label(el), at: at(r),
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

  // 主题到底有没有落到元素上。**判据必须落在 token 解析上,不能落在
  // `#stage` 的 computed padding 上** —— 实测 20 页里有 5 页在页内 <style> 里
  // 硬写了字面值 `#stage{padding:28px 56px}`,主题整份失效时它们照样显示
  // 28px 56px,会把失败完全掩盖掉;而 `--pad-x` 在那 5 页上全是空。
  const padX = getComputedStyle(document.documentElement)
                 .getPropertyValue('--pad-x').trim();
  const stageEl = document.getElementById('stage');
  const stagePad = stageEl ? getComputedStyle(stageEl).padding : '';

  return {theme: {padX: padX, stagePad: stagePad},
          clipped: clipped.slice(0, 25), escaped: escaped.slice(0, 25), sizes,
          canvases: document.querySelectorAll('canvas').length,
          boxes: boxes.length, texts: texts.length, overlap: overlap,
          overlap_pairs: pairs.slice(0, 4), tiny: tiny,
          bands: bands.length, intrude: intrude.slice(0, 12),
          occupied: used, cells: GX * GY};
}""" % (W, H)


async def run(files, shot_dir=None, wait=1200, after=(), crop=None, zoom=2):
    """渲染每一页,返回每页的一串**状态**:初始状态,外加每段 `--after` 一个。

    ⚠ 这里修过一个 fail-wrong 的 bug,不要改回去。`--after` 那个循环原来整个在
    `if shot_dir:` 里面,于是**不给 `--shot` 时那几段 JS 根本不执行**、
    JS 报错也不打印,而打出来的报告描述的是初始状态。
    量出来的代价:notale-v2 的 ape-g17 里 69 次 `--after` 全部没带 `--shot`
    (g18 是 4/4),**100% 空转**;建页 agent 拿着一份初始状态的干净报告
    当成了「交互后也不溢出」。lab 那条线 113 条里也有 33 条(29%)这样。
    契约里「有交互的加 --after 再跑一遍」从写下来那天起就不可执行。

    另一半是:跑完 JS 之后**从不重跑 PROBE**,只截了张图。所以 `--after` 从来
    只拍照、不测量 —— 而 notale-v2 那条线的模型直到今天才看得见照片。
    现在每个状态都跑一遍 PROBE,溢出/被裁/字号/密度在交互后同样要成立。

    截图也改了:不再另开一页用 device_scale_factor 缩,改成截 1600×900 原图
    再用 PIL 缩到 800×450。**视口仍然一次都不改**(那条教训在下面)。
    理由是 dsf 只能在建页时定,交互后的状态没法再用它 —— 实测 lab 那 72 张
    `-afterN.png` 全是 1600×900,比初始那张贵 4 倍。缩图片和缩 dsf 得到的
    像素数一样,而且测量和截图从此是同一个页面实例,不会再分叉。
    """
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
            stem = Path(f).stem
            try:
                await pg.goto("file://" + str(Path(f).resolve()), wait_until="load")
                await pg.wait_for_timeout(wait)          # 让动画/初始化跑起来
                probe = await pg.evaluate(PROBE)
            except Exception as e:
                out.append((Path(f).name, [{"label": None, "probe": {"fatal": str(e)[:200]},
                                            "errs": errs, "bad": bad, "png": None}]))
                await pg.close()
                continue

            def shoot(dst):
                """截当前状态。**不许改视口来缩图。**
                这里原来 set_viewport_size 到 800×450 再拍,注释写着「页面本身是按视口
                整体缩放的,所以改视口重截不失真」—— 那个假设是错的,而它污染了所有
                下游判断:base.js 的缩放只作用于 #stage,而 mount 注入的页眉页脚是
                position:absolute 挂在 body 上、不参与缩放。视口一改它们就重排 ——
                实测 page-38 的标题在 1600 宽下是 1045px 的一行,在 800 宽下换成三行
                并溢出到画布顶端之外。于是 builder 自查时看到的是一张渲染错误的图,
                48 个 builder 照着错的画面判断,自查完仍留着 29 处叠压。"""
                dst.parent.mkdir(parents=True, exist_ok=True)
                return dst

            states = [{"label": None, "probe": probe, "errs": list(errs),
                       "bad": list(bad), "png": None}]
            if shot_dir:
                png = shoot(Path(shot_dir) / f"{stem}.png")
                await pg.screenshot(path=str(png))
                # 裁图必须在缩图**之前**取 —— 从 800×450 里裁再放大等于放大马赛克,
                # 而「裁出来放大看」的全部意义就是拿到原始那一份像素。
                states[0]["crop"] = _crop(png, Path(shot_dir) / f"{stem}-crop.png",
                                          crop, zoom)
                _shrink(png)
                states[0]["png"] = png
            n_e, n_b = len(errs), len(bad)

            # --after:在页面里跑一段 JS(点按钮、拖滑块、切状态),然后**重新测一遍**。
            # 这个能力当初是补出来的,起因是实测:一轮里 subagent 自己写 playwright
            # 截图 33 次、经 selfcheck 只 16 次 —— 因为 selfcheck 只能看默认状态,
            # 而它要看的是「触发交互之后长什么样」。于是它绕过来自己搭,截出来的图
            # 不受这里的尺寸约束(实测最大一张 567KB base64,是 selfcheck 那张的
            # 2.6 倍),进上下文的图一轮 88 张 14MB。把这条路补上,自截就没有理由了。
            for i, js in enumerate(after, 1):
                st = {"label": " ".join(js.split())[:60], "probe": None,
                      "errs": [], "bad": [], "png": None, "js_error": None}
                try:
                    await pg.evaluate(f"() => {{ {js} }}")
                except Exception as e:
                    st["js_error"] = " ".join(str(e).split())[:160]
                else:
                    await pg.wait_for_timeout(600)
                    st["probe"] = await pg.evaluate(PROBE)
                    if shot_dir:
                        q = shoot(Path(shot_dir) / f"{stem}-after{i}.png")
                        await pg.screenshot(path=str(q))
                        st["crop"] = _crop(q, Path(shot_dir) / f"{stem}-after{i}-crop.png",
                                           crop, zoom)
                        _shrink(q)
                        st["png"] = q
                st["errs"], st["bad"] = errs[n_e:], bad[n_b:]
                n_e, n_b = len(errs), len(bad)
                states.append(st)

            out.append((Path(f).name, states))
            await pg.close()
        await b.close()
    return out


def _crop(src: Path, dst: Path, box, zoom: int) -> Path | None:
    """从 1600×900 的原图里裁一块并放大。

    包掉的是 lab 那条线**手搓 37 次 / 11 页**的那段:
    `Image.open(shot).crop(box).resize(box*2).save(z-*.png)` —— 建页 agent 每次
    要看清一个局部就现写一遍。裁图归渲染这一步管,别处不留第二份实现。

    box 是 1600×900 画布里的 CSS 像素 `[x, y, w, h]`,正好是报告里 `@x,y w×h`
    那几个数。越界自动收进画布,零面积返回 None(fail-visible,不静默给张空图)。
    """
    if not box:
        return None
    from PIL import Image
    x, y, w, h = (int(v) for v in box)
    x0, y0 = max(0, min(x, W)), max(0, min(y, H))
    x1, y1 = max(0, min(x + w, W)), max(0, min(y + h, H))
    if x1 - x0 < 2 or y1 - y0 < 2:
        return None
    im = Image.open(src).crop((x0, y0, x1, y1))
    im = im.resize((im.width * zoom, im.height * zoom), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst)
    return dst


def _at(x: dict) -> str:
    """把坐标写成 Look 能直接抄的形状。"""
    a = x.get("at")
    return f"@{a[0]},{a[1]} {a[2]}×{a[3]}" if a else ""


def _shrink(path: Path) -> None:
    """1600×900 的原图缩到 SHOT_W×SHOT_H。按像素计费,面积 1/4,约 480 token。"""
    from PIL import Image
    im = Image.open(path)
    if im.size != (SHOT_W, SHOT_H):
        im.resize((SHOT_W, SHOT_H), Image.LANCZOS).save(path)


def report(name: str, states: list) -> None:
    """把一页的每个状态各打一段。初始状态不加标题,`--after` 的状态标出来。"""
    print(f"\n── {name}")
    for st in states:
        if st["label"] is not None:
            print(f"   ┄ 跑过 «{st['label']}» 之后")
        # JS 报错**无条件打印**。以前这一行只在 shot 分支里,于是不给 --shot 时
        # 连「你那段 JS 抛异常了」都看不到,报告还是一片干净。
        if st.get("js_error"):
            print(f"   ✗ 这段 JS 报错了,**这个状态没测到**: {st['js_error']}")
            continue
        probe, errs, bad = st["probe"], st["errs"], st["bad"]
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
            print(f"   ✗ 超出画布 {x['el']} 往{side}出去 {px}px "
                  f"{_at(x)} «{x['text']}»")
        for x in probe["clipped"][:6]:
            print(f"   ✗ 被裁 {x['el']} 内容 {x['need']} 容器只有 {x['have']} "
                  f"{_at(x)} «{x['text']}»")
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
            # **2026-08-27:这两条从 ✗ 降成参考行。** 上面那段账没有删,它记的是
            # 「为什么当初给了数」;下面记的是「为什么它不能是这一页的合格线」。
            #
            # **2026-08-29:下面这段账的前提变了一半。** 规格塌缩成「标签+一句话」之后,
            # 内容量归建页 agent 定(brief:「其余由你定,不是漏写」),所以「出路不在它手里」
            # 已经不成立,提示语改成了「值得看一眼是不是该多讲一层」。
            # 但**这条仍然不升级为 ✗** —— 下面记的那个代价与规格形态无关,照旧成立。
            #
            # 出路不在建页 agent 手里。原文写着「要么把该讲的讲透,要么和相邻页合并」——
            # 内容量由 pNN.md 定死,合并页是 planner 的决定,**两条它都无权执行**。
            # 而 `prompts/brief.md` 要求「反复改到不再报 ✗ 为止」,于是这个循环在
            # 每轮 3–7 页上根本无法终止。
            #
            # 代价按模型分裂,这才是真正的问题:
            #   AWS-GPT-5.6-Sol       无视这条,照常收尾 —— 20 页 19.2 分 / 1,343 万 tok
            #   AWS-Claude-Sonnet-5   照办 —— page-09 打满 100 步,其中 Patch 39 次、
            #                         整页却只有 3 处真 ✗;它在步 61/91/100 的自述是
            #                         「调整字号间距边际效益递减」「initial 提升到 59%
            #                         了但出现叠压」「144 个文本块…让我数一下」。
            #                         92 分钟 5,195 万 tok 只交付 8 页。
            # **一条只有肯违反指令的模型才能通过的闸,不是闸,是陷阱。**
            #
            # 另外它和 system 块自相矛盾,这一点 core/builder.py 早就记下了:
            # `page-rhythm` 写着「允许有意保持内容较少的页面」,这里判它不合格。
            #
            # 数字继续打印 —— 它仍然是有用的体检项(plan_quality 和 check_palette
            # 读的是 JSON 里的 occupied/cells,不受影响),只是判归判、报归报。
            # **2026-08-28 试过把这条改成几何判定,不成立,已撤。留着免得再推一遍。**
            # 当时的想法是:低占用未必是内容不够,可能是主内容区没拿到 `flex:1`、
            # 子块停在自然高度、底部空一片 —— 那样出路就在建页 agent 手里,该报 ✗。
            # 支持它的数据是「缺 `flex:1` 的 4 页占用比均值 17、其余 16 页 49」。
            #
            # **那个 17 vs 49 是假的。** 它来自 grep 每页的内联 `<style>`,而版式类
            # (`.layout-cover` 那些)定义在 `theme.css` 里,grep 看不到 ——
            # 量的是代理不是产物。改成渲染后读 computed style 再量,
            # sonnet-full2-20260828 的 20 页**全部** flex-grow ≥ 1、
            # 内容底边离版心底边的余量**全部是 0px**,新判据 0/20 命中,已删。
            #
            # 也就是说:`#stage` 每一页都撑满了,空是空在**那个撑满的容器内部**;
            # 没有比占用比自己更便宜的几何代理。要再动这条,得先有新证据。
            # (同一批页还测了:规格长度 vs 占用比 r = -0.07,内容量也不解释它。)
            if occ_pct < OCC_FLOOR:
                print(f"   参考 密度偏低:占用比 {occ_pct}% < 目标 {OCC_FLOOR}%。"
                      f"**这是参考项,不是失败项**,不要为它反复调字号、间距或加装饰。"
                      f"但内容量现在归你定,值得看一眼:是不是该把这一页的道理多讲一层")
            if n_text and not (TEXT_LO <= n_text <= TEXT_HI):
                which = "偏少" if n_text < TEXT_LO else "偏多"
                print(f"   参考 文本块 {n_text} 个,{which}(参考区间 {TEXT_LO}–{TEXT_HI}),"
                      f"同上,不是失败项")
        # 主题有没有生效。**报参考,不报 ✗** —— 页面无权改 `assets/`(brief 明令),
        # 报 ✗ 就复制了占用比那个陷阱(它降级为参考的理由正是「出路不在建页 agent
        # 手里」)。这条的代价量过:theme.css 首行残留一个 markdown 围栏,浏览器把它
        # 连同 `:root` 一起丢弃,20 页全部无样式渲染,而当时所有判据都报绿。
        th = probe.get("theme") or {}
        if not th.get("padX"):
            print("   参考 主题 token 没生效:`--pad-x` 在 :root 上解析不出来。"
                  "**这不是本页能修的** —— 去看 `assets/theme.css` 是不是坏了"
                  "(首行残留代码围栏、语法错误吞掉 :root 之类)，页面无权改它")
        elif th.get("stagePad") in ("0px", "", None):
            print(f"   参考 版心 padding 是 {th.get('stagePad')!r},而主题声明了 "
                  f"--pad-x={th['padX']} —— 查一下本页 <style> 是不是覆盖了 "
                  f"`#stage` 的 padding")

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
        if st["png"]:
            print(f"   截图 {st['png']}  ({SHOT_W}×{SHOT_H},约 {SHOT_W*SHOT_H//750} token)")
        if st.get("crop"):
            from PIL import Image as _I
            w, h = _I.open(st["crop"]).size
            print(f"   裁图 {st['crop']}  ({w}×{h},约 {w*h//750} token)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pages", nargs="*", help="页面文件;不给就查当前目录下所有 page-*.html")
    ap.add_argument("--shot", action="store_true", help="另存截图")
    ap.add_argument("--shot-dir", default="/tmp/selfcheck")
    ap.add_argument("--wait", type=int, default=1200, help="打开后等多少毫秒再测")
    ap.add_argument("--after", action="append", default=[], metavar="JS",
                    help="在页面里跑这段 JS,然后**把这一页重新测一遍**(可多次给,依次叠加)。"
                         "不需要配 --shot;配了才另存 -afterN.png。"
                         "例:--after \"document.querySelector('#btn').click()\"")
    ap.add_argument("--crop", metavar="X,Y,W,H",
                    help="从 1600×900 原图里裁这一块再放大(报告里 @x,y w×h 那几个数)。"
                         "每个状态各出一张 -crop.png")
    ap.add_argument("--zoom", type=int, default=2, help="裁图放大倍数,默认 2")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    files = a.pages or sorted(str(p) for p in Path(".").glob("page-*.html"))
    files = [f for f in files if Path(f).exists()]
    if not files:
        print("没找到页面。用法: python3 assets/selfcheck.py page-01.html")
        return 2
    try:
        box = [int(v) for v in a.crop.split(",")] if a.crop else None
        # --crop 要有原图才裁得出来,所以它隐含 --shot。写死这条比让人自己配两个开关好:
        # 只给 --crop 却静静地什么都不出,正是 --after 那个 bug 的形状。
        res = asyncio.run(run(files, a.shot_dir if (a.shot or a.crop) else None,
                              a.wait, a.after, box, a.zoom))
    except ImportError:
        print("这台机器上 playwright 应该是装好的;若报缺失: pip install playwright")
        return 2

    if a.json:
        print(json.dumps(
            [{"page": n,
              "states": [{"after": st["label"], "js_error": st.get("js_error"),
                          **(st["probe"] or {}), "errors": st["errs"], "failed": st["bad"],
                          "shot": str(st["png"]) if st["png"] else None,
                          "crop": str(st["crop"]) if st.get("crop") else None}
                         for st in states]}
             for n, states in res],
            ensure_ascii=False, indent=2, default=str))
        return 0

    for name, states in res:
        report(name, states)
    return 0


if __name__ == "__main__":
    sys.exit(main())
