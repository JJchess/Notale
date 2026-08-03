#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


def find_page_image(page_dir: Path, kind: str) -> Path | None:
    if kind == "shot":
        candidates = [
            page_dir / "shot.png",
            page_dir / "attempt-native-2560x1440" / "shot.png",
            *sorted(page_dir.glob("attempt-native-*/shot.png")),
        ]
        return next((file for file in candidates if file.exists()), None)
    for extension in ("jpg", "jpeg", "png", "webp"):
        file = page_dir / f"ref.{extension}"
        if file.exists():
            return file
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--kind", choices=("reference", "shot"), default="shot")
    parser.add_argument("--columns", type=int, default=4)
    args = parser.parse_args()

    run = Path(args.run)
    pages = sorted((run / "evidence").glob("page-*"))
    rows = (len(pages) + args.columns - 1) // args.columns
    cell_w, image_h, label_h = 400, 225, 28
    sheet = Image.new("RGB", (cell_w * args.columns, (image_h + label_h) * rows), "#08101a")
    draw = ImageDraw.Draw(sheet)
    for index, page_dir in enumerate(pages):
        file = find_page_image(page_dir, args.kind)
        if not file:
            continue
        image = Image.open(file).convert("RGB")
        image.thumbnail((cell_w, image_h), Image.Resampling.LANCZOS)
        x = (index % args.columns) * cell_w
        y = (index // args.columns) * (image_h + label_h)
        sheet.paste(image, (x + (cell_w - image.width) // 2, y + (image_h - image.height) // 2))
        draw.rectangle((x, y + image_h, x + cell_w, y + image_h + label_h), fill="#111c29")
        draw.text((x + 10, y + image_h + 7), page_dir.name, fill="#dce7f5")
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out, compress_level=3)


if __name__ == "__main__":
    main()
