"""Read-only full-deck browser evidence; interaction semantics are reviewed separately."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from core import theme
from scripts.style_e2e import save

LABEL='nn-style-coherence-0909'
RUN=ROOT/'runs'/LABEL
REPORT=ROOT/'runs'/f'{LABEL}-report'
BASE=f'http://localhost:4177/notale-v2/runs/{LABEL}/pages/'
spec=importlib.util.spec_from_file_location('check',ROOT/'vendor/chassis/selfcheck.py')
check=importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)

APPEARANCE='''() => {
 const stage=document.querySelector('#stage'),s=getComputedStyle(stage);
 const headings=[...stage.querySelectorAll('h1,h2,.nt-title')].filter(e=>e.getBoundingClientRect().height>0);
 const titles=headings.map(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return {text:e.textContent,font:c.fontFamily,size:c.fontSize,weight:c.fontWeight,box:[r.x,r.y,r.width,r.height]}});
 return {variant:document.documentElement.dataset.variant||'default',background:{image:s.backgroundImage,size:s.backgroundSize,repeat:s.backgroundRepeat,position:s.backgroundPosition},stage:[stage.getBoundingClientRect().x,stage.getBoundingClientRect().y,stage.getBoundingClientRect().width,stage.getBoundingClientRect().height],titles,text:stage.innerText,
  controls:[...stage.querySelectorAll('button,input,select')].map(e=>({tag:e.tagName,id:e.id,type:e.type,text:e.textContent,value:e.value,min:e.min,max:e.max,disabled:e.disabled})),
  images:[...document.images].map(e=>({src:e.currentSrc,loaded:e.complete&&e.naturalWidth>0,alt:e.alt,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))};
}'''


def font_audit(page):
    elements=page.evaluate('''() => [...document.querySelectorAll('#stage *')].filter(e=>{
      const r=e.getBoundingClientRect(),s=getComputedStyle(e);
      return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('.katex-mathml,.sr-only')&&[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    }).map((e,i)=>{e.dataset.fontAudit=i;return {id:i,text:[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim(),family:getComputedStyle(e).fontFamily}})''')
    cdp=page.context.new_cdp_session(page)
    cdp.send('DOM.enable');cdp.send('CSS.enable')
    doc=cdp.send('DOM.getDocument')['root']['nodeId']
    for el in elements:
        node=cdp.send('DOM.querySelector',{'nodeId':doc,'selector':f'[data-font-audit="{el["id"]}"]'})['nodeId']
        el['fonts']=cdp.send('CSS.getPlatformFontsForNode',{'nodeId':node})['fonts']
    cdp.detach()
    return elements


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--only',nargs='*')
    args=ap.parse_args()
    output=REPORT/'verification'
    output.mkdir(exist_ok=True)
    state=json.loads((REPORT/'result.json').read_text())
    pages=args.only or state['pages']
    errors=theme.validate((RUN/'pages/assets/theme.css').read_text(),RUN/'pages/assets')
    rows=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch()
        for pid in pages:
            path=RUN/'pages'/f'{pid}.html'
            row={'page':pid,'theme_errors':errors}
            rows.append(row)
            if not path.exists():
                row['missing']=True
                save(output/f'{pid}.json',row)
                continue
            row['sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
            is_code='code-runtime' in path.read_text() or f'lessons/{pid}' in path.read_text()
            row['code']=is_code
            page=browser.new_page(viewport={'width':1600,'height':900},reduced_motion='reduce')
            runtime=[]
            page.on('pageerror',lambda e:runtime.append(str(e)))
            page.on('requestfailed',lambda r:runtime.append(f'{r.url}: {r.failure}'))
            page.on('response',lambda r:runtime.append(f'{r.url}: HTTP {r.status}') if r.status>=400 else None)
            page.on('console',lambda m:runtime.append(m.text) if m.type=='error' else None)
            try:
                page.goto(BASE+f'{pid}.html',wait_until='load',timeout=45000)
                page.evaluate('document.fonts.ready')
                page.wait_for_timeout(900)
                row['initial']=page.evaluate(APPEARANCE)
                page.screenshot(path=str(output/f'{pid}.png'))
                row['frames']=[f.url for f in page.frames]
                if not is_code:
                    row['probe']=page.evaluate(check.PROBE)
                    row['font_elements']=font_audit(page)
                    row['system_fallback']=[e for e in row['font_elements'] if any(not f['isCustomFont'] for f in e['fonts'])]
                    steps=page.evaluate('(window.Deck&&Deck.stepMax)||0')
                    if steps:
                        page.evaluate('(n)=>Deck.stepTo(n)',steps)
                        page.wait_for_timeout(200)
                        row['last_step']=page.evaluate(APPEARANCE)
                        row['last_step_probe']=page.evaluate(check.PROBE)
                        page.screenshot(path=str(output/f'{pid}-last-step.png'))
                        page.evaluate('Deck.stepTo(0)')
                    before=page.evaluate(APPEARANCE)
                    page.set_viewport_size({'width':800,'height':450})
                    page.wait_for_function('Math.abs(document.querySelector("#stage").getBoundingClientRect().width-800)<1',timeout=3000)
                    page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
                    after=page.evaluate(APPEARANCE)
                    row['scaled']=after
                    row['scaling_ok']=abs(after['stage'][2]/before['stage'][2]-.5)<.002 and abs(after['stage'][3]/before['stage'][3]-.5)<.002
                    for a,b in zip(before['titles'],after['titles']):
                        row['scaling_ok'] &= a['size']==b['size'] and abs(b['box'][2]/a['box'][2]-.5)<.005 and abs(b['box'][3]/a['box'][3]-.5)<.005
                    page.screenshot(path=str(output/f'{pid}-small.png'))
                row['runtime_errors']=list(runtime)
                row['semantic_review']='pending'
                row['visual_review']='pending'
            except Exception as exc:
                row.update(audit_error=f'{type(exc).__name__}: {exc}',runtime_errors=list(runtime))
            finally:
                page.close()
            row['artifact_unchanged']=row['sha256']==hashlib.sha256(path.read_bytes()).hexdigest()
            save(output/f'{pid}.json',row)
            print(pid,'code' if is_code else 'visual','errors=',len(row.get('runtime_errors',[])),'fallback=',len(row.get('system_fallback',[])),'scale=',row.get('scaling_ok'),flush=True)
        browser.close()
    save(output/'browser.json',rows)


if __name__=='__main__':main()
