#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "pages/assets/data"
SCALE_X = 300.2534121448773
SCALE_Y = 300.82036333324055


def clean(value: str) -> str:
    return " ".join(value.split())


def natural_earth(longitude: float, latitude: float):
    lam = math.radians(longitude)
    phi = math.radians(latitude)
    phi2 = phi * phi
    phi4 = phi2 * phi2
    x = lam * (
        0.8707
        - 0.131979 * phi2
        + phi4 * phi4 * phi4 * (-0.013791 + phi2 * (0.003971 * phi2 - 0.001529 * phi4))
    )
    y = phi * (
        1.007226
        + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4))
    )
    return 792.1181901144718 + SCALE_X * x, 450.0005585915445 - SCALE_Y * y


def main():
    screen = json.loads((DATA / "cities-screen.json").read_text())
    features = json.loads((DATA / "final_cities_v2.geojson").read_text())["features"]
    metadata = json.loads((DATA / "climate-grid.meta.json").read_text())
    assert len(screen) == len(features) == 70

    screen_by_name = {clean(row["name"]): row for row in screen}
    feature_by_name = {clean(feature["properties"]["name"]): feature for feature in features}
    assert screen_by_name.keys() == feature_by_name.keys()

    errors = []
    for name, row in screen_by_name.items():
        feature = feature_by_name[name]
        props = feature["properties"]
        for key in ("clim_2023", "clim_2070"):
            assert row[key] == props[key]
        for key in ("type_2023_simp", "type_2070_simp"):
            assert clean(row[key]) == clean(props[key])
        for key in ("temp_2023", "temp_2070"):
            assert abs(float(row[key]) - float(props[key])) < 1e-9
        projected = natural_earth(*feature["geometry"]["coordinates"])
        errors.append((projected[0] - row["x"], projected[1] - row["y"]))

    rms_x = math.sqrt(sum(x * x for x, _ in errors) / len(errors))
    rms_y = math.sqrt(sum(y * y for _, y in errors) / len(errors))
    max_error = max(math.hypot(x, y) for x, y in errors)
    assert rms_x < 0.7 and rms_y < 0.01 and max_error < 2.2

    result = {
        "cities": len(screen),
        "subclass_changes": sum(row["clim_2023"] != row["clim_2070"] for row in screen),
        "major_changes": sum(row["type_2023_simp"] != row["type_2070_simp"] for row in screen),
        "cold_present": sum(row["type_2023_simp"] == "Cold" for row in screen),
        "cold_future": sum(row["type_2070_simp"] == "Cold" for row in screen),
        "present_classes": sum(int(metadata["cell_counts"]["present"][str(value)]) > 0 for value in range(1, 31)),
        "projection_rms_px": [round(rms_x, 4), round(rms_y, 4)],
        "projection_max_px": round(max_error, 4),
        "geojson_sha256": hashlib.sha256((DATA / "final_cities_v2.geojson").read_bytes()).hexdigest(),
    }
    assert result["subclass_changes"] == 45
    assert result["major_changes"] == 31
    assert [result["cold_present"], result["cold_future"]] == [16, 1]
    assert result["present_classes"] == 30
    assert result["geojson_sha256"] == "193e0f371907f5e869cf88735982458b553a46018e5b25da70a7de80d3e95b59"
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
