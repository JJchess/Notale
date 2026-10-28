import {openFilmOverrides,type FilmHtmlClip} from '@notale/editor/film';
/** OpenFilm 0.1 page adapter. Clock from openfilm/openfilm
 * 4047538da31465162b3ff3c6298cf2fecd7a28e7, packages/openfilm/src/host.mjs.
 * The MIT notice is included in every injected copy below. */
const clock = "(()=>{const H=window.filmHost;if(!H||H.time)return;const P=performance,now=P.now.bind(P),D=Date,raf=window.requestAnimationFrame.bind(window),EPOCH=D.UTC(2026,0,1);let v=null,seed=0x2545f491;H.now=now;P.now=()=>v==null?now():v;function FilmDate(...a){const d=a.length||v==null?new D(...a):new D(EPOCH+v);return new.target?d:d.toString()}FilmDate.prototype=D.prototype;FilmDate.now=()=>v==null?D.now():EPOCH+v;FilmDate.parse=D.parse;FilmDate.UTC=D.UTC;window.Date=FilmDate;window.requestAnimationFrame=(cb)=>raf((ts)=>cb(v==null?ts:v));Math.random=()=>{seed=seed+0x6d2b79f5|0;let x=Math.imul(seed^seed>>>15,1|seed);x=x+Math.imul(x^x>>>7,61|x)^x;return((x^x>>>14)>>>0)/4294967296};const mine=new WeakSet();H.time=(t)=>{v=t*1000;seed=(Math.round(t*1e6)^0x2545f491)|0};H.settle=(t)=>{for(const a of document.getAnimations?.()??[]){if(typeof CSSTransition!=='undefined'&&a instanceof CSSTransition){a.finish();continue}if(!mine.has(a)){if(a.playState==='paused'||a.playState==='idle')continue;mine.add(a)}a.pause();a.currentTime=t*1000}}})();";
const notice = "MIT License\n\nCopyright (c) 2026 OpenFilm contributors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n";
const prelude = `/*! ${notice} */
(()=>{window.filmHost={version:'0.1',name:'Notale',errors:[]};
addEventListener('error',event=>{const el=event.target;window.filmHost.errors.push(event.message||('资源加载失败：'+(el?.src||el?.href||el?.tagName||'unknown')))},true);
addEventListener('unhandledrejection',event=>window.filmHost.errors.push(String(event.reason)));
const originalFetch=window.fetch.bind(window);window.fetch=(...args)=>originalFetch(...args).then(response=>{if(!response.ok)window.filmHost.errors.push('HTTP '+response.status+' '+response.url);return response},error=>{window.filmHost.errors.push(String(error));throw error});
${clock}})();`;

export interface OpenFilmPage {
  frame(time: number): void | Promise<unknown>;
  ready?: Promise<unknown> | (() => Promise<unknown> | void);
  duration?: number; width?: number; height?: number;
}
export interface OpenFilmHost { errors: string[]; time(time: number): void; settle(time: number): void }
type PageWindow = Window & { film?: OpenFilmPage; filmHost?: OpenFilmHost };

/** Parser-normalized srcdoc keeps relative resources and modules anchored at the
 * fetched page. This does not change the source file or run its scripts in the editor. */
