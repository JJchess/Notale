#!/usr/bin/env python3
"""Planner-shaped native Codex evaluation harness for the three workflow skills."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from functools import lru_cache
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

import yaml


HERE = Path(__file__).resolve().parent
V2 = HERE.parents[1]
# Exercise the promoted production packages. Research workbenches remain under experiments,
# but future comparisons must not silently test a duplicate skill tree.
SKILLS_ROOT = V2 / "skills"
CHASSIS = V2 / "vendor" / "chassis"
FIXTURES = HERE / "fixtures"
CASES_FILE = HERE / "cases.yaml"
RUNS = HERE / ".runs"
BRIEF = V2 / "prompts" / "brief.md"
ARMS = ("baseline", "reference", "full")
LABEL_SKILLS = {"标题页": "build-cover", "内容页": "build-page", "交互页": "build-interaction"}
MODEL = "gpt-5.6-sol"
EFFORT = "low"
SERVICE_TIER = "fast"
DEFAULT_REPEATS = 2
DEFAULT_JOBS = 3
DEFAULT_TIMEOUT = 3600
RUN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
PRELOADED_NAMES = ("CHASSIS.md", "theme.css", "pages.md")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def json_write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temp, path)


def json_read(path: Path, default=None):
    if not path.is_file():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tree_hash(path: Path, ignore: tuple[str, ...] = ()) -> str:
    digest = hashlib.sha256()
    for item in sorted(path.rglob("*")):
        rel = item.relative_to(path)
        if any(part in ignore for part in rel.parts):
            continue
        if item.is_symlink():
            digest.update(str(rel).encode())
            digest.update(os.readlink(item).encode())
        elif item.is_file():
            digest.update(str(rel).encode())
            digest.update(item.read_bytes())
    return digest.hexdigest()


def config() -> dict:
    data = yaml.safe_load(CASES_FILE.read_text(encoding="utf-8")) or {}
    if not isinstance(data.get("cases"), list):
        raise ValueError("cases.yaml must contain a cases list")
    return data


def cases() -> list[dict]:
    return config()["cases"]


def case_map() -> dict[str, dict]:
    return {row["id"]: row for row in cases()}


def arms_for(case: dict) -> tuple[str, ...]:
    return tuple(case.get("arms") or ARMS)


def select_cases(args: argparse.Namespace, *, smoke: bool = False) -> list[dict]:
    rows = cases()
    ids = {row["id"] for row in rows}
    if smoke:
        wanted = config().get("smoke_cases") or []
        return [case_map()[cid] for cid in wanted]
    if getattr(args, "all", False):
        return rows
    wanted_cases = set(getattr(args, "case", None) or [])
    wanted_skills = set(getattr(args, "skill", None) or [])
    if not wanted_cases and not wanted_skills:
        raise ValueError("select --all, --case, or --skill")
    unknown = wanted_cases - ids
    if unknown:
        raise ValueError("unknown cases: " + ", ".join(sorted(unknown)))
    unknown_skills = wanted_skills - set(LABEL_SKILLS.values())
    if unknown_skills:
        raise ValueError("unknown skills: " + ", ".join(sorted(unknown_skills)))
    return [row for row in rows if row["id"] in wanted_cases or row["skill"] in wanted_skills]


def skill_root(name: str) -> Path:
    root = SKILLS_ROOT / name
    if not (root / "SKILL.md").is_file():
        raise FileNotFoundError(root / "SKILL.md")
    return root


@lru_cache(maxsize=3)
def skill_context_hash(name: str) -> str:
    root = skill_root(name)
    digest = hashlib.sha256()
    catalog = json_read(root / "samples" / "catalog.json", {"samples": []})
    paths = [root / "SKILL.md", *(sorted((root / "references").glob("*.md"))), root / "samples" / "catalog.json"]
    for row in catalog.get("samples", []):
        for variant in ("full", "mini"):
            spec = row.get(variant)
            if spec:
                paths.extend(root / spec["root"] / rel for rel in spec.get("files", []))
    for path in paths:
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def reference_projection(source: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=False)
    text = (source / "SKILL.md").read_text(encoding="utf-8")
    start = text.find("## Load working context")
    end_marker = "<!-- SAMPLE_LAYER_END -->"
    end = text.find(end_marker)
    if start < 0 or end < 0 or end < start:
        raise ValueError(f"{source}/SKILL.md lacks sample projection markers")
    tail = text[end + len(end_marker):].lstrip()
    projected = (
        text[:start]
        + "## Load working context\n\n"
        + "Before modifying the page, call `workflow-context --reference <category>` exactly once. "
        + "It returns the complete selected reference. No sample material is available; do not open "
        + "`references/` directly, browse for examples, or load another reference.\n\n"
        + tail
    )
    (destination / "SKILL.md").write_text(projected, encoding="utf-8")
    shutil.copytree(source / "references", destination / "references")
    if (source / "agents").is_dir():
        shutil.copytree(source / "agents", destination / "agents")


def planner_input(deck: str) -> dict:
    return json_read(FIXTURES / deck / "planner-input.json")


def page_spec(root: Path, pid: str) -> str:
    return (root / "pages" / "plan" / f"p{pid.removeprefix('page-')}.md").read_text(encoding="utf-8").strip()


def skeleton(number: int, total: int = 16) -> str:
    return f"""<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="assets/theme.css">
