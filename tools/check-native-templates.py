#!/usr/bin/env python3
"""Render and smoke-test the native template HTML files."""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import os
import threading
from pathlib import Path
from urllib.parse import quote

import numpy as np
from PIL import Image, ImageChops, ImageEnhance
from playwright.sync_api import sync_playwright


REPO = Path(__file__).resolve().parents[1]
ORGANIZED = REPO / "refs/template/organized"
CHROME_CANDIDATES = (
    Path("/data1/home/zhuyifan/.cache/ms-playwright/chromium-1181/chrome-linux/chrome"),
    Path("/data1/home/zhuyifan/.cache/ms-playwright/chromium-1161/chrome-linux/chrome"),
)


EDITOR_PAGE = "图片排版/01-一图/E1-01-一图排版-企业宣传.html"
EDITOR_ASSET = (
    ORGANIZED
    / "图片排版/01-一图/E1-01-一图排版-企业宣传.assets/photo-01.png"
)


def chrome_path() -> str:
    override = os.environ.get("NOTALE_CHROME")
    if override and Path(override).is_file():
        return override
    for candidate in CHROME_CANDIDATES:
        if candidate.is_file():
            return str(candidate)
    raise SystemExit("No Chromium executable found. Set NOTALE_CHROME.")


def run_editor_smoke(browser: object, base_url: str, output: Path) -> dict[str, object]:
    """Exercise editing and writeback without touching the real template files."""
    page = browser.new_page(viewport={"width": 1152, "height": 648}, device_scale_factor=1)
    result: dict[str, object] = {"page": EDITOR_PAGE, "ok": False}
    page_errors: list[str] = []
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on(
        "console",
        lambda message: page_errors.append(f"console:{message.type}:{message.text}")
        if message.type == "error"
        else None,
    )
    page.add_init_script(
        """
        (() => {
          window.__nativeFsWrites = [];
          const makeDirectory = (segments = []) => ({
            kind: 'directory',
            name: segments.at(-1) || 'organized',
            queryPermission: async () => 'granted',
            requestPermission: async () => 'granted',
            getDirectoryHandle: async (name) => makeDirectory([...segments, name]),
            getFileHandle: async (name) => {
              const filePath = [...segments, name].join('/');
              return {
                kind: 'file',
                name,
                createWritable: async () => ({
                  write: async (data) => {
                    if (data instanceof Blob) {
                      window.__nativeFsWrites.push({
                        path: filePath,
                        kind: 'blob',
                        size: data.size,
                        type: data.type,
                      });
                    } else {
                      window.__nativeFsWrites.push({
                        path: filePath,
                        kind: 'text',
                        text: String(data),
                      });
                    }
                  },
                  close: async () => {},
                }),
              };
            },
          });
          Object.defineProperty(window, 'showDirectoryPicker', {
            configurable: true,
            value: async () => makeDirectory(),
          });
        })();
        """
    )
    try:
        url = f"{base_url.rstrip('/')}/{quote(EDITOR_PAGE, safe='/')}?edit=1"
        response = page.goto(url, wait_until="networkidle")
        page.wait_for_function(
            "document.documentElement.dataset.editMode === 'true' && !document.getElementById('native-toolbar').hidden"
        )

        title = page.locator('[data-element-id="e101-title"]')
        original_title = title.inner_text()
        title.dblclick()
        page.wait_for_function(
            "document.querySelector('[data-element-id=\"e101-title\"]').isContentEditable"
        )
        page.keyboard.press("Control+A")
        page.keyboard.insert_text("编辑测试标题")
        page.keyboard.press("Tab")
        page.wait_for_function(
            "document.querySelector('[data-element-id=\"e101-title\"]').textContent.trim() === '编辑测试标题'"
        )

        page.locator('button[data-action="undo"]').click()
        page.wait_for_function(
            "expected => document.querySelector('[data-element-id=\"e101-title\"]').textContent.trim() === expected",
            arg=original_title.strip(),
        )
        page.locator('button[data-action="redo"]').click()
        page.wait_for_function(
            "document.querySelector('[data-element-id=\"e101-title\"]').textContent.trim() === '编辑测试标题'"
        )

        width_before = title.evaluate("node => parseFloat(node.style.width)")
        handle = title.locator(":scope > .native-handle")
        handle_box = handle.bounding_box()
        if not handle_box:
            raise RuntimeError("Resize handle was not created for the selected title")
        page.mouse.move(handle_box["x"] + handle_box["width"] / 2, handle_box["y"] + handle_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(handle_box["x"] + handle_box["width"] / 2 + 18, handle_box["y"] + handle_box["height"] / 2 + 8)
        page.mouse.up()
        width_after = title.evaluate("node => parseFloat(node.style.width)")
        if width_after <= width_before:
            raise RuntimeError("Resize interaction did not change the title width")

        band = page.locator('[data-element-id="e101-band"]')
        band_box = band.bounding_box()
        if not band_box:
            raise RuntimeError("Movable band could not be measured")
        left_before = band.evaluate("node => parseFloat(node.style.left)")
        move_x = band_box["x"] + 900
        move_y = band_box["y"] + 102
        page.mouse.move(move_x, move_y)
        page.mouse.down()
        page.mouse.move(move_x + 16, move_y - 6)
        page.mouse.up()
        left_after = band.evaluate("node => parseFloat(node.style.left)")
        if left_after <= left_before:
            raise RuntimeError("Move interaction did not change the band position")

        photo = page.locator('[data-element-id="e101-photo"]')
        photo.click(position={"x": 200, "y": 200})
        page.locator("#native-image-input").set_input_files(str(EDITOR_ASSET))
        page.wait_for_function(
            "document.getElementById('native-toast').textContent.includes('图片已替换')"
        )

        page.locator('button[data-action="save"]').click()
        page.wait_for_function(
            "document.getElementById('native-toast').textContent.includes('已写回')"
        )
        writes = page.evaluate("window.__nativeFsWrites")
        html_writes = [item for item in writes if item["kind"] == "text" and item["path"].endswith(".html")]
        asset_writes = [item for item in writes if item["kind"] == "blob" and item["path"].endswith("photo-01.png")]
        if len(html_writes) != 1 or len(asset_writes) != 1:
            raise RuntimeError(f"Expected one HTML and one asset write, got: {writes!r}")
        saved_html = html_writes[0]["text"]
        if "编辑测试标题" not in saved_html or 'id="template-state"' not in saved_html:
            raise RuntimeError("Serialized HTML did not preserve the edited title/state")
        if "blob:" in saved_html or "E1-01-一图排版-企业宣传.assets/photo-01.png" not in saved_html:
            raise RuntimeError("Serialized HTML did not restore the stable photo asset path")

        result.update(
            {
                "ok": True,
                "status": response.status if response else None,
                "titleUndoRedo": True,
                "resize": True,
                "move": True,
                "replacePhoto": True,
                "writeback": True,
                "writes": [
                    {key: value for key, value in item.items() if key != "text"}
                    for item in writes
                ],
            }
        )
    except Exception as error:
        result["error"] = str(error)
    finally:
        result["pageErrors"] = page_errors
        try:
            page.locator(".slide").screenshot(path=str(output / "editor-smoke.png"))
        except Exception:
            pass
        page.close()
    if page_errors:
        result["ok"] = False
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url")
    parser.add_argument("--out", default="/tmp/notale-native-renders")
    parser.add_argument(
        "--page",
        action="append",
        help="Only render this HTML path relative to refs/template/organized; repeatable.",
    )
    parser.add_argument("--max-mae", type=float, default=10.0)
    parser.add_argument("--min-within16", type=float, default=90.0)
    parser.add_argument(
        "--fidelity-layer",
        action="store_true",
        help="Render the raster-derived SVG diagnostic layer instead of native DOM/CSS/SVG.",
    )
    args = parser.parse_args()

    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)
    all_html_files = sorted(ORGANIZED.rglob("*.html"))
    requested_pages = {Path(item).as_posix() for item in (args.page or [])}
    html_files = [
        item
        for item in all_html_files
        if not requested_pages or item.relative_to(ORGANIZED).as_posix() in requested_pages
    ]
    missing_requested = requested_pages - {
        item.relative_to(ORGANIZED).as_posix() for item in html_files
    }
    if missing_requested:
        raise SystemExit(
            json.dumps({"missingRequestedPages": sorted(missing_requested)}, ensure_ascii=False)
        )
    manifest_path = ORGANIZED / "native-template-manifest.json"
    if not manifest_path.is_file():
        raise SystemExit("native-template-manifest.json is missing; run the template builder first")
    audit_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_pages = {item["html"]: item for item in audit_manifest.get("pages", [])}
    pairing_errors = [
        str(html_file.relative_to(ORGANIZED))
        for html_file in html_files
        if not html_file.with_suffix(".png").is_file()
        or not html_file.with_suffix(".md").is_file()
    ]
    if (
        (not requested_pages and len(html_files) != 25)
        or pairing_errors
        or len(manifest_pages) != 25
    ):
        raise SystemExit(
            json.dumps(
                {
                    "expectedPages": 25,
                    "actualPages": len(html_files),
                    "missingPairs": pairing_errors,
                    "manifestPages": len(manifest_pages),
                },
                ensure_ascii=False,
            )
        )
    results: list[dict[str, object]] = []

    server = None
    server_thread = None
    base_url = args.base_url
    if not base_url:
        class QuietHandler(http.server.SimpleHTTPRequestHandler):
            def log_message(self, format: str, *values: object) -> None:
                return

        handler = functools.partial(QuietHandler, directory=str(ORGANIZED))
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        base_url = f"http://127.0.0.1:{server.server_port}"

    editor_result: dict[str, object] = {"ok": False, "error": "Editor smoke did not run"}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=chrome_path(),
            headless=True,
            args=["--no-sandbox", "--disable-gpu", "--disable-lcd-text"],
        )
        for html_file in html_files:
            relative = html_file.relative_to(ORGANIZED).as_posix()
            page_spec = manifest_pages.get(relative)
            if not page_spec:
                raise RuntimeError(f"Manifest entry is missing for {relative}")
            source = html_file.with_suffix(".png")

            with Image.open(source) as image:
                width, height = image.size
            page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
            errors: list[str] = []
            page.on("pageerror", lambda error, bucket=errors: bucket.append(str(error)))
            page.on(
                "console",
                lambda message, bucket=errors: bucket.append(f"console:{message.type}:{message.text}")
                if message.type == "error"
                else None,
            )
            query = "?fidelity=1" if args.fidelity_layer else ""
            url = f"{base_url.rstrip('/')}/{quote(relative, safe='/')}{query}"
            response = page.goto(url, wait_until="networkidle")
            page.evaluate("document.fonts.ready")
            data = page.evaluate(
                """
                () => {
                  const slide = document.querySelector('.slide');
                  const rect = slide.getBoundingClientRect();
                  const ids = [...document.querySelectorAll('[data-element-id]')].map(n => n.dataset.elementId);
                  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
                  const images = [...document.images].map(img => ({
                    src: img.getAttribute('src'),
                    complete: img.complete,
                    naturalWidth: img.naturalWidth,
                    naturalHeight: img.naturalHeight,
                  }));
                  const overflow = [...slide.querySelectorAll('.el:not(.allow-overflow)')].filter(node => {
                    const r = node.getBoundingClientRect();
                    return r.right > rect.right + 2 || r.bottom > rect.bottom + 2 || r.left < rect.left - 2 || r.top < rect.top - 2;
                  }).map(node => node.dataset.elementId);
                  return {
                    renderMode: document.documentElement.dataset.renderMode,
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    toolbarHidden: document.getElementById('native-toolbar').hidden,
                    elementCount: ids.length,
                    duplicates: [...new Set(duplicates)],
                    images,
                    overflow,
                  };
                }
                """
            )
            screenshot = output / (relative.replace("/", "__").removesuffix(".html") + ".png")
            page.locator(".slide").screenshot(path=str(screenshot))
            source_image = Image.open(source).convert("RGB")
            rendered_image = Image.open(screenshot).convert("RGB")
            source_audit = source_image.copy()
            rendered_audit = rendered_image.copy()
            valid_pixels = np.ones((height, width), dtype=bool)
            for mask in page_spec.get("watermarkMasks", []):
                x1 = max(0, int(mask["x"]))
                y1 = max(0, int(mask["y"]))
                x2 = min(width, x1 + int(mask["width"]))
                y2 = min(height, y1 + int(mask["height"]))
                valid_pixels[y1:y2, x1:x2] = False
                neutral = Image.new("RGB", (x2 - x1, y2 - y1), "#e4e7e5")
                source_audit.paste(neutral, (x1, y1))
                rendered_audit.paste(neutral, (x1, y1))
            source_array = np.asarray(source_audit, dtype=np.int16)
            render_array = np.asarray(rendered_audit, dtype=np.int16)
            delta = np.abs(source_array - render_array)
            valid_delta = delta[valid_pixels]
            max_delta = delta.max(axis=2)[valid_pixels]
            max_delta_map = delta.max(axis=2)
            failing_map = (max_delta_map > 16) & valid_pixels
            failing_y, failing_x = np.where(failing_map)
            error_bounds = None
            if failing_x.size:
                error_bounds = {
                    "x": int(failing_x.min()),
                    "y": int(failing_y.min()),
                    "width": int(failing_x.max() - failing_x.min() + 1),
                    "height": int(failing_y.max() - failing_y.min() + 1),
                }
            error_tiles: list[dict[str, object]] = []
            tile_size = 64
            for tile_y in range(0, height, tile_size):
                for tile_x in range(0, width, tile_size):
                    tile = failing_map[
                        tile_y : min(height, tile_y + tile_size),
                        tile_x : min(width, tile_x + tile_size),
                    ]
                    if not tile.size:
                        continue
                    ratio = float(tile.mean() * 100)
                    if ratio:
                        error_tiles.append(
                            {
                                "x": tile_x,
                                "y": tile_y,
                                "width": min(tile_size, width - tile_x),
                                "height": min(tile_size, height - tile_y),
                                "errorPercent": round(ratio, 3),
                            }
                        )
            error_tiles.sort(key=lambda item: item["errorPercent"], reverse=True)
            visual_stem = relative.replace("/", "__").removesuffix(".html")
            overlay_path = output / f"{visual_stem}__overlay.png"
            difference_path = output / f"{visual_stem}__difference.png"
            Image.blend(source_audit, rendered_audit, 0.5).save(overlay_path)
            ImageEnhance.Contrast(ImageChops.difference(source_audit, rendered_audit)).enhance(3).save(difference_path)
            mae = round(float(valid_delta.mean()), 3)
            within16 = round(float((max_delta <= 16).mean() * 100), 3)
            visual = {
                "mae": mae,
                "rmse": round(float(np.sqrt(np.mean(valid_delta.astype(np.float32) ** 2))), 3),
                "within4Percent": round(float((max_delta <= 4).mean() * 100), 3),
                "within16Percent": within16,
                "pass": mae <= args.max_mae and within16 >= args.min_within16,
                "thresholds": {
                    "maxMae": args.max_mae,
                    "minWithin16Percent": args.min_within16,
                },
                "errorBounds": error_bounds,
                "topErrorTiles": error_tiles[:12],
                "overlay": str(overlay_path),
                "difference": str(difference_path),
                "maskedRegions": page_spec.get("watermarkMasks", []),
            }
            failed_images = [item for item in data["images"] if not item["complete"] or not item["naturalWidth"]]
            source_image_refs = [
                item["src"]
                for item in data["images"]
                if item["src"] and ".assets/" not in item["src"]
            ]
            results.append(
                {
                    "path": relative,
                    "status": response.status if response else None,
                    "expectedWidth": width,
                    "expectedHeight": height,
                    **data,
                    "failedImages": failed_images,
                    "sourceImageRefs": source_image_refs,
                    "errors": errors,
                    "screenshot": str(screenshot),
                    "visual": visual,
                }
            )
            page.close()
        editor_result = run_editor_smoke(browser, base_url, output)
        browser.close()

    if server:
        server.shutdown()
        server.server_close()
    if server_thread:
        server_thread.join(timeout=2)

    report_path = output / "report.json"
    report_path.write_text(
        json.dumps(
            {
                "pages": results,
                "editor": editor_result,
                "visualThresholds": {
                    "maxMae": args.max_mae,
                    "minWithin16Percent": args.min_within16,
                },
                "renderVariant": "fidelity-diagnostic" if args.fidelity_layer else "native",
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    failures = [
        item
        for item in results
        if item["status"] != 200
        or item["renderMode"] != "native-html"
        or item["errors"]
        or item["duplicates"]
        or item["failedImages"]
        or item["sourceImageRefs"]
        or not item["toolbarHidden"]
        or item["overflow"]
        or item["elementCount"] <= 0
        or item["width"] != item["expectedWidth"]
        or item["height"] != item["expectedHeight"]
        or not item["visual"]["pass"]
    ]
    print(
        json.dumps(
            {
                "pages": len(results),
                "failures": len(failures),
                "overflowPages": sum(bool(item["overflow"]) for item in results),
                "visualFailures": sum(not item["visual"]["pass"] for item in results),
                "editorSmoke": editor_result["ok"],
                "visualAverageMae": round(
                    sum(item["visual"]["mae"] for item in results) / max(1, len(results)), 3
                ),
                "visualAverageWithin16": round(
                    sum(item["visual"]["within16Percent"] for item in results) / max(1, len(results)), 3
                ),
                "report": str(report_path),
            },
            ensure_ascii=False,
        )
    )
    if failures or not editor_result["ok"]:
        for failure in failures:
            print(json.dumps(failure, ensure_ascii=False))
        if not editor_result["ok"]:
            print(json.dumps(editor_result, ensure_ascii=False))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
