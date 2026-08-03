import path from 'node:path';
import { escapeHtml, writeText } from './lib/io.mjs';

export async function bindDeck({ runDir, project, design, pages, sections }) {
  const title = escapeHtml(project.title);
  const canvas = design.canvas;
  const html = `<!doctype html>
<html lang="${escapeHtml(project.language || 'zh-CN')}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="vendor/reveal/reveal.css">
  <style>
    :root { color-scheme: dark; }
    html, body { width:100%; height:100%; margin:0; background:#08101A; }
    .reveal { background:#08101A; }
    .reveal .slides { text-align:left; }
    .reveal .slides section { padding:0; }
    .reveal .controls { color:${design.colors.primary}; }
    .reveal .progress { color:${design.colors.accent}; height:3px; }
    @media (prefers-reduced-motion:reduce) {
      .native-3d-stage, .native-plane { transition:none!important; }
    }
    @media print {
      .native-plane-base { transform:translate3d(0,74px,-28px)!important; }
      .native-plane-copy { transform:translate3d(0,-22px,74px)!important; }
      .native-plane-art { transform:translate3d(0,-118px,148px)!important; }
    }
  </style>
</head>
<body>
  <div class="reveal">
    <div class="slides">
${sections.map(section => `      ${section}`).join('\n')}
    </div>
  </div>
  <script src="vendor/reveal/reveal.js"></script>
  <script>
    Reveal.initialize({
      width: ${canvas.width},
      height: ${canvas.height},
      margin: 0,
      minScale: 0.1,
      maxScale: 2,
      hash: false,
      controls: true,
      progress: true,
      center: false,
      transition: 'none',
      backgroundTransition: 'none'
    });
    document.addEventListener('input', event => {
      const live = event.target.closest?.('.snapshot-live');
      if (!live) return;
      live.dataset.edited = 'true';
    });
    const syncGraph = stage => {
      const center = id => {
        const node = stage.querySelector('.graph-node[data-node-id="' + CSS.escape(id) + '"]');
        if (!node) return null;
        return {
          x: parseFloat(node.style.left) + parseFloat(node.style.width) / 2,
          y: parseFloat(node.style.top) + parseFloat(node.style.height) / 2
        };
      };
      stage.querySelectorAll('.graph-layer line[data-from][data-to]').forEach(line => {
        const from = center(line.dataset.from), to = center(line.dataset.to);
        if (!from || !to) return;
        line.setAttribute('x1', from.x); line.setAttribute('y1', from.y);
        line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);
      });
    };
    let drag = null;
    document.addEventListener('pointerdown', event => {
      const node = event.target.closest?.('.graph-node');
      if (!node || !event.altKey) return;
      const stage = node.closest('.layer-stage');
      if (!stage) return;
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      drag = {
        node, stage, pointerId: event.pointerId,
        startX: event.clientX, startY: event.clientY,
        left: parseFloat(node.style.left), top: parseFloat(node.style.top),
        scaleX: rect.width / stage.offsetWidth, scaleY: rect.height / stage.offsetHeight
      };
      stage.dataset.graphEdited = 'true';
      node.dataset.edited = 'true';
      try { node.setPointerCapture(event.pointerId); } catch {}
    });
    document.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.node.style.left = (drag.left + (event.clientX - drag.startX) / drag.scaleX) + 'px';
      drag.node.style.top = (drag.top + (event.clientY - drag.startY) / drag.scaleY) + 'px';
      syncGraph(drag.stage);
    });
    document.addEventListener('pointerup', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      syncGraph(drag.stage);
      drag = null;
    });
    let nativeDrag = null;
    const resetNative3d = stage => {
      stage.classList.remove('is-expanded');
      stage.style.setProperty('--native-rx', (Number(stage.dataset.baseRx || 56)) + 'deg');
      stage.style.setProperty('--native-ry', '0deg');
      stage.style.setProperty('--native-rz', '-12deg');
      stage.dataset.nativeLocked = 'false';
    };
    document.querySelectorAll('[data-native-interactive="css3d"]').forEach(stage => {
      stage.dataset.baseRx = String(parseFloat(getComputedStyle(stage).getPropertyValue('--native-rx')) || 56);
      stage.dataset.nativeLocked = 'false';
    });
    document.addEventListener('pointerdown', event => {
      const stage = event.target.closest?.('[data-native-interactive="css3d"]');
      if (!stage) return;
      event.preventDefault();
      nativeDrag = {
        stage, pointerId:event.pointerId, x:event.clientX, y:event.clientY,
        rx:parseFloat(stage.style.getPropertyValue('--native-rx')) || Number(stage.dataset.baseRx || 56),
        ry:parseFloat(stage.style.getPropertyValue('--native-ry')) || 0,
        moved:false
      };
      try { stage.setPointerCapture(event.pointerId); } catch {}
    });
    document.addEventListener('pointermove', event => {
      if (!nativeDrag || nativeDrag.pointerId !== event.pointerId) return;
      const dx=event.clientX-nativeDrag.x, dy=event.clientY-nativeDrag.y;
      if (Math.abs(dx)+Math.abs(dy)>4) nativeDrag.moved=true;
      nativeDrag.stage.style.setProperty('--native-ry', (nativeDrag.ry + dx * .18) + 'deg');
      nativeDrag.stage.style.setProperty('--native-rx', Math.max(24,Math.min(76,nativeDrag.rx - dy * .14)) + 'deg');
      nativeDrag.stage.dataset.nativeDragged = nativeDrag.moved ? 'true' : 'false';
    });
    document.addEventListener('pointerup', event => {
      if (!nativeDrag || nativeDrag.pointerId !== event.pointerId) return;
      const {stage,moved}=nativeDrag;
      nativeDrag=null;
      if (!moved) {
        stage.classList.toggle('is-expanded');
        stage.dataset.nativeLocked = String(stage.classList.contains('is-expanded'));
      }
    });
    document.addEventListener('keydown', event => {
      const stage = event.target.closest?.('[data-native-interactive="css3d"]');
      if (!stage) return;
      const ry=parseFloat(stage.style.getPropertyValue('--native-ry')) || 0;
      const rx=parseFloat(stage.style.getPropertyValue('--native-rx')) || Number(stage.dataset.baseRx || 56);
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); stage.classList.toggle('is-expanded');
        stage.dataset.nativeLocked=String(stage.classList.contains('is-expanded'));
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); stage.style.setProperty('--native-ry',(ry+(event.key==='ArrowLeft'?-8:8))+'deg');
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault(); stage.style.setProperty('--native-rx',Math.max(24,Math.min(76,rx+(event.key==='ArrowUp'?-5:5)))+'deg');
      } else if (event.key === 'Escape') {
        event.preventDefault(); resetNative3d(stage);
      }
    });
  </script>
</body>
</html>`;
  await writeText(path.join(runDir, 'deck.html'), html);
  return {
    file: 'deck.html',
    pages: pages.map(page => page.id),
    canvas,
  };
}

