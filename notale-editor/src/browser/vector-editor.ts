import {
  cleanVector,
  createSvg,
  freshVector,
  pointIn,
  shapePath,
  SVG_NS,
  VID,
  vectorDiff,
  vectorId,
  vectorNode,
  paintVector,
} from './vector-dom.js';
import { calculatePaths, cancelVectorCalculation, transformPath, curves } from './vector-kernel.js';
import { portableVector } from './vector-export.js';
import { editVectorGradient } from './vector-gradient.js';
import { editVectorNodes } from './vector-nodes.js';
import type { Slide } from '../domain/model.js';
export function createVectorEditor(ctx: {
  slide: Slide;
  runtimeId: string;
  wasmUrl: string;
  enabled: () => boolean;
  selection: () => string[];
  select: (ids: string[]) => void;
  locked: (node: Element) => boolean;
  send: (type: string, data: unknown) => void;
  active: (value: boolean) => void;
  refresh: () => void;
}) {
  curves.setup(new curves.Size(1, 1));
  let sequence = 0,
    nodes: ReturnType<typeof editVectorNodes> | undefined,
    scope: SVGElement | undefined;
  let sourceGroup: SVGGraphicsElement | undefined, sourceJob: Promise<void> | undefined;
  let gradientHandles: ReturnType<typeof editVectorGradient> | undefined;
  let draw:
    | {
        root: SVGSVGElement;
        before: Element;
        path: SVGElement;
        points: { x: number; y: number }[];
        kind: string;
        start?: DOMPoint;
        model?: paper.Path;
      }
    | undefined;
  let input: HTMLTextAreaElement | undefined,
    textBefore: Element | undefined,
    textTarget: SVGElement | undefined,
    processing = false;
  const selected = () =>
    ctx
      .selection()
      .map((id) => vectorNode(id))
      .filter((n): n is SVGElement => !!n && (!n.closest('defs') || !!sourceGroup?.contains(n)));
  function rootOf(n: Element) {
    let root = n.closest('svg');
    while (root?.ownerSVGElement) root = root.ownerSVGElement;
    return root as SVGSVGElement | null;
  }
  function root() {
    return rootOf(selected()[0] ?? scope ?? document.documentElement);
  }
  function generated(n: Element) {
    return (
      !!n.closest('[data-notale-chart],[data-notale-connector]') ||
      Object.keys(ctx.slide.nativeCharts ?? {}).some((id) => vectorNode(id)?.contains(n)) ||
      (ctx.slide.components ?? []).some((c) => vectorNode(c.root)?.contains(n))
    );
  }
  function available(n: Element) {
    return !ctx.locked(n) && !generated(n);
  }
  function emitState() {
    const items = selected(),
      r = root();
    ctx.send('vector-state', {
      slideId: ctx.slide.id,
      runtimeId: ctx.runtimeId,
      active: !!r,
      rootId: r ? vectorId(r) : null,
      editing: !!nodes,
      gradientEditing: !!gradientHandles,
      sourceEditing: !!sourceGroup,
      sourceItems: sourceGroup
        ? [...sourceGroup.querySelector(':scope > defs[data-notale-vector-sources]')!.children].map(
            (n) => ({ id: vectorId(n), name: n.getAttribute('data-notale-name') ?? n.localName }),
          )
        : [],
      processing,
      scope: scope
        ? { id: vectorId(scope), name: scope.getAttribute('data-notale-name') ?? '组合' }
        : null,
      items: items.map((n) => ({
        id: vectorId(n),
        tag: n.localName,
        generated: generated(n),
        locked: ctx.locked(n),
        attributes: Object.fromEntries([...n.attributes].map((a) => [a.name, a.value])),
        styles: Object.fromEntries(
          [
            'filter',
            'fill',
            'stroke',
            'stroke-width',
            'opacity',
            'font-family',
            'font-size',
            'font-weight',
            'font-style',
            'letter-spacing',
            'text-anchor',
            'stroke-dasharray',
            'stroke-linecap',
            'stroke-linejoin',
            'mix-blend-mode',
          ].map((k) => [k, getComputedStyle(n).getPropertyValue(k)]),
        ),
      })),
      objects: r
        ? [r, ...r.querySelectorAll(`[${VID}]`)]
            .filter((n) => !n.closest('defs') || !!sourceGroup?.contains(n))
            .map((n) => ({
              id: vectorId(n),
              kind: 'svg',
              tag: n.localName,
              namespace: SVG_NS,
              parent: n.parentElement?.getAttribute(VID),
              html: n.outerHTML,
              text: n.textContent ?? '',
              style: Object.fromEntries(
                [...((n as SVGElement).style ?? [])].map((k) => [
                  k,
                  (n as SVGElement).style.getPropertyValue(k),
                ]),
              ),
              attributes: Object.fromEntries([...n.attributes].map((a) => [a.name, a.value])),
              locked: ctx.locked(n),
            }))
        : [],
    });
  }
  function commit(before: Element, action?: string) {
    if (sourceGroup && action !== 'source') {
      const group = sourceGroup;
      if (sourceJob) return;
      sourceJob = recomputeSource(before, group);
      void sourceJob
        .catch((error) => {
          const r = vectorNode(vectorId(before));
          if (r) paintVector(vectorDiff(cleanVector(r), before));
          ctx.send('edit-error', { message: String(error) });
        })
        .finally(() => {
          sourceJob = undefined;
        });
      return;
    }
    const r = vectorNode(vectorId(before));
    if (!r) return;
    const after = cleanVector(r),
      mutations = vectorDiff(before, after);
    if (!mutations.length) return;
    ctx.send('geometry-commit', {
      id: crypto.randomUUID(),
      runtimeId: ctx.runtimeId,
      slideId: ctx.slide.id,
      sequence: ++sequence,
      vector: true,
      commands: [
        {
          type: action ? 'svg.structure' : 'svg.patch',
          slideId: ctx.slide.id,
          ...(action ? { action } : {}),
          mutations,
        },
      ],
      before: [{ id: vectorId(r), style: null, vector: vectorDiff(after, before) }],
      after: [{ id: vectorId(r), style: null, vector: mutations }],
    });
    ctx.refresh();
    emitState();
  }
  function change(fn: (r: SVGSVGElement, items: SVGElement[]) => void, action?: string) {
    finishText();
    const r = root(),
      items = selected();
    if (!r || !items.length) throw Error('请先选择图形');
    if (items.some((n) => !available(n))) throw Error('请解锁对象，或创建可编辑副本');
    const before = cleanVector(r);
    try {
      fn(r, items);
      commit(before, action);
    } catch (e) {
      paintVector(vectorDiff(cleanVector(r), before));
      throw e;
    }
  }
  function exit() {
    const previousSource = sourceGroup;
    sourceGroup = undefined;
    gradientHandles?.destroy();
    gradientHandles = undefined;
    nodes?.destroy();
    nodes = undefined;
    finishText();
    if (draw) finishDraw();
    ctx.active(false);
    if (previousSource) ctx.select([vectorId(previousSource)]);
    emitState();
    ctx.refresh();
  }
  let textBucket: { id: string; before: Element } | undefined,
    textTimer: ReturnType<typeof setTimeout> | undefined;
  function textDraft(final = false, composing = false) {
    if (!textTarget || !input) return;
    const r = rootOf(textTarget)!;
    textBucket ??= { id: crypto.randomUUID(), before: cleanVector(r) };
    textTarget.textContent = input.value;
    const mutations = vectorDiff(textBucket.before, cleanVector(r));
    if (mutations.length)
      ctx.send('vector-draft', {
        id: textBucket.id,
        slideId: ctx.slide.id,
        runtimeId: ctx.runtimeId,
        selection: [vectorId(textTarget)],
        commands: [{ type: 'svg.patch', slideId: ctx.slide.id, mutations }],
        final,
        composing,
      });
    if (final) textBucket = undefined;
  }
  function flushText() {
    clearTimeout(textTimer);
    if (textBucket) textDraft(true);
  }
  function finishText() {
    if (!input || !textTarget) return;
    flushText();
    input.remove();
    input = undefined;
    textTarget = undefined;
    textBefore = undefined;
    ctx.active(false);
    ctx.refresh();
    emitState();
  }

  function editText(n: SVGElement) {
    exit();
    const leaf = n.children.length
      ? n.querySelector<SVGElement>('tspan:not(:has(*)),textPath:not(:has(*))')
      : n;
    if (!leaf || leaf.children.length) throw Error('请选择要修改的文字片段');
    const r = rootOf(n)!;
    textBefore = cleanVector(r);
    textTarget = leaf;
    input = document.createElement('textarea');
    const b = leaf.getBoundingClientRect(),
      css = getComputedStyle(leaf);
    input.value = leaf.textContent ?? '';
    input.setAttribute('aria-label', '编辑图中文字');
    input.style.cssText = `position:fixed;left:${b.left}px;top:${b.top}px;width:${Math.max(b.width, 120)}px;height:${Math.max(b.height + 12, 40)}px;z-index:2147483647;background:white;color:${css.fill};font:${css.font};border:2px solid #7450e9;resize:both;box-sizing:border-box`;
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.isComposing) return;
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        finishText();
      }
    };
    input.oninput = (e) => {
      textDraft(false, (e as InputEvent).isComposing);
      clearTimeout(textTimer);
      if (!(e as InputEvent).isComposing) textTimer = setTimeout(flushText, 500);
    };
    input.addEventListener('compositionend', () => {
      textDraft();
      clearTimeout(textTimer);
      textTimer = setTimeout(flushText, 500);
    });
    input.onblur = () => {
      if (!input?.matches(':focus')) finishText();
    };
    document.documentElement.append(input);
    ctx.active(true);
    input.focus();
    input.select();
  }
  function editNodes(n: SVGElement) {
    exit();
    if (!available(n)) throw Error('此图形由组件生成，请创建可编辑副本');
    const r = rootOf(n)!;
    nodes = editVectorNodes(
      n as SVGGraphicsElement,
      r,
      (b) => commit(b),
      () => {},
    );
    ctx.active(true);
    emitState();
  }
  function style(property: string, value: string) {
    change((_r, items) => {
      for (const n of items) n.style.setProperty(property, value);
    });
  }
  function group() {
    change((r, items) => {
      const parent = items[0].parentElement!;
      if (!items.every((n) => n.parentElement === parent) || parent.namespaceURI !== SVG_NS)
        throw Error('请选择同一组合内的图形');
      const group = createSvg('g', { 'data-notale-name': '组合' });
      parent.insertBefore(group, items[0]);
      for (const n of items) group.append(n);
      ctx.select([vectorId(group)]);
    }, 'group');
  }
  function ungroup() {
    change((_r, items) => {
      for (const g of items) {
        if (g.localName !== 'g') continue;
        const parent = g.parentElement!;
        const pm = (parent as unknown as SVGGraphicsElement).getScreenCTM();
        for (const n of [...g.children] as SVGGraphicsElement[]) {
          if (n.localName === 'defs') {
            for (const d of [...n.children]) defs(_r).append(d);
            continue;
          }
          const m = pm?.inverse().multiply(n.getScreenCTM()!);
          const css = getComputedStyle(n);
          for (const k of ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size'])
            n.style.setProperty(k, css.getPropertyValue(k));
          if (m) {
            n.style.removeProperty('transform');
            n.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
          }
          parent.insertBefore(n, g);
        }
        g.remove();
      }
      ctx.select([]);
    }, 'ungroup');
  }
  function defs(r: SVGSVGElement) {
    let d = r.querySelector<SVGDefsElement>(':scope > defs');
    if (!d) {
      d = createSvg('defs') as SVGDefsElement;
      r.prepend(d);
    }
    return d;
  }
  function gradient(kind: string, stops: { offset: number; color: string; opacity?: number }[]) {
    change((r, items) => {
      for (const n of items) {
        const g = createSvg(kind === 'radial' ? 'radialGradient' : 'linearGradient', {
          id: 'paint_' + crypto.randomUUID().replaceAll('-', ''),
        });
        if (kind !== 'radial') {
          g.setAttribute('x1', '0%');
          g.setAttribute('x2', '100%');
        }
        for (const s of stops)
          g.append(
            createSvg('stop', {
              offset: Math.max(0, Math.min(1, s.offset)),
              'stop-color': s.color,
              'stop-opacity': s.opacity ?? 1,
            }),
          );
        defs(r).append(g);
        n.style.fill = `url(#${g.id})`;
      }
    }, 'gradient');
  }
  async function combine(action: string, amount?: number) {
    const items = selected(),
      r = root();
    if (!r || !items.length) return;
    if (items.some((n) => !available(n))) throw Error('请选择可编辑形状');
    const parent = items[0].parentElement!;
    if (!items.every((n) => n.parentElement === parent)) throw Error('请选择同一组合内的形状');
    if (
      items.some((n) =>
        ctx.slide.animations.some(
          (a) => n.querySelector(`[${VID}="${a.target}"]`) || vectorId(n) === a.target,
        ),
      )
    )
      throw Error('这些形状带有动画，请对副本执行合并');
    const before = cleanVector(r),
      pm = (parent as unknown as SVGGraphicsElement).getScreenCTM()!,
      source = items.map((n) => {
        const css = getComputedStyle(n),
          m = pm.inverse().multiply((n as SVGGraphicsElement).getScreenCTM()!);
        return {
          d: transformPath(shapePath(n), m),
          fill: css.fill,
          stroke: css.stroke,
          width: parseFloat(css.strokeWidth),
          cap: css.strokeLinecap,
          join: css.strokeLinejoin,
        };
      });
    processing = true;
    emitState();
    try {
      const d = await calculatePaths(ctx.wasmUrl, source, action, amount);
      if (!r.isConnected || cleanVector(r).outerHTML !== before.outerHTML)
        throw Error('图形已变化，请重新执行');
      const g = createSvg('g', {
        'data-notale-name': '合并形状',
        'data-notale-vector-operation': action,
      });
      parent.insertBefore(g, items[0]);
      const sources = createSvg('defs', { 'data-notale-vector-sources': 'true' });
      g.append(sources);
      for (const n of items) sources.append(n);
      const css = source[action === 'subtract' ? 0 : source.length - 1];
      g.append(createSvg('path', { d, fill: css.fill === 'none' ? css.stroke : css.fill }));
      commit(before, ['outline', 'offset', 'flatten'].includes(action) ? action : action);
      ctx.select([vectorId(g)]);
    } finally {
      processing = false;
      emitState();
    }
  }
  async function outlineText(font: ArrayBuffer) {
    const n = selected()[0],
      r = root();
    if (!r || !n || n.localName !== 'text' || n.children.length)
      throw Error('文字转轮廓当前需要单一文字片段');
    const css = getComputedStyle(n);
    if (css.writingMode !== 'horizontal-tb') throw Error('请先切换为横排文字');
    if (!available(n)) throw Error('请解锁文字');
    const before = cleanVector(r);
    processing = true;
    emitState();
    try {
      const d = await calculatePaths(ctx.wasmUrl, [], 'text-outline', 0, {
        font,
        text: n.textContent,
        size: parseFloat(css.fontSize),
        x: Number(n.getAttribute('x') ?? 0),
        y: Number(n.getAttribute('y') ?? 0),
        spacing: parseFloat(css.letterSpacing) || 0,
        anchor: css.textAnchor,
      });
      if (cleanVector(r).outerHTML !== before.outerHTML) throw Error('文字已变化，请重试');
      const path = createSvg('path');
      for (const a of n.attributes)
        if (!['x', 'y', 'dx', 'dy', 'textLength', 'lengthAdjust'].includes(a.name))
          path.setAttribute(a.name, a.value);
      path.setAttribute('d', d);
      path.setAttribute('aria-label', n.textContent ?? '');
      n.replaceWith(path);
      commit(before, 'text');
    } finally {
      processing = false;
      emitState();
    }
  }
  function pattern(href: string) {
    if (!href.startsWith('data:image/')) throw Error('请选择图片文件');
    change((r, items) => {
      for (const n of items) {
        const p = createSvg('pattern', {
          id: 'pattern_' + crypto.randomUUID().replaceAll('-', ''),
          width: 1,
          height: 1,
          patternContentUnits: 'objectBoundingBox',
        });
        p.append(
          createSvg('image', { href, width: 1, height: 1, preserveAspectRatio: 'xMidYMid slice' }),
        );
        defs(r).append(p);
        n.style.fill = `url(#${p.id})`;
      }
    }, 'pattern');
  }
  async function recomputeSource(before: Element, group: SVGGraphicsElement) {
    const r = rootOf(group)!,
      src = group.querySelector(':scope > defs[data-notale-vector-sources]')!;
    const basis = cleanVector(r),
      pm = group.getScreenCTM()!;
    processing = true;
    emitState();
    try {
      const d = await calculatePaths(
        ctx.wasmUrl,
        [...src.children].map((n) => {
          const css = getComputedStyle(n);
          return {
            d: transformPath(
              shapePath(n),
              pm.inverse().multiply((n as SVGGraphicsElement).getScreenCTM()!),
            ),
            fill: css.fill,
            stroke: css.stroke,
            width: parseFloat(css.strokeWidth),
            cap: css.strokeLinecap,
            join: css.strokeLinejoin,
          };
        }),
        group.getAttribute('data-notale-vector-operation')!,
      );
      if (!r.isConnected) return;
      if (cleanVector(r).outerHTML !== basis.outerHTML) {
        await recomputeSource(before, group);
        return;
      }
      const result = group.querySelector(':scope > path');
      if (result) {
        result.setAttribute('d', d);
        const last = src.lastElementChild!,
          css = getComputedStyle(last);
        result.setAttribute('fill', css.fill === 'none' ? css.stroke : css.fill);
      }
      commit(before, 'source');
    } finally {
      processing = false;
      emitState();
    }
  }
  function sourceEdit(id?: string) {
    const g = sourceGroup ?? (selected()[0] as SVGGraphicsElement),
      source = g?.querySelector(':scope > defs[data-notale-vector-sources]');
    if (!source) throw Error('请选择合并形状');
    const n = id ? [...source.children].find((n) => vectorId(n) === id) : source.firstElementChild;
    if (!n) throw Error('源形状不可用');
    exit();
    sourceGroup = g;
    ctx.active(true);
    emitState();
    ctx.select([vectorId(n)]);
    nodes = editVectorNodes(
      n as SVGGraphicsElement,
      rootOf(g)!,
      (b) => commit(b),
      () => {},
    );
    ctx.active(true);
    emitState();
  }
  function finishSource() {
    exit();
  }
  function split() {
    change((_r, items) => {
      for (const n of items) {
        const model = new curves.CompoundPath({ pathData: shapePath(n), insert: false });
        if (model.children.length < 2) {
          model.remove();
          throw Error('请选择包含多个子路径的复合路径');
        }
        const g = createSvg('g');
        for (const a of n.attributes) if (a.name !== 'd') g.setAttribute(a.name, a.value);
        for (const p of model.children as paper.Path[])
          g.append(createSvg('path', { d: p.pathData }));
        n.replaceWith(g);
        model.remove();
      }
    }, 'split');
  }
  function arrow(end: string) {
    change((r, items) => {
      for (const n of items) {
        const marker = createSvg('marker', {
          id: 'arrow_' + crypto.randomUUID().replaceAll('-', ''),
          viewBox: '0 0 10 10',
          refX: 9,
          refY: 5,
          markerWidth: 5,
          markerHeight: 5,
          orient: 'auto-start-reverse',
        });
        marker.append(
          createSvg('path', { d: 'M0 0L10 5L0 10Z', fill: getComputedStyle(n).stroke }),
        );
        defs(r).append(marker);
        n.setAttribute('marker-' + end, `url(#${marker.id})`);
      }
    }, 'draw');
  }
  function clip(mask = false) {
    change(
      (r, items) => {
        if (items.length < 2) throw Error('请选择内容及最上方的裁剪形状');
        items.sort((a, b) =>
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
        );
        const shape = items.at(-1)!,
          parent = items[0].parentElement!;
        if (items.some((n) => n.parentElement !== parent)) throw Error('请选择同一组合内的对象');
        const wrapper = createSvg('g', { 'data-notale-name': mask ? '蒙版' : '裁剪' });
        parent.insertBefore(wrapper, items[0]);
        const def = createSvg(mask ? 'mask' : 'clipPath', {
          id: 'clip_' + crypto.randomUUID().replaceAll('-', ''),
          ...(mask ? { maskUnits: 'userSpaceOnUse' } : { clipPathUnits: 'userSpaceOnUse' }),
        });
        const local = createSvg('defs');
        local.append(def);
        wrapper.append(local);
        def.append(shape);
        for (const n of items.slice(0, -1)) wrapper.append(n);
        wrapper.setAttribute(mask ? 'mask' : 'clip-path', `url(#${def.id})`);
        ctx.select([vectorId(wrapper)]);
      },
      mask ? 'mask' : 'clip',
    );
  }
  function release() {
    change((_r, items) => {
      for (const n of items) {
        const sources = n.querySelector(':scope > defs,:scope > g[data-notale-vector-sources]');
        if (sources) {
          if (n.hasAttribute('data-notale-vector-operation'))
            for (const result of [...n.children]) if (result !== sources) result.remove();
          for (const child of [...sources.children]) {
            if (['clipPath', 'mask'].includes(child.localName))
              for (const leaf of [...child.children]) n.append(leaf);
            else n.append(child);
          }
          sources.remove();
        }
        n.removeAttribute('clip-path');
        n.removeAttribute('mask');
        n.removeAttribute('data-notale-vector-operation');
        n.removeAttribute('data-notale-vector-editing');
      }
    }, 'release');
  }
  function detach() {
    change((r, items) => {
      for (const n of items) {
        if (n.localName !== 'use') continue;
        const href = n.getAttribute('href') ?? n.getAttribute('xlink:href');
        const original = href?.startsWith('#') ? document.getElementById(href.slice(1)) : null;
        if (!original) throw Error('共享源不可用');
        const g = createSvg('g');
        g.setAttribute(VID, vectorId(n));
        for (const a of n.attributes)
          if (!['href', 'xlink:href', VID].includes(a.name)) g.setAttribute(a.name, a.value);
        const copy = freshVector(original);
        const x = Number(n.getAttribute('x') ?? 0),
          y = Number(n.getAttribute('y') ?? 0);
        g.removeAttribute('x');
        g.removeAttribute('y');
        const translated = createSvg('g', { transform: `translate(${x} ${y})` });
        g.append(translated);
        if (copy.localName === 'symbol') {
          const v = createSvg('svg', {
            viewBox: copy.getAttribute('viewBox') ?? '0 0 100 100',
            width: n.getAttribute('width') ?? '100',
            height: n.getAttribute('height') ?? '100',
          });
          for (const child of [...copy.children]) v.append(child);
          translated.append(v);
        } else translated.append(copy);
        n.replaceWith(g);
      }
    }, 'detach');
  }
  async function snapshot() {
    const r = root();
    if (!r) return;
    const copy = freshVector(await portableVector(r));
    for (const n of [copy, ...copy.querySelectorAll('*')])
      for (const a of [...n.attributes])
        if (a.name.startsWith('data-notale-') && a.name !== VID) n.removeAttribute(a.name);
    copy.style.position = 'absolute';
    copy.style.left = (parseFloat(r.style.left) || 120) + 24 + 'px';
    copy.style.top = (parseFloat(r.style.top) || 160) + 24 + 'px';
    copy.setAttribute('data-notale-name', '可编辑副本');
    ctx.send('vector-import', {
      html: copy.outerHTML,
      slideId: ctx.slide.id,
      runtimeId: ctx.runtimeId,
    });
  }
  function effect(name: string, value: number) {
    change((r, items) => {
      for (const n of items) {
        const f = createSvg('filter', {
          id: 'fx_' + crypto.randomUUID().replaceAll('-', ''),
          x: '-50%',
          y: '-50%',
          width: '200%',
          height: '200%',
        });
        f.append(
          name === 'blur'
            ? createSvg('feGaussianBlur', { stdDeviation: value })
            : createSvg('feDropShadow', {
                dx: value,
                dy: value,
                stdDeviation: Math.max(1, value / 2),
                'flood-opacity': 0.3,
              }),
        );
        defs(r).append(f);
        n.style.filter = `url(#${f.id})`;
      }
    });
  }
  function startDraw(kind: string) {
    exit();
    const r = root();
    if (!r) throw Error('请先选择一个矢量图，再在其中绘制');
    if (!available(r)) throw Error('请先创建可编辑副本');
    draw = {
      root: r,
      before: cleanVector(r),
      path: createSvg('path', {
        fill: kind === 'pen' || kind === 'pencil' ? 'none' : '#8b5cf6',
        stroke: '#6d43d6',
        'stroke-width': 2,
      }),
      points: [],
      kind,
      ...(kind === 'pen' ? { model: new curves.Path({ insert: false }) } : {}),
    };
    ctx.active(true);
  }
  function finishDraw() {
    if (!draw) return;
    if (draw.kind === 'pencil' && draw.points.length > 2) {
      const p = new curves.Path({ segments: draw.points.map((p) => [p.x, p.y]), insert: false });
      p.simplify(1);
      draw.path.setAttribute('d', p.pathData);
      p.remove();
    }
    const d = draw;
    draw.model?.remove();
    draw = undefined;
    if (d.path.isConnected && d.points.length > 1) {
      commit(d.before, 'draw');
      ctx.select([vectorId(d.path)]);
    } else d.path.remove();
    ctx.active(false);
    emitState();
    ctx.refresh();
  }
  function onDown(e: PointerEvent) {
    if (!ctx.enabled() || !draw) return;
    if ((e.target as Element).closest('[data-notale-handles]')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const p = pointIn(draw.root, e.clientX, e.clientY);
    if (draw.kind === 'pen' && draw.points.length > 2) {
      const first = draw.points[0];
      if (Math.hypot(p.x - first.x, p.y - first.y) < 8) {
        draw.model!.closed = true;
        draw.path.setAttribute('d', draw.model!.pathData);
        finishDraw();
        return;
      }
    }
    if (draw.kind === 'pen') {
      draw.start = p;
      draw.points.push({ x: p.x, y: p.y });
      draw.model!.add(new curves.Point(p.x, p.y));
      if (!draw.path.isConnected) draw.root.append(draw.path);
      draw.path.setAttribute('d', draw.model!.pathData);
      draw.root.setPointerCapture(e.pointerId);
      return;
    }
    draw.start = p;
    draw.points.push({ x: p.x, y: p.y });
    if (!draw.path.isConnected) draw.root.append(draw.path);
    draw.path.setAttribute('d', 'M' + draw.points.map((p) => `${p.x} ${p.y}`).join('L'));
    if (draw.kind !== 'pen') draw.root.setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent) {
    if (!draw?.start) return;
    const p = pointIn(draw.root, e.clientX, e.clientY),
      s = draw.start,
      w = p.x - s.x,
      h = p.y - s.y;
    if (draw.kind === 'pencil') {
      draw.points.push({ x: p.x, y: p.y });
      draw.path.setAttribute('d', 'M' + draw.points.map((p) => `${p.x} ${p.y}`).join('L'));
    } else if (draw.kind === 'pen') {
      const segment = draw.model!.lastSegment;
      segment.handleOut = new curves.Point(w, h);
      if (e.shiftKey) segment.handleOut.angle = Math.round(segment.handleOut.angle / 15) * 15;
      segment.handleIn = e.altKey ? new curves.Point(0, 0) : segment.handleOut.multiply(-1);
      draw.path.setAttribute('d', draw.model!.pathData);
    } else {
      draw.points[1] = { x: p.x, y: p.y };
      if (['polygon', 'star', 'arrow', 'arc'].includes(draw.kind)) {
        const cx = s.x + w / 2,
          cy = s.y + h / 2;
        let d = '';
        if (draw.kind === 'arc')
          d = `M${s.x} ${s.y + h}A${Math.abs(w)} ${Math.abs(h)} 0 0 1 ${p.x} ${s.y}`;
        else if (draw.kind === 'arrow')
          d = `M${s.x} ${s.y + h * 0.3}H${s.x + w * 0.6}V${s.y}L${p.x} ${cy}L${s.x + w * 0.6} ${p.y}V${s.y + h * 0.7}H${s.x}Z`;
        else {
          const count = draw.kind === 'star' ? 10 : 6;
          d =
            'M' +
            Array.from({ length: count }, (_, i) => {
              const a = (i * Math.PI * 2) / count - Math.PI / 2,
                r = draw!.kind === 'star' && i % 2 ? 0.45 : 1;
              return `${cx + ((Math.cos(a) * w) / 2) * r} ${cy + ((Math.sin(a) * h) / 2) * r}`;
            }).join('L') +
            'Z';
        }
        draw.path.setAttribute('d', d);
        return;
      }
      draw.path.setAttribute(
        'd',
        draw.kind === 'ellipse'
          ? `M${s.x} ${s.y + h / 2}a${Math.abs(w / 2)} ${Math.abs(h / 2)} 0 1 0 ${w} 0a${Math.abs(w / 2)} ${Math.abs(h / 2)} 0 1 0 ${-w} 0Z`
          : draw.kind === 'line'
            ? `M${s.x} ${s.y}L${p.x} ${p.y}`
            : `M${s.x} ${s.y}h${w}v${h}h${-w}Z`,
      );
    }
  }
  function onUp() {
    if (draw?.kind === 'pen') draw.start = undefined;
    else if (draw) finishDraw();
  }
  function cancelDraw() {
    if (draw) {
      draw.model?.remove();
      draw.path.remove();
      draw = undefined;
      ctx.active(false);
      emitState();
      ctx.refresh();
    }
  }
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('pointermove', onMove, true);
  document.addEventListener('pointerup', onUp, true);
  document.addEventListener('pointercancel', cancelDraw, true);
  window.addEventListener('blur', cancelDraw);
  const keydown = (e: KeyboardEvent) => {
    if (
      !ctx.enabled() ||
      e.isComposing ||
      (e.target instanceof HTMLElement &&
        (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)))
    )
      return;
    if (gradientHandles && e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      exit();
      return;
    }
    if (nodes) {
      let action: string | undefined,
        value = 0;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (nodes.dragging) nodes.cancel();
        else exit();
        return;
      }
      if (e.ctrlKey || e.metaKey)
        action = ({ a: 'all', c: 'copy', x: 'cut', v: 'paste' } as Record<string, string>)[
          e.key.toLowerCase()
        ];
      if (e.key === 'Delete' || e.key === 'Backspace') action = 'delete';
      if (e.key.startsWith('Arrow')) {
        action = /Left|Right/.test(e.key) ? 'nudge-x' : 'nudge-y';
        value = (/Left|Up/.test(e.key) ? -1 : 1) * (e.shiftKey ? 10 : 1);
      }
      if (action) {
        e.preventDefault();
        e.stopImmediatePropagation();
        try {
          nodes.action(action, value);
        } catch (error) {
          ctx.send('edit-error', { message: String(error) });
        }
        return;
      }
    }
    if (draw?.kind === 'pen' && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      draw.model!.lastSegment?.remove();
      draw.points.pop();
      draw.path.setAttribute('d', draw.model!.pathData);
      return;
    }
    if (draw && (e.key === 'Escape' || e.key === 'Enter')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        cancelDraw();
      } else finishDraw();
    }
  };
  window.addEventListener('keydown', keydown, true);
  const resize = () => {
    nodes?.refresh();
    gradientHandles?.refresh();
  };
  window.addEventListener('resize', resize);
  return {
    refresh() {
      nodes?.refresh();
      gradientHandles?.refresh();
      emitState();
    },
    get active() {
      return !!nodes || !!draw || !!input || !!gradientHandles;
    },
    get scope() {
      return scope;
    },
    exit,
    flush: flushText,
    enter(n: SVGElement) {
      if (['g', 'svg'].includes(n.localName)) {
        scope = n;
        emitState();
        return;
      }
      if (['text', 'tspan', 'textPath'].includes(n.localName)) editText(n);
      else editNodes(n);
    },
    async action(name: string, data: any = {}) {
      if (name === 'cancel') {
        cancelVectorCalculation();
        return;
      }
      if (name === 'nodes') {
        const n = selected()[0];
        if (n) editNodes(n);
      } else if (name === 'text') {
        const n = selected()[0];
        if (n) editText(n);
      } else if (name === 'attribute')
        change((_r, items) => {
          for (const n of items) n.setAttribute(data.property, String(data.value));
        });
      else if (name === 'style') style(data.property, data.value);
      else if (name === 'gradient') gradient(data.kind, data.stops);
      else if (name === 'gradient-handles') {
        exit();
        const n = selected()[0],
          r = root();
        if (n && r) {
          gradientHandles = editVectorGradient(n as SVGGraphicsElement, r, (b) =>
            commit(b, 'gradient'),
          );
          ctx.active(true);
        }
      } else if (name === 'text-outline') await outlineText(data.font);
      else if (name === 'pattern') pattern(data.href);
      else if (name === 'source') sourceEdit(data.id);
      else if (name === 'finish-source') await finishSource();
      else if (name === 'split') split();
      else if (name === 'arrow') arrow(data.end ?? 'end');
      else if (name === 'group') group();
      else if (name === 'ungroup') ungroup();
      else if (
        ['union', 'subtract', 'intersect', 'exclude', 'outline', 'offset', 'flatten'].includes(name)
      )
        await combine(name, data.amount);
      else if (name === 'clip' || name === 'mask') clip(name === 'mask');
      else if (name === 'clip-edit') {
        const n = selected()[0],
          ref =
            n &&
            (n.getAttribute('clip-path') ?? n.getAttribute('mask') ?? '').match(
              /#([^)'\"\s]+)/,
            )?.[1];
        const def = ref ? document.getElementById(ref) : null;
        const path = def?.querySelector<SVGElement>(
          'path,rect,circle,ellipse,line,polyline,polygon',
        );
        if (!path) throw Error('请选择带有可编辑边界的裁剪或蒙版');
        if (def?.getAttribute('clipPathUnits') === 'objectBoundingBox')
          throw Error('该裁剪使用相对边界，请解除后重新创建裁剪');
        editNodes(path);
      } else if (name === 'release') release();
      else if (name === 'detach') detach();
      else if (name === 'snapshot') await snapshot();
      else if (name === 'effect') effect(data.kind, data.value);
      else if (name === 'draw') startDraw(data.kind);
      else if (name === 'exit') exit();
      else if (name === 'node') nodes?.action(data.action, data.value);
      else if (name === 'export') {
        const r = root();
        if (r)
          ctx.send('vector-export', {
            html: new XMLSerializer().serializeToString(await portableVector(r)),
          });
      }
      emitState();
    },
    destroy() {
      exit();
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', cancelDraw, true);
      window.removeEventListener('blur', cancelDraw);
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('resize', resize);
    },
  };
}
