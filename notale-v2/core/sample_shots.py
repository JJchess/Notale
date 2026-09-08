"""Capture the authored states of visual samples and tile them into one sheet.

A sample's catalog row may carry ``shots``: the first entry is the initial view,
each later one runs ``after`` (page JS) and waits ``wait`` ms before shooting.

    "shots": [{"label": "1 锁住"},
              {"label": "2 放开", "after": "document.querySelector(...).click()"}]

Output per sample: ``samples/<cat>/<id>/shots/NN.png`` (800×450 each) and
``samples/<cat>/<id>/shots.png``, the labelled contact sheet the Builder sees.
One sheet per sample keeps within the two-images-per-tool-call budget.

    python3 core/sample_shots.py            # every sample with a shots list
    python3 core/sample_shots.py --only escapement --only lawn-path
"""

from __future__ import annotations

import argparse
import asyncio
import json
import shutil
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / "workflows"
CHASSIS = ROOT / "vendor" / "chassis"
W, H = 1600, 900           # canvas, same as selfcheck
TW, TH = 800, 450          # thumbnail, same as selfcheck's shrunk shot
LABEL_H, COLS, GAP = 36, 2, 0   # 1600 宽正好等于 IMG_MAX_W，进上下文不再缩
DEFAULT_WAIT = 1500
FONTS = (
    "/usr/share/fonts/truetype/arphic/uming.ttc",
    "/usr/share/fonts/opentype/unifont/unifont_jp.otf",
)


def sheet_path(sample_dir: Path) -> Path:
    return sample_dir / "shots.png"


def _font(size: int):
    for f in FONTS:
        if Path(f).is_file():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default(size=size)


MIRROR = ROOT / "experiments" / "workflow-skills-next"   # 样本剥掉的数据/媒体文件还留在这里


def _stage(skill_dir: Path, row: dict) -> tuple[Path, Path]:
    """Copy the whole sample dir, overlay the mirror's omitted files, link the chassis.

    Returns (tmp_dir, html_path).  The production sample ships without its data and
    media (catalog ``omitted``); those still exist in the experiments mirror at the
    same relative layout, so any file missing here is filled from there.
    """
    rel_root = Path(row["full"]["root"])                     # samples/<cat>/<id>/.../pages
    sample_rel = Path(*rel_root.parts[:3])                   # samples/<cat>/<id>
    tmp = Path(tempfile.mkdtemp(prefix="sample-shots-"))
    dst = tmp / sample_rel.name
    shutil.copytree(skill_dir / sample_rel, dst, symlinks=True)
    mirror = MIRROR / skill_dir.name / sample_rel
    if mirror.is_dir():
        for src in mirror.rglob("*"):
            target = dst / src.relative_to(mirror)
            if src.is_file() and not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, target)
    pages = dst / rel_root.relative_to(sample_rel)
    assets = pages / "assets"
    assets.mkdir(exist_ok=True)
    # 样本引用 chassis 文件的两种写法都见过：assets/lib/x.min.js 和 assets/x.min.js。
    for src in [CHASSIS / "base.css", CHASSIS / "base.js", CHASSIS / "lib", *(CHASSIS / "lib").iterdir()]:
        if not (assets / src.name).exists():
            (assets / src.name).symlink_to(src)
    html = next(f for f in row["full"]["files"] if f.endswith(".html"))
    return tmp, pages / html


async def _capture(html: Path, shots: list[dict], out_dir: Path) -> list[Path]:
    from playwright.async_api import async_playwright

    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.png"):
        old.unlink()
    pngs: list[Path] = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--allow-file-access-from-files"])
        pg = await b.new_page(viewport={"width": W, "height": H})
        errs: list[str] = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errs.append(f"console.error: {m.text[:100]}"))
        pg.on("requestfailed", lambda r: errs.append(f"missing: {r.url.split('/pages/')[-1]}"))
        # Modules and fetch() need an HTTP origin, including fully local samples.
        class QuietHandler(SimpleHTTPRequestHandler):
            def log_message(self, *_args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(html.parent)))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            await pg.goto(f"http://127.0.0.1:{server.server_port}/{html.name}", wait_until="load")
            for i, st in enumerate(shots):
                if st.get("after"):
                    try:
                        await pg.evaluate(f"() => {{ {st['after']} }}")
                    except Exception as exc:
                        errs.append(f"state {i} after failed: {' '.join(str(exc).split())[:120]}")
                await pg.wait_for_timeout(int(st.get("wait", DEFAULT_WAIT)))
                png = out_dir / f"{i:02d}.png"
                await pg.screenshot(path=str(png))
                Image.open(png).resize((TW, TH), Image.LANCZOS).save(png)
                pngs.append(png)
        finally:
            await b.close()
            server.shutdown()
            server.server_close()
            thread.join()
    if errs:  # 不中断：先出图，错误打出来由人判断截到的是不是真实状态
        print(f"   ⚠ page errors: {errs[:3]}")
    return pngs


def _sheet(pngs: list[Path], labels: list[str], dst: Path) -> None:
    rows = (len(pngs) + COLS - 1) // COLS
    im = Image.new(
        "RGB",
        (COLS * TW + (COLS - 1) * GAP, rows * (TH + LABEL_H) + (rows - 1) * GAP),
        "#e9eae7",
    )
    draw = ImageDraw.Draw(im)
    font = _font(22)
    for i, (png, label) in enumerate(zip(pngs, labels)):
        x = (i % COLS) * (TW + GAP)
        y = (i // COLS) * (TH + LABEL_H + GAP)
        draw.text((x + 8, y + 7), f"{i + 1}. {label}", fill="#414647", font=font)
        im.paste(Image.open(png), (x, y + LABEL_H))
    im.save(dst)


def render(skill_dir: Path, row: dict) -> Path:
    shots = row["shots"]
    sample_dir = skill_dir / "samples" / row["category"] / row["id"]
    tmp, html = _stage(skill_dir, row)
    try:
        pngs = asyncio.run(_capture(html, shots, sample_dir / "shots"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    dst = sheet_path(sample_dir)
    _sheet(pngs, [s["label"] for s in shots], dst)
    return dst


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", action="append", help="sample id, repeatable")
    args = ap.parse_args()
    n = 0
    for skill_dir in sorted(WORKFLOWS.glob("build-*")):
        catalog_path = skill_dir / "samples" / "catalog.json"
        if not catalog_path.is_file():
            continue
        for row in json.loads(catalog_path.read_text(encoding="utf-8")).get("samples", []):
            if not row.get("shots") or (args.only and row["id"] not in args.only):
                continue
            dst = render(skill_dir, row)
            w, h = Image.open(dst).size
            print(f"{skill_dir.name}/{row['id']}: {len(row['shots'])} states → "
                  f"{dst.relative_to(ROOT)} ({w}×{h}, ~{w * h // 750} tokens)")
            n += 1
    print(f"{n} sheets")


if __name__ == "__main__":
    main()
