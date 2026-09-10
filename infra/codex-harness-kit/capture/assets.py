"""Preserve generated assets outside the work directory; do not guess provenance."""
import shutil
from pathlib import Path
from capture.common import sha256, write_json


def archive_generated_assets(codex_home, out):
    files = []
    source = Path(codex_home) / "generated_images"
    if source.is_dir() and not source.is_symlink():
        for path in sorted(source.rglob("*")):
            if not path.is_file() or path.is_symlink() or any(p.is_symlink() for p in path.parents if p != source.parent):
                continue
            relative = path.relative_to(source)
            dest = Path(out) / "generated-assets" / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, dest)
            files.append({"source_path": str(path), "archive_path": str(dest.relative_to(out)),
                          "sha256": sha256(dest), "bytes": dest.stat().st_size})
    write_json(Path(out) / "generated-assets.index.json", {
        "files": files, "note": "Files from this run's Codex generated_images only; call linkage/HTML adoption requires trace evidence."})
    return files
