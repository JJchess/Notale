#!/usr/bin/env python3
"""Coordinate-descent tuner for native template text CSS.

This is a development helper: it keeps the page as DOM/CSS/SVG and searches
small typographic adjustments against the paired reference PNG.
"""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright


CHROME = Path("/data1/home/zhuyifan/.cache/ms-playwright/chromium-1161/chrome-linux/chrome")


def declaration(selector: str, prop: str, value: str) -> str:
    return f"{selector}{{{prop}:{value}!important}}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--element", action="append", default=[])
    parser.add_argument("--base-css", type=Path, action="append", default=[])
    parser.add_argument("--output-css", type=Path, required=True)
    parser.add_argument("--output-png", type=Path)
    parser.add_argument("--pad", type=int, default=12)
    parser.add_argument("--skip", default="", help="Comma-separated modes: translate,scale,size,spacing,weight")
    args = parser.parse_args()

    source_image = Image.open(args.source).convert("RGB")
    source = np.asarray(source_image, dtype=np.int16)
    height, width = source.shape[:2]
    base_css = "\n".join(path.read_text(encoding="utf-8") for path in args.base_css)
    skip = {item.strip() for item in args.skip.split(",") if item.strip()}
    rules: dict[tuple[str, str], str] = {}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=str(CHROME),
            headless=True,
            args=["--no-sandbox", "--disable-gpu", "--disable-lcd-text"],
        )
        page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
        page.goto(args.url, wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        if base_css:
            page.add_style_tag(content=base_css)
        page.evaluate(
            """
            () => {
              const style = document.createElement('style');
              style.id = 'native-tune-style';
              document.head.append(style);
            }
            """
        )

        def update_style(extra: tuple[str, str, str] | None = None) -> None:
            chunks = [declaration(selector, prop, value) for (selector, prop), value in rules.items()]
            if extra:
                chunks.append(declaration(*extra))
            page.locator("#native-tune-style").evaluate("(node, css) => { node.textContent = css; }", "\n".join(chunks))

        def screenshot_array(clip: dict[str, float] | None = None) -> np.ndarray:
            data = page.screenshot(type="png", clip=clip)
            return np.asarray(Image.open(io.BytesIO(data)).convert("RGB"), dtype=np.int16)

        def score(clip: dict[str, float], candidate: tuple[str, str, str] | None = None) -> tuple[int, float]:
            update_style(candidate)
            rendered = screenshot_array(clip)
            x = int(clip["x"])
            y = int(clip["y"])
            expected = source[y : y + rendered.shape[0], x : x + rendered.shape[1]]
            delta = np.abs(expected - rendered)
            max_delta = delta.max(axis=2)
            return int((max_delta > 16).sum()), float(delta.mean())

        def choose(selector: str, prop: str, values: list[str], clip: dict[str, float]) -> tuple[str | None, tuple[int, float]]:
            baseline = score(clip)
            best_value = None
            best_score = baseline
            for value in values:
                candidate_score = score(clip, (selector, prop, value))
                if candidate_score < best_score:
                    best_value = value
                    best_score = candidate_score
            if best_value is not None:
                rules[(selector, prop)] = best_value
                update_style()
            return best_value, best_score

        for element_id in args.element:
            selector = f'[data-element-id="{element_id}"]'
            locator = page.locator(selector)
            if locator.count() != 1:
                print(json.dumps({"element": element_id, "error": f"count={locator.count()}"}, ensure_ascii=False))
                continue
            box = locator.bounding_box()
            if not box:
                print(json.dumps({"element": element_id, "error": "no bounding box"}, ensure_ascii=False))
                continue
            pad = args.pad
            x1 = max(0, int(box["x"]) - pad)
            y1 = max(0, int(box["y"]) - pad)
            x2 = min(width, int(np.ceil(box["x"] + box["width"])) + pad)
            y2 = min(height, int(np.ceil(box["y"] + box["height"])) + pad)
            clip = {"x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1}
            computed = locator.evaluate(
                """node => {
                  const style = getComputedStyle(node);
                  return {
                    size: parseFloat(style.fontSize),
                    spacing: parseFloat(style.letterSpacing) || 0,
                  };
                }"""
            )
            results: dict[str, object] = {"element": element_id}

            if "translate" not in skip:
                coarse = [f"{x}px {y}px" for y in range(-3, 4) for x in range(-3, 4)]
                value, result = choose(selector, "translate", coarse, clip)
                if value:
                    x, y = (float(item.removesuffix("px")) for item in value.split())
                    fine = [f"{x + dx:.2f}px {y + dy:.2f}px" for dy in (-.5, -.25, 0, .25, .5) for dx in (-.5, -.25, 0, .25, .5)]
                    value, result = choose(selector, "translate", fine, clip)
                results["translate"] = {"value": rules.get((selector, "translate")), "score": result}

            if "scale" not in skip:
                values = [f"{sx:.3f} {sy:.3f}" for sy in (.94, .97, 1, 1.03, 1.06) for sx in (.90, .94, .97, 1, 1.03, 1.06, 1.10)]
                value, result = choose(selector, "scale", values, clip)
                results["scale"] = {"value": rules.get((selector, "scale")), "score": result}

            if "size" not in skip:
                size = float(computed["size"])
                values = [f"{size + delta:.2f}px" for delta in (-2, -1.5, -1, -.5, -.25, .25, .5, 1, 1.5, 2)]
                value, result = choose(selector, "font-size", values, clip)
                results["size"] = {"value": rules.get((selector, "font-size")), "score": result}

            if "spacing" not in skip:
                spacing = float(computed["spacing"])
                values = [f"{spacing + delta:.2f}px" for delta in (-1.5, -1, -.75, -.5, -.25, .25, .5, .75, 1, 1.5)]
                value, result = choose(selector, "letter-spacing", values, clip)
                results["spacing"] = {"value": rules.get((selector, "letter-spacing")), "score": result}

            if "weight" not in skip:
                value, result = choose(selector, "font-weight", ["400", "500", "600", "700", "800"], clip)
                results["weight"] = {"value": rules.get((selector, "font-weight")), "score": result}

            print(json.dumps(results, ensure_ascii=False))

        update_style()
        css = "\n".join(declaration(selector, prop, value) for (selector, prop), value in rules.items()) + "\n"
        args.output_css.write_text(css, encoding="utf-8")
        if args.output_png:
            args.output_png.write_bytes(page.locator(".slide").screenshot(type="png"))
        full = screenshot_array()
        delta = np.abs(source - full)
        max_delta = delta.max(axis=2)
        print(json.dumps({
            "fullMae": float(delta.mean()),
            "fullWithin16": float((max_delta <= 16).mean() * 100),
            "fullFail": int((max_delta > 16).sum()),
            "css": str(args.output_css),
        }, ensure_ascii=False))
        browser.close()


if __name__ == "__main__":
    main()