</head>
<body data-page="{number:02d}" data-total="{total}">
  <div id="stage"></div>
  <script src="assets/base.js"></script>
</body>
</html>
"""


def shared_preload(root: Path, total: int) -> str:
    sys.path.insert(0, str(V2)) if str(V2) not in sys.path else None
    from core.builder import shared_preload as builder_shared_preload

    text, _ = builder_shared_preload(root, total)
    return text


def agent_instructions(root: Path, total: int) -> str:
    sys.path.insert(0, str(V2)) if str(V2) not in sys.path else None
    from core.builder import IDENTITY

    adapter = """<native_codex_adapter>
This isolated run uses native Codex tools while preserving the Builder task contract.
- Treat the first complete apply_patch of the target skeleton as Builder Write; afterward make focused incremental patches.
- Treat `workflow-check <target> --shot --shot-dir .codex-shots` as Builder Check and repair every reported failure. Never invoke `pages/assets/selfcheck.py` directly; Chromium is owned by the host-side check broker in this isolated run.
- For an interaction, at least one check must include one or more `--after '<JavaScript that reaches a rule-relevant state>'` arguments. Repair the rendered report for every checked state.
- The planner label routes deterministically: [标题页] to build-cover, [内容页] to build-page, [交互页] to build-interaction.
- When that routed project skill is installed, load it before any page mutation. After it chooses one reference and any samples, call `workflow-context` exactly once with those choices; its output is the Builder Read payload.
- When no routed project skill is installed, continue without workflow material. Do not search for or substitute another design skill.
- The chassis, tech contract, theme interface, deck map, and page spec are already preloaded. Do not read their source files again.
- Do not read or apply any anti-AI/slop skill. It is intentionally outside this experiment.
- Do not read other page HTML files, planner inputs, harness files, run metadata, or context logs. Modify only the requested page HTML; do not change assets or create another deliverable.
</native_codex_adapter>"""
    return "# Notale single-page Builder\n\n" + IDENTITY + "\n\n" + adapter + "\n\n" + shared_preload(root, total)


def brief_for(root: Path, case: dict, total: int = 16) -> str:
    query = planner_input(case["deck"])["query"]
    base = BRIEF.read_text(encoding="utf-8").format(
        query=query,
        pid=case["pid"],
        total=total,
    )
    return base.rstrip() + "\n\n<page_spec>\n" + page_spec(root, case["pid"]) + "\n</page_spec>\n"


def init_repo(root: Path) -> None:
    proc = subprocess.run(["git", "init", "-q", str(root)], text=True, capture_output=True, timeout=30)
    if proc.returncode:
        raise RuntimeError(proc.stderr.strip() or "git init failed")


def prepare_arm(case: dict, arm: str, root: Path) -> dict:
    marker = root.parent.parent / "meta" / f"{arm}.prepared.json"
    existing = json_read(marker)
    if existing:
        return existing
    if root.exists() and any(root.iterdir()):
        raise FileExistsError(f"refusing to overwrite non-prepared arm: {root}")
    root.mkdir(parents=True, exist_ok=True)
    fixture = FIXTURES / case["deck"]
    shutil.copytree(fixture / "pages" / "plan", root / "pages" / "plan")
    shutil.copytree(CHASSIS, root / "pages" / "assets")
    shutil.copy2(fixture / "pages" / "assets" / "theme.css", root / "pages" / "assets" / "theme.css")
    for number in range(1, 17):
        (root / "pages" / f"page-{number:02d}.html").write_text(skeleton(number), encoding="utf-8")
    (root / "AGENTS.md").write_text(agent_instructions(root, 16), encoding="utf-8")

    installed = None
    if arm == "full":
        source = skill_root(case["skill"]).resolve()
        installed = root / ".agents" / "skills" / case["skill"]
        installed.parent.mkdir(parents=True, exist_ok=True)
        installed.symlink_to(os.path.relpath(source, installed.parent), target_is_directory=True)
    elif arm == "reference":
        installed = root / ".agents" / "skills" / case["skill"]
        installed.parent.mkdir(parents=True, exist_ok=True)
        reference_projection(skill_root(case["skill"]), installed)
    elif arm != "baseline":
        raise ValueError(f"unknown arm: {arm}")

    init_repo(root)
    target = root / "pages" / f"{case['pid']}.html"
    data = {
        "case": case["id"],
        "deck": case["deck"],
        "pid": case["pid"],
        "arm": arm,
        "skill": case["skill"],
        "reference": case["reference"],
        "base_payload_hash": tree_hash(root, ignore=(".agents", ".git", ".codex-lab", ".codex-shots")),
        "assets_hash": tree_hash(root / "pages" / "assets"),
        "other_pages": {
            path.name: sha256_file(path)
            for path in sorted((root / "pages").glob("page-*.html"))
            if path != target
        },
        "prompt_hash": sha256_text(brief_for(root, case)),
        "skill_path": str(installed) if installed else None,
        "skill_hash": skill_context_hash(case["skill"]) if installed else None,
        "created_at": now(),
    }
    json_write(marker, data)
    return data


def run_root(run_id: str) -> Path:
    if not RUN_ID.fullmatch(run_id):
        raise ValueError("run id must contain only letters, numbers, '.', '_' or '-'")
    return RUNS / run_id


def prepare_run(run_id: str, selected: list[dict], repeats: int) -> Path:
    root = run_root(run_id)
    root.mkdir(parents=True, exist_ok=True)
    manifest_path = root / "run.json"
    existing = json_read(manifest_path)
    chosen = [row["id"] for row in selected]
    if existing and (existing.get("cases") != chosen or existing.get("repeats") != repeats):
        raise ValueError(f"run {run_id} already exists with a different selection")
    payload_groups = []
    for repeat in range(1, repeats + 1):
        for case in selected:
            pair = root / f"repeat-{repeat:02d}" / case["id"]
            prepared = [prepare_arm(case, arm, pair / "arms" / arm) for arm in arms_for(case)]
            hashes = {item["base_payload_hash"] for item in prepared}
            if len(hashes) != 1:
                raise AssertionError(f"{case['id']} repeat {repeat}: non-treatment payload differs by arm")
            payload_groups.append(next(iter(hashes)))
    manifest = existing or {
        "run_id": run_id,
        "status": "prepared",
        "model": MODEL,
        "reasoning_effort": EFFORT,
        "service_tier": SERVICE_TIER,
        "cases": chosen,
        "repeats": repeats,
        "arms": sum(len(arms_for(row)) for row in selected) * repeats,
        "created_at": now(),
        "results": [],
    }
    manifest["payload_groups"] = payload_groups
    json_write(manifest_path, manifest)
    make_review(root, selected, repeats)
    return root


def auth_source() -> Path:
    configured = os.environ.get("CODEX_HOME")
    return (Path(configured) if configured else Path.home() / ".codex") / "auth.json"


def temporary_codex_home() -> Path:
    source = auth_source()
    if not source.is_file():
        raise FileNotFoundError(f"Codex auth file missing: {source}")
    root = Path(tempfile.mkdtemp(prefix="codex-workflow-next-"))
    os.chmod(root, 0o700)
    shutil.copy2(source, root / "auth.json")
    os.chmod(root / "auth.json", 0o600)
    return root


def codex_command(root: Path, output: Path, prompt: str) -> list[str]:
    return [
        "codex", "exec", "--ephemeral", "--ignore-user-config", "--strict-config",
        "--model", MODEL,
        "--config", f'model_reasoning_effort="{EFFORT}"',
        "--config", f'service_tier="{SERVICE_TIER}"',
        "--config", 'approval_policy="never"',
        "--config", "sandbox_workspace_write.network_access=false",
        "--config", 'shell_environment_policy.inherit="all"',
        "--config", 'shell_environment_policy.exclude=["CODEX_HOME"]',
        "--config", "agents.enabled=false",
        "--sandbox", "workspace-write", "--json", "--output-last-message", str(output),
        "--cd", str(root), prompt,
    ]


def child_environment(home: Path, arm_root: Path, case: dict, arm: str) -> dict[str, str]:
    env = dict(os.environ)
    secret = re.compile(r"(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)", re.I)
    for key in list(env):
        if secret.search(key) and key != "PARATERA_API_KEY":
            env.pop(key, None)
    env["CODEX_HOME"] = str(home)
    env["PATH"] = str(HERE) + os.pathsep + env.get("PATH", "")
    env["WORKFLOW_CONTEXT_LOG"] = str(arm_root / ".codex-lab" / "context-reads.jsonl")
    env["WORKFLOW_CHECK_DIR"] = str(arm_root / ".codex-lab" / "check")
    env["WORKFLOW_CHECK_TIMEOUT"] = "300"
    if arm != "baseline":
        env["WORKFLOW_SKILL_ROOT"] = str(arm_root / ".agents" / "skills" / case["skill"])
        env["WORKFLOW_CONTEXT_MODE"] = arm
    else:
        env.pop("WORKFLOW_SKILL_ROOT", None)
        env.pop("WORKFLOW_CONTEXT_MODE", None)
    return env


def parse_trace(path: Path) -> dict:
    commands = []
    usage = {}
    events = 0
    if path.is_file():
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            events += 1
            item = event.get("item") if isinstance(event, dict) and event.get("type") == "item.completed" else None
            if isinstance(item, dict):
                command = item.get("command") or item.get("cmd")
                if isinstance(command, str):
                    commands.append(command)
                elif isinstance(command, list):
                    commands.append(" ".join(str(part) for part in command))
            for candidate in (event.get("usage"), (event.get("response") or {}).get("usage") if isinstance(event.get("response"), dict) else None):
                if isinstance(candidate, dict):
                    usage = candidate
    return {"events": events, "commands": commands, "usage": usage}


def context_records(root: Path) -> list[dict]:
    path = root / ".codex-lab" / "context-reads.jsonl"
    rows = []
    if path.is_file():
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                rows.append({"invalid": line})
    return rows


def builder_check_records(root: Path) -> list[dict]:
    path = root / ".codex-lab" / "builder-checks.jsonl"
    rows = []
    if path.is_file():
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                rows.append({"invalid": line})
    return rows


def selfcheck_payload_issues(payload: object) -> list[str]:
    issues = []
    if not isinstance(payload, list):
        return ["selfcheck JSON is not a page list"]
    for page in payload:
        page_name = page.get("page", "unknown") if isinstance(page, dict) else "unknown"
        states = page.get("states", []) if isinstance(page, dict) else []
        if not states:
            issues.append(f"{page_name}: no rendered states")
        for index, state in enumerate(states):
            if not isinstance(state, dict):
                issues.append(f"{page_name} state {index}: invalid record")
                continue
            prefix = f"{page_name} state {index}"
            if state.get("js_error"):
                issues.append(f"{prefix}: after-script failed")
            for error in state.get("errors") or []:
                issues.append(f"{prefix}: {error}")
            for failure in state.get("failed") or []:
                issues.append(f"{prefix}: resource {failure}")
            probe = state.get("probe") if isinstance(state.get("probe"), dict) else state
            if probe.get("fatal"):
                issues.append(f"{prefix}: {probe['fatal']}")
            for escaped in probe.get("escaped") or []:
                issues.append(f"{prefix}: escaped {escaped.get('el', 'element')}")
            for clipped in probe.get("clipped") or []:
                element = clipped.get("el", "element")
                # The chassis intentionally implements visually-hidden accessibility
                # copy as a 1px clipped box. It is not visible layout overflow.
                if "sr-only" in element:
                    continue
                issues.append(f"{prefix}: clipped {element}")
    return issues


def reported_check_issues(stdout: str, json_mode: bool) -> list[str]:
    if json_mode:
        try:
            return selfcheck_payload_issues(json.loads(stdout))
        except json.JSONDecodeError as error:
            return [f"invalid selfcheck JSON: {error}"]
    issues = []
    for line in stdout.splitlines():
        stripped = line.strip()
        if stripped.startswith("✗") and "sr-only" not in stripped:
            issues.append(stripped)
        elif stripped.startswith("打不开:"):
            issues.append(stripped)
    return issues


def service_check_request(root: Path, case: dict, request_path: Path) -> dict:
    check_root = root / ".codex-lab" / "check"
    response_path = check_root / "responses" / request_path.name
    try:
        request = json.loads(request_path.read_text(encoding="utf-8"))
        expected_page = f"pages/{case['pid']}.html"
        if request.get("page") != expected_page:
            raise ValueError(f"only {expected_page} may be checked")
        after = request.get("after") or []
        if not isinstance(after, list) or len(after) > 8 or any(not isinstance(js, str) or len(js) > 5000 for js in after):
            raise ValueError("--after accepts at most eight JavaScript snippets of 5000 chars")
        wait = request.get("wait", 1200)
        zoom = request.get("zoom", 2)
        if not isinstance(wait, int) or not 0 <= wait <= 5000:
            raise ValueError("--wait must be 0..5000")
        if not isinstance(zoom, int) or not 1 <= zoom <= 4:
            raise ValueError("--zoom must be 1..4")
        shot_dir = Path(request.get("shot_dir") or ".codex-shots")
        if shot_dir.is_absolute() or ".." in shot_dir.parts or not shot_dir.parts or shot_dir.parts[0] != ".codex-shots":
            raise ValueError("--shot-dir must stay under .codex-shots")
        crop = request.get("crop")
        if crop is not None and not re.fullmatch(r"-?\d+,-?\d+,\d+,\d+", str(crop)):
            raise ValueError("--crop must be X,Y,W,H")
        json_mode = bool(request.get("json"))
        command = [
            sys.executable,
            "pages/assets/selfcheck.py",
            expected_page,
            "--wait",
            str(wait),
            "--zoom",
            str(zoom),
        ]
        if request.get("shot"):
            command.extend(("--shot", "--shot-dir", str(shot_dir)))
        if crop:
            command.extend(("--crop", str(crop)))
        for js in after:
            command.extend(("--after", js))
        if json_mode:
            command.append("--json")
        proc = subprocess.run(command, cwd=root, text=True, capture_output=True, timeout=240)
        issues = reported_check_issues(proc.stdout, json_mode)
        response = {"returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}
        record = {
            "at": now(),
            "request_id": request.get("id"),
            "page": expected_page,
            "after_count": len(after),
            "json": json_mode,
            "returncode": proc.returncode,
            "reported_issues": issues,
        }
    except (OSError, ValueError, json.JSONDecodeError, subprocess.TimeoutExpired) as error:
        response = {"returncode": 2, "stdout": "", "stderr": f"workflow-check: {error}\n"}
        record = {
            "at": now(),
            "request_id": request_path.stem,
            "page": None,
            "after_count": 0,
            "json": False,
            "returncode": 2,
            "reported_issues": [str(error)],
        }
    json_write(response_path, response)
    log = root / ".codex-lab" / "builder-checks.jsonl"
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def check_broker(root: Path, case: dict, stop: threading.Event, failures: list[str]) -> None:
    requests = root / ".codex-lab" / "check" / "requests"
    responses = root / ".codex-lab" / "check" / "responses"
    requests.mkdir(parents=True, exist_ok=True)
    responses.mkdir(parents=True, exist_ok=True)
    processed = set()
    try:
        while True:
            pending = [path for path in sorted(requests.glob("*.json")) if path.name not in processed]
            for path in pending:
                service_check_request(root, case, path)
                processed.add(path.name)
            if stop.is_set() and not pending:
                break
            stop.wait(0.1)
    except Exception as error:  # Keep broker failures visible in the arm audit.
        failures.append(repr(error))


def audit_arm(case: dict, arm: str, root: Path, prepared: dict, trace: dict, selfcheck: dict | None) -> dict:
    errors = []
    warnings = []
    target = root / "pages" / f"{case['pid']}.html"
    if not target.is_file():
        errors.append("target page missing")
        source = ""
    else:
        source = target.read_text(encoding="utf-8", errors="replace")
        if len(source) < 1000:
            errors.append(f"target page too small: {len(source)} chars")
        if 'id="stage"' not in source and "id='stage'" not in source:
            errors.append("#stage missing")
        number = case["pid"].removeprefix("page-")
        if not re.search(rf'data-page=["\']{number}["\']', source):
            errors.append("data-page changed or missing")
        if not re.search(r'data-total=["\']16["\']', source):
            errors.append("data-total changed or missing")
        if re.search(r'(?:src|href)=["\']https?://', source, re.I):
            errors.append("external runtime resource found")
        if case.get("interactive") and not re.search(r"addEventListener|on(?:click|input|change|pointer|keydown)|<button|<input", source, re.I):
            warnings.append("no obvious learner input path found by static heuristic")

    if tree_hash(root / "pages" / "assets") != prepared["assets_hash"]:
        errors.append("pages/assets changed")
    for name, expected in prepared["other_pages"].items():
        path = root / "pages" / name
        if not path.is_file() or sha256_file(path) != expected:
            errors.append(f"non-target page changed: {name}")

    records = context_records(root)
    if arm == "baseline":
        if records:
            errors.append("baseline loaded workflow context")
    else:
        if len(records) != 1:
            errors.append(f"expected one workflow-context read, found {len(records)}")
        else:
            record = records[0]
            if record.get("skill") != case["skill"] or record.get("reference") != case["reference"]:
                errors.append("wrong skill or reference selected")
            samples = record.get("samples") or []
            if arm == "reference" and samples:
                errors.append("reference arm loaded samples")
            if arm == "full" and not samples:
                errors.append("full arm did not load a main sample")
            if record.get("aux_chars", 0) > 30_000 or record.get("bundle_chars", 0) > 110_000:
                errors.append("context character budget exceeded")

    joined_commands = "\n".join(trace.get("commands") or [])
    redundant = [name for name in PRELOADED_NAMES if re.search(rf"(?:cat|sed|rg|grep|head|tail|less|more)[^\n]*{re.escape(name)}", joined_commands)]
    p_name = "p" + case["pid"].removeprefix("page-") + ".md"
    if re.search(rf"(?:cat|sed|rg|grep|head|tail|less|more)[^\n]*{re.escape(p_name)}", joined_commands):
        redundant.append(p_name)
    if redundant:
        errors.append("re-read preloaded files: " + ", ".join(redundant))
    direct_workflow_reads = []
    for command in trace.get("commands") or []:
        if not re.search(r"(?:^|[;&|]\s*|\s)(?:cat|sed|rg|grep|head|tail|less|more|awk)(?:\s|$)", command):
            continue
        if re.search(r"(?:\.agents/skills|/skills/).*(?:/references/|/samples/|catalog\.json)", command):
            direct_workflow_reads.append(command)
    if direct_workflow_reads:
        errors.append(f"bypassed workflow-context for {len(direct_workflow_reads)} direct reference/sample read(s)")
    if any("pages/assets/selfcheck.py" in command for command in trace.get("commands") or []):
        errors.append("bypassed workflow-check with direct selfcheck invocation")

    checks = builder_check_records(root)
    if not checks:
        errors.append("Builder Check was not called")
    else:
        last_check = checks[-1]
        if last_check.get("returncode") != 0:
            errors.append("last Builder Check did not complete")
        if last_check.get("reported_issues"):
            errors.append("last Builder Check still reports rendered issues")
        if case.get("interactive") and not any(
            check.get("returncode") == 0 and check.get("after_count", 0) > 0 for check in checks
        ):
            errors.append("interaction was not checked in a changed state")

    if selfcheck:
        if selfcheck.get("returncode") != 0:
            errors.append("harness selfcheck failed")
        if selfcheck.get("issues"):
            errors.append("harness selfcheck found rendered issues")

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "target_chars": len(source),
        "context": records,
        "trace_events": trace.get("events", 0),
        "usage": trace.get("usage") or {},
        "builder_checks": checks,
        "selfcheck": selfcheck,
    }


def run_selfcheck(root: Path, case: dict) -> dict:
    command = [
        sys.executable,
        "pages/assets/selfcheck.py",
        f"pages/{case['pid']}.html",
        "--shot",
        "--shot-dir",
        ".codex-shots/harness",
        "--json",
    ]
    proc = subprocess.run(command, cwd=root, text=True, capture_output=True, timeout=240)
    try:
        payload = json.loads(proc.stdout) if proc.stdout else None
        issues = selfcheck_payload_issues(payload) if payload is not None else ["empty selfcheck output"]
    except json.JSONDecodeError as error:
        payload = None
        issues = [f"invalid selfcheck JSON: {error}"]
    return {
        "command": command,
        "returncode": proc.returncode,
        "issues": issues,
        "payload": payload,
        "stderr": proc.stderr[-4000:],
    }


def execute_arm(run: Path, repeat: int, case: dict, arm: str, timeout: int) -> dict:
    pair = run / f"repeat-{repeat:02d}" / case["id"]
    root = pair / "arms" / arm
    meta = pair / "meta"
    result_path = meta / f"{arm}.result.json"
    existing = json_read(result_path)
    if existing and existing.get("status") == "complete":
        return existing
    prepared = json_read(meta / f"{arm}.prepared.json")
    trace_path = meta / f"{arm}.trace.jsonl"
    last_path = meta / f"{arm}.last.txt"
    home = temporary_codex_home()
    broker_stop = threading.Event()
    broker_failures: list[str] = []
    broker_thread = threading.Thread(
        target=check_broker,
        args=(root, case, broker_stop, broker_failures),
        name=f"check-{case['id']}-{arm}",
        daemon=True,
    )
    broker_thread.start()
    started = time.monotonic()
    try:
        prompt = brief_for(root, case)
        command = codex_command(root, last_path, prompt)
        proc = subprocess.run(
            command,
            env=child_environment(home, root, case, arm),
            text=True,
            capture_output=True,
            timeout=timeout,
        )
        broker_stop.set()
        broker_thread.join(timeout=10)
        trace_path.write_text(proc.stdout, encoding="utf-8")
        (meta / f"{arm}.stderr.txt").write_text(proc.stderr, encoding="utf-8")
        trace = parse_trace(trace_path)
        target = root / "pages" / f"{case['pid']}.html"
        selfcheck = run_selfcheck(root, case) if target.is_file() and target.stat().st_size > 1000 else None
        audit = audit_arm(case, arm, root, prepared, trace, selfcheck)
        if broker_failures or broker_thread.is_alive():
            audit["errors"].append("Builder Check broker failed or did not stop")
            audit["ok"] = False
        status = "complete" if proc.returncode == 0 and audit["ok"] else "failed"
        result = {
            "case": case["id"],
            "repeat": repeat,
            "arm": arm,
            "status": status,
            "codex_returncode": proc.returncode,
            "seconds": round(time.monotonic() - started, 2),
            "audit": audit,
            "completed_at": now(),
        }
    except subprocess.TimeoutExpired as error:
        result = {
            "case": case["id"], "repeat": repeat, "arm": arm, "status": "timeout",
            "seconds": round(time.monotonic() - started, 2), "error": str(error), "completed_at": now(),
        }
    finally:
        broker_stop.set()
        broker_thread.join(timeout=10)
        shutil.rmtree(home)
    json_write(result_path, result)
    return result


def execute_run(run_id: str, selected: list[dict], repeats: int, jobs: int, timeout: int, arms: tuple[str, ...] | None = None) -> list[dict]:
    root = prepare_run(run_id, selected, repeats)
    work = []
    for repeat in range(1, repeats + 1):
        for case in selected:
            for arm in arms_for(case):
                if arms is None or arm in arms:
                    work.append((repeat, case, arm))
    results = []
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        pending = {
            pool.submit(execute_arm, root, repeat, case, arm, timeout): (repeat, case["id"], arm)
            for repeat, case, arm in work
        }
        for future in as_completed(pending):
            repeat, case_id, arm = pending[future]
            try:
                result = future.result()
            except Exception as error:
                result = {"case": case_id, "repeat": repeat, "arm": arm, "status": "harness-error", "error": repr(error)}
            results.append(result)
            print(f"{result['status'].upper():12} repeat-{repeat:02d} {case_id} {arm}")
    manifest = json_read(root / "run.json")
    manifest["results"] = sorted(results, key=lambda item: (item["repeat"], item["case"], item["arm"]))
    manifest["status"] = "complete" if all(item["status"] == "complete" for item in results) else "needs-review"
    manifest["completed_at"] = now()
    json_write(root / "run.json", manifest)
    make_review(root, selected, repeats)
    return results


def make_review(root: Path, selected: list[dict], repeats: int) -> None:
    rng = random.Random(int(hashlib.sha256(root.name.encode()).hexdigest()[:16], 16))
    key = {}
    sections = []
    for repeat in range(1, repeats + 1):
        for case in selected:
            arms = list(arms_for(case))
            rng.shuffle(arms)
            aliases = {chr(65 + index): arm for index, arm in enumerate(arms)}
            key[f"repeat-{repeat:02d}/{case['id']}"] = aliases
            frames = []
            for alias, arm in aliases.items():
                rel = f"../repeat-{repeat:02d}/{case['id']}/arms/{arm}/pages/{case['pid']}.html"
                frames.append(
                    f'<article><h3>{alias}</h3><iframe src="{html.escape(rel)}" loading="lazy"></iframe></article>'
                )
            sections.append(
                f'<section><h2>repeat-{repeat:02d} · {html.escape(case["id"])}</h2>'
                + '<p>分别检查视觉吸引力、构图层级、学习真实性、内容正确性、动效/交互质量与 accept/revise。</p>'
                + '<div class="arms">' + "".join(frames) + "</div></section>"
            )
    json_write(root / "comparison-key.json", key)
    review = root / "review"
    review.mkdir(exist_ok=True)
    page = """<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>Blind review</title><style>
