import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchBrowser } from './browser.mjs';
import { ensureDir, writeJson } from './lib/io.mjs';

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function pageProbeExpression(pageId, minFontPx) {
  return `(() => {
    const section = document.querySelector('[data-page-id="${pageId}"]');
    if (!section) return { missing: true };
    const visible = el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const parse = value => {
      const match = String(value).match(/rgba?\\(([^)]+)\\)/);
      if (!match) return null;
      const p = match[1].split(',').map(Number);
      return { r:p[0], g:p[1], b:p[2], a:p.length > 3 ? p[3] : 1 };
    };
    const luminance = color => {
      const channel = n => { const v=n/255; return v <= .03928 ? v/12.92 : ((v+.055)/1.055) ** 2.4; };
      return .2126*channel(color.r)+.7152*channel(color.g)+.0722*channel(color.b);
    };
    const contrast = (a,b) => {
      const l1=luminance(a), l2=luminance(b);
      return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
    };
    const backgroundFor = el => {
      let cur=el;
      while(cur){
        const declared=cur.dataset?.probeBackground;
        if(declared){
          const hex=declared.match(/^#([0-9a-f]{6})$/i);
          if(hex){ const value=parseInt(hex[1],16); return {r:(value>>16)&255,g:(value>>8)&255,b:value&255,a:1}; }
        }
        const bg=parse(getComputedStyle(cur).backgroundColor);
        if(bg && bg.a > .94) return bg;
        cur=cur.parentElement;
      }
      return {r:8,g:16,b:26,a:1};
    };
    const sectionRect = section.getBoundingClientRect();
    const outside = [];
    const smallText = [];
    const lowContrast = [];
    for(const el of section.querySelectorAll('*')){
      if(!visible(el) || el.matches('style,aside.notes,script')) continue;
      const rect=el.getBoundingClientRect();
      if(rect.left < sectionRect.left-2 || rect.right > sectionRect.right+2 ||
         rect.top < sectionRect.top-2 || rect.bottom > sectionRect.bottom+2){
        outside.push({tag:el.tagName.toLowerCase(), cls:el.className?.baseVal || el.className || '', px:Math.round(Math.max(
          sectionRect.left-rect.left, rect.right-sectionRect.right, sectionRect.top-rect.top, rect.bottom-sectionRect.bottom, 0
        ))});
      }
      const ownText=[...el.childNodes].some(node => node.nodeType===Node.TEXT_NODE && node.textContent.trim());
      if(!ownText || el.closest('pre,code')) continue;
      const cs=getComputedStyle(el);
      const fontSize=parseFloat(cs.fontSize);
      if(fontSize < ${minFontPx}) smallText.push({text:el.textContent.trim().slice(0,40), px:fontSize});
      const fg=parse(cs.color), bg=backgroundFor(el);
      if(fg && fg.a > .5){
        const ratio=contrast(fg,bg);
        const threshold=fontSize >= 24 ? 3 : 4.5;
        if(ratio + .05 < threshold) lowContrast.push({text:el.textContent.trim().slice(0,40), ratio:Number(ratio.toFixed(2))});
      }
    }
    const clone=section.cloneNode(true);
    clone.querySelectorAll('style,pre,code,aside.notes').forEach(el=>el.remove());
    const text=clone.textContent || '';
    const leak=text.match(/\\[object Object\\]|\\bundefined\\b|(?:^|\\s)\\x60{3}|\\\\begin\\{/m)?.[0] || '';
    return {
      missing:false,
      overflowX:Math.max(0,Math.round(section.scrollWidth-section.clientWidth)),
      overflowY:Math.max(0,Math.round(section.scrollHeight-section.clientHeight)),
      outside:outside.slice(0,12),
      smallText:smallText.slice(0,12),
      lowContrast:lowContrast.slice(0,12),
      sourceLeak:leak,
      fontStatus:document.fonts.status,
    };
  })()`;
}

