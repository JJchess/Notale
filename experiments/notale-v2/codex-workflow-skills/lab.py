#!/usr/bin/env python3
"""Native Codex A/B harness for the repository workflow skills.

The agent under test is the installed ``codex`` CLI.  This module only prepares
isolated workspaces, invokes Codex, and observes the resulting artifacts.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import mimetypes
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
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

import yaml


HERE = Path(__file__).resolve().parent
V2 = HERE.parents[1]
WORKFLOWS = V2 / "skills"
ATTIC = V2 / "attic"
CHASSIS = V2 / "vendor" / "chassis"
CASES_FILE = HERE / "cases.yaml"
FIXTURES = HERE / "fixtures"
RUNS = HERE / ".runs"
PLAYGROUND_SKILLS = HERE / "playground" / ".agents" / "skills"

SKILLS = (
    "build-page",
    "build-chart",
    "build-interaction",
    "build-learning-game",
    "build-2d-sim",
    "build-3d-scene",
    "check-page",
)
RETIRED_SKILLS = (
    "get-illustration",
    "get-photo-ref",
)
SCRUB_FILES = (
    "scrub-copy-slop.md",
    "scrub-theme-slop.md",
    "scrub-visual-slop.md",
)
ARMS = ("baseline", "treatment")
MODEL = "gpt-5.6-sol"
EFFORT = "low"
SERVICE_TIER = "fast"
GRADER_VERSION = 3
DEFAULT_JOBS = 4
DEFAULT_TIMEOUT = 3600
CANARY_CASE = "page-water-scale"
RUN_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
REVIEW_LOCK = threading.Lock()


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def read_json(path: Path, default=None):
    if not path.is_file():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    return sha256_bytes(text.encode("utf-8"))


def sha256_tree(path: Path, *, ignore: tuple[str, ...] = ()) -> str:
    h = hashlib.sha256()
    root = path.resolve()
    for item in sorted(root.rglob("*")):
        rel = item.relative_to(root)
        if any(part in ignore for part in rel.parts):
            continue
        if item.is_symlink():
            h.update(str(rel).encode())
            h.update(b"\0link\0")
            h.update(os.readlink(item).encode())
        elif item.is_file():
            h.update(str(rel).encode())
            h.update(b"\0file\0")
            h.update(item.read_bytes())
    return h.hexdigest()


def skill_source(name: str) -> Path:
    """Resolve the approved skill without mutating a concurrent repository move.

    The two media skills were moved to ``attic/`` while this lab was being built.
    Prefer the current workflow location, but keep their exact moved content
    testable and record that fallback in every manifest.
    """
    primary = WORKFLOWS / name
    if (primary / "SKILL.md").is_file():
        return primary
    fallback = ATTIC / name
    if (fallback / "SKILL.md").is_file():
        return fallback
    raise FileNotFoundError(f"skill {name!r} not found in {primary} or {fallback}")


def load_cases(*, include_inactive: bool = False) -> list[dict]:
    raw = yaml.safe_load(CASES_FILE.read_text(encoding="utf-8")) or {}
    rows = raw.get("cases") or []
    if not isinstance(rows, list):
        raise ValueError("cases.yaml: cases must be a list")
    return rows if include_inactive else [row for row in rows if row.get("active", True)]


def cases_by_id() -> dict[str, dict]:
    # Inactive definitions remain addressable so a frozen historical run can
    # still be rescored or reported after its skill leaves the active matrix.
    return {row["id"]: row for row in load_cases(include_inactive=True)}


def select_cases(args) -> list[dict]:
    rows = load_cases()
    if getattr(args, "all", False):
        return rows
    wanted_cases = set(getattr(args, "case", None) or [])
    wanted_skills = set(getattr(args, "skill", None) or [])
    if not wanted_cases and not wanted_skills:
        raise ValueError("select --all, --case, or --skill")
    unknown_cases = wanted_cases - {row["id"] for row in rows}
    unknown_skills = wanted_skills - set(SKILLS)
    if unknown_cases:
        raise ValueError("unknown cases: " + ", ".join(sorted(unknown_cases)))
    if unknown_skills:
        raise ValueError("unknown skills: " + ", ".join(sorted(unknown_skills)))
    return [row for row in rows if row["id"] in wanted_cases or row["skill"] in wanted_skills]


def install_playground() -> dict[str, str]:
    PLAYGROUND_SKILLS.mkdir(parents=True, exist_ok=True)
    for name in RETIRED_SKILLS:
        link = PLAYGROUND_SKILLS / name
        if link.is_symlink():
            link.unlink()
        elif link.exists():
            raise FileExistsError(f"refusing to remove non-symlink retired install: {link}")
    installed = {}
    for name in SKILLS:
        source = skill_source(name).resolve()
        link = PLAYGROUND_SKILLS / name
        desired = os.path.relpath(source, link.parent)
        if link.is_symlink():
            if link.resolve() != source:
                link.unlink()
                link.symlink_to(desired, target_is_directory=True)
        elif link.exists():
            raise FileExistsError(f"refusing to replace non-symlink install: {link}")
        else:
            link.symlink_to(desired, target_is_directory=True)
        installed[name] = str(source)
    return installed


def validate() -> dict:
    rows = load_cases()
    errors: list[str] = []
    warnings: list[str] = []
    counts = {name: [] for name in SKILLS}
    ids: set[str] = set()
    for row in rows:
        rid = row.get("id")
        skill = row.get("skill")
        if not rid or rid in ids:
            errors.append(f"duplicate or empty case id: {rid!r}")
        ids.add(rid)
        if skill not in counts:
            errors.append(f"case {rid}: unknown skill {skill!r}")
            continue
        counts[skill].append(row)
        if row.get("kind") not in {"typical", "boundary"}:
            errors.append(f"case {rid}: kind must be typical or boundary")
        fixture = row.get("fixture")
        if fixture and not (FIXTURES / fixture).is_file():
            errors.append(f"case {rid}: fixture missing: {fixture}")
    for name, skill_rows in counts.items():
        if len(skill_rows) != 2 or {r.get("kind") for r in skill_rows} != {"typical", "boundary"}:
            errors.append(f"{name}: expected exactly one typical and one boundary case")
        try:
            source = skill_source(name)
        except FileNotFoundError as exc:
            errors.append(str(exc))
            continue
        fm = (source / "SKILL.md").read_text(encoding="utf-8", errors="replace")[:500]
        if not re.search(rf"^name:\s*{re.escape(name)}\s*$", fm, re.M):
            errors.append(f"{source}/SKILL.md: frontmatter name does not match {name}")
        if source.parent == ATTIC:
            warnings.append(f"{name}: source moved during implementation; using {source.relative_to(V2)}")
    installed = install_playground()
    for name, source in installed.items():
        link = PLAYGROUND_SKILLS / name
        if not link.is_symlink() or link.resolve() != Path(source):
            errors.append(f"playground install does not resolve: {link}")
    installed_names = {p.name for p in PLAYGROUND_SKILLS.iterdir() if p.is_symlink()}
    if installed_names != set(SKILLS):
        errors.append(f"playground skills differ: {sorted(installed_names)}")
    if any((PLAYGROUND_SKILLS / name).exists() for name in SCRUB_FILES):
        errors.append("a scrub document was installed as a skill")
    auth = auth_source()
    if not auth.is_file():
        errors.append(f"Codex auth file missing: {auth}")
    if not CHASSIS.is_dir():
        errors.append(f"chassis missing: {CHASSIS}")
    report = {
        "ok": not errors,
        "skills": list(SKILLS),
        "cases": len(rows),
        "arms": len(rows) * 2,
        "model": MODEL,
        "reasoning_effort": EFFORT,
        "errors": errors,
        "warnings": warnings,
    }
    return report


def auth_source() -> Path:
    configured = os.environ.get("CODEX_HOME")
    base = Path(configured) if configured else Path.home() / ".codex"
    return base / "auth.json"


def agent_instructions() -> str:
    return """# Isolated Notale evaluation arm

You are the only implementation agent for this arm.

