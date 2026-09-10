"""Preflight the maze archive; apply only the exact reviewed, qualified source."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from core.sample_bundles import _REF, omitted_lines

BASE = ROOT / "experiments/mini-size-budget"
SAMPLE = "state-maze-stories"
LIMIT = 15429


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--verified-source", help="SHA-256 of the candidate reviewed for fidelity")
    args = parser.parse_args()
    source = BASE / "combined" / SAMPLE
    html = (source / "index.html").read_text()
    sha = digest(source / "index.html")
    catalog_path = ROOT / "workflows/build-interaction/samples/catalog.json"
    catalog = read(catalog_path)
    row = next(r for r in catalog["samples"] if r["id"] == SAMPLE)
    destination = catalog_path.parent.parent / row["mini"]["root"]
    metadata = read(BASE / "maze/build.json")
    if metadata["chars"] != len(html):
        raise ValueError("Build metadata does not describe the current source")

    # Copy only reviewed data/art/font resources, never packed preview code.
    resources = {}
    for item in read(BASE / "maze/short-asset-equivalence.json"):
        path = ROOT / item["target"]
        relative = path.relative_to(source)
        if digest(path) != item["sha256"]:
            raise ValueError(f"Asset changed since build: {relative}")
        resources[relative] = path
    data = read(source / "assets/mini-data.json")
    for relative in ["assets/mini-data.json", "assets/AbortionMazeBook_ThePudding.pdf",
                     *(font[1][4:-1] if font[1].startswith("url(") and font[1].endswith(")") else font[1] for font in data["fonts"])]:
        path = source / relative
        if not path.is_file():
            raise ValueError(f"Missing resource: {relative}")
        resources[Path(relative)] = path

    notes = {
        "b.jpg": "Original activity-book cover image.",
        "d.json": "Original narrative/policy data, maze coordinates and paths, image and font manifests, and text bindings. No author layout or interaction code. Descriptive data is retained in assets/mini-data.json; original fonts and the activity-book PDF are copied alongside it.",
    }
    refs = {r.removeprefix("./") for r in _REF.findall(html)}
    omitted = {}
    for ref in sorted(refs):
        if ref.startswith(("http:", "https:", "data:", "//")):
            continue
        if ref in notes:
            omitted[ref] = notes[ref]
        elif re.fullmatch(r"'\+\w+\+'", ref) or re.fullmatch(r"\+\w+\+' alt class=", ref):
            omitted[ref] = "Inline image-helper parameter. Original icon and keyboard SVG assets are included in the resource manifest; the helper code remains inline."
        else:
            raise ValueError(f"Review the new literal dependency before archiving: {ref}")
    spec = {"root": row["mini"]["root"], "chars": len(html),
            "files": ["index.html"], "omitted": omitted}
    declarations = omitted_lines(SAMPLE, spec, html)

    baseline = read(BASE / "baseline.json")
    by_id = {r["id"]: r for r in baseline}
    full_hashes = {p: h for r in baseline for p, h in r["full_hashes"].items()}
    for path, expected in full_hashes.items():
        if digest(ROOT / path) != expected:
            raise ValueError(f"Original full-version source changed: {path}")
    installed_path = BASE / "installed.json"
    installed = read(installed_path)
    for item in installed:
        if item["id"] == SAMPLE:
            continue
        path = ROOT / by_id[item["id"]]["root"] / "index.html"
        if digest(path) != item["sha256"] or len(path.read_text()) != item["chars"]:
            raise ValueError(f"Installed mini differs from its record: {item['id']}")

    report = {"sample": SAMPLE, "chars": len(html), "limit": LIMIT,
              "overBy": max(0, len(html) - LIMIT), "sourceSha256": sha,
              "resources": len(resources), "unchangedFullSources": len(full_hashes),
              "verifiedInstalledMinis": len([i for i in installed if i["id"] != SAMPLE]),
              "dependencyDeclarations": declarations,
              "eligibleBySize": len(html) <= LIMIT, "applied": False}
    if not args.apply:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return
    if len(html) > LIMIT:
        raise ValueError(f"Candidate exceeds the limit by {len(html) - LIMIT} chars")
    if args.verified_source != sha:
        raise ValueError("The reviewed source hash must match the current candidate")

    # Every preflight finishes before changing the stable entry or catalog.
    for relative, path in resources.items():
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    notes_path = destination / "SAMPLE.md"
    previous_notes = notes_path.read_text() if notes_path.exists() else ""
    marker = "## 合一 mini 归档"
    previous_notes = previous_notes.split(marker)[0].rstrip()
    notes_path.write_text(previous_notes + "\n\n" + marker + "\n\n"
                         + f"index.html 包含全部 HTML、CSS 与交互代码，共 {len(html):,} chars。"
                         + "页面按 1600×900 展示；原始数据、字体、插画及 PDF 保留在资源目录。\n")
    (destination / "index.html").write_text(html)
    row["mini"] = spec
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    installed = [i for i in installed if i["id"] != SAMPLE]
    installed.append({"id": SAMPLE, **metadata, "sha256": sha})
    installed_path.write_text(json.dumps(installed, ensure_ascii=False, indent=2) + "\n")
    report["applied"] = True
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
