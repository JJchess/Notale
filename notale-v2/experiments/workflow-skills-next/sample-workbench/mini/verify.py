#!/usr/bin/env python3
"""Verify promoted mini samples, full-only decisions, and the formal archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen


HERE = Path(__file__).resolve().parent
COLLECTION_ROOT = HERE.parents[1]
REPO = HERE.parents[3]
DEV_METADATA = COLLECTION_ROOT.parent / "workflow-skills-next-dev" / "sample-metadata"
AUTHOR_SUFFIXES = {".html", ".css", ".js", ".mjs"}
MAX_AUTHOR_LINE = 400


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_chars(path: Path) -> int:
    return len(path.read_text(encoding="utf-8"))


def tree_hashes(root: Path) -> dict[str, str]:
    return {
        path.relative_to(root).as_posix(): sha256(path)
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def relocated_metadata_path(path: Path) -> Path | None:
    """Map a former deployable-tree metadata path to the sibling audit archive."""
    try:
        relative = path.resolve(strict=False).relative_to(COLLECTION_ROOT.resolve())
    except ValueError:
        return None
    return DEV_METADATA / relative


def archived_tree_hashes(runtime_root: Path) -> dict[str, str]:
    """Reconstruct the reviewed tree from runtime files plus relocated metadata."""
    hashes = tree_hashes(runtime_root)
    metadata_root = relocated_metadata_path(runtime_root)
    if metadata_root and metadata_root.is_dir():
        for relative, digest in tree_hashes(metadata_root).items():
            if relative in hashes and hashes[relative] != digest:
                raise ValueError(f"runtime/metadata collision: {relative}")
            hashes[relative] = digest
    return hashes


def http_status(url: str) -> int:
    request = Request(url, headers={"User-Agent": "notale-mini-verifier/1"})
    with urlopen(request, timeout=8) as response:
        return response.status


def formal_sample_root(sample: dict, category_roots: dict[str, str]) -> Path:
    category, sample_name = sample["key"].split("/", 1)
    return (HERE / category_roots[category] / sample_name).resolve()


def verify_promoted_sample(
    sample: dict,
    category_roots: dict[str, str],
    base_url: str | None,
    require_cross_audit: bool = False,
) -> tuple[str, list[str], str]:
    key = sample["key"]
    stage = HERE / key
    report_path = stage / "report.json"
    candidate = stage / "candidate" / "pages"
    if not report_path.is_file() or not (candidate / "index.html").is_file():
        return "pending", [], key

    issues = []
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return "fail", [f"invalid report: {error}"], key

    if report.get("key") != key:
        issues.append(f"report key {report.get('key')!r}")
    if report.get("status") != "promoted" or not report.get("promoted"):
        issues.append("report is not promoted")
    if sample.get("status") != "promoted" or not sample.get("mini"):
        issues.append("manifest is not promoted")
    if report.get("full_chars") != sample["full_chars"]:
        issues.append("full_chars differs from manifest")
    if report.get("budget") != 9999:
        issues.append("budget must be 9999")

    records = report.get("author_files")
    if not isinstance(records, list) or not records:
        issues.append("author_files missing")
        records = []
    declared_paths = set()
    actual_total = 0
    for record in records:
        relative = record.get("path") if isinstance(record, dict) else None
        if not isinstance(relative, str) or not relative.startswith("candidate/pages/"):
            issues.append(f"invalid author path: {relative!r}")
            continue
        path = stage / relative
        declared_paths.add(path.resolve())
        if not path.is_file():
            issues.append(f"missing author file: {relative}")
            continue
        try:
            chars = read_chars(path)
        except (OSError, UnicodeDecodeError):
            issues.append(f"unreadable author file: {relative}")
            continue
        actual_total += chars
        if record.get("chars") != chars:
            issues.append(f"char mismatch: {relative}")
        if record.get("sha256") != sha256(path):
            issues.append(f"hash mismatch: {relative}")
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if len(line) > MAX_AUTHOR_LINE:
                issues.append(f"overlong line: {relative}:{number}:{len(line)}")

    reused_paths = set()
    for record in report.get("reused_files", []):
        if not isinstance(record, dict):
            issues.append("invalid reused_files record")
            continue
        relative, source = record.get("path"), record.get("source")
        if not isinstance(relative, str) or not isinstance(source, str):
            issues.append("reused file needs path and source")
            continue
        path = stage / relative
        source_path = REPO / source
        if not source_path.is_file():
            relocated = relocated_metadata_path(source_path)
            if relocated and relocated.is_file():
                source_path = relocated
            else:
                source_path = HERE.parent / source
        reused_paths.add(path.resolve())
        if not path.is_file() or not source_path.is_file():
            issues.append(f"missing reused file/source: {relative}")
            continue
        current_hash = sha256(path)
        if current_hash != sha256(source_path) or record.get("sha256") != current_hash:
            issues.append(f"reused hash mismatch: {relative}")

    runtime_files = {
        path.resolve()
        for path in candidate.rglob("*")
        if path.is_file() and path.suffix.lower() in AUTHOR_SUFFIXES
    }
    unclassified = sorted(runtime_files - declared_paths - reused_paths)
    missing_runtime = sorted(declared_paths - runtime_files)
    if unclassified:
        issues.append("unclassified runtime files: " + ", ".join(path.name for path in unclassified))
    if missing_runtime:
        issues.append("declared files outside runtime inventory")

    if report.get("mini_chars") != actual_total:
        issues.append(f"mini_chars {report.get('mini_chars')} != {actual_total}")
    if actual_total >= 10000:
        issues.append(f"character budget exceeded: {actual_total}")
    if actual_total <= 0:
        issues.append("empty author layer")
    failed_checks = [
        check.get("name", "unnamed")
        for check in report.get("checks", [])
        if not isinstance(check, dict) or check.get("status") != "pass"
    ]
    if failed_checks:
        issues.append("failed checks: " + ", ".join(failed_checks))
    for field in ("retained", "removed"):
        if not isinstance(report.get(field), list) or not report[field]:
            issues.append(f"{field} evidence missing")
    if require_cross_audit:
        audit = report.get("cross_audit")
        if not isinstance(audit, dict) or audit.get("status") != "pass":
            issues.append("passing cross_audit missing")
        elif not audit.get("reviewer") or not audit.get("checks"):
            issues.append("cross_audit reviewer/checks missing")

    archive = (HERE / sample.get("mini", "")).resolve()
    expected_archive = formal_sample_root(sample, category_roots) / "mini" / "pages"
    if archive != expected_archive:
        issues.append("manifest mini path differs from category root")
    if not (archive / "index.html").is_file():
        issues.append("formal mini entry missing")
    elif tree_hashes(candidate) != archived_tree_hashes(archive):
        issues.append("formal mini differs from approved candidate")
    formal = report.get("formal_mini")
    expected_formal_path = archive.relative_to(COLLECTION_ROOT).as_posix()
    expected_audit_source = f"sample-workbench/mini/{key}/candidate/pages"
    if not isinstance(formal, dict) or formal.get("status") != "promoted_after_explicit_user_approval":
        issues.append("formal promotion ledger missing")
    elif (
        not formal.get("formal_matches_candidate")
        or formal.get("promoted_at") != "2026-08-31"
        or formal.get("path") != expected_formal_path
        or formal.get("source") != expected_audit_source
    ):
        issues.append("formal promotion ledger is incomplete")

    if base_url:
        workbench_url = base_url.rstrip("/") + "/sample-workbench/mini/"
        mini_url = urljoin(workbench_url, sample["mini"])
        full_url = urljoin(workbench_url, sample["full"])
        for label, url in (("full", full_url), ("mini", mini_url)):
            try:
                if http_status(url) != 200:
                    issues.append(f"{label} HTTP not 200")
            except Exception as error:
                issues.append(f"{label} HTTP error: {error}")

    return ("fail" if issues else "pass"), issues, key


def verify_full_only(
    sample: dict, category_roots: dict[str, str], base_url: str | None
) -> list[str]:
    issues = []
    key = sample["key"]
    report_path = HERE / key / "report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    disposition = report.get("disposition", {})
    if sample.get("status") != "mini-rejected-after-user-review":
        issues.append("manifest rejection status missing")
    if sample.get("auxiliary_eligible") is not False or sample.get("mini"):
        issues.append("full-only sample must not expose an auxiliary mini")
    if report.get("status") != "rejected_after_user_review" or report.get("promoted") is not False:
        issues.append("report rejection status missing")
    if disposition.get("decision") != "full-only" or disposition.get("eligible_for_model_context") is not False:
        issues.append("report full-only disposition missing")
    archive = formal_sample_root(sample, category_roots) / "mini"
    if archive.exists():
        issues.append("rejected mini exists in formal archive")
    if base_url:
        full_url = urljoin(
            base_url.rstrip("/") + "/sample-workbench/mini/", sample["full"]
        )
        try:
            if http_status(full_url) != 200:
                issues.append("full HTTP not 200")
        except Exception as error:
            issues.append(f"full HTTP error: {error}")
    return issues


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", help="Collection root, for example http://127.0.0.1:41031")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Require cross-audit evidence and the reviewed under-10k exemption ledger",
    )
    args = parser.parse_args()

    manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))
    category_roots = manifest.get("category_roots", {})
    samples = manifest.get("samples", [])
    required = [sample for sample in samples if sample.get("decision") == "required"]
    exempt = [sample for sample in samples if sample.get("decision") == "already-under-10k"]
    full_only = [sample for sample in samples if sample.get("decision") == "full-only"]
    inventory_issues = []
    expected_categories = {
        "cover-composition", "cover-generative", "cover-motion",
        "interaction-general", "page-3d", "page-chart", "page-general",
    }
    if set(category_roots) != expected_categories:
        inventory_issues.append("category_roots differ from the seven supported categories")
    if len(samples) != 23 or len(required) != 19 or len(exempt) != 3 or len(full_only) != 1:
        inventory_issues.append(
            f"inventory={len(samples)} required={len(required)} exempt={len(exempt)} "
            f"full_only={len(full_only)}"
        )
    if any(sample.get("full_chars", 10000) >= 10000 for sample in exempt):
        inventory_issues.append("an exempt full is not below 10k")
    if args.strict:
        try:
            exempt_audit = json.loads((HERE / "exempt-audit.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            inventory_issues.append(f"invalid exempt audit: {error}")
        else:
            audited = {sample.get("key"): sample for sample in exempt_audit.get("samples", [])}
            expected = {sample["key"]: sample for sample in exempt}
            if exempt_audit.get("status") != "pass" or not exempt_audit.get("reviewer"):
                inventory_issues.append("exempt audit is not a reviewed pass")
            if set(audited) != set(expected):
                inventory_issues.append("exempt audit keys differ from manifest")
            for key, sample in expected.items():
                audit = audited.get(key, {})
                if audit.get("chars") != sample["full_chars"]:
                    inventory_issues.append(f"exempt char mismatch: {key}")
                checks = audit.get("checks", [])
                if not checks or any(check.get("status") != "pass" for check in checks):
                    inventory_issues.append(f"exempt checks failed: {key}")

    results = [
        verify_promoted_sample(sample, category_roots, args.base_url, args.strict)
        for sample in required
    ]
    for sample in full_only:
        for issue in verify_full_only(sample, category_roots, args.base_url):
            inventory_issues.append(f"{sample['key']}: {issue}")
    counts = {state: sum(result[0] == state for result in results) for state in ("pass", "fail", "pending")}
    for state, issues, key in results:
        print(f"{state.upper():7} {key}")
        for issue in issues:
            print(f"         - {issue}")
    for issue in inventory_issues:
        print(f"INVENTORY - {issue}")
    print(
        f"SUMMARY promoted=19 pass={counts['pass']} fail={counts['fail']} "
        f"pending={counts['pending']} exempt=3 full_only=1"
    )
    failed = bool(inventory_issues or counts["fail"] or (args.strict and counts["pending"]))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
