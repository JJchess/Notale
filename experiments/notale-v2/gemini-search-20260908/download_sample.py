"""Download one explicitly selected image URL observed in a source-page audit."""
import argparse
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
sys.path.insert(0, str(ROOT))
from core.media import _download_image
from core.redact import redact

ap = argparse.ArgumentParser()
ap.add_argument("audit", type=Path)
ap.add_argument("--match", required=True)
ap.add_argument("--label", required=True)
args = ap.parse_args()
if Path(args.label).name != args.label or args.label in (".", ".."):
    ap.error("invalid label")
rows = json.loads(args.audit.read_text())
selected = [(row, img) for row in rows for img in row.get("images", [])
            if args.match in img.get("src", "")]
if not selected:
    ap.error("image not observed in source-page HTML")
row, img = selected[0]
out = Path(__file__).resolve().parent / "downloads" / args.label
out.mkdir(parents=True, exist_ok=False)
record = {"source_audit": str(args.audit), "source_page": row["final_url"],
          "source_title": row.get("title"), "image_url": img["src"], "observed_attributes": img}
try:
    path, w, h = _download_image(img["src"], out, 0, time.monotonic() + 90)
    record.update(file=path.name, width=w, height=h, bytes=path.stat().st_size)
except Exception as exc:
    record["error"] = f"{type(exc).__name__}: {exc}"
(out / "evidence.json").write_text(redact(json.dumps(record, ensure_ascii=False, indent=2)))
print(redact(json.dumps(record, ensure_ascii=False)))
