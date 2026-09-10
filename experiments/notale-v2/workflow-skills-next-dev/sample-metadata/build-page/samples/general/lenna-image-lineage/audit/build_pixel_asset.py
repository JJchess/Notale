#!/usr/bin/env python3
"""Build the exact 84×84 RGB asset used by the pinned Lenna.svelte data source."""

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = Path("/data1/home/zhuyifan/ws2/Notale/refs/lenna")
SOURCE = UPSTREAM / "src" / "data" / "lennaPixels.json"
DESTINATION = ROOT / "output" / "pages" / "assets" / "img" / "lenna-pixels.png"


def main() -> None:
    pixels = json.loads(SOURCE.read_text(encoding="utf-8"))
    assert len(pixels) == 84 * 84
    image = Image.new("RGB", (84, 84))
    for pixel in pixels:
        image.putpixel(
            (pixel["x"], pixel["y"]),
            (pixel["r"], pixel["g"], pixel["b"]),
        )
    image.save(DESTINATION, optimize=True)

    check = Image.open(DESTINATION).convert("RGB")
    assert all(
        check.getpixel((pixel["x"], pixel["y"]))
        == (pixel["r"], pixel["g"], pixel["b"])
        for pixel in pixels
    )


if __name__ == "__main__":
    main()
