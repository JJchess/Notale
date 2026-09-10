#!/usr/bin/env python3
"""Export exact session IDs and descendants, or all sessions from a per-run home."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from capture.common import now, rows, scrub, secrets_from_auth, sha256, write_json


def parent_id(meta):
    source = meta.get("source")
    if isinstance(source, dict):
        sub = source.get("subagent", {})
        if isinstance(sub, dict):
            spawn = sub.get("thread_spawn", sub)
            if isinstance(spawn, dict):
                return spawn.get("parent_thread_id") or spawn.get("parent_session_id")
    return meta.get("parent_thread_id")


def discover(home):
    found = {}
    for folder in ("sessions", "archived_sessions"):
        for path in sorted((Path(home) / folder).rglob("*.jsonl")):
            for _, row, error in rows(path):
                if error:
                    continue
                if row.get("type") == "session_meta":
                    meta = row.get("payload", {})
                    sid = meta.get("id") or meta.get("session_id")
                    if sid:
                        if sid in found and sha256(path) != sha256(found[sid][0]):
                            raise ValueError(f"conflicting files for session {sid}")
                        found[sid] = (path, meta)
                    break
    return found


def collect(home, out, session_id=None, secrets=()):
    home, out = Path(home).resolve(), Path(out).resolve()
    if out == home or home in out.parents:
        raise ValueError("export destination must be outside source Codex home")
    found = discover(home)
    if session_id:
        if session_id not in found:
            raise ValueError("session ID not found: " + session_id)
        selected = {session_id}
        while True:
            children = {sid for sid, (_, meta) in found.items() if parent_id(meta) in selected}
            if children <= selected:
                break
            selected |= children
    else:
        selected = set(found)
    if not selected:
        raise ValueError("no native rollout sessions found (ephemeral/paginated history is not a rollout)")
    session_dir = out / "sessions"
    if session_dir.exists() and any(session_dir.iterdir()):
        raise ValueError("destination already contains sessions; use a new export directory")
    session_dir.mkdir(parents=True, exist_ok=True)
    index = {"schema_version": 1, "exported_at": now(), "source_home": str(home),
             "root_session_id": session_id, "sessions": [], "warnings": [],
             "redaction": "structured keys + known credentials + patterns; not a public-release certification"}
    for sid in sorted(selected):
        path, meta = found[sid]
        # IDs remain metadata; safe hash filenames also handle future non-UUID identifiers.
        import hashlib
        dest = session_dir / (hashlib.sha256(sid.encode()).hexdigest()[:24] + ".jsonl")
        malformed = []
        # Read a finite snapshot. A live export is explicitly marked as such by the caller.
        raw = path.read_bytes()
        with dest.open("w", encoding="utf-8") as f:
            for n, line in enumerate(raw.decode("utf-8", errors="replace").splitlines(), 1):
                try:
                    value = json.loads(line)
                    f.write(json.dumps(scrub(value, secrets), ensure_ascii=False) + "\n")
                except ValueError:
                    malformed.append(n)
                    f.write(scrub(line, secrets) + "\n")
        dest.chmod(0o600)
        index["sessions"].append({"session_id": sid, "parent_session_id": parent_id(meta),
            "forked_from_id": meta.get("forked_from_id"), "source": meta.get("source"),
            "source_path": str(path), "archive_path": str(dest.relative_to(out)),
            "source_sha256": hashlib.sha256(raw).hexdigest(), "archive_sha256": sha256(dest),
            "source_bytes": len(raw), "malformed_lines": malformed,
            "snapshot_ended_with_newline": raw.endswith(b"\n")})
        if malformed:
            index["warnings"].append(f"{sid}: malformed lines {malformed}")
        parent = parent_id(meta)
        if parent and parent not in selected:
            index["warnings"].append(f"{sid}: parent {parent} outside export")
    write_json(out / "sessions.index.json", index, secrets)
    return index


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--home", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument("--session-id")
    group.add_argument("--isolated-home", action="store_true", help="only for a kit-created per-run home")
    args = p.parse_args()
    index = collect(args.home, args.out, args.session_id, secrets_from_auth(args.home / "auth.json"))
    print(f"Exported {len(index['sessions'])} sessions; warnings: {len(index['warnings'])}")


if __name__ == "__main__":
    main()