export function hostedPage(html: string, url: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let base = doc.querySelector<HTMLBaseElement>('base[href]');
  if (!base) { base = doc.createElement('base'); base.href = url; doc.head.prepend(base); }
  else base.href = new URL(base.getAttribute('href')!, url).href;
  const script = doc.createElement('script'); script.textContent = prelude; doc.head.prepend(script);
  return '<!doctype html>\n' + doc.documentElement.outerHTML;
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
function pageError(host: OpenFilmHost) { if (host.errors.length) throw new Error(host.errors[0]); }

/** One in-flight frame per instance. A stale async draw never acknowledges a new
 * seek, and deleting the clip fences all late completions/errors. */
export class OpenFilmTransport {
  private completed: number | undefined;private completedOverrides='';
  private pending = false;
  private disposed = false;
  private failed = false;
  private abort = new AbortController();
  constructor(private page: OpenFilmPage, private host: OpenFilmHost, private fail: (message: string) => void,private overrides?:ReturnType<typeof openFilmOverrides>) {}
  prepare(time: number,list:FilmHtmlClip['overrides']=[]): boolean {
    const signature=JSON.stringify(list);
    if (this.disposed || this.failed) return false;
    if (!Number.isFinite(time) || time < 0) { this.error('Invalid OpenFilm frame time'); return false; }
    const target = this.page.duration === undefined ? time : Math.min(time, Math.max(0, this.page.duration - 1e-6));
    try { pageError(this.host); } catch (error) { this.error(error); return false; }
    if (this.pending) return false;
    if (this.completed === target&&this.completedOverrides===signature) return true;
    this.pending = true;
    // Promise boundary catches both synchronous throws and asynchronous failures.
    void Promise.resolve().then(async () => {
      if (this.disposed) return;
      this.overrides?.restore();this.host.time(target);
      await until(Promise.resolve(this.page.frame(target)), this.abort.signal, 15000, 'OpenFilm frame(t) 超时');
      if (this.disposed) return;
      this.host.settle(target);this.overrides?.apply(list); pageError(this.host);
      this.completed = target;this.completedOverrides=signature;
    }).catch(error => this.error(error)).finally(() => { this.pending = false; });
    return false;
  }
  private error(error: unknown) { if (!this.disposed && !this.failed) { this.failed = true; this.fail(errorMessage(error)); } }
  dispose() { this.disposed = true; this.abort.abort(); }
}

function until<T>(work: Promise<T>, signal: AbortSignal, milliseconds: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => done(() => reject(signal.reason ?? new Error('已取消网页载入')));
    const timer = setTimeout(() => done(() => reject(new Error(label))), milliseconds);
    const done = (finish: () => void) => { clearTimeout(timer); signal.removeEventListener('abort', abort); finish(); };
    signal.addEventListener('abort', abort, { once: true });
    work.then(value => done(() => resolve(value)), error => done(() => reject(error)));
    if (signal.aborted) abort();
  });
}
export async function loadOpenFilm(frame: HTMLIFrameElement, uri: string, signal: AbortSignal, fail: (message: string) => void) {
  const url = new URL(uri, location.href);
  if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('OpenFilm 网页需同源 HTTP 地址');
  const response = await until(fetch(url, { signal }), signal, 30000, 'OpenFilm 网页请求超时');
  if (!response.ok) throw new Error(`OpenFilm 网页载入失败（${response.status}）`);
  if (new URL(response.url).origin !== location.origin) throw new Error('OpenFilm 网页重定向到了其他源');
  const html = await until(response.text(), signal, 30000, 'OpenFilm 网页读取超时');
  signal.throwIfAborted();
  // Install the load listener before srcdoc. Relative resource URLs use <base>.
  const loaded = new Promise<void>(resolve => frame.addEventListener('load', () => resolve(), { once: true, signal }));
  frame.srcdoc = hostedPage(html, response.url);
  await until(loaded, signal, 15000, 'OpenFilm 网页资源载入超时');
  const started = performance.now();
  let page: OpenFilmPage | undefined, host: OpenFilmHost | undefined;
  while (!page) {
    signal.throwIfAborted();
    const window = frame.contentWindow as PageWindow | null;
    host = window?.filmHost;
    if (host) pageError(host);
    if (window?.film && typeof window.film.frame === 'function') { page = window.film; break; }
    if (performance.now() - started >= 10000) throw new Error('网页未提供 window.film.frame(t)');
    await until(new Promise<void>(resolve => setTimeout(resolve, 30)), signal, 1000, '网页接口等待超时');
  }
  if (!host?.time || !host.settle) throw new Error('OpenFilm 宿主初始化失败，检查网页 CSP');
  await until(Promise.resolve().then(() => typeof page.ready === 'function' ? page.ready() : page.ready), signal, 30000, 'OpenFilm ready 超时');
  for (const key of ['duration', 'width', 'height'] as const) {
    const value = page[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) throw new Error(`OpenFilm ${key} 须为正数`);
  }
  signal.throwIfAborted();const pageDocument=frame.contentDocument!;await until(Promise.all([...pageDocument.querySelectorAll<HTMLElement>('body *')].slice(0,3000).map(node=>{const css=frame.contentWindow!.getComputedStyle(node);return pageDocument.fonts.load(`${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`,node.textContent?.slice(0,200)||'BESbswy');})),signal,30000,'OpenFilm 字体载入超时');pageError(host);
  return { transport: new OpenFilmTransport(page, host, fail,openFilmOverrides(frame.contentWindow!)), duration:page.duration,width: page.width, height: page.height };
}
