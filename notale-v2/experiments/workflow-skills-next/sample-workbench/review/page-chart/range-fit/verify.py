#!/usr/bin/env python3
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).parent.resolve()
URL=(ROOT/'pages/index.html').as_uri()
SHOTS=ROOT/'screenshots'
EXPECTED=[
  ('2000 · 目标名称','26.1','中国 45.3','33 / 100','IT-1',False),
  ('2000 · 目标数值','26.1','中国 45.3','33 / 100','高于 IT-1',True),
  ('2010 · 目标数值','23.1','中国 49.0','27 / 100','高于 IT-1',True),
  ('2015 · 目标数值','22.7','中国 49.5','24 / 100','高于 IT-1',True),
  ('2023 · 目标数值','21.3','中国 32.0','24 / 100','IT-1',True),
]

STATE="""() => {
 const q=s=>document.querySelector(s), m=[...document.querySelectorAll('.mark')];
 const W=q('#plot').clientWidth, year=+q('#yr').textContent.slice(0,4), yi=[2000,2010,2015,2023].indexOf(year);
 let xerr=0;
 for(const g of m){const row=PM25.rows.find(r=>r[0]===g.dataset.id),x=24+(W-44)*row[3+yi]/85,got=new DOMMatrix(getComputedStyle(g).transform).e;xerr=Math.max(xerr,Math.abs(x-got))}
 return {year:q('#yr').textContent,med:q('#med').textContent,rep:q('#rep text').textContent,
  over:q('#over').textContent,band:q('.focus').dataset.band,marks:m.length,
  focus:[+q('.focus').getAttribute('x'),+q('.focus').getAttribute('width')].map(v=>+v.toFixed(2)),
  selected:[...document.querySelectorAll('.state')].findIndex(x=>x.getAttribute('aria-current')==='true'),
  numbered:q('#chart').classList.contains('numbered'),x_error:+xerr.toFixed(4)}
}"""

COLLISIONS="""() => {
 const p=[...document.querySelectorAll('.mark')].map(g=>{const m=new DOMMatrix(getComputedStyle(g).transform);return[m.e,m.f]});
 let n=0,min=Infinity;
 for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){let d=Math.hypot(p[i][0]-p[j][0],p[i][1]-p[j][1]);min=Math.min(min,d);if(d<29.5)n++}
 return {pairs:n,min:+min.toFixed(2)}
}"""

async def snap(page,name): await page.screenshot(path=str(SHOTS/name))
async def read(page): return await page.evaluate(STATE)

def matches(s,i):
  e=EXPECTED[i]
  return [s['year'],s['med'],s['rep'],s['over'],s['band'],s['numbered'],s['selected'],s['marks']]==[*e,i,100]

