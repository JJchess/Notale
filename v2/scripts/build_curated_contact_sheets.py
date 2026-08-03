#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build one three-page contact sheet per curated style.")
    parser.add_argument("--root", required=True)
    parser.add_argument("--styles", required=True)
    parser.add_argument("--pages", required=True)
    parser.add_argument("--roles", required=True)
    parser.add_argument("--report", default="selection-report.json")
    parser.add_argument("--out", default="contact-sheets")
    args = parser.parse_args()

    curated = Path(args.root)
    if not curated.is_absolute():
        curated = ROOT / curated
    styles = [item.strip() for item in args.styles.split(",") if item.strip()]
    pages = [item.strip() for item in args.pages.split(",") if item.strip()]
    roles = [item.strip().upper() for item in args.roles.split(",") if item.strip()]
    if len(pages) != len(roles):
        raise SystemExit("--pages and --roles must have the same number of entries")

    report_path = curated / args.report
    report = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {}
    out_dir = curated / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    cell_w, image_h, header_h, role_h = 640, 360, 54, 28
    width = cell_w * len(pages)
    height = header_h + role_h + image_h
    title_font = font(24, bold=True)
    role_font = font(16, bold=True)

    for style in styles:
        score = report.get("styles", {}).get(style, {}).get("score")
        title = style if score is None else f"{style}  |  CURATED SCORE {score}/100"
        sheet = Image.new("RGB", (width, height), "#111318")
        draw = ImageDraw.Draw(sheet)
        draw.text((16, 13), title, fill="#f5f7fa", font=title_font)

        for index, (page, role) in enumerate(zip(pages, roles)):
            x = index * cell_w
            draw.text((x + 12, header_h + 5), role, fill="#d5d9e0", font=role_font)
            source = curated / style / f"{page}.jpg"
            image = Image.open(source).convert("RGB")
            fitted = ImageOps.fit(image, (cell_w, image_h), method=Image.Resampling.LANCZOS)
            sheet.paste(fitted, (x, header_h + role_h))
            if index:
                draw.line((x, header_h, x, height), fill="#32363e", width=2)

        sheet.save(out_dir / f"{style}.jpg", quality=92, optimize=True)


if __name__ == "__main__":
    main()
