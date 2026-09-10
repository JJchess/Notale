#!/usr/bin/env python3
"""Reduce the pinned Pudding cuts table to fields used by the sample."""

import csv
import json
from collections import Counter
from pathlib import Path


HERE = Path(__file__).resolve()
NOTALE_V2 = next(path for path in HERE.parents if path.name == "notale-v2")
SOURCE = NOTALE_V2.parent / "refs/censorship/src/data/cuts.csv"
OUT = HERE.parents[1] / "pages/data.js"
SUMMARY = HERE.parents[1] / "verification/data-summary.json"
TYPES = [
    "sex",
    "non-heteronormative-relationship",
    "disrespect",
    "illegal-actions",
    "religion",
    "unhealthy-addiction",
    "miscellaneous",
]


def seconds(value: str) -> int:
    minutes, remainder = map(int, value.split(":"))
    return minutes * 60 + remainder


with SOURCE.open(encoding="utf-8", newline="") as handle:
    raw = list(csv.DictReader(handle))

records = []
for row in raw:
    start, stop = seconds(row["cut_start"]), seconds(row["cut_stop"])
    assert stop - start == int(row["cut_seconds"])
    records.append([int(row["index"]) - 1, start, stop, TYPES.index(row["type"])])

counts = Counter(row[3] for row in records)
summary = {
    "records": len(records),
    "editedEpisodes": len({row[0] for row in records}),
    "totalSeconds": sum(row[2] - row[1] for row in records),
    "maxStopSeconds": max(row[2] for row in records),
    "typeCounts": {TYPES[key]: value for key, value in sorted(counts.items())},
}
assert summary == {
    "records": 206,
    "editedEpisodes": 77,
    "totalSeconds": 3700,
    "maxStopSeconds": 1251,
    "typeCounts": {
        "sex": 139,
        "non-heteronormative-relationship": 22,
        "disrespect": 20,
        "illegal-actions": 12,
        "religion": 3,
        "unhealthy-addiction": 2,
        "miscellaneous": 8,
    },
}

OUT.parent.mkdir(parents=True, exist_ok=True)
SUMMARY.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("window.CUTS=" + json.dumps(records, separators=(",", ":")) + ";\n")
SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(summary, ensure_ascii=False))
