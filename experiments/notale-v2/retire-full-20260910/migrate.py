"""One-time, recoverable full retirement. Run only from this repository."""
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3] / 'notale-v2'
WORKFLOWS = ROOT / "workflows"
ARCHIVE = ROOT / "legacy/full-samples"


def hashes(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(root.rglob("*")) if p.is_file()}


def main():
    if ARCHIVE.exists():
        raise SystemExit("Archive already exists; do not rerun the migration.")
    catalogs = [(p, json.loads(p.read_text()))
                for p in sorted(WORKFLOWS.glob("build-*/samples/catalog.json"))]
    records = []
    for p, catalog in catalogs:
        wf = p.parent.parent
        for row in catalog["samples"]:
            full = wf / row["full"]["root"]
            mini = row.get("mini", row.get("one"))
            runtime = wf / mini["root"]
            full.relative_to(WORKFLOWS)
            assert full.is_dir() and runtime.is_dir()
            assert not any(f.is_symlink() for f in full.rglob("*"))
            assert full == runtime or full not in runtime.parents
            records.append({"workflow": wf.name, "id": row["id"],
                            "full_root": str(full.relative_to(WORKFLOWS)),
                            "mini_root": str(runtime.relative_to(WORKFLOWS)),
                            "full_files": hashes(full), "mini_files": hashes(runtime),
                            "selected": list(mini["files"])})
    ARCHIVE.mkdir(parents=True)
    (ARCHIVE / "migration.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
    for p, catalog in catalogs:
        wf = p.parent.parent
        archived = json.loads(json.dumps(catalog))
        for row in archived["samples"]:
            row.pop("mini", None)
            row.pop("one", None)
        ap = ARCHIVE / "workflows" / p.relative_to(WORKFLOWS)
        ap.parent.mkdir(parents=True, exist_ok=True)
        ap.write_text(json.dumps(archived, ensure_ascii=False, indent=2) + "\n")
        for row in catalog["samples"]:
            full = wf / row["full"]["root"]
            mini = row.get("mini", row.get("one"))
            destination = ARCHIVE / "workflows" / full.relative_to(WORKFLOWS)
            destination.parent.mkdir(parents=True, exist_ok=True)
            full.rename(destination)
            if mini["root"] == row["full"]["root"]:
                if wf.name == "build-code":
                    # Only the one retained author layer belongs to the live workflow.
                    shutil.copytree(destination / "edit-distance", full / "edit-distance")
                else:
                    shutil.copytree(destination, full)
            # Keep origin/license notices with both independent copies.
            parent = destination.parent
            for notice in full.parent.glob("*"):
                if notice.is_file() and notice.suffix.lower() in {".md", ".txt"}:
                    shutil.copy2(notice, parent / notice.name)
            bundle = wf / f"samples/bundles/{row['category']}/{row['id']}.full.md"
            target = ARCHIVE / "workflows" / bundle.relative_to(WORKFLOWS)
            target.parent.mkdir(parents=True, exist_ok=True)
            bundle.rename(target)
            del row["full"]
        p.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    for name in ("index.html", "mini.html"):
        shutil.copy2(WORKFLOWS / name, ARCHIVE / "workflows" / name)
    for r in records:
        assert hashes(ARCHIVE / "workflows" / r["full_root"]) == r["full_files"], r["id"]
        current = hashes(WORKFLOWS / r["mini_root"])
        for f in r["selected"]:
            assert current[f] == r["mini_files"][f], (r["id"], f)
        if r["workflow"] != "build-code":
            assert current == r["mini_files"], r["id"]
    print(f"Archived {len(records)} full sources/bundles; live mini source bytes unchanged.")


if __name__ == "__main__":
    main()