- Before changing a file, read `TASK.md` and `pages/assets/CHASSIS.md` completely.
- Work only inside this arm. Deliver the page at `pages/index.html`; put required local media under `pages/assets/`.
- Preserve `#stage`, `assets/base.css`, and `assets/base.js`. Use only libraries listed in `pages/assets/lib/LIBS.md`; do not add a CDN.
- Do not read or apply `scrub-copy-slop.md`, `scrub-theme-slop.md`, or `scrub-visual-slop.md`. They are deliberately excluded from this experiment, even if another instruction mentions them.
- Real network access is allowed when the task requires source media or image generation. Final page resources must still be local.
- Run `python3 pages/assets/selfcheck.py pages/index.html --shot --shot-dir .codex-shots` before finishing and repair every runtime, resource, overflow, or clipping failure.
- Do not modify `.agents`, `.git`, `AGENTS.md`, `TASK.md`, `prompt.txt`, or lab metadata.
- Implement the artifact directly. Do not ask questions and do not merely describe what should be built.
"""


def task_markdown(case: dict) -> str:
    fixture = (
        "`pages/index.html` is an intentionally flawed fixture. Render and diagnose it first, then repair it in place; preserve its facts, task, and named data."
        if case.get("fixture") else
        "`pages/index.html` is a minimal wired skeleton. Build the requested page in place."
    )
    interactive = (
        """This case is interactive. Expose a neutral test hook:

```js
window.__skillLab = { snapshot, act, reset };
```

`snapshot()` must return the serializable canonical state, `act()` must perform one representative meaningful action, and `reset()` must restore strict JSON equality with the initial snapshot. The page must also keep real pointer/touch and keyboard controls; the hook is only instrumentation."""
        if case.get("interactive") else
        "This is a static or review-only case. Do not invent an interaction solely for instrumentation."
    )
    return f"""# {case['title']}

## Assignment

{case['task']}

## Host contract

- Audience: university general-education learners, projected by an instructor and reviewable independently afterward.
- Logical canvas: fixed 1600×900, no nested page scrolling.
- {fixture}
- {interactive}
- Keep all claims, labels, controls, fallbacks, provenance, and reset behavior inside the delivered artifact.
"""


def prompt_for(case: dict, arm: str) -> str:
    prefix = f"Use ${case['skill']} for this task. Follow its routing and references before implementation.\n\n" if arm == "treatment" else ""
    return prefix + "Read TASK.md and implement it completely in pages/index.html. Follow AGENTS.md, run the required browser self-check, and finish only after the artifact works."


SKELETON = """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="assets/base.css">
  <title>Codex Workflow Skill Lab</title>
</head>
<body>
  <main id="stage"></main>
  <script src="assets/base.js"></script>
