"""把一个 run 的 pages/page-*.html 截成 1600×900 全展开(?all)截图并拼成 slides.pdf。

    python3 deck2pdf.py <run_root> <out.pdf>

自起一个 no-store 的静态服务(pages 目录),不依赖外部预览服务。
"""
import asyncio, io, sys, threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright


class NoStore(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store"); super().end_headers()
    def log_message(self, *a): pass


async def shoot(pages: Path, port: int) -> list[Image.Image]:
    files = sorted(pages.glob("page-*.html"))
    out = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1600, "height": 900}, device_scale_factor=1)
        for f in files:
            errs = []
            pg.once("pageerror", lambda e: errs.append(str(e)))
            await pg.goto(f"http://127.0.0.1:{port}/{f.name}?all", wait_until="networkidle")
            await pg.wait_for_timeout(1500)
            png = await pg.screenshot()
            out.append(Image.open(io.BytesIO(png)).convert("RGB"))
            print(f"  {f.name}" + (f"  pageerror: {errs[0][:80]}" if errs else ""))
        await b.close()
    return out


def main(run_root: str, out_pdf: str):
    pages = Path(run_root) / "pages"
    srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(NoStore, directory=str(pages)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    imgs = asyncio.run(shoot(pages, srv.server_port))
    srv.shutdown()
    assert imgs, f"no page-*.html under {pages}"
    Path(out_pdf).parent.mkdir(parents=True, exist_ok=True)
    imgs[0].save(out_pdf, save_all=True, append_images=imgs[1:], resolution=96)
    print(f"{len(imgs)} pages → {out_pdf}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
