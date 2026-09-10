#!/usr/bin/env python3
"""Trace non-photo page pixels into inline SVG paths for preview fidelity.

The output is vector geometry only: source screenshots are never embedded. Photo
rectangles and approved watermark regions are removed before palette tracing.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--photos", default="[]")
    parser.add_argument("--masks", default="[]")
    parser.add_argument("--colors", type=int, default=48)
    parser.add_argument("--min-area", type=int, default=0)
    return parser.parse_args()


def rect_values(rect: dict) -> tuple[int, int, int, int]:
    x = int(rect.get("x", 0))
    y = int(rect.get("y", 0))
    width = int(rect.get("w", rect.get("width", 0)))
    height = int(rect.get("h", rect.get("height", 0)))
    return x, y, width, height


def remove_rectangles(pixels: np.ndarray, rectangles: list[dict]) -> None:
    height, width = pixels.shape[:2]
    for rect in rectangles:
        x, y, rect_width, rect_height = rect_values(rect)
        if rect.get("mask"):
            polygon = np.array(
                [[x + int(point[0]), y + int(point[1])] for point in rect["mask"]],
                dtype=np.int32,
            )
            polygon[:, 0] = np.clip(polygon[:, 0], 0, width - 1)
            polygon[:, 1] = np.clip(polygon[:, 1], 0, height - 1)
            selection = np.zeros((height, width), dtype=np.uint8)
            cv2.fillPoly(selection, [polygon], 1)
            pixels[selection == 1] = 255
            continue
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(width, x + rect_width), min(height, y + rect_height)
        if x2 > x1 and y2 > y1:
            pixels[y1:y2, x1:x2] = 255


def fmt(number: float) -> str:
    if number == int(number):
        return str(int(number))
    return f"{number:.2f}".rstrip("0").rstrip(".")


def mask_paths(mask: np.ndarray) -> list[str]:
    """Return pixel-aligned vector polygons for a binary color layer."""
    padded = np.pad(mask, 1)
    center = padded[1:-1, 1:-1].astype(bool)
    edge_list: list[tuple[int, int, int, int]] = []
    for boundary, dx1, dy1, dx2, dy2 in (
        (center & ~padded[:-2, 1:-1].astype(bool), 0, 0, 1, 0),
        (center & ~padded[1:-1, 2:].astype(bool), 1, 0, 1, 1),
        (center & ~padded[2:, 1:-1].astype(bool), 1, 1, 0, 1),
        (center & ~padded[1:-1, :-2].astype(bool), 0, 1, 0, 0),
    ):
        ys, xs = np.where(boundary)
        edge_list.extend(
            (int(x + dx1), int(y + dy1), int(x + dx2), int(y + dy2))
            for x, y in zip(xs, ys)
        )

    unused = set(edge_list)
    outgoing: dict[tuple[int, int], list[tuple[int, int, int, int]]] = {}
    for edge in edge_list:
        outgoing.setdefault((edge[0], edge[1]), []).append(edge)
    direction = {(1, 0): 0, (0, 1): 1, (-1, 0): 2, (0, -1): 3}
    turn_rank = {1: 0, 0: 1, 3: 2, 2: 3}
    paths: list[str] = []

    while unused:
        first = next(iter(unused))
        unused.remove(first)
        start = (first[0], first[1])
        current = (first[2], first[3])
        previous_direction = direction[(current[0] - start[0], current[1] - start[1])]
        points = [start, current]
        guard = 0
        while current != start and guard <= len(edge_list):
            candidates = [edge for edge in outgoing.get(current, []) if edge in unused]
            if not candidates:
                break
            chosen = min(
                candidates,
                key=lambda edge: turn_rank[
                    (direction[(edge[2] - edge[0], edge[3] - edge[1])] - previous_direction) % 4
                ],
            )
            unused.remove(chosen)
            next_point = (chosen[2], chosen[3])
            next_direction = direction[(next_point[0] - current[0], next_point[1] - current[1])]
            if next_direction == previous_direction:
                points[-1] = next_point
            else:
                points.append(next_point)
            previous_direction = next_direction
            current = next_point
            guard += 1
        if current != start or len(points) < 3:
            continue
        commands = [f"M{points[0][0]} {points[0][1]}"]
        previous = points[0]
        for point in points[1:-1]:
            dx, dy = point[0] - previous[0], point[1] - previous[1]
            commands.append(f"h{dx}" if dy == 0 else f"v{dy}")
            previous = point
        commands.append("Z")
        paths.append("".join(commands))
    return paths


def main() -> None:
    args = parse_args()
    image = Image.open(args.source).convert("RGB")
    pixels = np.array(image)
    remove_rectangles(pixels, json.loads(args.photos))
    remove_rectangles(pixels, json.loads(args.masks))

    quantized = Image.fromarray(pixels).quantize(
        colors=args.colors,
        method=Image.Quantize.MAXCOVERAGE,
        dither=Image.Dither.NONE,
    )
    indices = np.array(quantized)
    palette = quantized.getpalette()
    entries: list[tuple[int, tuple[int, int, int], int]] = []
    for index in np.unique(indices):
        offset = int(index) * 3
        color = tuple(int(value) for value in palette[offset : offset + 3])
        count = int(np.count_nonzero(indices == index))
        if min(color) >= 248:
            continue
        entries.append((int(index), color, count))

    # Paint pale surfaces first and dark typography last.
    entries.sort(key=lambda item: (sum(item[1]), item[2]), reverse=True)
    paths: list[str] = []
    for index, color, _ in entries:
        mask = (indices == index).astype(np.uint8)
        component_count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
        clean = np.zeros_like(mask)
        min_area = args.min_area or (2 if sum(color) < 690 else 3)
        for component in range(1, component_count):
            if int(stats[component, cv2.CC_STAT_AREA]) >= min_area:
                clean[labels == component] = 1
        if not np.any(clean):
            continue
        data = mask_paths(clean)
        if not data:
            continue
        fill = f"#{color[0]:02x}{color[1]:02x}{color[2]:02x}"
        paths.append(f'<path d="{"".join(data)}" fill="{fill}" fill-rule="evenodd"/>')

    width, height = image.size
    print(
        f'<svg class="fidelity-vector-layer" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" aria-hidden="true" '
        'preserveAspectRatio="none" shape-rendering="crispEdges">'
        + "".join(paths)
        + "</svg>"
    )


if __name__ == "__main__":
    main()
