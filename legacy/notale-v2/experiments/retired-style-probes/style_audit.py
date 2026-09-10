"""Capture and operate the three-route smoke outputs; no model calls or output repair."""
import argparse
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
from pathlib import Path
import re
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
RUNS_ROOT = ROOT.parent / 'runs' / ROOT.name
from core import theme


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--prefix',required=True)
    ap.add_argument('--cover-prefix',help='两个补测封面所在的新 run 前缀；其余页保持原输出')
    args=ap.parse_args()
    output=RUNS_ROOT/f'{args.prefix}-audit'
    output.mkdir(exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(RUNS_ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    records=[]
    try:
        # validate outside the browser context (sync Playwright cannot nest event loops)
        validation={}
        for style in ('auto','glass','photo'):
            assets=RUNS_ROOT/f'{args.prefix}-{style}'/'pages/assets'
            validation[style]=theme.validate((assets/'theme.css').read_text(),assets)
        with sync_playwright() as pw:
            browser=pw.chromium.launch()
            for style in ('auto','glass','photo'):
                for number in (1,2,3):
                    label=f'{args.prefix}-{style}'
                    if args.cover_prefix and number==1 and style in ('auto','glass'):
                        label=f'{args.cover_prefix}-{style}'
                    pid=f'page-{number:02d}'
                    target=RUNS_ROOT/label/'pages'/f'{pid}.html'
                    row={'style':style,'page':pid,'run':label,'theme_errors':validation[style]}
                    records.append(row)
                    if not target.is_file():
                        row['error']='missing page'
                        continue
                    page=browser.new_page(viewport={'width':1600,'height':900},reduced_motion='reduce')
                    errors=[]
                    page.on('pageerror',lambda error:errors.append(str(error)))
                    page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(f'http://127.0.0.1:{server.server_port}/') else route.abort())
                    page.goto(f'http://127.0.0.1:{server.server_port}/{label}/pages/{pid}.html')
                    page.evaluate('document.fonts.ready')
                    page.wait_for_timeout(700)
                    row['appearance']=page.evaluate('''() => {
                      const stage=document.querySelector('#stage'),s=getComputedStyle(stage),root=getComputedStyle(document.documentElement);
                      const title=stage.querySelector('h1')||stage.querySelector('.nt-title');
                      return {variant:document.documentElement.dataset.variant||'',background:s.backgroundImage,
                        color:s.color,bg:root.getPropertyValue('--bg'),font:title?getComputedStyle(title).fontFamily:null,
                        titleSize:title?getComputedStyle(title).fontSize:null,
                        namedClasses:[...new Set([...stage.querySelectorAll('[class]')].flatMap(e=>[...e.classList]).filter(c=>c.startsWith('nt-')))],
                        text:stage.innerText.slice(0,350)};
                    }''')
                    page.screenshot(path=str(output/f'{style}-{number}.png'))
                    if number==3:
                        try:
                            amount=lambda:float(re.sub(r'[^\d.]','',page.locator('#amount').inner_text()))
                            initial=amount()
                            page.locator('#rate').focus()
                            page.keyboard.press('End')
                            page.wait_for_timeout(200)
                            maximum=amount()
                            page.locator('#reset').click()
                            page.wait_for_timeout(200)
                            reset=amount()
                            page.set_viewport_size({'width':800,'height':450})
                            page.locator('#rate').click()
                            page.keyboard.press('Home')
                            page.wait_for_timeout(200)
                            minimum=amount()
                            row['interaction']={'initial':initial,'max':maximum,'reset':reset,'min_scaled':minimum,
                                'ok':abs(initial-248.83)<.02 and abs(maximum-759.38)<.02 and abs(reset-248.83)<.02 and abs(minimum-100)<.02}
                        except Exception as exc:
                            row['interaction']={'ok':False,'error':str(exc)[:300]}
                    row['js_errors']=errors
                    page.close()
            browser.close()
    finally:
        server.shutdown()
    (output/'audit.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
    from PIL import Image, ImageDraw, ImageFont
    sheet=Image.new('RGB',(1920,1182),'white')
    draw=ImageDraw.Draw(sheet)
    font=ImageFont.truetype('DejaVuSans.ttf',18)
    for col,style in enumerate(('auto','glass','photo')):
        for row in range(3):
            image=output/f'{style}-{row+1}.png'
            x,y=640*col,394*row
            draw.text((x+10,y+8),f'{style} / page {row+1}',font=font,fill='black')
            if image.is_file():
                with Image.open(image) as im:
                    sheet.paste(im.resize((640,360)),(x,y+34))
    sheet.save(output/'contact.png')
    print(json.dumps([{k:v for k,v in r.items() if k!='appearance'} for r in records],ensure_ascii=False,indent=2))


if __name__=='__main__': main()
