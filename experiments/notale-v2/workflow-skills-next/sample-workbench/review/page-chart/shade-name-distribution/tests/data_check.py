#!/usr/bin/env python3
"""Verify that the compact browser payload is a lossless selected-field transform."""

import argparse
import csv
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).parents[1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("/data1/home/zhuyifan/ws2/Notale/refs/pudding-data/foundation-names/allCategories.csv"),
    )
    args = parser.parse_args()

    script = (ROOT / "pages/data/shades.js").read_text(encoding="utf-8")
    assert script.startswith("window.SHADE_DATA=") and script.endswith(";\n")
    payload = json.loads(script[len("window.SHADE_DATA=") : -2])
    source_bytes = args.source.read_bytes()
    assert payload["sourceSha256"] == hashlib.sha256(source_bytes).hexdigest()

    with args.source.open(encoding="utf-8-sig", newline="") as handle:
        source = list(csv.DictReader(handle))
    assert len(source) == len(payload["rows"]) == 5307
    assert len(payload["brands"]) == 93
    assert len(payload["categories"]) == 17

    category_index = {value: index for index, value in enumerate(payload["categories"])}
    for original, compact in zip(source, payload["rows"], strict=True):
        brand, product, name, specific, color, lightness, mask = compact
        assert payload["brands"][brand] == original["brand"]
        assert payload["products"][product] == original["product"]
        assert name == original["name"]
        assert specific == ("" if original["specific"] == "NA" else original["specific"])
        assert color == original["hex"].lstrip("#").upper()
        assert abs(lightness / 1_000_000 - float(original["lightness"])) <= 0.0000005
        expected_mask = 0
        for category in original["categories"].split(","):
            category = category.strip()
            if category and category != "NA":
                expected_mask |= 1 << category_index[category]
        assert mask == expected_mask

    lightness = [row[5] / 1_000_000 for row in payload["rows"]]
    assert min(lightness) == 0.154902
    assert max(lightness) == 0.996078
    assert sum(value >= 0.5 for value in lightness) == 4104
    assert "http://" not in script and "https://" not in script

    print(
        json.dumps(
            {
                "records": len(source),
                "brands": len(payload["brands"]),
                "categories": len(payload["categories"]),
                "above_50_percent_lightness": 4104,
                "source_sha256": payload["sourceSha256"],
                "selected_fields_lossless": True,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
