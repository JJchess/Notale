"""Freeze JPEG inputs for the 40 authored style slides and 10 contact sheets.

Run after build-previews.py. The cache is keyed by the PNG bytes read by
StyleCatalog; writing the manifest last prevents partial cache selection.
"""

from hashlib import sha256
import json
from pathlib import Path

from PIL import Image

STYLE = Path(__file__).resolve().parent
RESOURCES = STYLE.parents[1]
OUTPUT = RESOURCES / "style-images"
MANIFEST = RESOURCES / "style-images.json"


def digest(data):
    return sha256(data).hexdigest()


def main():
    ids = [
        line.split("|")[1].strip()
        for line in (STYLE / "INDEX.md").read_text().splitlines()
        if line.startswith("| ") and line[2:4].isdigit()
    ]
    if len(ids) != 40:
        raise ValueError("expected 40 style IDs")
    sources = [(STYLE / "shots" / f"{key}.png", (900, 1600)) for key in ids]
    sources += [(STYLE / "contact-sheets" / f"{number:02d}.png", (1600,)) for number in range(1, 11)]
    OUTPUT.mkdir(exist_ok=True)
    old = set(OUTPUT.glob("*.jpg"))
    entries = {}
    current = set()
    for source, widths in sources:
        raw = source.read_bytes()
        source_hash = digest(raw)
        for width in widths:
            with Image.open(source) as image:
                thumb = image.convert("RGB")
                thumb.thumbnail((width, width * 10), Image.Resampling.LANCZOS)
                import io

                buffer = io.BytesIO()
                thumb.save(buffer, "JPEG", quality=86, optimize=True)
                output = buffer.getvalue()
                dimensions = thumb.size
            image_hash = digest(output)
            filename = OUTPUT / f"{image_hash}.jpg"
            if not filename.exists() or filename.read_bytes() != output:
                filename.write_bytes(output)
            current.add(filename)
            entries[f"{source_hash}:{width}"] = {
                "path": f"style-images/{filename.name}",
                "sha256": image_hash,
                "width": dimensions[0],
                "height": dimensions[1],
            }
    temporary = MANIFEST.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(MANIFEST)
    for obsolete in old - current:
        obsolete.unlink()
    print(f"{len(entries)} cache keys, {len(current)} JPEGs, {len(old - current)} old JPEGs removed")


if __name__ == "__main__":
    main()