async def main():
  SHOTS.mkdir(exist_ok=True)
  report={}
  async with async_playwright() as p:
    browser=await p.chromium.launch()
    ctx=await browser.new_context(viewport={'width':1600,'height':900})
    page=await ctx.new_page(); errors=[]; failed=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.on('requestfailed',lambda r:failed.append(r.url))
    await page.goto(URL); await page.wait_for_timeout(900)
    await snap(page,'initial.png')
    s=await read(page); s['ok']=matches(s,0); s['collisions']=await page.evaluate(COLLISIONS); report['initial']=s
    await page.evaluate("window.__refs=[...document.querySelectorAll('.mark')];window.__p0=__refs.map(g=>getComputedStyle(g).transform)")

    # Same data, relabeled bands, and one continuously transforming focus rectangle.
    await page.locator('.state').nth(1).click(); await page.wait_for_timeout(300)
    report['band_stagger']=await page.evaluate("""() => {let n=[...document.querySelectorAll('.numeric')].map(x=>+getComputedStyle(x).opacity);return{outer:n[0],center:n[3],staggered:n[0]<.05&&n[3]>.1}}""")
    fmid=await page.eval_on_selector('.focus',"r=>[+r.getAttribute('x'),+r.getAttribute('width')]")
    await page.wait_for_timeout(1050)
    s=await read(page); s['ok']=matches(s,1); s['same_positions']=await page.evaluate("__refs.every((g,i)=>getComputedStyle(g).transform===__p0[i])"); s['focus_mid']=[round(x,2) for x in fmid]; s['focus_continuous']=all(min(a,c)<b<max(a,c) for a,b,c in zip(report['initial']['focus'],s['focus_mid'],s['focus'])); report['relabel']=s

    # Distribution transition: capture a genuine in-between frame.
    x0=await page.eval_on_selector('.china','g=>new DOMMatrix(getComputedStyle(g).transform).e')
    await page.locator('.state').nth(2).click(); await page.wait_for_timeout(250)
    xm=await page.eval_on_selector('.china','g=>new DOMMatrix(getComputedStyle(g).transform).e'); await snap(page,'transition-mid.png')
    await page.wait_for_timeout(650)
    xf=await page.eval_on_selector('.china','g=>new DOMMatrix(getComputedStyle(g).transform).e')
    report['transition']={'china_x':[round(x,2) for x in (x0,xm,xf)],'mid_between':min(x0,xf)<xm<max(x0,xf)}

    states=[]
    for i in range(5):
      await page.locator('.state').nth(i).click(); await page.wait_for_timeout(1350 if i<2 else 800)
      s=await read(page); s['ok']=matches(s,i); states.append(s)
    report['states']=states
    await snap(page,'final.png')
    report['final_collisions']=await page.evaluate(COLLISIONS)
    report['stable_nodes']=await page.evaluate("__refs.every((e,i)=>e===document.querySelectorAll('.mark')[i]&&e.isConnected)&&document.querySelectorAll('.focus').length===1")

    await page.locator('.state').nth(0).click(); await page.wait_for_timeout(1350); s=await read(page); report['reverse']={'state':s,'ok':matches(s,0)}
    await page.evaluate("[4,0,3,1,4,2,0,4].forEach(i=>document.querySelectorAll('.state')[i].click())"); await page.wait_for_timeout(1350)
    s=await read(page); report['rapid']={'state':s,'ok':matches(s,4),'marks':await page.locator('.mark').count(),'focuses':await page.locator('.focus').count()}
    await page.locator('#reset').click(); await page.wait_for_timeout(1350); s=await read(page); report['reset']={'state':s,'ok':matches(s,0)}

    await page.locator('#play').click(); playback=[]; elapsed=0
    for wait_ms in (100,2250,2000,2000,2800,1700):
      await page.wait_for_timeout(wait_ms); elapsed+=wait_ms
      playback.append({'ms':elapsed,'state':await page.locator('#yr').text_content(),'button':await page.locator('#play').text_content()})
    report['playback']=playback
    report['errors']=errors; report['failed_requests']=failed
    await ctx.close()

    ctx=await browser.new_context(viewport={'width':1200,'height':900})
    page=await ctx.new_page(); await page.goto(URL); await page.wait_for_timeout(900)
    report['1200x900']=await page.evaluate("""() => {let r=document.querySelector('#stage').getBoundingClientRect();return{stage:[r.x,r.y,r.width,r.height].map(Math.round),scroll:[document.body.scrollWidth,document.body.scrollHeight],viewport:[innerWidth,innerHeight]}}""")
    await ctx.close()

    ctx=await browser.new_context(viewport={'width':1600,'height':900},reduced_motion='reduce')
    page=await ctx.new_page(); await page.goto(URL); await page.wait_for_timeout(100); await page.locator('.state').nth(4).click(); await page.wait_for_timeout(20)
    s=await read(page); s['ok']=matches(s,4); s['transition']=await page.eval_on_selector('.mark','g=>getComputedStyle(g).transitionDuration'); report['reduced']=s
    await snap(page,'reduced-motion.png'); await ctx.close()

    ctx=await browser.new_context(viewport={'width':1600,'height':900},java_script_enabled=False)
    page=await ctx.new_page(); await page.goto(URL)
    t=await page.locator('.fallback').inner_text(); report['no_js']={'visible':await page.locator('.fallback').is_visible(),'has_all':all(x in t for x in ('2000','2010','2015','2023','26.1','21.3')),'text':t}
    await ctx.close(); await browser.close()
  print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__': asyncio.run(main())