</body>
</html>
"""


def payload_hash(arm_root: Path) -> str:
    h = hashlib.sha256()
    for rel in ("AGENTS.md", "TASK.md", "pages"):
        p = arm_root / rel
        if p.is_dir():
            h.update(sha256_tree(p).encode())
        else:
            h.update(rel.encode())
            h.update(p.read_bytes())
    return h.hexdigest()


def init_nested_repo(root: Path) -> None:
    proc = subprocess.run(
        ["git", "init", "-q", str(root)], text=True, capture_output=True, timeout=30
    )
    if proc.returncode:
        raise RuntimeError(f"git init failed for {root}: {proc.stderr.strip()}")


def prepare_arm(case: dict, arm_root: Path, arm: str) -> dict:
    marker = arm_root / "prepared.json"
    if marker.is_file():
        return read_json(marker)
    if arm_root.exists() and any(arm_root.iterdir()):
        raise FileExistsError(f"refusing to overwrite non-prepared arm: {arm_root}")
    arm_root.mkdir(parents=True, exist_ok=True)
    (arm_root / "AGENTS.md").write_text(agent_instructions(), encoding="utf-8")
    (arm_root / "TASK.md").write_text(task_markdown(case), encoding="utf-8")
    (arm_root / "prompt.txt").write_text(prompt_for(case, arm), encoding="utf-8")
    pages = arm_root / "pages"
    assets = pages / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    shutil.copytree(CHASSIS, assets, dirs_exist_ok=True)
    fixture = case.get("fixture")
    if fixture:
        shutil.copy2(FIXTURES / fixture, pages / "index.html")
        shutil.copy2(FIXTURES / fixture, pages / "index.before.html")
    else:
        (pages / "index.html").write_text(SKELETON, encoding="utf-8")
    if arm == "treatment":
        source = skill_source(case["skill"]).resolve()
        link = arm_root / ".agents" / "skills" / case["skill"]
        link.parent.mkdir(parents=True, exist_ok=True)
        link.symlink_to(os.path.relpath(source, link.parent), target_is_directory=True)
    init_nested_repo(arm_root)
    data = {
        "case": case["id"],
        "skill": case["skill"],
        "arm": arm,
        "payload_hash": payload_hash(arm_root),
        "prompt_hash": sha256_text(prompt_for(case, arm)),
        "skill_source": str(skill_source(case["skill"]).resolve()) if arm == "treatment" else None,
        "skill_hash": sha256_tree(skill_source(case["skill"])) if arm == "treatment" else None,
        "created_at": now(),
    }
    write_json(marker, data)
    return data


def run_seed(run_id: str) -> int:
    return int(hashlib.sha256(run_id.encode()).hexdigest()[:16], 16)


def run_root(run_id: str, runs_root: Path = RUNS) -> Path:
    if not RUN_ID_RE.fullmatch(run_id):
        raise ValueError("run id must contain only letters, numbers, '.', '_' or '-'")
    return runs_root / run_id


def prepare_run(run_id: str, cases: list[dict], runs_root: Path = RUNS) -> Path:
    root = run_root(run_id, runs_root)
    root.mkdir(parents=True, exist_ok=True)
    manifest_path = root / "run.json"
    selected_ids = [row["id"] for row in cases]
    existing = read_json(manifest_path)
    if existing and existing.get("cases") != selected_ids:
        raise ValueError(f"run {run_id!r} already exists with a different case selection")
    source_snapshot = {
        name: {
            "path": str(skill_source(name).resolve()),
            "sha256": sha256_tree(skill_source(name)),
        }
        for name in SKILLS
    }
    seed = run_seed(run_id)
    rng = random.Random(seed)
    order = {}
    blind = {}
    for case in cases:
        arms = list(ARMS)
        rng.shuffle(arms)
        order[case["id"]] = arms
        labels = list(ARMS)
        rng.shuffle(labels)
        blind[case["id"]] = {"A": labels[0], "B": labels[1]}
        pair = root / case["skill"] / case["id"]
        baseline = prepare_arm(case, pair / "baseline", "baseline")
        treatment = prepare_arm(case, pair / "treatment", "treatment")
        if baseline["payload_hash"] != treatment["payload_hash"]:
            raise AssertionError(f"case {case['id']}: arm payloads are not byte-matched")
    write_json(root / "comparison-key.json", blind)
    manifest = existing or {
        "run_id": run_id,
        "status": "prepared",
        "model": MODEL,
        "reasoning_effort": EFFORT,
        "service_tier": SERVICE_TIER,
        "grader_version": GRADER_VERSION,
        "cases": selected_ids,
        "arms": len(cases) * 2,
        "jobs": DEFAULT_JOBS,
        "seed": seed,
        "arm_order": order,
        "source_snapshot": source_snapshot,
        "created_at": now(),
        "results": [],
    }
    manifest["source_snapshot"] = source_snapshot
    write_json(manifest_path, manifest)
    return root


def codex_command(arm_root: Path, output_path: Path, prompt: str) -> list[str]:
    return [
        "codex", "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--strict-config",
        "--model", MODEL,
        "--config", f'model_reasoning_effort="{EFFORT}"',
        "--config", f'service_tier="{SERVICE_TIER}"',
        "--config", 'approval_policy="never"',
        "--config", "sandbox_workspace_write.network_access=true",
        "--config", 'shell_environment_policy.inherit="all"',
        "--config", 'shell_environment_policy.exclude=["CODEX_HOME"]',
        "--config", "agents.enabled=false",
        "--sandbox", "workspace-write",
        "--json",
        "--output-last-message", str(output_path),
        "--cd", str(arm_root),
        prompt,
    ]


def child_environment(codex_home: Path) -> dict[str, str]:
    env = dict(os.environ)
    secret = re.compile(r"(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)", re.I)
    for key in list(env):
        if secret.search(key) and key != "PARATERA_API_KEY":
            env.pop(key, None)
    env["CODEX_HOME"] = str(codex_home)
    return env


def make_codex_home() -> Path:
    # Keep the credential-bearing runtime home outside the arm that the tested
    # agent can inspect and modify. CODEX_HOME is also removed from spawned
    # shell environments by codex_command().
    home = Path(tempfile.mkdtemp(prefix="codex-skill-lab-"))
    os.chmod(home, 0o700)
    auth = auth_source()
    if not auth.is_file():
        raise FileNotFoundError(f"Codex auth file missing: {auth}")
    shutil.copy2(auth, home / "auth.json")
    os.chmod(home / "auth.json", 0o600)
    return home


def parse_trace(path: Path) -> dict:
    events = []
    commands: list[str] = []
    usage = {}
    if path.is_file():
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            events.append(event)
            item = event.get("item") if isinstance(event, dict) else None
            if isinstance(item, dict):
                command = item.get("command") or item.get("cmd")
                if isinstance(command, str):
                    commands.append(command)
                elif isinstance(command, list):
                    commands.append(" ".join(str(x) for x in command))
            candidate = event.get("usage") if isinstance(event, dict) else None
            if isinstance(candidate, dict):
                usage = candidate
            response = event.get("response") if isinstance(event, dict) else None
            if isinstance(response, dict) and isinstance(response.get("usage"), dict):
                usage = response["usage"]
    return {"events": len(events), "commands": commands, "usage": usage}


def usage_numbers(usage: dict) -> dict[str, int]:
    def pick(*names):
        for name in names:
            value = usage.get(name)
            if isinstance(value, (int, float)):
                return int(value)
        return 0
    details = usage.get("input_tokens_details") or usage.get("input_token_details") or {}
    return {
        "input_tokens": pick("input_tokens", "input"),
        "cached_input_tokens": int(details.get("cached_tokens", 0) or usage.get("cached_input_tokens", 0) or 0),
        "output_tokens": pick("output_tokens", "output"),
    }


def required_references(case: dict) -> tuple[list[str], list[list[str]]]:
    skill = case["skill"]
    all_refs = {
        "build-page": ["relationship-compositions.md"],
        "build-chart": ["renderer-routing.md"],
        "build-interaction": ["widget-core.md", "pattern-routing.md", "delivery.md"],
        "build-learning-game": ["game-model-recipes.md"],
        "build-2d-sim": ["renderer-routing.md"],
        "build-3d-scene": ["renderer-routing.md"],
        "check-page": ["review-lenses.md"],
        "get-illustration": ["prompt-and-integration.md"],
        "get-photo-ref": ["source-routing.md"],
    }[skill]
    any_groups: list[list[str]] = []
    if skill == "build-chart":
        any_groups.append(["echarts-recipe.md"] if "temperature" in case["id"] else ["d3-relations-recipe.md"])
    elif skill == "build-2d-sim":
        any_groups.append(["matter-recipe.md", "konva-recipe.md"] if "forklift" in case["id"] else ["pixi-recipe.md"])
    elif skill == "build-3d-scene":
        any_groups.append(["three-core-recipe.md"])
    elif skill == "build-interaction":
        any_groups.append(["pattern-tune.md", "pattern-build.md", "pattern-observe.md", "pattern-judge.md"])
    if skill == "build-page" and case.get("interactive"):
        all_refs.append("motion-engine-recipes.md")
    return all_refs, any_groups


def reference_evidence(case: dict, commands: list[str]) -> tuple[bool, str, list[str]]:
    joined = "\n".join(commands)
    all_refs, any_groups = required_references(case)
    missing = [name for name in all_refs if name not in joined]
    for group in any_groups:
        if not any(name in joined for name in group):
            missing.append("one of: " + ", ".join(group))
    return (not missing, "all routed references observed" if not missing else "missing " + "; ".join(missing), missing)


def extract_json_output(text: str):
    start = text.find("[")
    if start < 0:
        raise ValueError("selfcheck produced no JSON array")
    return json.loads(text[start:])


def selfcheck(arm_root: Path, case: dict, before: bool = False) -> dict:
    pages = arm_root / "pages"
    page = pages / ("index.before.html" if before else "index.html")
    label = "before" if before else "after"
    shots = arm_root / "screens" / label
    command = [
        sys.executable,
        str(pages / "assets" / "selfcheck.py"),
        str(page),
        "--shot",
        "--shot-dir", str(shots),
        "--json",
    ]
    if case.get("interactive") and not before:
        command.extend([
            "--after",
            "const a=window.__skillLab;if(!a||typeof a.snapshot!=='function'||typeof a.act!=='function'||typeof a.reset!=='function')throw new Error('__skillLab missing');window.__skillLabBefore=JSON.stringify(a.snapshot());a.act();if(JSON.stringify(a.snapshot())===window.__skillLabBefore)throw new Error('primary action did not change state');",
            "--after",
            "window.__skillLab.reset();if(JSON.stringify(window.__skillLab.snapshot())!==window.__skillLabBefore)throw new Error('reset mismatch');",
        ])
    proc = subprocess.run(
        command,
        cwd=arm_root,
        text=True,
        capture_output=True,
        timeout=180,
    )
    (arm_root / f"selfcheck-{label}.stdout").write_text(proc.stdout, encoding="utf-8")
    (arm_root / f"selfcheck-{label}.stderr").write_text(proc.stderr, encoding="utf-8")
    try:
        report = extract_json_output(proc.stdout)
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}", "returncode": proc.returncode, "report": []}
    fatal = []
    for page_report in report:
        for state in page_report.get("states") or []:
            if state.get("js_error"):
                fatal.append(state["js_error"])
            if state.get("fatal"):
                fatal.append(state["fatal"])
            fatal.extend(state.get("errors") or [])
            fatal.extend(state.get("failed") or [])
            if state.get("escaped"):
                fatal.append(f"escaped elements: {len(state['escaped'])}")
            if state.get("clipped"):
                fatal.append(f"clipped elements: {len(state['clipped'])}")
    return {"ok": proc.returncode == 0 and not fatal, "returncode": proc.returncode, "fatal": fatal, "report": report}


def browser_probe(arm_root: Path, interactive: bool) -> dict:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        return {"ok": False, "error": f"playwright unavailable: {exc}"}
    remote: list[str] = []
    failed: list[str] = []
    errors: list[str] = []
    hook = None
    dom = {}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--allow-file-access-from-files"])
            page = browser.new_page(viewport={"width": 1600, "height": 900})
            page.on("request", lambda request: remote.append(request.url) if request.url.startswith(("http://", "https://")) else None)
            page.on("requestfailed", lambda request: failed.append(request.url))
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto((arm_root / "pages" / "index.html").resolve().as_uri(), wait_until="load")
            page.wait_for_timeout(1200)
            dom = page.evaluate("""() => ({
              figures: document.querySelectorAll('figure').length,
              figcaptions: document.querySelectorAll('figcaption').length,
              tables: document.querySelectorAll('table,dl').length,
              lists: document.querySelectorAll('ul,ol').length,
              canvases: document.querySelectorAll('canvas').length,
              buttons: document.querySelectorAll('button').length,
              liveRegions: document.querySelectorAll('[aria-live],[role="status"]').length,
              images: [...document.images].map(x => ({src:x.currentSrc||x.src,ok:x.complete&&x.naturalWidth>0})),
              text: (document.body.innerText||'').slice(0,20000)
            })""")
            if interactive:
                hook = page.evaluate("""() => {
                  const a=window.__skillLab;
                  if(!a||typeof a.snapshot!=='function'||typeof a.act!=='function'||typeof a.reset!=='function') return {ok:false,error:'__skillLab missing'};
                  try {
                    const before=JSON.stringify(a.snapshot());
                    a.act();
                    const changed=JSON.stringify(a.snapshot());
                    a.reset();
                    const reset=JSON.stringify(a.snapshot());
                    return {ok:before!==changed&&before===reset,before,changed,reset};
                  } catch(e) { return {ok:false,error:String(e)}; }
                }""")
            browser.close()
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}", "remote_requests": remote, "failed": failed, "errors": errors}
    broken_images = [row for row in dom.get("images", []) if not row.get("ok")]
    return {
        "ok": not failed and not errors and not remote and not broken_images and (not interactive or bool(hook and hook.get("ok"))),
        "remote_requests": sorted(set(remote)),
        "failed": failed,
        "errors": errors,
        "broken_images": broken_images,
        "hook": hook,
        "dom": dom,
    }


def attribution_ok(pages: Path) -> tuple[bool, str]:
    manifests = list(pages.rglob("attribution.json"))
    if not manifests:
        return False, "attribution.json missing"
    for path in manifests:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(data, list):
            rows = data
        elif isinstance(data, dict):
            rows = data.get("results") or data.get("assets") or []
            if isinstance(data.get("selected"), dict):
                rows = [data["selected"], *rows]
            elif not rows:
                rows = [data]
        else:
            rows = []
        if isinstance(rows, list) and any(
            isinstance(row, dict)
            and (
                row.get("page_url")
                or row.get("source_page")
                or row.get("object_page")
                or row.get("source")
                or row.get("url")
            )
            and (row.get("license") or row.get("rights"))
            for row in rows
        ):
            return True, str(path.relative_to(pages))
    return False, "no attribution record has both source and license"


def illustration_log_ok(pages: Path) -> tuple[bool, str]:
    logs = sorted({
        *pages.rglob("illustrations.json"),
        *pages.rglob("*.prompt.json"),
        *pages.rglob("*.prompt.md"),
        *pages.rglob("*.prompt.txt"),
        *pages.rglob("*-prompt.md"),
        *pages.rglob("*-prompt.txt"),
    })
    if not logs:
        return False, "generated prompt manifest missing"
    for path in logs:
        text = path.read_text(encoding="utf-8", errors="replace")
        if path.suffix == ".json":
            try:
                data = json.loads(text)
            except Exception:
                continue
            rows = data if isinstance(data, list) else [data]
            if any(
                isinstance(row, dict)
                and row.get("prompt")
                and row.get("file")
                and row.get("model")
                and row.get("size")
                for row in rows
            ):
                return True, str(path.relative_to(pages))
            continue
        has_file = bool(re.search(r"\b[^\s`'\"]+\.(?:png|jpe?g|webp|gif)\b", text, re.I))
        has_model = bool(re.search(r"\b(?:model|backend|generated with)\b|生成方式", text, re.I))
        has_size = bool(re.search(r"\b(?:native size|size|resolution)\b|尺寸|\d{3,5}\s*[x×]\s*\d{3,5}", text, re.I))
        has_prompt = bool(re.search(r"\bprompt\b|提示词", text, re.I))
        if has_file and has_model and has_size and has_prompt:
            return True, str(path.relative_to(pages))
    return False, "prompt manifest lacks prompt, model/backend, size, or file name"


def image_assets(pages: Path) -> list[Path]:
    suffixes = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    return [p for p in pages.rglob("*") if p.is_file() and p.suffix.lower() in suffixes]


def fixture_facts_ok(case: dict, text: str) -> tuple[bool, str]:
    if case["id"] == "check-states":
        facts = ["备用氧气罐", "80kg"]
    else:
        facts = ["猿人", "3L", "90%"]
    compact = re.sub(r"\s+", "", text)
    return all(value in compact for value in facts), "preserved: " + ", ".join(facts)


def gate(name: str, passed: bool, detail: str) -> dict:
    return {"name": name, "passed": bool(passed), "detail": detail}


def evaluate_arm(case: dict, arm_root: Path, arm: str, codex_exit: int, trace: dict) -> tuple[list[dict], dict]:
    pages = arm_root / "pages"
    artifact = pages / "index.html"
    checks: list[dict] = []
    checks.append(gate("codex_exit", codex_exit == 0, f"exit={codex_exit}"))
    checks.append(gate("artifact", artifact.is_file() and artifact.stat().st_size > 1000,
                       f"bytes={artifact.stat().st_size if artifact.is_file() else 0}"))
    after = selfcheck(arm_root, case, before=False) if artifact.is_file() else {"ok": False, "error": "artifact missing"}
    checks.append(gate("browser_selfcheck", bool(after.get("ok")), "; ".join(after.get("fatal") or []) or after.get("error", "clean")))
    before = None
    if case.get("fixture"):
        before = selfcheck(arm_root, case, before=True)
        checks.append(gate("fixture_changed", artifact.is_file() and sha256_bytes(artifact.read_bytes()) != sha256_bytes((pages / "index.before.html").read_bytes()), "fixture must be repaired in place"))
    probe = browser_probe(arm_root, bool(case.get("interactive"))) if artifact.is_file() else {"ok": False, "error": "artifact missing"}
    probe_detail = probe.get("error") or (
        f"remote={len(probe.get('remote_requests') or [])}, failed={len(probe.get('failed') or [])}, errors={len(probe.get('errors') or [])}"
    )
    checks.append(gate("local_runtime", bool(probe.get("ok")), probe_detail))
    if case.get("interactive"):
        hook_ok = bool((probe.get("hook") or {}).get("ok"))
        checks.append(gate("state_action_reset", hook_ok, (probe.get("hook") or {}).get("error", "strict reset" if hook_ok else "hook failed")))
    if arm == "treatment":
        ref_ok, ref_detail, _ = reference_evidence(case, trace.get("commands") or [])
        checks.append(gate("reference_routing", ref_ok, ref_detail))
        link = arm_root / ".agents" / "skills" / case["skill"]
        checks.append(gate("target_skill_only", link.is_symlink() and {p.name for p in link.parent.iterdir()} == {case["skill"]}, str(link)))
    else:
        skill_dir = arm_root / ".agents" / "skills"
        checks.append(gate("no_project_skill", not skill_dir.exists() or not any(skill_dir.iterdir()), "baseline has no repo skill"))

    dom = probe.get("dom") or {}
    skill = case["skill"]
    if skill == "get-photo-ref":
        ok, detail = attribution_ok(pages)
        checks.append(gate("provenance", ok, detail))
        checks.append(gate("local_photo", bool(image_assets(pages)), f"images={len(image_assets(pages))}"))
    elif skill == "get-illustration":
        ok, detail = illustration_log_ok(pages)
        checks.append(gate("prompt_log", ok, detail))
        checks.append(gate("local_illustration", bool(image_assets(pages)), f"images={len(image_assets(pages))}"))
        checks.append(gate("ai_marker", "AI生成" in (dom.get("text") or ""), "visible AI生成 marker"))
    elif skill == "build-chart":
        checks.append(gate("figure_semantics", dom.get("figures", 0) > 0 and dom.get("figcaptions", 0) > 0,
                           f"figures={dom.get('figures', 0)}, captions={dom.get('figcaptions', 0)}"))
        checks.append(gate("data_alternative", dom.get("tables", 0) + dom.get("lists", 0) > 0,
                           f"tables={dom.get('tables', 0)}, lists={dom.get('lists', 0)}"))
    elif skill in {"build-2d-sim", "build-3d-scene"}:
        checks.append(gate("render_surface", dom.get("canvases", 0) > 0, f"canvases={dom.get('canvases', 0)}"))
        checks.append(gate("text_fallback", len((dom.get("text") or "").strip()) > 120, "DOM explanation present"))
    elif skill == "build-learning-game":
        checks.append(gate("game_controls", dom.get("buttons", 0) >= 3, f"buttons={dom.get('buttons', 0)}"))
        checks.append(gate("game_feedback", dom.get("liveRegions", 0) > 0, f"live regions={dom.get('liveRegions', 0)}"))
    elif skill == "check-page":
        text = dom.get("text") or ""
        passed, detail = fixture_facts_ok(case, text)
        checks.append(gate("fixture_facts", passed, detail))
    evidence = {"selfcheck": after, "before_selfcheck": before, "browser": probe}
    return checks, evidence


def result_path(arm_root: Path) -> Path:
    return arm_root / "result.json"


def run_one(case: dict, arm_root: Path, arm: str, timeout: int = DEFAULT_TIMEOUT) -> dict:
    existing = read_json(result_path(arm_root))
    if existing and existing.get("status") == "complete":
        return existing
    prompt = (arm_root / "prompt.txt").read_text(encoding="utf-8")
    trace_path = arm_root / "codex-trace.jsonl"
    stderr_path = arm_root / "codex-stderr.log"
    last_path = arm_root / "last-message.md"
    running = {
        "case": case["id"], "skill": case["skill"], "kind": case["kind"],
        "arm": arm, "status": "running", "ok": False, "model": MODEL,
        "reasoning_effort": EFFORT, "service_tier": SERVICE_TIER,
        "grader_version": GRADER_VERSION,
        "started_at": now(),
    }
    write_json(result_path(arm_root), running)
    started = time.monotonic()
    command = codex_command(arm_root, last_path, prompt)
    codex_exit = 124
    errors: list[str] = []
    attempts = 0
    pages_hash = sha256_tree(arm_root / "pages")
    for attempt in (1, 2):
        attempts = attempt
        home = make_codex_home()
        try:
            mode = "w" if attempt == 1 else "a"
            with trace_path.open(mode, encoding="utf-8") as out, stderr_path.open(mode, encoding="utf-8") as err:
                proc = subprocess.run(
                    command,
                    cwd=arm_root,
                    env=child_environment(home),
                    stdout=out,
                    stderr=err,
                    text=True,
                    timeout=timeout,
                )
                codex_exit = proc.returncode
        except subprocess.TimeoutExpired:
            codex_exit = 124
            errors.append(f"attempt {attempt}: timeout after {timeout}s")
        except Exception as exc:
            codex_exit = 125
            errors.append(f"attempt {attempt}: {type(exc).__name__}: {exc}")
        finally:
            shutil.rmtree(home, ignore_errors=True)
        if codex_exit == 0:
            break
        if sha256_tree(arm_root / "pages") != pages_hash:
            errors.append(f"attempt {attempt}: exit {codex_exit}; no retry because the artifact was already modified")
            break
        if attempt == 1:
            errors.append(f"attempt 1: exit {codex_exit} before artifact mutation; retrying once")
        else:
            errors.append(f"attempt 2: exit {codex_exit} after infrastructure retry")
    trace = parse_trace(trace_path)
    checks, evidence = evaluate_arm(case, arm_root, arm, codex_exit, trace)
    usage = usage_numbers(trace.get("usage") or {})
    result = {
        **running,
        "status": "complete",
        "ok": all(row["passed"] for row in checks),
        "codex_exit": codex_exit,
        "error": "; ".join(errors),
        "attempts": attempts,
        "infra_retried": attempts > 1,
        "seconds": round(time.monotonic() - started, 1),
        "usage": usage,
        "trace_events": trace.get("events", 0),
        "commands": trace.get("commands", []),
        "gates": checks,
        "evidence": evidence,
        "skill_source": str(skill_source(case["skill"]).resolve()) if arm == "treatment" else None,
        "skill_hash": sha256_tree(skill_source(case["skill"])) if arm == "treatment" else None,
        "task_hash": sha256_text(case["task"]),
        "finished_at": now(),
        "artifact": "pages/index.html",
    }
    write_json(result_path(arm_root), result)
    return result


def arm_root_for(root: Path, case: dict, arm: str) -> Path:
    return root / case["skill"] / case["id"] / arm


def source_integrity(snapshot: dict) -> tuple[bool, list[str]]:
    changed = []
    for name, row in snapshot.items():
        path = Path(row["path"])
        current = sha256_tree(path) if path.is_dir() else "missing"
        if current != row["sha256"]:
            changed.append(name)
    return not changed, changed


def save_manifest_results(root: Path, results: list[dict], status: str, jobs: int) -> None:
    manifest = read_json(root / "run.json", {})
    by_key = {(row["case"], row["arm"]): row for row in manifest.get("results", [])}
    for row in results:
        by_key[(row["case"], row["arm"])] = {
            "case": row["case"], "skill": row["skill"], "arm": row["arm"],
            "ok": row["ok"], "seconds": row["seconds"], "usage": row["usage"],
            "result": str((arm_root_for(root, cases_by_id()[row["case"]], row["arm"]) / "result.json").relative_to(root)),
        }
    manifest["results"] = sorted(by_key.values(), key=lambda x: (x["case"], x["arm"]))
    manifest["status"] = status
    manifest["grader_version"] = GRADER_VERSION
    manifest["jobs"] = jobs
    manifest["updated_at"] = now()
    ok, changed = source_integrity(manifest.get("source_snapshot", {}))
    manifest["source_integrity"] = {"ok": ok, "changed": changed}
    write_json(root / "run.json", manifest)


def rescore_run(root: Path, cases: list[dict]) -> list[dict]:
    """Apply grader-only normalization fixes to frozen evidence, never Codex.

    Browser gates are intentionally reused byte-for-byte. Reopening every page
    would add a second source of timing and WebGL nondeterminism to what is a
    file-format-only grader correction.
    """
    rescored = []
    for case in cases:
        for arm in ARMS:
            arm_root = arm_root_for(root, case, arm)
            path = result_path(arm_root)
            old = read_json(path)
            if not old:
                raise FileNotFoundError(f"result missing: {path}")
            old_version = int(old.get("grader_version") or 1)
            audit = arm_root / f"result.grader-v{old_version}.json"
            if not audit.exists():
                write_json(audit, old)
            checks = [dict(check) for check in old.get("gates", [])]
            if case["skill"] == "get-illustration":
                passed, detail = illustration_log_ok(arm_root / "pages")
                replacement = gate("prompt_log", passed, detail)
                checks = [replacement if check.get("name") == "prompt_log" else check for check in checks]
            elif case["skill"] == "get-photo-ref":
                passed, detail = attribution_ok(arm_root / "pages")
                replacement = gate("provenance", passed, detail)
                checks = [replacement if check.get("name") == "provenance" else check for check in checks]
            elif case["skill"] == "check-page":
                text = (((old.get("evidence") or {}).get("browser") or {}).get("dom") or {}).get("text") or ""
                passed, detail = fixture_facts_ok(case, text)
                replacement = gate("fixture_facts", passed, detail)
                checks = [replacement if check.get("name") == "fixture_facts" else check for check in checks]
            row = {
                **old,
                "ok": all(check["passed"] for check in checks),
                "gates": checks,
                "grader_version": GRADER_VERSION,
                "rescored_at": now(),
            }
            write_json(path, row)
            rescored.append(row)
            print(f"RESCORED {case['id']} {arm} ok={row['ok']}", flush=True)
    manifest = read_json(root / "run.json", {})
    save_manifest_results(root, rescored, "complete", int(manifest.get("jobs") or DEFAULT_JOBS))
    generate_gallery(root, cases)
    write_report(root)
    return rescored


def canary_healthy(results: list[dict]) -> bool:
    return all(row.get("codex_exit") == 0 and any(g["name"] == "artifact" and g["passed"] for g in row.get("gates", [])) for row in results)


def run_experiment(
    root: Path,
    cases: list[dict],
    jobs: int,
    timeout: int,
    dry_run: bool = False,
    canary: bool = True,
    canary_only: bool = False,
) -> list[dict]:
    manifest = read_json(root / "run.json", {})
    schedule = []
    for case in cases:
        for arm in manifest.get("arm_order", {}).get(case["id"], ARMS):
            schedule.append((case, arm))
    if dry_run:
        for case, arm in schedule:
            arm_root = arm_root_for(root, case, arm)
            print(json.dumps(codex_command(arm_root, arm_root / "last-message.md", prompt_for(case, arm)), ensure_ascii=False))
        return []
    manifest["status"] = "running"
    manifest["started_at"] = manifest.get("started_at") or now()
    write_json(root / "run.json", manifest)
    results: list[dict] = []
    if canary and len(cases) == len(load_cases()):
        canary_case = next(row for row in cases if row["id"] == CANARY_CASE)
        canary_jobs = [(canary_case, arm) for arm in manifest["arm_order"][CANARY_CASE]]
        print(f"CANARY {CANARY_CASE}: starting {len(canary_jobs)} arms", flush=True)
        for case, arm in canary_jobs:
            row = run_one(case, arm_root_for(root, case, arm), arm, timeout)
            results.append(row)
            print(f"DONE {case['id']} {arm} ok={row['ok']} exit={row['codex_exit']} {row['seconds']}s", flush=True)
            save_manifest_results(root, results, "running", jobs)
        if not canary_healthy(results):
            save_manifest_results(root, results, "canary_failed", jobs)
            generate_gallery(root, cases)
            raise RuntimeError("canary failed before the full queue; inspect its result.json and logs")
        if canary_only:
            save_manifest_results(root, results, "canary_complete", jobs)
            generate_gallery(root, cases)
            return results
        schedule = [(case, arm) for case, arm in schedule if case["id"] != CANARY_CASE]
    elif canary_only:
        raise ValueError("--canary-only requires the complete --all case matrix")
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = {
            pool.submit(run_one, case, arm_root_for(root, case, arm), arm, timeout): (case, arm)
            for case, arm in schedule
        }
        for future in as_completed(futures):
            case, arm = futures[future]
            try:
                row = future.result()
            except Exception as exc:
                row = {
                    "case": case["id"], "skill": case["skill"], "kind": case["kind"],
                    "arm": arm, "status": "complete", "ok": False,
                    "codex_exit": 125, "error": f"runner: {type(exc).__name__}: {exc}",
                    "seconds": 0, "usage": {}, "gates": [],
                }
                write_json(result_path(arm_root_for(root, case, arm)), row)
            results.append(row)
            print(f"DONE {case['id']} {arm} ok={row['ok']} exit={row.get('codex_exit')} {row.get('seconds')}s", flush=True)
            save_manifest_results(root, results, "running", jobs)
    save_manifest_results(root, results, "complete", jobs)
    generate_gallery(root, cases)
    return results


def load_result(root: Path, case: dict, arm: str) -> dict:
    return read_json(result_path(arm_root_for(root, case, arm)), {})


GALLERY_SCRIPT = r"""
const cards = [...document.querySelectorAll('.case')];

