#!/usr/bin/env python3
"""Decompose a generated slide into an inpainted base and transparent node sprites.

The JSON spec uses source-image pixel coordinates. Text masks remove only glyph-like
pixels inside declared boxes; graph masks remove complete nodes/edges so HTML/SVG can
own those elements without leaving a raster duplicate underneath.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def _text_mask(image: np.ndarray, item: dict, full: bool = False) -> np.ndarray:
    x, y, w, h = (int(item[key]) for key in ("x", "y", "w", "h"))
    mask = np.zeros(image.shape[:2], np.uint8)
    if full or item.get("full"):
        mask[y:y + h, x:x + w] = 255
        return mask
    crop = image[y:y + h, x:x + w]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mode = item.get("mode", "dark")
    if mode == "light":
        local = gray >= int(item.get("threshold", 185))
    elif mode == "colored":
        local = (hsv[..., 1] >= int(item.get("saturation", 70))) | (gray <= int(item.get("threshold", 100)))
    else:
        local = gray <= int(item.get("threshold", 115))
    kernel = np.ones((3, 3), np.uint8)
    local = cv2.dilate(local.astype(np.uint8) * 255, kernel, iterations=int(item.get("dilate", 1)))
    mask[y:y + h, x:x + w] = local
    return mask


def _anti_aliased_circle(size: int, radius: float) -> np.ndarray:
    scale = 4
    large = np.zeros((size * scale, size * scale), np.uint8)
    center = size * scale // 2
    cv2.circle(large, (center, center), int(radius * scale), 255, -1, lineType=cv2.LINE_AA)
    return cv2.resize(large, (size, size), interpolation=cv2.INTER_AREA)


def _snapshot_ids(spec: dict) -> list[str]:
    text = spec.get("text", {})
    ids = ["chapter", "title", "subtitle"]
    ids.extend(f"concept-{index}" for index, _ in enumerate(text.get("concepts", [])))
    ids.append("kpi-header")
    ids.extend(f"kpi-{index}" for index, _ in enumerate(text.get("kpis", [])))
    ids.append("banner")
    return ids


def _crop_snapshot(source_rgb: Image.Image, bbox: tuple[int, int, int, int], out: Path) -> dict:
    x, y, w, h = bbox
    source_rgb.crop((x, y, x + w, y + h)).save(out, compress_level=3)
    return {"file": out.name, "x": x, "y": y, "w": w, "h": h}


def decompose(source: Path, spec_path: Path, out_dir: Path, skip_graph: bool = False, skip_sprites: bool = False) -> None:
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    try:
        source_rgb = Image.open(source).convert("RGB")
    except OSError as error:
        raise SystemExit(f"cannot read source image: {source}: {error}") from error
    image = cv2.cvtColor(np.asarray(source_rgb), cv2.COLOR_RGB2BGR)
    height, width = image.shape[:2]
    canvas = spec["canvas"]
    if [width, height] != [int(canvas["width"]), int(canvas["height"])]:
        raise SystemExit(f"source size {width}x{height} does not match spec {canvas}")

    out_dir.mkdir(parents=True, exist_ok=True)
    sprite_dir = out_dir / "nodes"
    sprite_dir.mkdir(parents=True, exist_ok=True)
    snapshot_dir = out_dir / "snapshots"
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    text_layer_mask = np.zeros((height, width), np.uint8)
    for item in spec.get("textMasks", []):
        text_layer_mask = cv2.bitwise_or(text_layer_mask, _text_mask(image, item, bool(spec.get("fullTextMasks"))))
    graph_layer_mask = np.zeros((height, width), np.uint8)

    graph = {} if skip_graph else spec.get("graph", {})
    nodes = {node["id"]: node for node in graph.get("nodes", [])}
    for edge in graph.get("edges", []):
        start = nodes[edge["from"]]
        end = nodes[edge["to"]]
        cv2.line(graph_layer_mask, (int(start["cx"]), int(start["cy"])), (int(end["cx"]), int(end["cy"])), 255,
                 int(graph.get("eraseLineWidth", 34)), lineType=cv2.LINE_AA)

    for node in graph.get("nodes", []):
        cx, cy = int(node["cx"]), int(node["cy"])
        erase_radius = int(node.get("eraseRadius", graph.get("eraseRadius", 122)))
        cv2.circle(graph_layer_mask, (cx, cy), erase_radius, 255, -1, lineType=cv2.LINE_AA)

        if skip_sprites:
            continue
        radius = int(node.get("radius", graph.get("radius", 82)))
        pad = int(node.get("pad", graph.get("spritePad", 8)))
        size = (radius + pad) * 2
        x0, y0 = cx - size // 2, cy - size // 2
        crop = image[y0:y0 + size, x0:x0 + size].copy()
        crop_gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        yy, xx = np.ogrid[:size, :size]
        inner = (xx - size / 2) ** 2 + (yy - size / 2) ** 2 <= (radius * 0.62) ** 2
        letter = ((crop_gray >= 178) & inner).astype(np.uint8) * 255
        letter = cv2.dilate(letter, np.ones((5, 5), np.uint8), iterations=2)
        clean = cv2.inpaint(crop, letter, 7, cv2.INPAINT_TELEA)
        rgba = cv2.cvtColor(clean, cv2.COLOR_BGR2RGBA)
        rgba[..., 3] = _anti_aliased_circle(size, radius + 1)
        Image.fromarray(rgba).save(sprite_dir / f"{node['id']}.png")

    text_layer_mask = cv2.dilate(text_layer_mask, np.ones((5, 5), np.uint8), iterations=1)
    graph_layer_mask = cv2.dilate(graph_layer_mask, np.ones((5, 5), np.uint8), iterations=1)
    mask = cv2.bitwise_or(text_layer_mask, graph_layer_mask)
    fidelity_mask = mask.copy()
    for region in spec.get("fidelityRegions", []):
        x, y, w, h = (int(region[key]) for key in ("x", "y", "w", "h"))
        radius = int(region.get("radius", 0))
        if radius > 0:
            cv2.rectangle(fidelity_mask, (x + radius, y), (x + w - radius, y + h), 255, -1)
            cv2.rectangle(fidelity_mask, (x, y + radius), (x + w, y + h - radius), 255, -1)
            cv2.circle(fidelity_mask, (x + radius, y + radius), radius, 255, -1)
            cv2.circle(fidelity_mask, (x + w - radius, y + radius), radius, 255, -1)
            cv2.circle(fidelity_mask, (x + radius, y + h - radius), radius, 255, -1)
            cv2.circle(fidelity_mask, (x + w - radius, y + h - radius), radius, 255, -1)
        else:
            cv2.rectangle(fidelity_mask, (x, y), (x + w, y + h), 255, -1)
    base = cv2.inpaint(image, mask, int(spec.get("inpaintRadius", 7)), cv2.INPAINT_TELEA)
    cv2.imwrite(str(out_dir / "base.jpg"), base, [cv2.IMWRITE_JPEG_QUALITY, 96])
    cv2.imwrite(str(out_dir / "base.png"), base, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    cv2.imwrite(str(out_dir / "mask.png"), mask)
    cv2.imwrite(str(out_dir / "text-mask.png"), text_layer_mask)
    cv2.imwrite(str(out_dir / "graph-mask.png"), graph_layer_mask)
    cv2.imwrite(str(out_dir / "fidelity-mask.png"), fidelity_mask)
    snapshot_pad = int(spec.get("snapshotPad", 8))
    snapshot_coverage = np.zeros((height, width), np.uint8)
    snapshot_text = []
    ids = _snapshot_ids(spec)
    text_masks = spec.get("textMasks", [])
    if len(ids) != len(text_masks):
        raise SystemExit(f"snapshot id count {len(ids)} does not match textMasks count {len(text_masks)}")
    for snapshot_id, item in zip(ids, text_masks):
        x, y, w, h = (int(item[key]) for key in ("x", "y", "w", "h"))
        x0, y0 = max(0, x - snapshot_pad), max(0, y - snapshot_pad)
        x1, y1 = min(width, x + w + snapshot_pad), min(height, y + h + snapshot_pad)
        file = snapshot_dir / f"text-{snapshot_id}.png"
        record = _crop_snapshot(source_rgb, (x0, y0, x1 - x0, y1 - y0), file)
        record["id"] = snapshot_id
        snapshot_text.append(record)
        snapshot_coverage[y0:y1, x0:x1] = 255
    snapshot_graph = None
    graph_points = cv2.findNonZero(graph_layer_mask)
    if graph_points is not None:
        gx, gy, gw, gh = cv2.boundingRect(graph_points)
        x0, y0 = max(0, gx - snapshot_pad), max(0, gy - snapshot_pad)
        x1, y1 = min(width, gx + gw + snapshot_pad), min(height, gy + gh + snapshot_pad)
        file = snapshot_dir / "graph.png"
        snapshot_graph = _crop_snapshot(source_rgb, (x0, y0, x1 - x0, y1 - y0), file)
        snapshot_graph["id"] = "graph"
        snapshot_coverage[y0:y1, x0:x1] = 255
    snapshot_manifest = {
        "version": "1.0",
        "canvas": canvas,
        "text": snapshot_text,
        "graph": snapshot_graph,
        "coverageFraction": float(np.count_nonzero(snapshot_coverage) / snapshot_coverage.size),
        "wholePageSnapshot": False,
    }
    (snapshot_dir / "manifest.json").write_text(
        json.dumps(snapshot_manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / "decomposition.json").write_text(json.dumps({
        "source": source.name,
        "canvas": canvas,
        "textMaskCount": len(spec.get("textMasks", [])),
        "nodeCount": len(graph.get("nodes", [])),
        "edgeCount": len(graph.get("edges", [])),
        "maskedPixelFraction": float(np.count_nonzero(mask) / mask.size),
        "snapshotCoverageFraction": snapshot_manifest["coverageFraction"],
    }, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--spec", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--skip-graph", action="store_true")
    parser.add_argument("--skip-sprites", action="store_true")
    args = parser.parse_args()
    decompose(Path(args.source), Path(args.spec), Path(args.out), args.skip_graph, args.skip_sprites)


if __name__ == "__main__":
    main()
