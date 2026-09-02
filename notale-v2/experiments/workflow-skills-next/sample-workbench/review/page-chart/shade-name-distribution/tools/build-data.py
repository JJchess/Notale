#!/usr/bin/env python3
"""Build the browser dataset from The Pudding's MIT allCategories.csv."""

import argparse
import csv
import hashlib
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("/data1/home/zhuyifan/ws2/Notale/refs/pudding-data/foundation-names/allCategories.csv"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).parents[1] / "pages/data/shades.js",
    )
    args = parser.parse_args()

    raw = args.source.read_bytes()
    with args.source.open(encoding="utf-8-sig", newline="") as handle:
        records = list(csv.DictReader(handle))
    if len(records) != 5307:
        raise SystemExit(f"expected 5307 records, found {len(records)}")

    brands = sorted({row["brand"] for row in records}, key=str.casefold)
    products = sorted({row["product"] for row in records}, key=str.casefold)
    categories = sorted(
        {
            category.strip()
            for row in records
            for category in row["categories"].split(",")
            if category.strip() and category.strip() != "NA"
        }
    )
    brand_index = {value: index for index, value in enumerate(brands)}
    product_index = {value: index for index, value in enumerate(products)}
    category_index = {value: index for index, value in enumerate(categories)}

    rows = []
    for row in records:
        mask = 0
        for category in row["categories"].split(","):
            category = category.strip()
            if category and category != "NA":
                mask |= 1 << category_index[category]
        rows.append(
            [
                brand_index[row["brand"]],
                product_index[row["product"]],
                row["name"],
                row["specific"] if row["specific"] != "NA" else "",
                row["hex"].lstrip("#").upper(),
                round(float(row["lightness"]) * 1_000_000),
                mask,
            ]
        )

    payload = {
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "brands": brands,
        "products": products,
        "categories": categories,
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "window.SHADE_DATA=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {len(rows)} records to {args.output}")
    print(f"source sha256 {payload['sourceSha256']}")


if __name__ == "__main__":
    main()
