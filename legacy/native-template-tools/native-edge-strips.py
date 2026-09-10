#!/usr/bin/env python3
"""Encode narrow raster anti-alias samples as native CSS hard-stop gradients.

This helper is intentionally limited to one-pixel rows/columns.  It is used to
reproduce the sub-pixel coverage that PowerPoint bakes into thin vector rules;
it is not a mechanism for embedding a source slide as a bitmap.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def color(value: tuple[int, int, int]) -> str:
    return "#" + "".join(f"{channel:02x}" for channel in value)


def runs(values: np.ndarray) -> list[tuple[int, int, tuple[int, int, int]]]:
    result: list[tuple[int, int, tuple[int, int, int]]] = []
    start = 0
    previous = tuple(int(channel) for channel in values[0])
    for index, item in enumerate(values[1:], 1):
        current = tuple(int(channel) for channel in item)
        if current != previous:
            result.append((start, index, previous))
            start = index
            previous = current
    result.append((start, len(values), previous))
    return result


def gradient_for_strip(image: np.ndarray, spec: dict[str, int]) -> str:
    if "row" in spec:
        y = int(spec["row"])
        start = int(spec["start"])
        end = int(spec["end"])
        values = image[y, start:end]
        direction = "90deg"
        position = f"{start}px {y}px"
        size = f"{end - start}px 1px"
    elif "column" in spec:
        x = int(spec["column"])
        start = int(spec["start"])
        end = int(spec["end"])
        values = image[start:end, x]
        direction = "180deg"
        position = f"{x}px {start}px"
        size = f"1px {end - start}px"
    else:
        raise ValueError(f"Strip must contain row or column: {spec!r}")

    if end <= start or not len(values):
        raise ValueError(f"Strip has an empty range: {spec!r}")
    stops = ",".join(
        f"{color(value)} {run_start}px {run_end}px"
        for run_start, run_end, value in runs(values)
    )
    return f"linear-gradient({direction},{stops}) {position}/{size} no-repeat"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--strips", required=True, help="JSON array of strip specifications")
    args = parser.parse_args()

    specs = json.loads(args.strips)
    if not isinstance(specs, list) or not specs:
        raise SystemExit("--strips must be a non-empty JSON array")
    image = np.asarray(Image.open(args.source).convert("RGB"))
    print(",".join(gradient_for_strip(image, spec) for spec in specs))


if __name__ == "__main__":
    main()
