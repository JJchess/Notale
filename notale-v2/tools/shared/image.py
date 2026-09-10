from __future__ import annotations
from pathlib import Path
import base64
import io
from .result import Out


IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


IMG_MAX_W = 1600


def _image(p: Path) -> Out:
    """一张图 → 可以进上下文的 base64。

    比 IMG_MAX_W 宽的先缩。这不是省钿,是防灌爆:`assets/img/` 里有 3000px 的素材,
    原样一张 base64 就能顶掉半个上下文,而判版面并不需要那些像素。
    """
    from PIL import Image

    im = Image.open(p)
    w, h = im.size
    note = ""
    if w > IMG_MAX_W:
        im = im.convert("RGB").resize((IMG_MAX_W, round(h * IMG_MAX_W / w)), Image.LANCZOS)
        note = f",已从 {w}×{h} 缩到 {im.width}×{im.height} 再给你"
    buf = io.BytesIO()
    im.save(buf, "PNG")
    b = buf.getvalue()
    return Out(f"{p.name}({im.width}×{im.height},约 {im.width * im.height // 750} token{note})",
               [("image/png", base64.b64encode(b).decode())])