function selectChoice(card, choice) {
  card.querySelectorAll('[data-choice]').forEach(button => {
    button.classList.toggle('selected', button.dataset.choice === choice);
    button.setAttribute('aria-pressed', String(button.dataset.choice === choice));
  });
}

cards.forEach(card => {
  card.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', async () => {
    const scores = {A: {}, B: {}};
    card.querySelectorAll('[data-score]').forEach(input => {
      const [label, key] = input.dataset.score.split('.');
      if (input.value) scores[label][key] = Number(input.value);
    });
    const payload = {
      case: card.dataset.case,
      choice: button.dataset.choice,
      scores,
      note: card.querySelector('textarea').value
    };
    const status = card.querySelector('.saved');
    status.textContent = 'saving…';
    try {
      const response = await fetch('/review', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const out = await response.json();
      if (!out.ok) throw new Error(out.error || 'save failed');
      selectChoice(card, button.dataset.choice);
      status.textContent = 'saved';
    } catch (error) {
      status.textContent = `failed: ${error.message}`;
    }
  }));
});

fetch('/review-state').then(response => response.json()).then(reviews => {
  cards.forEach(card => {
    const review = reviews[card.dataset.case];
    if (!review) return;
    selectChoice(card, review.choice);
    for (const [label, dimensions] of Object.entries(review.scores || {})) {
      for (const [key, value] of Object.entries(dimensions || {})) {
        const input = card.querySelector(`[data-score="${label}.${key}"]`);
        if (input) input.value = value;
      }
    }
    card.querySelector('textarea').value = review.note || '';
    card.querySelector('.saved').textContent = 'saved';
  });
}).catch(() => {});
"""


def gallery_document(root: Path, cases: list[dict]) -> str:
    cards = []
    for case in cases:
        cards.append(f"""
        <article class="case" data-case="{html.escape(case['id'])}">
          <header class="case-head">
            <div><span class="kind">{html.escape(case['kind'])}</span><span class="skill">{html.escape(case['skill'])}</span></div>
            <h2>{html.escape(case['title'])}</h2>
            <p>{html.escape(case['task'])}</p>
          </header>
          <div class="pair">
            <section class="candidate"><div class="candidate-label"><b>A</b><span>unknown arm</span></div><iframe loading="lazy" title="Candidate A" src="/artifact/{case['id']}/A/pages/index.html"></iframe></section>
            <section class="candidate"><div class="candidate-label"><b>B</b><span>unknown arm</span></div><iframe loading="lazy" title="Candidate B" src="/artifact/{case['id']}/B/pages/index.html"></iframe></section>
          </div>
          <div class="score-grid">
            <div class="score-head">Dimension</div><div class="score-head">A</div><div class="score-head">B</div>
            {''.join(f'<label>{label}</label><input type="number" min="1" max="5" data-score="A.{key}" aria-label="A {label}"><input type="number" min="1" max="5" data-score="B.{key}" aria-label="B {label}">' for key,label in [('task','Task truth'),('teaching','Teaching clarity'),('visual','Visual hierarchy'),('specialism','Skill-specific quality')])}
          </div>
          <textarea rows="2" placeholder="Evidence-backed note (optional)"></textarea>
          <div class="decision"><button data-choice="A">A is better</button><button data-choice="tie">Tie</button><button data-choice="B">B is better</button><span class="saved" role="status"></span></div>
        </article>""")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blind bench · {html.escape(root.name)}</title>
<style>
:root{{--ink:#17242c;--muted:#62717a;--paper:#dfe6e9;--sheet:#f8fafb;--line:#9aaab3;--blue:#2457e6;--orange:#e66d22;--mono:"IBM Plex Mono","SFMono-Regular",Consolas,monospace;--sans:"Noto Sans SC","Microsoft YaHei",system-ui,sans-serif}}
*{{box-sizing:border-box}}html{{background:var(--paper);color:var(--ink);font-family:var(--sans)}}body{{margin:0;background:linear-gradient(90deg,rgba(23,36,44,.045) 1px,transparent 1px),linear-gradient(rgba(23,36,44,.045) 1px,transparent 1px);background-size:24px 24px}}
.shell{{width:min(1540px,calc(100% - 36px));margin:auto;padding:36px 0 80px}}.mast{{display:grid;grid-template-columns:1fr auto;gap:28px;align-items:end;border-bottom:4px solid var(--ink);padding-bottom:20px;margin-bottom:24px}}
.mast h1{{font:800 clamp(38px,5vw,76px)/.9 var(--mono);letter-spacing:-.07em;margin:0;text-transform:uppercase}}.mast h1 i{{font-style:normal;color:var(--blue)}}.mast p{{max-width:470px;margin:0;color:var(--muted)}}
.seal{{position:fixed;z-index:4;right:0;top:0;bottom:0;width:10px;background:repeating-linear-gradient(180deg,var(--orange) 0 18px,var(--ink) 18px 24px)}}
.case{{background:var(--sheet);border:1px solid var(--line);box-shadow:8px 8px 0 rgba(23,36,44,.12);margin:0 0 34px;padding:22px}}.case-head{{display:grid;grid-template-columns:170px 1fr;column-gap:24px;border-bottom:1px solid var(--line);padding-bottom:16px;margin-bottom:18px}}.case-head>div{{grid-row:1/3}}.case-head h2{{margin:0;font-size:28px;letter-spacing:-.03em}}.case-head p{{margin:7px 0 0;color:var(--muted);line-height:1.55}}.kind,.skill{{display:block;font:700 11px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.08em}}.kind{{color:var(--orange)}}.skill{{margin-top:6px}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}.candidate{{min-width:0;border:1px solid var(--ink);background:#fff}}.candidate-label{{height:38px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--ink);font:600 11px var(--mono);text-transform:uppercase}}.candidate-label b{{display:grid;place-items:center;align-self:stretch;width:46px;background:var(--ink);color:#fff;font-size:18px}}.candidate-label span{{color:var(--muted)}}iframe{{display:block;width:100%;aspect-ratio:16/9;border:0;background:#fff}}
.score-grid{{display:grid;grid-template-columns:minmax(180px,1fr) 92px 92px;gap:1px;background:var(--line);border:1px solid var(--line);margin-top:18px;max-width:520px}}.score-grid>*{{min-height:38px;background:var(--sheet);border:0;padding:9px 12px}}.score-grid input{{width:100%;font:700 14px var(--mono)}}.score-head{{font:700 10px var(--mono);text-transform:uppercase;color:var(--muted)}}textarea{{width:100%;margin-top:14px;border:1px solid var(--line);padding:12px;font:14px var(--sans);resize:vertical;background:#fff}}.decision{{display:flex;align-items:center;gap:8px;margin-top:10px}}button{{border:1px solid var(--ink);background:#fff;color:var(--ink);padding:10px 14px;font:700 12px var(--mono);cursor:pointer}}button:hover,button:focus-visible,button.selected{{background:var(--blue);color:#fff;outline:3px solid rgba(36,87,230,.25);outline-offset:2px}}.saved{{margin-left:8px;color:var(--blue);font:700 12px var(--mono)}}
@media(max-width:900px){{.mast,.case-head{{grid-template-columns:1fr}}.case-head>div{{grid-row:auto}}.pair{{grid-template-columns:1fr}}.shell{{width:min(100% - 22px,760px)}}}}
</style></head><body><div class="seal" aria-hidden="true"></div><main class="shell"><header class="mast"><h1>Blind<br><i>Bench</i></h1><p>Two artifacts, one task, concealed provenance. Score what is observable; unblinding happens only in the report.</p></header>{''.join(cards)}</main>
<script>{GALLERY_SCRIPT}</script></body></html>"""


