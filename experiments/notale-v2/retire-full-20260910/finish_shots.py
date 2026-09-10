"""Assemble the already captured mini states; no extra browser run."""
import json
from pathlib import Path
from PIL import Image
from core.sample_shots import _sheet

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
count = 0
for catalog in (ROOT / "workflows").glob("build-*/samples/catalog.json"):
    for row in json.loads(catalog.read_text())["samples"]:
        if "mini" not in row:
            continue
        sample = catalog.parent / row["category"] / row["id"]
        pngs = sorted((sample / "shots").glob("*.png"))
        states = row.get("shots") or [{"label": "初态"}]
        assert len(pngs) == len(states), row["id"]
        for p in pngs:
            with Image.open(p) as image:
                if image.size == (800, 450):
                    continue
                small = image.resize((800, 450), Image.Resampling.LANCZOS)
            small.save(p)
        _sheet(pngs, [s["label"] for s in states], sample / "shots.png")
        count += 1
print(f"Built {count} live mini contact sheets from verified mini states.")
