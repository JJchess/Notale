"""Read-only deck-step/control smoke and CSS cascade evidence, no model calls."""
import hashlib
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
from audit import BASE, REPORT, RUN, APPEARANCE


def main():
    target=REPORT/'verification/supplement.json'
    rows=json.loads(target.read_text()) if target.exists() else {}
    completed=set(re.findall(r'(page-\d+)\s+✓', (REPORT/'builder.log').read_text()))
    with sync_playwright() as pw:
        browser=pw.chromium.launch()
        for path in sorted((RUN/'pages').glob('page-*.html')):
            pid=path.stem
            if pid=='page-16' or pid not in completed or pid in rows:continue
            page=browser.new_page(viewport={'width':1600,'height':900},reduced_motion='reduce')
            page.set_default_timeout(1500)
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            before=hashlib.sha256(path.read_bytes()).hexdigest()
            row={'steps':[],'controls':[]};rows[pid]=row
            try:
                page.goto(BASE+path.name,timeout=45000);page.evaluate('document.fonts.ready')
                maximum=page.evaluate('(window.Deck&&Deck.stepMax)||0')
                for step in range(maximum+1):
                    page.evaluate('(n)=>Deck.stepTo(n)',step);page.wait_for_timeout(30)
                    row['steps'].append(page.evaluate('() => ({step:Deck.step,text:stage.innerText})'))
                if maximum:
                    page.screenshot(path=str(REPORT/'verification'/f'{pid}-last-step.png'))
                # The other native controls have independent numerical cases in interactions.py.
                if pid in ['page-06','page-10','page-12','page-15','page-23','page-24','page-33','page-40']:
                    page.evaluate('Deck.stepTo(0)')
                    controls=page.locator('#stage button,#stage input,#stage select')
                    for i in range(controls.count()):
                        el=controls.nth(i)
                        data={'index':i,'id':el.get_attribute('id'),'text':el.text_content()}
                        row['controls'].append(data)
                        if el.is_disabled():data['disabled']=True;continue
                        try:
                            if el.get_attribute('type')=='range':
                                data['states']=[]
                                for key in ['Home','End']:
                                    el.press(key)
                                    data['states'].append({'key':key,'value':el.input_value(),'text':page.locator('#stage').inner_text()})
                            else:
                                el.click();data['text_after']=page.locator('#stage').inner_text()
                            data['ok']=True
                        except Exception as exc:data.update(ok=False,error=str(exc))
                    if pid=='page-33':
                        for _ in range(3):page.locator('#btnNext').press('Enter')
                        row['final_gate_text']=page.locator('#stage').inner_text()
                    page.screenshot(path=str(REPORT/'verification'/f'{pid}-controls.png'))
                if pid in ['page-14','page-32']:
                    row['svg_cascade']=page.locator('.nt-data-line').evaluate_all('(es)=>es.map(e=>({stroke_attribute:e.getAttribute("stroke"),dash_attribute:e.getAttribute("stroke-dasharray"),stroke:getComputedStyle(e).stroke,dash:getComputedStyle(e).strokeDasharray,width:getComputedStyle(e).strokeWidth}))')
                if pid=='page-01':
                    row['radius_example']=page.evaluate('''() => {
                      const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
                      s.innerHTML='<circle class="nt-data-point" r="var(--point-radius)"/>';
                      stage.append(s);const e=s.firstChild;
                      const result={computed:getComputedStyle(e).r,bbox:e.getBBox().width};s.remove();return result;
                    }''')
                row['url']=page.url
            except Exception as exc:row['error']=str(exc)
            row.update(js_errors=errors,sha256=before,artifact_unchanged=before==hashlib.sha256(path.read_bytes()).hexdigest())
            page.close()
            (REPORT/'verification/supplement.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
            print(pid,'steps',len(row['steps']),'control_failures',sum(c.get('ok') is False for c in row['controls']),flush=True)
        browser.close()


if __name__=='__main__':main()
