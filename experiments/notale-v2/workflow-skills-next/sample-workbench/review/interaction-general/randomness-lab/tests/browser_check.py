#!/usr/bin/env python3
import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
PAGE=(ROOT/'output/pages/index.html').as_uri()
SHOTS=ROOT/'output/.codex-shots'

async def main():
    SHOTS.mkdir(parents=True,exist_ok=True)
    report={'http_requests':[],'errors':[]}
    async with async_playwright() as p:
        browser=await p.chromium.launch(args=['--allow-file-access-from-files'])
        context=await browser.new_context(viewport={'width':1600,'height':900})
        page=await context.new_page()
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('request',lambda r:report['http_requests'].append(r.url) if r.url.startswith(('http:','https:')) else None)
        await page.route('http://**/*',lambda route:route.abort())
        await page.route('https://**/*',lambda route:route.abort())
        await page.goto(PAGE,wait_until='load')
        for bit in '010101010101':await page.click(f'[data-bit="{bit}"]')
        report['attempt1']=await page.evaluate('window.__RANDOMNESS_LAB__.getState()')
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(SHOTS/'attempt-1-1600.png'))
        await page.click('#retry')
        for bit in '011010011101':await page.keyboard.press('h' if bit=='1' else 't')
        report['attempt2']=await page.evaluate('window.__RANDOMNESS_LAB__.getState()')
        report['result_text']=await page.locator('.evidence').inner_text()
        await page.wait_for_timeout(800)
        await page.screenshot(path=str(SHOTS/'attempt-2-1600.png'))
        await page.click('#reset');initial1=await page.evaluate('window.__RANDOMNESS_LAB__.getState()')
        await page.click('[data-bit="1"]');await page.click('[data-bit="0"]');await page.click('#reset')
        initial2=await page.evaluate('window.__RANDOMNESS_LAB__.getState()')
        report['reset_equal']=initial1==initial2
        scales=[]
        for w,h in ((1280,720),(1920,1080),(1600,900)):
            await page.set_viewport_size({'width':w,'height':h});await page.evaluate('Deck.resize()');await page.wait_for_timeout(120)
            scales.append(await page.evaluate("""(()=>{const r=document.querySelector('#stage').getBoundingClientRect();return {viewport:[innerWidth,innerHeight],scale:Deck.s,stage:[r.x,r.y,r.width,r.height],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],overflow:getComputedStyle(document.body).overflow}})()"""))
        report['resize']=scales
        await context.close()
        reduced=await browser.new_context(viewport={'width':1600,'height':900},reduced_motion='reduce')
        rp=await reduced.new_page();await rp.goto(PAGE,wait_until='load')
        for bit in '011010011101':await rp.keyboard.press('h' if bit=='1' else 't')
        report['reduced_motion']=await rp.evaluate("({requested:Deck.reduced(),phase:__RANDOMNESS_LAB__.getState().phase,scanner:getComputedStyle(document.querySelector('#scanner')).animationDuration})")
        await reduced.close();await browser.close()
    assert report['attempt1']['phase']==report['attempt2']['phase']=='result'
    assert report['attempt2']['previous']['sequence']==report['attempt1']['sequence']
    assert report['reset_equal'] and not report['http_requests'] and not report['errors']
    assert all(max(abs(a-b) for a,b in zip(x['stage'],[0,0,*x['viewport']]))<.01 and x['overflow']=='hidden' for x in report['resize'])
    assert report['reduced_motion']['requested'] and report['reduced_motion']['phase']=='result'
    (ROOT/'output/browser-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

asyncio.run(main())
