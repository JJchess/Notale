#!/usr/bin/env python3
"""Build the cover's offline vector payload from the upstream Pudding tileset.

The generated file contains projected SVG path data, not screenshots or video
frames. Runtime rendering is handled by native Canvas in `assets/map.js`.

Build dependency (kept outside the shipped page):
    python -m pip install mapbox-vector-tile shapely
"""

from __future__ import annotations

import gzip
import json
import math
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

import mapbox_vector_tile
from shapely import make_valid
from shapely.geometry import box, shape
from shapely.ops import transform, unary_union


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "pages/assets/map-data.js"
TOKEN = (
    "pk.eyJ1IjoiZG9jazQyNDIiLCJhIjoiY2x4dGY4Zzc5MThmMDJrcHhhYnFrOGU2cSJ9."
    "PMuXZiieoVCoJTTVbFYoHw"
)
TILESET = "dock4242.98ahoozo"
LAYER = "present_vector_v12-azczh3"
ZOOM = 0
EXTENT = 4096
WIDTH = 1600
HEIGHT = 900
SCALE = 300.0
CX = WIDTH / 2
CY = HEIGHT / 2

COUNTRIES_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_110m_admin_0_countries.geojson"
)


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "Notale sample builder"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def natural_earth_raw(lon: float, lat: float) -> tuple[float, float]:
    lam = math.radians(lon)
    phi = math.radians(max(-90.0, min(90.0, lat)))
    phi2 = phi * phi
    phi4 = phi2 * phi2
    x = lam * (
        0.8707
        - 0.131979 * phi2
        + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4))
    )
    y = phi * (
        1.007226
        + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4))
    )
    return CX + SCALE * x, CY - SCALE * y


def mercator_to_pixel(x: float, y: float, z: float | None = None):
    lon = x * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1.0 - 2.0 * y))))
    return natural_earth_raw(lon, lat)


def lonlat_to_pixel(x: float, y: float, z: float | None = None):
    return natural_earth_raw(x, y)


def clean_number(value: float) -> str:
    rounded = round(value, 1)
    if rounded == int(rounded):
        return str(int(rounded))
    return f"{rounded:.1f}"


def ring_path(coords) -> str:
    points = list(coords)
    if len(points) < 4:
        return ""
    chunks = [f"M{clean_number(points[0][0])},{clean_number(points[0][1])}"]
    chunks.extend(f"L{clean_number(x)},{clean_number(y)}" for x, y in points[1:-1])
    chunks.append("Z")
    return "".join(chunks)


def geometry_path(geometry) -> str:
    if geometry.is_empty:
        return ""
    if geometry.geom_type == "Polygon":
        return ring_path(geometry.exterior.coords) + "".join(
            ring_path(interior.coords) for interior in geometry.interiors
        )
    if geometry.geom_type in ("MultiPolygon", "GeometryCollection"):
        return "".join(geometry_path(part) for part in geometry.geoms)
    return ""


def climate_geometry():
    by_dn = defaultdict(list)
    count = 1 << ZOOM
    for tile_x in range(count):
        for tile_y in range(count):
            url = (
                f"https://a.tiles.mapbox.com/v4/{TILESET}/{ZOOM}/{tile_x}/{tile_y}."
                f"vector.pbf?access_token={TOKEN}"
            )
            payload = fetch(url)
            if payload[:2] == b"\x1f\x8b":
                payload = gzip.decompress(payload)
            decoded = mapbox_vector_tile.decode(payload)[LAYER]
            extent = decoded.get("extent", EXTENT)
            tile_bounds = box(tile_x / count, tile_y / count, (tile_x + 1) / count, (tile_y + 1) / count)

            def to_global(x, y, z=None):
                return (tile_x + x / extent) / count, (tile_y + (extent - y) / extent) / count

            for feature in decoded["features"]:
                dn = int(feature["properties"].get("DN", 0))
                if dn <= 0:
                    continue
                geometry = make_valid(shape(feature["geometry"]))
                geometry = transform(to_global, geometry).intersection(tile_bounds)
                if not geometry.is_empty:
                    by_dn[dn].append(geometry)

    output = []
    for dn in sorted(by_dn):
        geometry = make_valid(unary_union(by_dn[dn]))
        geometry = geometry.simplify(0.00022, preserve_topology=True)
        geometry = transform(mercator_to_pixel, geometry)
        path = geometry_path(geometry)
        if path:
            output.append([dn, path])
    return output


def country_geometry():
    collection = json.loads(fetch(COUNTRIES_URL))
    geometries = [make_valid(shape(feature["geometry"])) for feature in collection["features"]]
    land = make_valid(unary_union(geometries))
    land = transform(lonlat_to_pixel, land)
    countries = [transform(lonlat_to_pixel, geometry) for geometry in geometries]
    return geometry_path(land), "".join(geometry_path(geometry) for geometry in countries)


def frame_path() -> str:
    points = []
    for lon in range(-180, 181, 2):
        points.append(natural_earth_raw(lon, 90))
    for lat in range(88, -91, -2):
        points.append(natural_earth_raw(180, lat))
    for lon in range(178, -181, -2):
        points.append(natural_earth_raw(lon, -90))
    for lat in range(-88, 91, 2):
        points.append(natural_earth_raw(-180, lat))
    points.append(points[0])
    return ring_path(points)


def main() -> None:
    land, countries = country_geometry()
    payload = {
        "width": WIDTH,
        "height": HEIGHT,
        "frame": frame_path(),
        "land": land,
        "countries": countries,
        "zones": climate_geometry(),
    }
    text = "window.CLIMATE_MAP_DATA=" + json.dumps(payload, separators=(",", ":")) + ";\n"
    OUTPUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUTPUT} ({len(text):,} characters)", file=sys.stderr)


if __name__ == "__main__":
    main()
