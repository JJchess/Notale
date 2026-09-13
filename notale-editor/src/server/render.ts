import {resolve} from 'node:path';
import { canvasFactory, instrumentCanvasLifecycle } from '../domain/canvas-instances.js';
import { maxStep } from '../domain/timeline.js';
import { instrumentSourceScenes, inspectSourceScenes } from '../domain/source-scenes.js';
import { rebaseTheme } from '../domain/urls.js';
import type { Stylesheets } from '../domain/layout-css.js';
import { readFile } from 'node:fs/promises';
import {
  parse,
  serialize,
  elements,
  setText,
  attr,
  appendHtml,
  escaped,
  removeElement,
} from '../domain/html.js';
import type { DeckDocument, Slide } from '../domain/model.js';
import { materializeLayout } from '../domain/layouts.js';
import {
  chartFactory,
  chartInteractionFactory,
  instrumentChartLifecycle,
} from '../domain/chart-sources.js';
import { inspectChartComponents } from '../domain/chart-components.js';
import { rebaseUrl } from '../domain/urls.js';

export async function renderSlide(
  doc: DeckDocument,
  slide: Slide,
  channel: string,
  stylesheets: Stylesheets = {},
) {
  const root = parse(
      materializeLayout(
        doc,
        {
          ...slide,
          html: instrumentChartLifecycle({
            ...slide,
            html: instrumentCanvasLifecycle(slide, instrumentSourceScenes(slide)),
          }),
        },
        false,
        stylesheets,
      ),
    ),
    head = elements(root).find((e) => e.tagName === 'head')!,
    body = elements(root).find((e) => e.tagName === 'body')!;
  // Serialized pages and embedded factories are UTF-8, including newly inserted
  // fragments without a head. Keep the declaration inside the first 1024 bytes.
  for (const meta of elements(head))
    if (
      meta.tagName === 'meta' &&
      (attr(meta, 'charset') !== undefined ||
        attr(meta, 'http-equiv')?.toLowerCase() === 'content-type')
    )
      removeElement(meta);
  const encoding = appendHtml(head, '<meta charset="utf-8">', undefined, false)[0];
  head.childNodes = head.childNodes.filter((node) => node !== encoding);
  head.childNodes.unshift(encoding);

  // Presentation copies must be silent before authored scripts can start media.
  const guard=appendHtml(head,`<script data-notale-runtime>(function(){const role=new URLSearchParams(location.search).get('notaleRole');if(!role)return;const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(this.dataset.notaleDesiredMuted===undefined)this.dataset.notaleDesiredMuted=String(this.muted);this.muted=!window.__NOTALE_PRESENTATION_SOUND__||this.dataset.notaleDesiredMuted==='true';if(role==='preview')return Promise.resolve();return play.call(this);};})();</script>`,undefined,false)[0];
  head.childNodes=head.childNodes.filter(node=>node!==guard);head.childNodes.splice(1,0,guard);
  const numberedSlides = doc.slides.filter((page) => !page.layoutSourceId);
  for (const el of elements(root)) {
    if (el.tagName === 'aside' && (attr(el, 'class') ?? '').split(/\s+/).includes('notes'))
      setText(el, slide.notes);
    const field = attr(el, 'data-notale-field');
    if (field) {
      const value = (
        {
          'slide-number': slide.layoutSourceId ? '' : String(numberedSlides.findIndex((page) => page.id === slide.id) + 1),
          'slide-count': String(numberedSlides.length),
          title: doc.title,
          section: slide.section,
        } as Record<string, string>
      )[field];
      if (value !== undefined) setText(el, value);
    }
  }
  const css = Object.entries({
    ...rebaseTheme(doc.theme, 'theme.css', slide.sourcePath),
    ...rebaseTheme(
      doc.layouts.find((l) => l.id === slide.layoutId)?.theme ?? {},
      doc.layouts.find((l) => l.id === slide.layoutId)?.sourcePath ?? 'layout.html',
      slide.sourcePath,
    ),
    ...slide.theme,
  })
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  appendHtml(
    head,
    `<style id="notale-theme">:root{${css.replaceAll('</', '<\\/')};--stage-w:${doc.width};--stage-h:${doc.height}}#stage{width:${doc.width}px;height:${doc.height}px}</style>`,
    undefined,
    false,
  );
  if(Object.values(slide.nativeCharts).some(chart=>chart.authoring&&!chart.source)) {
    if(channel==='export'){
      const engine=await readFile(resolve(process.env.EDITOR_RUNTIME_DIR??'dist','chart-engine.js'),'utf8');
      appendHtml(head,`<script data-notale-chart-engine>${engine.replaceAll('</script','<\\/script')}</script>`,undefined,false);
    }else appendHtml(head,`<script data-notale-chart-engine src="${'../'.repeat(slide.sourcePath.split('/').length-1)}__notale_runtime__/chart-engine.js"></script>`,undefined,false);
  }
  const runtime = channel==='export'?await readFile(resolve(process.env.EDITOR_RUNTIME_DIR??'dist','bridge.js'), 'utf8'):undefined;
  const factories: string[] = [];
  for (const [id, chart] of Object.entries(slide.nativeCharts))
    if (chart.source) {
      const library = chart.source.library;
      if (
        !elements(root).some(
          (el) =>
            el.tagName === 'script' &&
            rebaseUrl(attr(el, 'src') ?? '', slide.sourcePath, 'index.html') === library,
        )
      )
        appendHtml(
          head,
          `<script src="${escaped(rebaseUrl(library, 'index.html', slide.sourcePath))}"></script>`,
          undefined,
          false,
        );
      const factory = chartFactory(chart.source);
      if (!factory) throw new Error('Native chart factory is unavailable');
      factories.push(`window.__NOTALE_CHART_FACTORIES__[${JSON.stringify(id)}]=${factory};`);
      if (chart.interaction) {
        const interactionFactory = chartInteractionFactory(chart.source);
        if (!interactionFactory) throw new Error('Chart component factory is unavailable');
        factories.push(
          `window.__NOTALE_CHART_INTERACTIONS__[${JSON.stringify(id)}]=${interactionFactory};`,
        );
      }
    }
  for (const [id, instance] of Object.entries(slide.canvasInstances ?? {}))
    factories.push(
      `window.__NOTALE_CANVAS_FACTORIES__[${JSON.stringify(id)}]=${canvasFactory(instance)};`,
    );
  if (factories.length)
    appendHtml(
      body,
      `<script data-notale-factories>window.__NOTALE_CANVAS_FACTORIES__={};window.__NOTALE_CHART_FACTORIES__={};window.__NOTALE_CHART_INTERACTIONS__={};${factories.join('\n').replaceAll('</script', '<\\/script')}</script>`,
      undefined,
      false,
    );
  const data = {
    ...(channel!=='export'?Object.fromEntries([['textEditorUrl','text-editor.js'],['vectorEditorUrl','vector-editor.js'],['vectorWasmUrl','pathkit.wasm']].map(([key,file])=>[key,'../'.repeat(slide.sourcePath.split('/').length-1)+'__notale_runtime__/'+file])):{}),
    slide: { ...slide, html: '' },
    scenes: inspectSourceScenes(slide),
    chartComponents: Object.fromEntries(inspectChartComponents(slide)),
    navigation: doc.slides.map((s) => ({
      id: s.id,
      path: s.sourcePath.split('/').map(encodeURIComponent).join('/'),
    })),
    channel,
    width: doc.width,
    height: doc.height,
  };
  appendHtml(
    body,
    `<script type="application/json" id="notale-author-config">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script><script data-notale-runtime>window.__NOTALE__=${JSON.stringify(data).replaceAll('<', '\\u003c')};\n${runtime?.replaceAll('</script', '<\\/script')??''}</script>${runtime===undefined?`<script data-notale-runtime src="${'../'.repeat(slide.sourcePath.split('/').length-1)}__notale_runtime__/bridge.js"></script>`:''}`,
    undefined,
    false,
  );
  return serialize(root);
}
export function playerHtml(doc: DeckDocument) {
  const slides = doc.slides
    .filter((s) => !s.hidden)
    .map((s) => ({
      id: s.id,
      path: s.sourcePath.split('/').map(encodeURIComponent).join('/'),
      name: s.name,
      notes: s.notes,
      steps: maxStep(s),
      teaching: s.steps ?? [],
      advanceAfter: s.advanceAfter,
    }));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escaped(doc.title)}</title><style>body{margin:0;background:#171b25;color:white;font:16px system-ui}iframe{width:100vw;height:calc(100vh - 60px);border:0}nav{height:60px;display:flex;align-items:center;justify-content:center;gap:12px}button,select{padding:6px 12px;max-width:260px}aside{position:fixed;right:16px;bottom:76px;max-width:420px;max-height:45vh;overflow:auto;padding:20px;background:#202a3c;white-space:pre-wrap;box-shadow:0 6px 30px #0008}aside[hidden]{display:none}</style></head><body><iframe id="slide" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe><nav><button id="prev">←</button><span id="status"></span><select id="step-select" aria-label="讲授步骤"></select><button id="next">→</button><button id="auto">暂停自动播放</button><button id="notes-toggle">讲稿</button><button id="full">Fullscreen</button></nav><aside id="notes" hidden></aside><script>
const slides=${JSON.stringify(slides).replaceAll('<', '\\u003c')};let index=0,step=0,max=0,ready=false,paused=false,endOnReady=false,auto;const frame=document.querySelector('iframe');
const label=n=>slides[index].teaching[n]?.name??(n===0?'开始':'步骤 '+n);
function schedule(){clearTimeout(auto);const delay=slides[index].teaching[step]?.advanceAfter??slides[index].advanceAfter;if(ready&&!paused&&delay)auto=setTimeout(next,delay);}
function load(atEnd=false){clearTimeout(auto);ready=false;endOnReady=atEnd;frame.src=slides[index].path;max=slides[index].steps;step=atEnd?max:0;status();}
function status(){document.getElementById('prev').disabled=!ready||(index===0&&step===0);document.getElementById('next').disabled=!ready||(index===slides.length-1&&step===max);document.getElementById('step-select').disabled=!ready;document.getElementById('status').textContent=(index+1)+' / '+slides.length+' · '+step+' / '+max;const picker=document.getElementById('step-select');picker.replaceChildren(...Array.from({length:max+1},(_,n)=>new Option(n+' · '+label(n),String(n))));picker.value=String(step);document.getElementById('notes').textContent=[slides[index].notes,slides[index].teaching[step]?.notes].filter(Boolean).join('\\n\\n');}
function send(animate=true){frame.contentWindow.postMessage({source:'notale-host',channel:'export',type:'seek',data:{step,animate}},'*');status();schedule();}
function next(){if(!ready)return;if(step<max){step++;send();}else if(index<slides.length-1){index++;load();}}
function prev(){if(!ready)return;if(step>0){step--;send();}else if(index>0){index--;load(true);}}
window.addEventListener('message',e=>{if(e.source!==frame.contentWindow||e.data?.source!=='notale-slide')return;if(e.data.type==='ready'&&e.data.data.slideId===slides[index].id&&!ready){ready=true;max=e.data.data.max;const atEnd=endOnReady;endOnReady=false;if(atEnd)step=max;send(!atEnd);}if(e.data.type==='navigate'){if(e.data.data.slideId){const at=slides.findIndex(s=>s.id===e.data.data.slideId);if(at>=0){index=at;load();}}else e.data.data.direction>0?next():prev();}});
document.getElementById('next').onclick=next;document.getElementById('prev').onclick=prev;document.getElementById('step-select').onchange=e=>{if(ready){step=Number(e.target.value);send();}};document.getElementById('auto').onclick=e=>{paused=!paused;e.target.textContent=paused?'继续自动播放':'暂停自动播放';schedule();};document.getElementById('notes-toggle').onclick=()=>{const notes=document.getElementById('notes');notes.hidden=!notes.hidden;};document.getElementById('full').onclick=()=>document.documentElement.requestFullscreen();document.onkeydown=e=>{if(['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName))return;if(e.key==='ArrowRight')next();if(e.key==='ArrowLeft')prev();};load();
</script></body></html>`;
}