function renderStatusBadge(label, status) {
  const cls = status === 'pass' ? 'pass' : status === 'pending' ? 'pending' : 'fail';
  return `<span class="badge ${cls}">${escapeHtml(label)} · ${escapeHtml(status)}</span>`;
}

export async function writeReport({ runDir, project, runManifest, pageEvidence }) {
  const cards = pageEvidence.map(item => {
    const hard = item.probe.pass ? 'pass' : 'fail';
    const soft = item.verdict.status || (item.verdict.pass ? 'pass' : 'fail');
    const issues = [
      ...(item.probe.issues || []).map(issue => `[硬] ${issue.message}`),
      ...(item.verdict.issues || []).map(issue => `[软] ${typeof issue === 'string' ? issue : issue.message}`),
    ];
    return `<article class="page-card">
      <div class="shot"><img src="${escapeHtml(item.probe.screenshot)}" alt="${escapeHtml(item.page.title)} 真机截图"></div>
      <div class="page-copy">
        <div class="eyebrow">${escapeHtml(item.page.id)}</div>
        <h2>${escapeHtml(item.page.title)}</h2>
        <div class="badges">${renderStatusBadge('硬闸', hard)}${renderStatusBadge('单图', soft)}</div>
        <p>${escapeHtml(item.verdict.reason || '视觉评审已完成')}</p>
        ${issues.length ? `<ul>${issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>` : '<p class="clean">无阻断问题</p>'}
      </div>
    </article>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(project.title)} · V2 验收报告</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#080D15;color:#DCE7F5;font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif}
    main{max-width:1240px;margin:auto;padding:48px 28px 80px}.hero{padding:30px;border:1px solid #26364C;border-radius:20px;background:#101A27}
    .eyebrow{color:#7DD3FC;font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}
    h1{margin:12px 0 8px;font-size:34px}h2{margin:8px 0 12px;font-size:22px}.meta{color:#8FA3BA;font-size:13px}
    .summary{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.badge{display:inline-flex;padding:5px 9px;border-radius:999px;font:700 10px/1 ui-monospace,monospace}
    .badge.pass{color:#6EE7B7;background:#064E3B}.badge.pending{color:#FDE68A;background:#713F12}.badge.fail{color:#FCA5A5;background:#7F1D1D}
    .pages{display:grid;gap:18px;margin-top:24px}.page-card{display:grid;grid-template-columns:46% 1fr;gap:24px;padding:18px;border:1px solid #26364C;border-radius:18px;background:#0E1723}
    .shot{overflow:hidden;border-radius:12px;border:1px solid #26364C;background:#000}.shot img{display:block;width:100%;height:auto}.page-copy{padding:8px 8px 8px 0}
    .badges{display:flex;gap:8px}.page-copy p,.page-copy li{color:#93A4BA;font-size:13px;line-height:1.6}.page-copy ul{padding-left:18px}.page-copy .clean{color:#6EE7B7}
    @media(max-width:760px){.page-card{grid-template-columns:1fr}.page-copy{padding:4px}}
  </style>
</head>
<body><main>
  <header class="hero">
    <div class="eyebrow">Workflow V2 · Evidence Report</div>
    <h1>${escapeHtml(project.title)}</h1>
    <p class="meta">run ${escapeHtml(runManifest.runId)} · ${escapeHtml(runManifest.createdAt)} · ${pageEvidence.length} 页</p>
    <div class="summary">
      ${renderStatusBadge('流水线', runManifest.status)}
      ${renderStatusBadge('硬闸', runManifest.hardGate)}
      ${renderStatusBadge('单图', runManifest.visualGate)}
    </div>
  </header>
  <section class="pages">${cards}</section>
</main></body></html>`;
  await writeText(path.join(runDir, 'report.html'), html);
}