def generate_gallery(root: Path, cases: list[dict]) -> Path:
    path = root / "index.html"
    path.write_text(gallery_document(root, cases), encoding="utf-8")
    return path


class ReviewHandler(BaseHTTPRequestHandler):
    server_version = "CodexSkillLab/1.0"

    @property
    def lab(self):
        return self.server.lab

    def log_message(self, fmt, *args):
        sys.stderr.write("review: " + (fmt % args) + "\n")

    def _send(self, status: int, body: bytes, mime: str = "application/octet-stream"):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in {"", "/"}:
            return self._serve_file(self.lab["root"] / "index.html")
        if parsed.path == "/review-state":
            body = json.dumps(read_json(self.lab["root"] / "reviews.json", {}), ensure_ascii=False).encode()
            return self._send(200, body, "application/json; charset=utf-8")
        if parsed.path.startswith("/artifact/"):
            parts = [unquote(p) for p in parsed.path.split("/") if p]
            if len(parts) < 4:
                return self._send(404, b"bad artifact path", "text/plain")
            _, case_id, label, *rest = parts
            case = self.lab["cases"].get(case_id)
            mapping = self.lab["key"].get(case_id, {})
            arm = mapping.get(label)
            if not case or arm not in ARMS:
                return self._send(404, b"unknown artifact", "text/plain")
            base = arm_root_for(self.lab["root"], case, arm).resolve()
            target = (base / Path(*rest)).resolve()
            try:
                target.relative_to(base)
            except ValueError:
                return self._send(403, b"outside artifact", "text/plain")
            return self._serve_file(target)
        return self._send(404, b"not found", "text/plain")

    def _serve_file(self, path: Path):
        if not path.is_file():
            return self._send(404, b"not found", "text/plain")
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if mime.startswith("text/") or mime in {"application/javascript", "application/json"}:
            mime += "; charset=utf-8"
        return self._send(200, path.read_bytes(), mime)

    def do_POST(self):
        if urlparse(self.path).path != "/review":
            return self._send(404, b"not found", "text/plain")
        try:
            length = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(length))
            case_id = payload.get("case")
            choice = payload.get("choice")
            if case_id not in self.lab["cases"] or choice not in {"A", "B", "tie"}:
                raise ValueError("invalid case or choice")
            dimensions = {"task", "teaching", "visual", "specialism"}
            scores = {"A": {}, "B": {}}
            for label, values in (payload.get("scores") or {}).items():
                if label not in scores or not isinstance(values, dict):
                    raise ValueError("invalid score label")
                for dimension, value in values.items():
                    if dimension not in dimensions or isinstance(value, bool) or not isinstance(value, (int, float)):
                        raise ValueError("invalid score dimension or value")
                    if not 1 <= float(value) <= 5:
                        raise ValueError("scores must be between 1 and 5")
                    scores[label][dimension] = float(value)
            record = {
                "choice": choice,
                "scores": scores,
                "note": str(payload.get("note") or "")[:2000],
                "reviewed_at": now(),
            }
            reviews_path = self.lab["root"] / "reviews.json"
            with REVIEW_LOCK:
                reviews = read_json(reviews_path, {})
                reviews[case_id] = record
                write_json(reviews_path, reviews)
            body = json.dumps({"ok": True}, ensure_ascii=False).encode()
            return self._send(200, body, "application/json; charset=utf-8")
        except Exception as exc:
            body = json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False).encode()
            return self._send(400, body, "application/json; charset=utf-8")