function issuesFor(metrics, consoleErrors, externalResources) {
  const issues = [];
  if (metrics.missing) issues.push({ code: 'missing-page', message: '页面 section 不存在' });
  if (metrics.overflowX > 2) issues.push({ code: 'overflow-x', message: `横向溢出 ${metrics.overflowX}px` });
  if (metrics.overflowY > 4) issues.push({ code: 'overflow-y', message: `纵向溢出 ${metrics.overflowY}px` });
  if (metrics.outside?.length) issues.push({ code: 'element-outside', message: `${metrics.outside.length} 个元素越界`, detail: metrics.outside });
  if (metrics.smallText?.length) issues.push({ code: 'font-size', message: `${metrics.smallText.length} 处字号过小`, detail: metrics.smallText });
  if (metrics.lowContrast?.length) issues.push({ code: 'contrast', message: `${metrics.lowContrast.length} 处对比度不足`, detail: metrics.lowContrast });
  if (metrics.sourceLeak) issues.push({ code: 'source-leak', message: `源码标记泄漏: ${metrics.sourceLeak}` });
  if (metrics.fontStatus !== 'loaded') issues.push({ code: 'fonts', message: `字体状态: ${metrics.fontStatus}` });
  if (consoleErrors.length) issues.push({ code: 'console', message: `${consoleErrors.length} 条 console error`, detail: consoleErrors.slice(0, 5) });
  if (externalResources.length) {
    issues.push({ code: 'external-resource', message: `${externalResources.length} 个外链资源`, detail: externalResources });
  }
  return issues;
}

export async function probeDeck({ runDir, pages, canvas, attempt, minFontPx = 16, nativeCapture = false }) {
  const { cdp, port, cleanup } = await launchBrowser(runDir, canvas);
  let targetId;
  try {
    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    targetId = target.targetId;
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = attached.sessionId;
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: canvas.width,
      height: canvas.height,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId);

    const consoleErrors = [];
    const stopListening = cdp.on(message => {
      if (message.sessionId !== sessionId) return;
      if (message.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(message.params.exceptionDetails?.text || 'uncaught exception');
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(message.params.args?.map(arg => arg.value || arg.description).join(' ') || 'console.error');
      }
    });
    const evaluate = async expression => {
      const response = await cdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      }, sessionId);
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || '浏览器脚本执行失败');
      return response.result?.value;
    };

    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/deck.html` }, sessionId);
    for (let index = 0; index < 80; index += 1) {
      if (await evaluate('Boolean(window.Reveal?.isReady?.())')) break;
      await delay(100);
    }
    if (!(await evaluate('Boolean(window.Reveal?.isReady?.())'))) throw new Error('Reveal 未在时限内就绪');
    await evaluate('document.fonts.ready');
    await evaluate(`Reveal.configure({ transition:'none', backgroundTransition:'none' })`);
    if (nativeCapture) await evaluate(`document.documentElement.dataset.nativeCapture='true'`);

    const resourceUrls = await evaluate(`performance.getEntriesByType('resource').map(entry=>entry.name)`);
    const externalResources = resourceUrls.filter(url => {
      try {
        const parsed = new URL(url);
        return parsed.origin !== `http://127.0.0.1:${port}` && parsed.protocol !== 'data:';
      } catch {
        return false;
      }
    });

    const results = [];
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const errorStart = consoleErrors.length;
      await evaluate(`(async()=>{ Reveal.slide(${index}); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); })()`);
      await delay(80);
      const metrics = await evaluate(pageProbeExpression(page.id, minFontPx));
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
      const attemptDir = path.join(runDir, 'evidence', page.id, `attempt-${String(attempt).padStart(2, '0')}`);
      await ensureDir(attemptDir);
      const screenshotFile = path.join(attemptDir, 'shot.png');
      await writeFile(screenshotFile, Buffer.from(screenshot.data, 'base64'));
      const pageConsoleErrors = consoleErrors.slice(errorStart);
      const issues = issuesFor(metrics, pageConsoleErrors, externalResources);
      const result = {
        pageId: page.id,
        pass: issues.length === 0,
        issues,
        metrics,
        screenshot: path.relative(runDir, screenshotFile).split(path.sep).join('/'),
      };
      await writeJson(path.join(attemptDir, 'probe.json'), result);
      results.push(result);
    }
    stopListening();
    return {
      pass: results.every(result => result.pass),
      browser: 'system Edge/Chrome via zero-dependency CDP',
      canvas,
      pages: results,
    };
  } finally {
    if (targetId) await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
    await cleanup();
  }
}
