// Read real CSS in a disposable, script-free document: never leak slide selectors
// into Monaco. Values/variants are computed by the browser, not parsed as a schema.
export const defaultTheme=new URL('./preview-theme.css', import.meta.url).href;
export async function readDeckTheme(path=defaultTheme, variant='') {
  const url=new URL(path,location.href);
  if(url.origin!==location.origin)throw new Error('请选择本地同源的 theme.css');
  const response=await fetch(url);
  if(!response.ok)throw new Error(`主题读取失败：HTTP ${response.status}`);
  const frame=document.createElement('iframe');
  frame.setAttribute('sandbox','allow-same-origin');frame.setAttribute('aria-hidden','true');
  frame.style.cssText='position:fixed;left:-10000px;top:0;width:1600px;height:900px;visibility:hidden;border:0';
  const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  const css=await response.text();
  frame.srcdoc=`<!doctype html><html${variant?` data-variant="${esc(variant)}"`:''}><head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; base-uri 'self'">
    <base href="${esc(url.href)}"><style>${css.replace(/<\/style/gi,'<\\/style')}</style>
    </head><body><main id="stage"><span id="probe"></span></main></body></html>`;
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('主题样式载入超时')),5000);
      frame.onload=()=>{clearTimeout(timer);resolve();};document.body.append(frame);
    });
    const doc=frame.contentDocument,win=frame.contentWindow,stage=doc.querySelector('#stage'),probe=doc.querySelector('#probe');
    const computed=win.getComputedStyle(stage),notes=[];
    function color(names,fallback){
      for(const name of names){
        const value=computed.getPropertyValue(name).trim();
        if(!value)continue;
        probe.style.setProperty('color',`var(${name})`,'important');
        // Validate the resolved custom property so missing/invalid values never reuse canvas state.
        if(!CSS.supports('color',value))continue;
        return win.getComputedStyle(probe).color;
      }
      notes.push(`${names[0]} 未定义，使用 ${fallback}`);return fallback;
    }
    const bg=color(['--bg'],computed.backgroundColor==='rgba(0, 0, 0, 0)'?'#ffffff':computed.backgroundColor);
    const ink=color(['--text'],computed.color);
    const values={bg,ink,muted:color(['--muted','--text-muted'],ink),accent:color(['--focus'],ink)};
    if(computed.backgroundImage!=='none')notes.push('工作台采用主题底色，不复制底图／渐变');
    const variants=new Set();
    function visit(rules){for(const rule of rules){
      for(const m of (rule.selectorText||'').matchAll(/\[data-variant\s*=\s*["']?([^\s"'\]]+)["']?\]/g))variants.add(m[1]);
      if(rule.cssRules)visit(rule.cssRules);
      if(rule.styleSheet){try{visit(rule.styleSheet.cssRules);}catch{}}
    }}
    for(const sheet of doc.styleSheets){try{visit(sheet.cssRules);}catch{}}
    return {values,source:url.pathname,variant,variants:[...variants],notes};
  } finally {frame.remove();}
}
