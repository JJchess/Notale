#!/usr/bin/env python3
"""Project Beck et al. Köppen rasters into the sample's Natural Earth grid.

The output is scientific category data, not pixels from a rendered map. Each row
is run-length encoded as (x, length, DN), where DN is the 0-30 Köppen class.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image


WIDTH = 1584
HEIGHT = 900
SCALE_X = 300.2534121448773
SCALE_Y = 300.82036333324055
TRANSLATE_X = 792.1181901144718
TRANSLATE_Y = 450.0005585915445


def natural_earth_y(phi: float) -> float:
    phi2 = phi * phi
    phi4 = phi2 * phi2
    return phi * (
        1.007226
        + phi2
        * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4))
    )


def natural_earth_x_factor(phi: float) -> float:
    phi2 = phi * phi
    phi4 = phi2 * phi2
    return 0.8707 - 0.131979 * phi2 + phi4 * phi4 * phi4 * (
        -0.013791 + phi2 * (0.003971 * phi2 - 0.001529 * phi4)
    )


def invert_y(raw_y: float) -> float | None:
    limit = natural_earth_y(math.pi / 2)
    if abs(raw_y) > limit:
        return None
    low, high = -math.pi / 2, math.pi / 2
    for _ in range(36):
        mid = (low + high) / 2
        if natural_earth_y(mid) < raw_y:
            low = mid
        else:
            high = mid
    return (low + high) / 2


def raster_index(image: Image.Image, longitude: float, latitude: float) -> int:
    x = min(image.width - 1, max(0, int((longitude + 180.0) / 360.0 * image.width)))
    y = min(image.height - 1, max(0, int((90.0 - latitude) / 180.0 * image.height)))
    return int(image.getpixel((x, y)))


def projected_rows(present: Image.Image, future: Image.Image):
    for y in range(HEIGHT):
        raw_y = (TRANSLATE_Y - (y + 0.5)) / SCALE_Y
        phi = invert_y(raw_y)
        current_row: list[int] = []
        future_row: list[int] = []
        if phi is None:
            yield [0] * WIDTH, [0] * WIDTH
            continue
        factor = natural_earth_x_factor(phi)
        latitude = math.degrees(phi)
        for x in range(WIDTH):
            raw_x = ((x + 0.5) - TRANSLATE_X) / SCALE_X
            longitude = math.degrees(raw_x / factor)
            if longitude < -180.0 or longitude > 180.0:
                current_row.append(0)
                future_row.append(0)
            else:
                current_row.append(raster_index(present, longitude, latitude))
                future_row.append(raster_index(future, longitude, latitude))
        yield current_row, future_row


def row_runs(row: list[int]):
    start = 0
    value = row[0]
    for x in range(1, len(row) + 1):
        if x == len(row) or row[x] != value:
            yield start, x - start, value
            if x < len(row):
                start = x
                value = row[x]


def js_rows(rows: list[list[int]]) -> list[list[int]]:
    return [[item for run in row_runs(row) for item in run] for row in rows]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    present_path = args.source_dir / "Beck_KG_V1_present_0p083.tif"
    future_path = args.source_dir / "Beck_KG_V1_future_0p083.tif"
    present = Image.open(present_path)
    future = Image.open(future_path)
    if present.size != (4320, 2160) or future.size != present.size:
        raise ValueError("Expected matching Beck V1 5-arc-minute rasters at 4320×2160")

    present_rows: list[list[int]] = []
    future_rows: list[list[int]] = []
    for current_row, projected_row in projected_rows(present, future):
        present_rows.append(current_row)
        future_rows.append(projected_row)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    js_payload = {
        "width": WIDTH,
        "height": HEIGHT,
        "present": js_rows(present_rows),
        "future": js_rows(future_rows),
    }
    args.output.write_text(
        "window.CLIMATE_GRID_RLE="
        + json.dumps(js_payload, separators=(",", ":"), ensure_ascii=True)
        + ";\n",
        encoding="utf-8",
    )

    counts = {
        "present": {str(value): sum(row.count(value) for row in present_rows) for value in range(31)},
        "future": {str(value): sum(row.count(value) for row in future_rows) for value in range(31)},
    }
    metadata = {
        "format": "JavaScript row RLE: each row repeats x, length, DN",
        "width": WIDTH,
        "height": HEIGHT,
        "projection": "Natural Earth 1",
        "scale": [SCALE_X, SCALE_Y],
        "translate": [TRANSLATE_X, TRANSLATE_Y],
        "source_resolution": "5 arc minutes (0.083333 degrees)",
        "source_sha256": {
            present_path.name: sha256(present_path),
            future_path.name: sha256(future_path),
        },
        "cell_counts": counts,
    }
    args.output.with_suffix(".meta.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
