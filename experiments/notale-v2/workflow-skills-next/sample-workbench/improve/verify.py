#!/usr/bin/env python3
"""Audit the 23 formal page samples and their staged full-version candidates."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import Request, urlopen


HERE = Path(__file__).resolve().parent
COLLECTION_ROOT = HERE.parents[1]
EXPECTED_COUNT = 23
MINI_MANIFEST = HERE.parent / "mini/manifest.json"


def discover_inventory(manifest: dict) -> dict[str, Path]:
    inventory = {}
    for sample in manifest.get("samples", []):
        entry = (MINI_MANIFEST.parent / sample["full"] / "index.html").resolve()
        if entry.is_file():
            inventory[sample["key"]] = entry
    return inventory


def formal_sample_root(sample: dict, category_roots: dict[str, str]) -> Path:
    category, sample_name = sample["key"].split("/", 1)
    return (MINI_MANIFEST.parent / category_roots[category] / sample_name).resolve()


def read_review_entries() -> tuple[dict[str, tuple[str, str]], list[str]]:
    source = (HERE / "index.html").read_text(encoding="utf-8")
    block = re.search(r"const\s+samples\s*=\s*\[(.*?)\];", source, re.S)
    errors = []
    if not block:
        return {}, ["review index has no const samples array"]
    rows = re.findall(r"\['([^']+)','([^']+)','([^']+)'\]", block.group(1))
    if len(rows) != EXPECTED_COUNT:
        errors.append(f"review row count is {len(rows)}, expected {EXPECTED_COUNT}")
    entries = {}
    for sample_id, key, baseline in rows:
        if key in entries:
            errors.append(f"duplicate review entry: {key}")
        entries[key] = (sample_id, baseline)
    return entries, errors


def get_number(value, path):
    for key in path:
        if not isinstance(value, dict) or key not in value:
            return None
        value = value[key]
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def extract_chars(report: dict, side: str):
    aliases = ("before", "baseline") if side == "before" else ("after", "candidate")
    # A few samples were promoted before this staging audit. Prefer their
    # explicit current-formal ledger over retained historical measurements.
    if side == "before":
        paths = [
            ("formal_current", "total_chars"),
            ("cross_audit", "formal_at_audit_start", "chars"),
            ("cross_audit", "formal", "chars"),
            ("author_layer", "formal_current_chars"),
        ]
    else:
        paths = [
            ("cross_audit", "candidate", "chars"),
            ("author_layer", "candidate_chars"),
        ]
    for alias in aliases:
        paths.extend((
            ("chars", alias),
            ("size", f"{alias}_chars"),
            ("historical_improvement", f"{alias}_chars"),
            ("author_layer", f"{alias}_chars"),
            ("author_layer", alias, "chars"),
            ("author_layer", alias, "total_chars"),
            (f"{alias}_chars",),
        ))
    for path in paths:
        value = get_number(report, path)
        if value is not None:
            return int(value)

    files = report.get("author_files")
    if not isinstance(files, list) or not files:
        return None
    values = []
    for file in files:
        value = None
        for alias in aliases:
            for path in ((f"{alias}_chars",), (alias, "chars"), (alias, "total_chars")):
                value = get_number(file, path)
                if value is not None:
                    break
            if value is not None:
                break
        if value is None:
            return None
        values.append(value)
    return int(sum(values))


def author_records(report: dict, side: str):
    """Return current author-file ledger records for one side of a report."""
    aliases = ("before", "baseline") if side == "before" else ("after", "candidate")
    layer = report.get("author_layer") if isinstance(report.get("author_layer"), dict) else {}

    def from_detail(path, detail):
        if not isinstance(path, str) or not isinstance(detail, dict):
            return None
        chars = get_number(detail, ("chars",))
        sha256 = detail.get("sha256") if isinstance(detail.get("sha256"), str) else None
        return path, int(chars) if chars is not None else None, sha256

    def from_node(node):
        if not isinstance(node, dict):
            return []
        files = node.get("files")
        if isinstance(files, list):
            return [record for item in files
                    if isinstance(item, dict)
                    for record in [from_detail(item.get("path"), item)] if record]
        if isinstance(files, dict):
            return [record for path, detail in files.items()
                    for record in [from_detail(path, detail)] if record]
        return [record for path, detail in node.items() if "/" in path
                for record in [from_detail(path, detail)] if record]

    if side == "before":
        records = from_node(report.get("formal_current"))
        if records:
            return records

    current_files = layer.get("formal_current_files" if side == "before" else "candidate_files")
    records = from_node({"files": current_files})
    if records:
        return records

    for alias in aliases:
        records = from_node(layer.get(alias))
        if records:
            return records

    files = report.get("author_files")
    if not isinstance(files, list):
        files = layer.get("files")
    records = []
    if isinstance(files, list):
        for item in files:
            if not isinstance(item, dict) or not isinstance(item.get("path"), str):
                continue
            chars = sha256 = None
            for alias in aliases:
                direct_chars = get_number(item, (f"{alias}_chars",))
                direct_hash = item.get(f"{alias}_sha256")
                detail = item.get(alias)
                if direct_chars is not None or isinstance(direct_hash, str):
                    chars = int(direct_chars) if direct_chars is not None else None
                    sha256 = direct_hash if isinstance(direct_hash, str) else None
                    break
                if isinstance(detail, dict):
                    nested = from_detail(item["path"], detail)
                    chars, sha256 = nested[1], nested[2]
                    break
            records.append((item["path"], chars, sha256))
        if records:
            return records

    included = layer.get("included")
    if isinstance(included, list):
        return [(path, None, None) for path in included
                if isinstance(path, str) and "/" in path and " " not in path]
    return []


def resolve_author_file(
    stage: Path, formal_root: Path, path: str, side: str
) -> Path:
    relative = Path(path.removeprefix("candidate/"))
    if side == "before":
        return formal_root / relative
    candidate = stage / "candidate" / relative
    # Formal Lenna source lives under output/pages; staging deliberately
    # flattens that author layer to candidate/pages for the review server.
    if not candidate.exists() and relative.parts[:1] == ("output",):
        candidate = stage / "candidate" / Path(*relative.parts[1:])
    return candidate


def validate_author_files(
    stage: Path, formal_root: Path, report: dict, side: str
):
    records = author_records(report, side)
    if not records:
        return None, [f"missing-{side}-author-file-ledger"]
    issues, total = [], 0
    for relative, declared_chars, declared_hash in records:
        path = resolve_author_file(stage, formal_root, relative, side)
        if not path.is_file():
            if declared_chars == 0:
                continue
            issues.append(f"missing-{side}-author-file:{relative}")
            continue
        try:
            payload = path.read_bytes()
            actual_chars = len(payload.decode("utf-8"))
        except (OSError, UnicodeDecodeError):
            issues.append(f"unreadable-{side}-author-file:{relative}")
            continue
        total += actual_chars
        if declared_chars is not None and declared_chars != actual_chars:
            issues.append(f"{side}-file-chars:{relative}:{declared_chars}!={actual_chars}")
        if declared_hash is not None:
            actual_hash = hashlib.sha256(payload).hexdigest()
            if declared_hash != actual_hash:
                issues.append(f"{side}-file-hash:{relative}")
    return total, issues


def broken_links(*roots: Path):
    broken = []
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.is_symlink() and not path.exists():
                broken.append(str(path.relative_to(COLLECTION_ROOT)))
    return sorted(broken)


def check_url(url_timeout):
    url, timeout = url_timeout
    try:
        with urlopen(Request(url, headers={"User-Agent": "workflow-sample-audit"}), timeout=timeout) as response:
            response.read(256)
            return url, str(response.status) if 200 <= response.status < 400 else f"HTTP-{response.status}"
    except Exception as error:  # URL errors differ by server and Python version.
        return url, f"ERR-{type(error).__name__}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", help="Optionally GET all 23 baseline and 23 candidate URLs")
    parser.add_argument("--timeout", type=float, default=5.0)
    args = parser.parse_args()

    review, global_errors = read_review_entries()
    try:
        mini_manifest = json.loads(MINI_MANIFEST.read_text(encoding="utf-8"))
        auxiliary = {sample["key"]: sample for sample in mini_manifest["samples"]}
        category_roots = mini_manifest["category_roots"]
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as error:
        mini_manifest = {}
        auxiliary = {}
        category_roots = {}
        global_errors.append(f"invalid mini manifest: {error}")
    inventory = discover_inventory(mini_manifest)
    formal_roots = {
        key: formal_sample_root(sample, category_roots)
        for key, sample in auxiliary.items()
    } if category_roots else {}
    inventory_keys, review_keys = set(inventory), set(review)
    if len(inventory) != EXPECTED_COUNT:
        global_errors.append(f"formal inventory count is {len(inventory)}, expected {EXPECTED_COUNT}")
    for key in sorted(inventory_keys - review_keys):
        global_errors.append(f"review index missing: {key}")
    for key in sorted(review_keys - inventory_keys):
        global_errors.append(f"review index extra: {key}")
    if set(auxiliary) != inventory_keys:
        global_errors.append("mini manifest keys differ from formal inventory")

    http_results = {}
    if args.base_url:
        base = args.base_url.rstrip("/")
        urls = []
        for key, entry in sorted(inventory.items()):
            formal_route = entry.relative_to(COLLECTION_ROOT).parent.as_posix() + "/"
            urls.extend((
                f"{base}/{formal_route}",
                f"{base}/sample-workbench/improve/{key}/candidate/pages/",
            ))
        with ThreadPoolExecutor(max_workers=8) as pool:
            http_results = dict(pool.map(check_url, ((url, args.timeout) for url in urls)))

    rows = []
    for key, entry in sorted(inventory.items()):
        stage = HERE / key
        issues = []
        baseline = stage / "baseline"
        candidate_entry = stage / "candidate/pages/index.html"
        report_path = stage / "report.json"
        if not baseline.is_dir():
            issues.append("missing-baseline")
        if not candidate_entry.is_file():
            issues.append("missing-candidate-entry")
        if not report_path.is_file():
            issues.append("missing-report")

        report = None
        if report_path.is_file():
            try:
                report = json.loads(report_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                issues.append("invalid-report-json")
        before = extract_chars(report, "before") if report else None
        after = extract_chars(report, "after") if report else None
        if before is None or after is None:
            issues.append("missing-char-ledger")
        if report:
            actual_before, author_issues = validate_author_files(
                stage, formal_roots[key], report, "before"
            )
            issues.extend(author_issues)
            actual_after, author_issues = validate_author_files(
                stage, formal_roots[key], report, "after"
            )
            issues.extend(author_issues)
            if before is not None and actual_before is not None and before != actual_before:
                issues.append(f"before-total:{before}!={actual_before}")
            if after is not None and actual_after is not None and after != actual_after:
                issues.append(f"after-total:{after}!={actual_after}")

        auxiliary_entry = auxiliary.get(key, {})
        decision = auxiliary_entry.get("decision")
        if decision == "required" and auxiliary_entry.get("status") == "promoted":
            auxiliary_state = "promoted-mini"
        elif decision == "already-under-10k" and auxiliary_entry.get("status") == "active-full-as-auxiliary":
            auxiliary_state = "full-direct"
        elif decision == "full-only" and auxiliary_entry.get("auxiliary_eligible") is False:
            auxiliary_state = "full-only"
        else:
            auxiliary_state = "invalid"
            issues.append("invalid-auxiliary-ledger")

        review_entry = review.get(key)
        expected_baseline = "../../" + entry.relative_to(COLLECTION_ROOT).parent.as_posix() + "/"
        if review_entry:
            sample_id, baseline_route = review_entry
            if sample_id != key.rsplit("/", 1)[-1]:
                issues.append("review-id-mismatch")
            if baseline_route != expected_baseline:
                issues.append("review-baseline-mismatch")

        links = broken_links(formal_roots[key], stage)
        if links:
            issues.append("broken-symlink:" + ",".join(links))

        http = "SKIP"
        if args.base_url:
            base = args.base_url.rstrip("/")
            formal_url = f"{base}/{entry.relative_to(COLLECTION_ROOT).parent.as_posix()}/"
            candidate_url = f"{base}/sample-workbench/improve/{key}/candidate/pages/"
            statuses = (http_results.get(formal_url, "MISSING"), http_results.get(candidate_url, "MISSING"))
            http = "/".join(statuses)
            if any(not status.isdigit() for status in statuses):
                issues.append("http-failure")

        rows.append((key, before, after, auxiliary_state, "sample-workbench/mini/manifest.json", http, issues))

    print("sample\tbefore_chars\tafter_chars\tdelta_chars\tauxiliary\tauxiliary_source\thttp\tstatus\tissues")
    for key, before, after, auxiliary_state, source, http, issues in rows:
        delta = after - before if before is not None and after is not None else None
        values = (key, before, after, delta, auxiliary_state, source, http, "FAIL" if issues else "PASS", "|".join(issues) or "-")
        print("\t".join("-" if value is None else str(value) for value in values))
    for error in sorted(global_errors):
        print(f"ERROR\t{error}")

    failures = len(global_errors) + sum(bool(row[-1]) for row in rows)
    promoted = sum(row[3] == "promoted-mini" for row in rows)
    direct = sum(row[3] == "full-direct" for row in rows)
    full_only = sum(row[3] == "full-only" for row in rows)
    http_state = "checked" if args.base_url else "skipped"
    print(
        f"SUMMARY\tinventory={len(inventory)}\tpass={len(rows)-sum(bool(row[-1]) for row in rows)}"
        f"\tfailures={failures}\tpromoted_mini={promoted}\tfull_direct={direct}"
        f"\tfull_only={full_only}\thttp={http_state}"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
