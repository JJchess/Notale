#!/usr/bin/env python3
"""Extract only the Falsetto Story records rendered by this sample."""

import csv
from pathlib import Path

SOURCE = Path("/data1/home/zhuyifan/ws2/Notale/refs/falsetto-story/src/assets/data")
OUT = Path(__file__).resolve().parents[1] / "pages" / "data"
YEARS = {1977, 1984, 1988, 2010, 2017, 2019}


def copy_small(name: str) -> None:
    (OUT / name).write_bytes((SOURCE / name).read_bytes())


def extract_songs() -> None:
    with (SOURCE / "songs.csv").open(newline="", encoding="utf-8") as source:
        rows = list(csv.DictReader(source))
    selected = []
    for year in sorted(YEARS):
        selected.extend([row for row in rows if int(row["year"]) == year][:100])
    with (OUT / "songs.csv").open("w", newline="", encoding="utf-8") as target:
        writer = csv.DictWriter(target, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(selected)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    copy_small("avg.csv")
    copy_small("avg_top.csv")
    extract_songs()