body{margin:0;background:#17191d;color:#eee;font:15px/1.45 system-ui;padding:24px}h1{margin:0 0 8px}h2{margin:40px 0 4px}.arms{display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:18px}article{min-width:0}h3{margin:0 0 6px}iframe{width:100%;aspect-ratio:16/9;border:1px solid #4b5058;background:white}p{color:#aeb5c0}
</style></head><body><h1>Workflow skills blind review</h1><p>页面只显示随机别名；真实实验臂保存在 comparison-key.json。</p>""" + "".join(sections) + "</body></html>"
    (review / "index.html").write_text(page, encoding="utf-8")


def validate_catalog(skill: str) -> list[str]:
    errors = []
    root = skill_root(skill)
    skill_chars = len((root / "SKILL.md").read_text(encoding="utf-8"))
    if skill_chars > 12_000:
        errors.append(f"{skill}: SKILL.md {skill_chars} > 12000 chars")
    path = root / "samples" / "catalog.json"
    try:
        catalog = json_read(path)
    except json.JSONDecodeError as error:
        return [f"{path}: {error}"]
    seen = set()
    for row in catalog.get("samples", []):
        sid = row.get("id")
        if sid in seen:
            errors.append(f"{skill}: duplicate sample {sid}")
        seen.add(sid)
        for variant in ("full", "mini"):
            spec = row.get(variant)
            if not spec:
                continue
            total = 0
            base = root / spec["root"]
            for rel in spec.get("files", []):
                file = base / rel
                if not file.is_file():
                    errors.append(f"{skill}/{sid}: missing {variant} file {rel}")
                    continue
                total += len(file.read_text(encoding="utf-8"))
            if total != spec.get("chars"):
                errors.append(f"{skill}/{sid}: {variant} chars declared {spec.get('chars')} actual {total}")
            if variant == "mini" and total >= 10_000:
                errors.append(f"{skill}/{sid}: mini is not below 10000 chars")
        if row.get("aux") and not row.get("mini") and row.get("full", {}).get("chars", 10_000) >= 10_000:
            errors.append(f"{skill}/{sid}: auxiliary has no compact variant")
    skill_text = (root / "SKILL.md").read_text(encoding="utf-8")
    start = skill_text.find("<!-- SAMPLE_LAYER_START -->")
    end = skill_text.find("<!-- SAMPLE_LAYER_END -->")
    if start < 0 or end < start:
        errors.append(f"{skill}: sample catalog markers missing")
    else:
        listed = set(re.findall(r"(?m)^- `([^`]+)`\s+—", skill_text[start:end]))
        if listed != seen:
            errors.append(
                f"{skill}: SKILL sample descriptions differ from catalog ids "
                f"(missing={sorted(seen - listed)}, extra={sorted(listed - seen)})"
            )
    return errors


def validate() -> dict:
    errors = []
    warnings = []
    rows = cases()
    ids = set()
    for case in rows:
        cid = case.get("id")
        if not cid or cid in ids:
            errors.append(f"duplicate or empty case id: {cid!r}")
        ids.add(cid)
        expected_skill = LABEL_SKILLS.get(case.get("label"))
        if case.get("skill") != expected_skill:
            errors.append(f"{cid}: label routes to {expected_skill}, not {case.get('skill')}")
        if any(arm not in ARMS for arm in arms_for(case)):
            errors.append(f"{cid}: unknown arm")
        fixture = FIXTURES / case.get("deck", "")
        spec = fixture / "pages" / "plan" / f"p{case.get('pid', '').removeprefix('page-')}.md"
        if not spec.is_file():
            errors.append(f"{cid}: page spec missing")
        else:
            first = spec.read_text(encoding="utf-8").splitlines()[0]
            if first != f"# {case['pid']} [{case['label']}]":
                errors.append(f"{cid}: page spec label mismatch")
        if not (skill_root(case["skill"]) / "references" / f"{case['reference']}.md").is_file():
            errors.append(f"{cid}: reference missing")
    expected = {("build-cover", "composition"), ("build-cover", "motion"), ("build-cover", "generative"), ("build-page", "general"), ("build-page", "chart"), ("build-page", "3d"), ("build-interaction", "general"), ("build-interaction", "3d"), ("build-interaction", "code")}
    actual = {(row["skill"], row["reference"]) for row in rows}
    if actual != expected:
        errors.append("case matrix does not cover the nine reference categories exactly once")
    for skill in LABEL_SKILLS.values():
        errors.extend(validate_catalog(skill))
    if (SKILLS_ROOT / "build-interaction" / "references" / "code-samples.md").exists():
        errors.append("obsolete references/code-samples.md still exists")
    if not auth_source().is_file():
        warnings.append(f"Codex auth file not found at {auth_source()}; prepare works but run will fail")
    planned = sum(len(arms_for(row)) for row in rows) * DEFAULT_REPEATS
    return {"ok": not errors, "skills": 3, "fixtures": len({row['deck'] for row in rows}), "cases": len(rows), "planned_runs": planned, "errors": errors, "warnings": warnings}


def serve(run_id: str, port: int) -> None:
    root = run_root(run_id)
    if not root.is_dir():
        raise FileNotFoundError(root)
    handler = lambda *args, **kwargs: SimpleHTTPRequestHandler(*args, directory=str(root), **kwargs)
    server = ThreadingHTTPServer(("0.0.0.0", port), handler)
    print(f"review: http://127.0.0.1:{port}/review/")
    server.serve_forever()


def add_selection(parser: argparse.ArgumentParser) -> None:
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true")
    group.add_argument("--case", action="append")
    group.add_argument("--skill", action="append")


def cli() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("validate")
    prepare = sub.add_parser("prepare")
    prepare.add_argument("--run", required=True)
    prepare.add_argument("--repeats", type=int, default=DEFAULT_REPEATS)
    add_selection(prepare)
    run = sub.add_parser("run")
    run.add_argument("--run", required=True)
    run.add_argument("--repeats", type=int, default=DEFAULT_REPEATS)
    run.add_argument("--jobs", type=int, default=DEFAULT_JOBS)
    run.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    run.add_argument("--arm", action="append", choices=ARMS, help="Execute only selected arm(s); preparation still preserves the complete comparison set.")
    add_selection(run)
    smoke = sub.add_parser("smoke")
    smoke.add_argument("--run", required=True)
    smoke.add_argument("--jobs", type=int, default=DEFAULT_JOBS)
    smoke.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    review = sub.add_parser("review")
    review.add_argument("--run", required=True)
    serve_parser = sub.add_parser("serve")
    serve_parser.add_argument("--run", required=True)
    serve_parser.add_argument("--port", type=int, default=4177)
    return parser


def main() -> int:
    args = cli().parse_args()
    try:
        if args.command == "validate":
            report = validate()
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 0 if report["ok"] else 1
        if args.command == "prepare":
            selected = select_cases(args)
            root = prepare_run(args.run, selected, args.repeats)
            print(root)
            return 0
        if args.command == "run":
            selected = select_cases(args)
            selected_arms = tuple(args.arm) if args.arm else None
            results = execute_run(args.run, selected, args.repeats, args.jobs, args.timeout, arms=selected_arms)
            return 0 if all(row["status"] == "complete" for row in results) else 1
        if args.command == "smoke":
            selected = select_cases(args, smoke=True)
            results = execute_run(args.run, selected, 1, args.jobs, args.timeout, arms=("full",))
            return 0 if all(row["status"] == "complete" for row in results) else 1
        if args.command == "review":
            manifest = json_read(run_root(args.run) / "run.json")
            selected = [case_map()[cid] for cid in manifest["cases"]]
            make_review(run_root(args.run), selected, manifest["repeats"])
            print(run_root(args.run) / "review" / "index.html")
            return 0
        if args.command == "serve":
            serve(args.run, args.port)
            return 0
    except (FileNotFoundError, ValueError, RuntimeError, AssertionError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