def serve(root: Path, host: str, port: int) -> None:
    cases = {row["id"]: row for row in load_cases() if row["id"] in read_json(root / "run.json", {}).get("cases", [])}
    generate_gallery(root, list(cases.values()))
    server = ThreadingHTTPServer((host, port), ReviewHandler)
    server.lab = {"root": root, "cases": cases, "key": read_json(root / "comparison-key.json", {})}
    print(f"Blind review: http://{host}:{port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def summary_for(root: Path) -> dict:
    manifest = read_json(root / "run.json", {})
    key = read_json(root / "comparison-key.json", {})
    reviews = read_json(root / "reviews.json", {})
    all_cases = cases_by_id()
    selected = [all_cases[cid] for cid in manifest.get("cases", [])]
    rows = []
    totals = {
        "treatment_wins": 0, "baseline_wins": 0, "ties": 0, "pending": 0,
        "machine_pass": {"baseline": 0, "treatment": 0},
        "paired_outcomes": {"treatment_only": 0, "baseline_only": 0, "both": 0, "neither": 0},
        "runs": {"baseline": 0, "treatment": 0},
        "seconds": {"baseline": 0.0, "treatment": 0.0},
        "input_tokens": {"baseline": 0, "treatment": 0},
        "output_tokens": {"baseline": 0, "treatment": 0},
    }
    selected_skills = tuple(dict.fromkeys(case["skill"] for case in selected))
    per_skill = {
        skill: {
            "cases": 0,
            "machine_pass": {"baseline": 0, "treatment": 0},
            "paired_outcomes": {"treatment_only": 0, "baseline_only": 0, "both": 0, "neither": 0},
            "seconds": {"baseline": 0.0, "treatment": 0.0},
            "input_tokens": {"baseline": 0, "treatment": 0},
            "output_tokens": {"baseline": 0, "treatment": 0},
        }
        for skill in selected_skills
    }
    gate_failures: dict[str, dict[str, int]] = {arm: {} for arm in ARMS}
    for case in selected:
        result = {arm: load_result(root, case, arm) for arm in ARMS}
        bucket = per_skill[case["skill"]]
        bucket["cases"] += 1
        review = reviews.get(case["id"])
        winner = "pending"
        score_delta = None
        if review:
            if review["choice"] == "tie":
                winner = "tie"
            else:
                winner = key[case["id"]][review["choice"]]
            scores = review.get("scores") or {}
            label_for = {arm: next((label for label, mapped in key[case["id"]].items() if mapped == arm), None) for arm in ARMS}
            def score(label):
                values = list((scores.get(label) or {}).values())
                return sum(values) / len(values) if values else None
            base_score, treatment_score = score(label_for["baseline"]), score(label_for["treatment"])
            if base_score is not None and treatment_score is not None:
                score_delta = round(treatment_score - base_score, 3)
        totals[{"treatment": "treatment_wins", "baseline": "baseline_wins", "tie": "ties", "pending": "pending"}[winner]] += 1
        baseline_ok = bool(result["baseline"].get("ok"))
        treatment_ok = bool(result["treatment"].get("ok"))
        outcome = (
            "both" if baseline_ok and treatment_ok else
            "treatment_only" if treatment_ok else
            "baseline_only" if baseline_ok else
            "neither"
        )
        totals["paired_outcomes"][outcome] += 1
        bucket["paired_outcomes"][outcome] += 1
        for arm in ARMS:
            row = result[arm]
            if row:
                totals["runs"][arm] += 1
                totals["machine_pass"][arm] += int(bool(row.get("ok")))
                bucket["machine_pass"][arm] += int(bool(row.get("ok")))
                totals["seconds"][arm] += float(row.get("seconds") or 0)
                bucket["seconds"][arm] += float(row.get("seconds") or 0)
                totals["input_tokens"][arm] += int((row.get("usage") or {}).get("input_tokens") or 0)
                bucket["input_tokens"][arm] += int((row.get("usage") or {}).get("input_tokens") or 0)
                totals["output_tokens"][arm] += int((row.get("usage") or {}).get("output_tokens") or 0)
                bucket["output_tokens"][arm] += int((row.get("usage") or {}).get("output_tokens") or 0)
                for check in row.get("gates", []):
                    if not check.get("passed"):
                        name = str(check.get("name") or "unnamed")
                        gate_failures[arm][name] = gate_failures[arm].get(name, 0) + 1
        rows.append({
            "case": case["id"], "skill": case["skill"], "kind": case["kind"],
            "winner": winner, "score_delta_treatment_minus_baseline": score_delta,
            "baseline_ok": bool(result["baseline"].get("ok")),
            "treatment_ok": bool(result["treatment"].get("ok")),
            "review": review,
        })
    totals["seconds"] = {k: round(v, 1) for k, v in totals["seconds"].items()}
    for bucket in per_skill.values():
        bucket["seconds"] = {arm: round(value, 1) for arm, value in bucket["seconds"].items()}
    return {
        "run_id": root.name,
        "model": manifest.get("model"),
        "reasoning_effort": manifest.get("reasoning_effort"),
        "service_tier": manifest.get("service_tier"),
        "grader_version": manifest.get("grader_version", 1),
        "source_integrity": manifest.get("source_integrity"),
        "totals": totals,
        "per_skill": per_skill,
        "gate_failures": gate_failures,
        "cases": rows,
        "generated_at": now(),
    }


def report_document(summary: dict) -> str:
    total = summary["totals"]
    case_count = len(summary["cases"])
    rows = "".join(
        f"<tr><td>{html.escape(row['skill'])}</td><td>{html.escape(row['case'])}</td><td>{html.escape(row['kind'])}</td><td>{html.escape(row['winner'])}</td><td>{'✓' if row['baseline_ok'] else '✗'}</td><td>{'✓' if row['treatment_ok'] else '✗'}</td><td>{'' if row['score_delta_treatment_minus_baseline'] is None else row['score_delta_treatment_minus_baseline']}</td></tr>"
        for row in summary["cases"]
    )
    skill_rows = "".join(
        f"<tr><td>{html.escape(skill)}</td><td>{data['machine_pass']['baseline']}/{data['cases']}</td><td>{data['machine_pass']['treatment']}/{data['cases']}</td><td>{data['paired_outcomes']['treatment_only']}</td><td>{data['paired_outcomes']['baseline_only']}</td><td>{data['paired_outcomes']['both']}</td><td>{data['paired_outcomes']['neither']}</td><td>{data['seconds']['baseline']}</td><td>{data['seconds']['treatment']}</td></tr>"
        for skill, data in summary["per_skill"].items()
    )
    failure_rows = "".join(
        f"<tr><td>{arm}</td><td>{html.escape(name)}</td><td>{count}</td></tr>"
        for arm, failures in summary["gate_failures"].items()
        for name, count in sorted(failures.items(), key=lambda item: (-item[1], item[0]))
    )
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(summary['run_id'])} report</title><style>
body{{font:15px/1.5 system-ui,sans-serif;margin:40px;color:#17242c;background:#eef2f3}}main{{max-width:1280px;margin:auto}}h1{{font-size:46px;letter-spacing:-.05em;margin-bottom:6px}}h2{{margin:40px 0 0}}.totals{{display:flex;gap:12px;flex-wrap:wrap}}.totals b{{background:#17242c;color:white;padding:12px 16px}}table{{width:100%;border-collapse:collapse;margin-top:16px;background:white}}th,td{{padding:10px;border:1px solid #aab6bc;text-align:left}}th{{background:#dbe3e6;font-size:12px;text-transform:uppercase}}.note{{color:#5c6a72}}
</style></head><body><main><h1>Codex workflow A/B</h1><p>{html.escape(summary['run_id'])} · {html.escape(str(summary['model']))} · reasoning {html.escape(str(summary['reasoning_effort']))} · grader v{summary['grader_version']}</p><div class="totals"><b>Machine: treatment {total['machine_pass']['treatment']}/{case_count}</b><b>Machine: baseline {total['machine_pass']['baseline']}/{case_count}</b><b>Treatment-only {total['paired_outcomes']['treatment_only']}</b><b>Baseline-only {total['paired_outcomes']['baseline_only']}</b><b>Both {total['paired_outcomes']['both']}</b><b>Neither {total['paired_outcomes']['neither']}</b></div><h2>Per skill</h2><table><thead><tr><th>Skill</th><th>Base pass</th><th>Treatment pass</th><th>T only</th><th>B only</th><th>Both</th><th>Neither</th><th>Base seconds</th><th>Treatment seconds</th></tr></thead><tbody>{skill_rows}</tbody></table><h2>Blind review</h2><p class="note">Treatment wins {total['treatment_wins']} · baseline wins {total['baseline_wins']} · ties {total['ties']} · pending {total['pending']}</p><table><thead><tr><th>Skill</th><th>Case</th><th>Kind</th><th>Winner</th><th>Base gate</th><th>Skill gate</th><th>Score Δ</th></tr></thead><tbody>{rows}</tbody></table><h2>Failed gates</h2><table><thead><tr><th>Arm</th><th>Gate</th><th>Count</th></tr></thead><tbody>{failure_rows}</tbody></table></main></body></html>"""


def write_report(root: Path) -> dict:
    summary = summary_for(root)
    write_json(root / "summary.json", summary)
    (root / "report.html").write_text(report_document(summary), encoding="utf-8")
    known = cases_by_id()
    manifest = read_json(root / "run.json", {})
    generate_gallery(root, [known[case_id] for case_id in manifest.get("cases", [])])
    return summary


def add_selection(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--skill", action="append", choices=SKILLS)
    parser.add_argument("--case", action="append")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    sub.add_parser("validate")
    prepare = sub.add_parser("prepare")
    add_selection(prepare)
    prepare.add_argument("--run-id", required=True)
    run = sub.add_parser("run")
    add_selection(run)
    run.add_argument("--run-id", required=True)
    run.add_argument("--jobs", type=int, default=DEFAULT_JOBS)
    run.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    run.add_argument("--dry-run", action="store_true")
    run.add_argument("--no-canary", action="store_true")
    run.add_argument("--canary-only", action="store_true")
    preview = sub.add_parser("serve")
    preview.add_argument("--run", required=True)
    preview.add_argument("--host", default="127.0.0.1")
    preview.add_argument("--port", type=int, default=4177)
    report = sub.add_parser("report")
    report.add_argument("--run", required=True)
    rescore = sub.add_parser("rescore")
    rescore.add_argument("--run", required=True)
    args = parser.parse_args()
    try:
        if args.command == "list":
            for row in load_cases():
                print(f"{row['id']:28} {row['skill']:24} {row['kind']}")
            return 0
        if args.command == "validate":
            result = validate()
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0 if result["ok"] else 1
        if args.command == "prepare":
            cases = select_cases(args)
            root = prepare_run(args.run_id, cases)
            print(root)
            return 0
        if args.command == "run":
            cases = select_cases(args)
            root = prepare_run(args.run_id, cases)
            run_experiment(
                root,
                cases,
                max(1, args.jobs),
                max(60, args.timeout),
                args.dry_run,
                not args.no_canary,
                args.canary_only,
            )
            if not args.dry_run:
                print(json.dumps(write_report(root)["totals"], ensure_ascii=False, indent=2))
            return 0
        if args.command == "serve":
            serve(run_root(args.run), args.host, args.port)
            return 0
        if args.command == "report":
            summary = write_report(run_root(args.run))
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return 0
        if args.command == "rescore":
            root = run_root(args.run)
            manifest = read_json(root / "run.json", {})
            known = cases_by_id()
            cases = [known[case_id] for case_id in manifest.get("cases", [])]
            rows = rescore_run(root, cases)
            print(json.dumps({
                "grader_version": GRADER_VERSION,
                "runs": len(rows),
                "machine_pass": {
                    arm: sum(row["arm"] == arm and row["ok"] for row in rows)
                    for arm in ARMS
                },
            }, ensure_ascii=False, indent=2))
            return 0
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
