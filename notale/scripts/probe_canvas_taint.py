"""Can a file:// document read pixels back from a file:// image?

The whole in-browser backplate-luminance path depends on the answer. Chromium is
launched with --allow-file-access-from-files (web/browser.py), which should keep
the canvas untainted, but the security rules around local files differ by
platform and version, so this is checked rather than assumed.

Run: python -m notale.scripts.probe_canvas_taint
Exit 0 = pixels readable, the JS sampler is viable.
Exit 1 = tainted, fall back to reading the PNG server-side.
"""

from __future__ import annotations

import asyncio
import base64
import struct
import sys
import tempfile
import zlib
from pathlib import Path

from notale.web.browser import BrowserPageRenderer, BrowserUnavailable


def _solid_png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    """A minimal solid-colour PNG, so the expected sample value is known exactly."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


_PROBE_JS = """(async () => {
  const img = document.querySelector('img');
  const canvas = document.createElement('canvas');
  canvas.width = 8; canvas.height = 8;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.drawImage(img, 0, 0, 8, 8);
  try {
    const d = ctx.getImageData(2, 2, 1, 1).data;
    return {ok: true, rgba: [d[0], d[1], d[2], d[3]]};
  } catch (err) {
    return {ok: false, error: String(err && err.name || err)};
  }
})()"""


async def main() -> int:
    expected = (32, 96, 200)
    with tempfile.TemporaryDirectory(prefix="notale-taint-") as scratch:
        root = Path(scratch)
        (root / "plate.png").write_bytes(_solid_png(16, 16, expected))
        (root / "probe.html").write_text(
            '<!doctype html><meta charset="utf-8">'
            '<img src="plate.png" width="1280" height="720">',
            encoding="utf-8",
        )
        try:
            async with BrowserPageRenderer() as renderer:
                await renderer.render(root / "probe.html")
                result = await renderer._cdp.evaluate(_PROBE_JS, await_promise=True)
        except BrowserUnavailable as exc:
            print(f"SKIP: no Chromium available ({exc})")
            return 2

    print(f"result: {result}")
    if not isinstance(result, dict) or not result.get("ok"):
        print("TAINTED: getImageData is blocked; use the server-side fallback.")
        return 1
    rgba = list(result.get("rgba") or [])
    if rgba[:3] != list(expected):
        print(f"READABLE BUT WRONG: expected {expected}, sampled {rgba[:3]}")
        return 1
    print("OK: file:// canvas pixels are readable; the JS sampler is viable.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
