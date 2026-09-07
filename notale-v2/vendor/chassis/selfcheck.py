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
import contextlib
import io
import json
import sys
from pathlib import Path

W, H = 1600, 900
SHOT_W, SHOT_H = 800, 450       # 截图尺寸,只影响截图不影响测量

# 版面密度的下限与区间。实测:Opus 那条线占用比 57–69%(nn-06 69%、nn-11 63%)、
# 文本块中位 29–62;我们三个模型占用比 22–44%,ape-ds3 有 23/50 页低于 20%。
# 45 是留了余量的保守值;文本块超 80 的页人眼一看就太满(nn-10 有 4 页)。
# OCC_FLOOR / TEXT_LO / TEXT_HI 2026-09-05 删 —— 见 report() 里那段注释。

# 2026-09-05 修:这段是 r-string,里面写 `\\(` 到了 JS 里是「转义的反斜杠 + 括号」,于是
# alpha() 的正则永远匹配不到 rgb(...) —— 只有底色/描边的容器一直被当成"没有容器",报告里
# "容器 0 个"出现在满屏卡片的页上。同类的 `\\s+` 也一并修。修前后:史记 C-02 容器 2 → 8。
PROBE = r"""() => {
  const num = v => { const f = parseFloat(v); return Number.isFinite(f) ? f : 0; };
  const W = %d, H = %d;
  const clipped = [], escaped = [], sizes = [];
  const boxes = [], texts = [];
  const alpha = c => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
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
    const c = (el.className || '').toString().trim().split(/\s+/)[0];
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

  // 主体:最大内容块与第二大的面积比。**只报数,不判定。**
  // 「一页要有一个主体」这句话 reference、check_use、反套路清单各说了一遍
  // (check_use 随每次 Check 回传,一轮 27 页发了 73 遍),而报告里从来没有一个数
  // 对应它 —— 模型无从知道自己这页是 1.4 倍。缺的不是话,是镜子。
  // 铺满层不算内容,和占用比同一口径。
  const blocks = [];
  for (const el of document.querySelectorAll('#stage *')) {
    const cs2 = getComputedStyle(el), r2 = el.getBoundingClientRect();
    if (cs2.display === 'none' || cs2.visibility === 'hidden') continue;
    if (num(cs2.opacity) <= .05 || r2.width <= 0 || r2.height <= 0) continue;
    const a = r2.width * r2.height;
    if (a >= W * H * 0.98) continue;
    const media = ['CANVAS','SVG','IMG','VIDEO'].includes(el.tagName);
    let leafText = '';
    for (const n of el.childNodes) if (n.nodeType === 3) leafText += n.textContent;
    if (media || (el.children.length === 0 && leafText.trim())) blocks.push(a);
  }
  blocks.sort((a, b) => b - a);
  const subject = blocks.length
    ? {top: blocks[0] / (W * H), ratio: blocks[1] ? blocks[0] / blocks[1] : 0}
    : null;

  // 字阶:主题在 :root 上声明了哪些 --fs-*,页面上有多少文字元素不在这些档位。
  // 契约「字号只用主题 token」写在 tech.md,此前从无判据。
  // 次级文字:小且低对比。**口径写死在这里,规则文本引用同一个定义。**
  // ≤15px 与「低对比」是两个条件的合取 —— 只按字号算是 59%%,合取后是 38%%,
  // 两个数不能混用(2026-09-05 第一稿混用过)。
  const lum = c => {
    const m = (c.match(/[\d.]+/g) || [0,0,0]).slice(0,3).map(Number);
    const [r0,g0,b0] = m.map(v => { v/=255; return v<=.03928 ? v/12.92
                                    : Math.pow((v+.055)/1.055, 2.4); });
    return .2126*r0 + .7152*g0 + .0722*b0;
  };
  const stageCS = getComputedStyle(stage);
  const bgL = lum(stageCS.backgroundColor === 'rgba(0, 0, 0, 0)'
                  ? 'rgb(255,255,255)' : stageCS.backgroundColor);
  const contrast = c => { const l = lum(c), a = Math.max(l,bgL), b2 = Math.min(l,bgL);
                          return (a+.05)/(b2+.05); };
  const mainContrast = contrast(stageCS.color);
  let minorN = 0, minorChars = 0, allChars = 0, allCjk = 0;
  const minorAt = [];
  for (const el of stage.querySelectorAll('*')) {
    if (el.children.length) continue;
    let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
    own = own.trim(); if (!own) continue;
    const cs3 = getComputedStyle(el), r3 = el.getBoundingClientRect();
    if (cs3.display === 'none' || cs3.visibility === 'hidden' || r3.width <= 0) continue;
    allChars += own.length;
    allCjk += (own.match(/[\u4e00-\u9fff]/g) || []).length;
    if ((parseFloat(cs3.fontSize)||0) <= 15 && contrast(cs3.color) < mainContrast*0.75) {
      minorN++; minorChars += own.length;
      if (minorAt.length < 3) minorAt.push(Math.round(r3.left)+','+Math.round(r3.top)
                                           +' «'+own.slice(0,18)+'»');
    }
  }

  // 讲稿区:#stage 之外的 <aside class="notes" hidden>。不渲染,所以上面所有几何量都不含它;
  // 这里单独数它的字,和画面字数并排报 —— 「画面 ≤ N 字,其余进讲稿」这条约束要有两个数才能看。
  const notesEl = document.querySelector('aside.notes');
  const notesChars = notesEl ? (notesEl.textContent || '').replace(/\s+/g, '').length : 0;

  // 粗侧边条:**只算卡片/callout**,即有底色或圆角的容器。表格底边线和图表轴线
  // 也是单边描边,但它们合法 —— 第一稿没收窄口径,46 处里混了大量误报。
  const railAt = [];
  for (const el of stage.querySelectorAll('*')) {
    const cs4 = getComputedStyle(el), r4 = el.getBoundingClientRect();
    if (r4.width <= 0 || r4.height <= 0) continue;
    const boxy = cs4.backgroundColor !== 'rgba(0, 0, 0, 0)'
                 || (parseFloat(cs4.borderTopLeftRadius)||0) > 0;
    if (!boxy) continue;
    for (const side of ['Left','Right']) {
      const w4 = parseFloat(cs4['border'+side+'Width'])||0;
      if (w4 <= 1 || cs4['border'+side+'Style'] === 'none') continue;
      if (cs4['border'+side+'Color'] === 'rgba(0, 0, 0, 0)') continue;
      const others = ['Left','Right','Top','Bottom'].filter(s => s !== side)
        .map(s => parseFloat(cs4['border'+s+'Width'])||0);
      if (others.every(o => o < w4) && railAt.length < 3) {
        railAt.push('border-'+side.toLowerCase()+' '+w4+'px @'
                    +Math.round(r4.left)+','+Math.round(r4.top));
      }
    }
  }

  // 容器填充率:带底色/描边/阴影、面积 ≥5%% 版心的容器里,叶子内容(文字/媒体/控件)的包围盒占容器面积的比例,
  // 以及内容底边到容器底边的空隙占容器高度的比例。抓的是「字删了盒子没缩」的半空卡片。
  const fills = [];
  for (const el of stage.querySelectorAll('*')) {
    const cs5 = getComputedStyle(el), r5 = el.getBoundingClientRect();
    if (cs5.display === 'none' || cs5.visibility === 'hidden' || num(cs5.opacity) <= .05) continue;
    const a5 = r5.width * r5.height; if (a5 < W * H * 0.05 || a5 > W * H * 0.9) continue;
    const boxy5 = alpha(cs5.backgroundColor) > 0.02 || (num(cs5.borderTopWidth) > 0 && alpha(cs5.borderTopColor) > 0.02)
                  || (cs5.boxShadow && cs5.boxShadow !== 'none');
    if (!boxy5) continue;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n5 = 0;
    for (const c of el.querySelectorAll('*')) {
      const cc = getComputedStyle(c); if (cc.display === 'none' || cc.visibility === 'hidden') continue;
      const tg = c.tagName.toLowerCase(); let own5 = '';
      for (const nd of c.childNodes) if (nd.nodeType === 3) own5 += nd.textContent;
      if (!own5.trim() && !['svg','canvas','img','input','button','select'].includes(tg)) continue;
      const rr = c.getBoundingClientRect(); if (rr.width < 2 || rr.height < 2) continue;
      x0 = Math.min(x0, rr.left); y0 = Math.min(y0, rr.top); x1 = Math.max(x1, rr.right); y1 = Math.max(y1, rr.bottom); n5++;
    }
    const fill = n5 ? ((x1 - x0) * (y1 - y0)) / a5 : 0;
    const gap = n5 ? (r5.bottom - y1) / r5.height : 1;
    fills.push({tag: label(el), at: at(r5), fill: Math.round(fill * 100) / 100, gap: Math.round(gap * 100) / 100,
                area: Math.round(a5 / (W * H) * 100) / 100});
  }

  const rootCS = getComputedStyle(document.documentElement);
  const scale = new Set();
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
    for (const rule of rules || []) {
      if (!rule.style) continue;
      for (const prop of rule.style) {
        if (prop.startsWith('--fs')) {
          const v = num(rootCS.getPropertyValue(prop));
          if (v) scale.add(Math.round(v));
        }
      }
    }
  }
  const offScale = scale.size
    ? sizes.filter(s => !scale.has(Math.round(s))).length : 0;

  return {theme: {padX: padX, stagePad: stagePad},
          subject: subject, scale: [...scale].sort((a,b)=>a-b), offScale: offScale,
          minor: {n: minorN, chars: minorChars, all: allChars, at: minorAt},
          text: {chars: allChars, cjk: allCjk, notes: notesChars},
          fills: fills.slice(0, 30),
          rails: railAt,
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
                # 分步出场:页面声明了 data-step 就逐步拍,**主截图和越界判定以末步为准** ——
                # 末步才是完整画面;拿第 0 步当 00.png 会让占用比、judge 全部失真。
                smax = await pg.evaluate("(window.Deck && Deck.stepMax) || 0")
                step_pngs, step_issues = [], []
                if smax:
                    counts = await pg.evaluate(
                        "Array.from({length: Deck.stepMax + 1}, (_, i) =>"
                        " document.querySelectorAll('#stage [data-step=\"' + i + '\"]').length)")
                    fns = await pg.evaluate("Deck._stepFns.length")
                    if smax < 2:
                        step_issues.append("分步只有 1 步,没意义:要么 ≥2 步,要么不分步")
                    for i in range(1, smax + 1):
                        if counts[i] == 0 and not fns:
                            step_issues.append(f"第 {i} 步没有任何元素出场,也没有 Deck.onStep(空步)")
                    if shot_dir:
                        for i in range(0, smax):
                            await pg.evaluate(f"Deck.stepTo({i})")
                            await pg.wait_for_timeout(350)
                            q = Path(shot_dir) / f"{stem}-step{i}.png"
                            q.parent.mkdir(parents=True, exist_ok=True)
                            await pg.screenshot(path=str(q))
                            _shrink(q)
                            step_pngs.append(q)
                        # 回退门禁:走到末步再退回第 0 步,画面必须和开场一样 —— onStep 的 fn
                        # 若只向前追加、不按步数整体重绘,这里字节就对不上。
                        await pg.evaluate(f"Deck.stepTo({smax}); Deck.stepTo(0)")
                        await pg.wait_for_timeout(350)
                        back = Path(shot_dir) / f"{stem}-step0-back.png"
                        await pg.screenshot(path=str(back)); _shrink(back)
                        if back.read_bytes() != step_pngs[0].read_bytes():
                            step_issues.append("回退到第 0 步后画面与开场不同:onStep 的 fn 没按步数完整重绘,只是向前追加")
                        back.unlink()
                    await pg.evaluate(f"Deck.stepTo({smax})")
                    await pg.wait_for_timeout(350)
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
                       "bad": list(bad), "png": None,
                       "steps": smax, "step_pngs": step_pngs, "step_issues": step_issues}]
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


def _report_state(name: str, states: list, text_report: bool = False) -> None:
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
        if st.get("steps"):
            print(f"   分步 {st['steps']} 步，以上判定按末步")
        for x in st.get("step_issues") or []:
            print(f"   ✗ {x}")
        if sizes:
            print(f"   canvas {probe['canvases']} 个;有文字的元素 {len(sizes)} 个,"
                  f"字号最小 {sizes[0]:g}px 中位 {sizes[len(sizes)//2]:g}px 最大 {sizes[-1]:g}px")
        # 主体与字阶 —— **只报数,不判定,不升级为 ✗。**
        # 升级为闸的代价记在下面占用比那段账里(Sonnet 打满 100 步、92 分钟只交付 8 页),
        # 而这两条还各有正当例外:对照页天然多主体平权,`.big` 这类展示数值也不在 --fs 档里。
        # 判定权留给模型,harness 只负责让它看得见。
        subj = probe.get("subject")
        if subj and subj.get("ratio"):
            print(f"   主体 最大内容块占版心 {subj['top'] * 100:.0f}%,"
                  f"比第二大的大 {subj['ratio']:.1f} 倍")
        # 次级文字与粗侧边条 —— 同样只报数与位置,不判定。
        # **报位置是必要的**:只给比例,模型不知道该去看哪里。
        mn = probe.get("minor") or {}
        if mn.get("all"):
            pct = mn["chars"] * 100 // mn["all"]
            note = ("；例如 " + "、".join(mn.get("at") or [])) if mn.get("at") else ""
            print(f"   次级文字 ≤15px 且低对比的 {mn['n']} 处,承载 {pct}% 的字符{note}")
        rails = probe.get("rails") or []
        if rails:
            print(f"   侧边条 有底色或圆角的容器上有 {len(rails)} 处单边粗描边："
                  + "、".join(rails))
        # 画面字数 / 讲稿字数 —— 只在 --text-report 时打印,基线报告一个字节不变。
        # 2026-09-05 实测:生成页每页可见字符中位 550–750,金样本中位 206;这是 G3「字太密」的数。
        tx = probe.get("text") or {}
        if text_report and tx:
            print(f"   文字 画面 {tx.get('chars', 0)} 字（汉字 {tx.get('cjk', 0)}）· 讲稿 {tx.get('notes', 0)} 字")
        scale = probe.get("scale") or []
        off = probe.get("offScale") or 0
        if scale and sizes:
            print(f"   字阶 {off}/{len(sizes)} 个文字元素不在主题声明的档位上"
                  f"（{'/'.join(str(x) for x in scale)}px）")
        # 2026-09-05 删掉了这里的「密度/占用比/文本块」三行。占用比数的是 32×18 格被内容盖住的比例,
        # 同样的内容铺满整页比集中在一处得分高一倍 —— 它在奖励"铺开"、惩罚"集中",正是半空卡片与
        # 碎留白的来源;文本块区间同理在鼓励多块文字。数字仍在 JSON 里(occupied/cells/texts),
        # 只是不再念给模型听。占用比曾是这个仓库追得最狠的一个数,历史见 git log。
        # 取而代之的构图数只有两个:上面的「主体」,和下面的「容器填充率」。
        fl = probe.get("fills") or []
        if fl:
            half = [f for f in fl if f["fill"] < 0.45 or f["gap"] > 0.35]
            where = "、".join(f"{f['tag']}@{f['at'][0]},{f['at'][1]} 填充 {int(f['fill']*100)}%" for f in half[:3])
            print(f"   区块 {len(fl)} 个(带底色或描边,≥5% 版心),其中 {len(half)} 个半空(内容填充 <45% 或底部空 >35%)"
                  + (f":{where}" if where else "")
                  + ("。字删了区块要跟着缩:合并、去掉,或者干脆不要这个容器" if half else ""))
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

        # 2026-09-05 修:这一块原来缩进在上面的 elif 里,只有版心 padding 为 0 时才会打印 ——
        # 叠压/侵入/小容器三条一直被静默吞掉。现在无条件打印。
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
            for i, q in enumerate(st.get("step_pngs") or []):
                print(f"   截图 {q}  (第 {i} 步)")
            print(f"   截图 {st['png']}  ({SHOT_W}×{SHOT_H}"
                  + (f",第 {st['steps']} 步 = 完整画面" if st.get("steps") else "") + ")")
        if st.get("crop"):
            from PIL import Image as _I
            w, h = _I.open(st["crop"]).size
            print(f"   裁图 {st['crop']}  ({w}×{h})")


def report(name: str, states: list, text_report: bool = False) -> None:
    """Every state is measured upstream; compress equal output, never probe data.

    Compare against the first measured state, not the previous state. Errors and
    image paths always remain explicit; disappearing metrics are named as well.
    """
    print(f"\n── {name}")
    baseline = None
    baseline_label = "初态"
    scales = set()
    for index, state in enumerate(states):
        if index:
            print(f"   ┄ after{index} «{state['label']}»")
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            _report_state(name, [state], text_report)
        lines = [line for line in buf.getvalue().splitlines()
                 if line.strip() and not line.lstrip().startswith(("──", "┄"))]
        measured = state.get("probe") is not None and not state.get("js_error") \
            and not state["probe"].get("fatal")
        metrics = [line for line in lines if not line.lstrip().startswith(
            ("✗", "打不开:", "截图 ", "裁图 "))]
        emitted = lines
        if measured and baseline is not None:
            emitted = [line for line in lines if line not in metrics or line not in baseline]
            current_keys = {line.strip().split()[0] for line in metrics}
            missing = sorted({line.strip().split()[0] for line in baseline} - current_keys)
            unchanged = sum(line in baseline for line in metrics)
            if unchanged:
                print(f"   已测，{'其余 ' + str(unchanged) + ' 项' if emitted or missing else '指标'}同{baseline_label}")
            if missing:
                print("   本状态不再报告的项目：" + "、".join(missing))
        elif measured:
            baseline = metrics
            baseline_label = "初态" if index == 0 else f"after{index}"
        for line in emitted:
            if line.lstrip().startswith("字阶 ") and "（" in line:
                head, scale = line.split("（", 1)
                if scale in scales:
                    line = head
                scales.add(scale)
            print(line)


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
    ap.add_argument("--text-report", action="store_true",
                    help="多报一行「画面 N 字 · 讲稿 K 字」(builder --notes 臂用);默认不报")
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
        report(name, states, a.text_report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
