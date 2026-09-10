"""Diagnose exact-byte rewind checks; does not modify the page or production Check."""
import hashlib
import io
import json
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright
from audit import BASE, REPORT, RUN


def main():
    path=RUN/'pages/page-15.html'
    before=hashlib.sha256(path.read_bytes()).hexdigest()
    rows=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch()
        for trial in range(3):
            page=browser.new_page(viewport={'width':1600,'height':900})
            page.goto(BASE+path.name);page.wait_for_timeout(1200)
            maximum=page.evaluate('Deck.stepMax')
            page.evaluate('Deck.stepTo(0)');page.wait_for_timeout(350)
            initial=page.screenshot();dom=page.locator('#stage').inner_html();text=page.locator('#stage').inner_text()
            for n in range(1,maximum):
                page.evaluate('(n)=>Deck.stepTo(n)',n);page.wait_for_timeout(350)
            page.evaluate('(n)=>{Deck.stepTo(n);Deck.stepTo(0)}',maximum);page.wait_for_timeout(350)
            back=page.screenshot()
            delta=ImageChops.difference(Image.open(io.BytesIO(initial)).convert('RGB'),Image.open(io.BytesIO(back)).convert('RGB'))
            rows.append({'trial':trial,'bytes_equal':initial==back,'dom_equal':dom==page.locator('#stage').inner_html(),'text_equal':text==page.locator('#stage').inner_text(),'different_pixels':sum(p!=(0,0,0) for p in delta.get_flattened_data()),'pixel_bbox':delta.getbbox()})
            page.close()
        browser.close()
    out={'page_sha256':before,'artifact_unchanged':before==hashlib.sha256(path.read_bytes()).hexdigest(),'trials':rows,'scope':'Read-only reproduction while the full run is live. No production checker or generated artifact changed.'}
    (REPORT/'verification/rewind-diagnostic.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
    print(json.dumps(out))


if __name__=='__main__':main()
