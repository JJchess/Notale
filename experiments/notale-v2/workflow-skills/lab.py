#!/usr/bin/env python3
"""Isolated workflow-skill forward-test and human-review harness."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import mimetypes
import os
import re
import shutil
import sys
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
ROOT = V2.parent
WORKFLOWS = HERE / "workflows"
CASES_FILE = HERE / "evals" / "cases.yaml"
FIXTURES = HERE / "evals" / "fixtures"
RUNS = HERE / ".runs"
REVIEWS = HERE / ".reviews.json"
CATALOG = HERE / "catalog.yaml"
REVIEW_LOCK = threading.Lock()
CORE_SKILL_CREATOR = Path(
    "/data1/home/zhuyifan/.codex/skills/.system/skill-creator"
)

sys.path.insert(0, str(V2))

from core import builder as core_builder  # noqa: E402
from core import llm  # noqa: E402
from core import skills as core_skills  # noqa: E402
from tools import runtime as core_tools  # noqa: E402


MODEL = "AWS-GPT-5.6-Terra"


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    for f in sorted(path.rglob("*")):
        if f.is_file() and "__pycache__" not in f.parts:
            h.update(str(f.relative_to(path)).encode())
            h.update(b"\0")
            h.update(f.read_bytes())
    return h.hexdigest()


def load_cases() -> list[dict]:
    data = yaml.safe_load(CASES_FILE.read_text(encoding="utf-8")) or {}
    rows = data.get("cases") or []
    if not isinstance(rows, list):
        raise ValueError("evals/cases.yaml 的 cases 必须是列表")
    return rows


def workflow_names() -> list[str]:
    return sorted(p.name for p in WORKFLOWS.iterdir() if (p / "SKILL.md").is_file())


def scaffold(case: dict, target: Path) -> Path:
    pages = target / "pages"
    assets = pages / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    shutil.copytree(V2 / "vendor" / "chassis", assets, dirs_exist_ok=True)
    fixture = case.get("fixture")
    if fixture:
        src = FIXTURES / fixture
        if not src.is_file():
            raise FileNotFoundError(f"fixture 不存在: {src}")
        shutil.copy2(src, pages / "index.html")
    else:
        (pages / "index.html").write_text(
            """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="assets/base.css">
<title>Workflow Skill Lab</title>
</head>
<body><main id="stage"></main><script src="assets/base.js"></script></body>
</html>
""",
            encoding="utf-8",
        )
    return pages


def prompt_for(case: dict, pages: Path) -> str:
    interactive = bool(case.get("interactive"))
    hook = (
        "页面必须暴露 window.__skillLab={snapshot,act,reset}。snapshot() 返回可 JSON 序列化的主状态；"
        "act() 执行一次主要学习动作并改变该状态；reset() 恢复初始状态。"
        if interactive else
        "这是一项静态或审查型任务，不要为了验收接口虚构交互。"
    )
    fixture = (
        "index.html 已包含一个有意做坏的页面。先渲染并诊断，再原地修复；不要换成无关的新页面。"
        if case.get("fixture") else
        "index.html 是空骨架。保留 #stage，并原样保留 `assets/base.css` 与 `assets/base.js` 两条接线；"
        "不要把它们改成根目录下不存在的 `base.css` 或 `base.js`。"
    )
    return f"""为下面的验收案例构建一个可直接预览的 Notale 页面。

指定 workflow：{case['workflow']}
案例：{case['title']}
任务：{case['task']}

受众是大学通识课学生，场景是教师投影带讲且学生课后可独立重看。逻辑画布 1600×900。
{fixture}
{hook}

工作目录：{pages}
目标文件：{pages / 'index.html'}

必须先用 Skill 工具读取 `{case['workflow']}`。按 skill 内的决策和步骤施工；需要其 reference 时用
Read 读取明确给出的路径。只用 assets/lib/LIBS.md 已列的本地库。至少调用一次 Check 检查
`index.html` 的初始成品并请求截图；有交互时再用 after 检查主要动作后的状态，并确认
snapshot→act→reset 后 snapshot 严格相等。任何 Check 报告中的 ✗（资源、JS、裁切或溢出）
都要修完并重新 Check。最终只交付 index.html
及本页确需的本地资源。
"""


def compact_render_report(text: str) -> str:
    keep = []
    for line in text.splitlines():
        if any(k in line for k in (
            "截图 ", "JS 报错", "console.error", "资源加载失败", "超出画布", "被裁", "文字叠压",
            "Traceback", "TargetClosedError", "BrowserType.launch", "sandbox_host_linux"
        )):
            keep.append(line)
    return "\n".join(keep) or "渲染完成；详细审美判断留给人工预览。"


def smoke(pages: Path, interactive: bool,
          workflow_root: Path = WORKFLOWS) -> tuple[bool, str, str | None]:
    after = []
    if interactive:
        after.append(
            "(() => { const a=window.__skillLab; if(!a||typeof a.snapshot!=='function'||"
            "typeof a.act!=='function'||typeof a.reset!=='function') throw new Error('__skillLab missing');"
            "const before=JSON.stringify(a.snapshot()); a.act(); const changed=JSON.stringify(a.snapshot());"
            "if(before===changed) throw new Error('primary action did not change state');"
            "a.reset(); const reset=JSON.stringify(a.snapshot()); if(reset!==before) throw new Error('reset mismatch'); })()"
        )
    out = core_tools.run(
        "Check", {"page": "index.html", "after": after, "shot": True},
        pages, workflow_root
    )
    report = out.text if isinstance(out, core_tools.Out) else str(out)
    fatal = (
        "✗ JS 报错", "✗ console.error", "✗ 资源加载失败", "__skillLab missing",
        "primary action did not change state", "reset mismatch", "失败:", "Traceback",
        "TargetClosedError", "BrowserType.launch"
    )
    ok = (pages / "index.html").stat().st_size > 1000 and not any(x in report for x in fatal)
    shots = sorted((pages.parent / ".shots").glob("*.png"), key=lambda p: p.stat().st_mtime)
    shot = str(shots[-1].relative_to(pages.parent)) if shots else None
    return ok, compact_render_report(report), shot


def trace_usage(path: Path) -> tuple[int, int]:
    """Sum Builder's persisted per-call usage without creating a second trace format."""
    total_in = total_out = 0
    if not path.is_file():
        return total_in, total_out
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        usage = ((row.get("message") or {}).get("usage") or {})
        total_in += int(usage.get("input_tokens", 0) or 0)
        total_out += int(usage.get("output_tokens", 0) or 0)
    return total_in, total_out


def run_case(case: dict, run_root: Path, model: str, effort: str,
             workflow_root: Path = WORKFLOWS) -> dict:
    """Run a lab case through the production Builder loop.

    The case task and lab scaffold remain the experimental input. History replay,
    tool execution, image eviction, bad-JSON recovery, limits, and no-tool-use
    termination all come from ``core.builder.build_one``. The final smoke is an
    observer: its report is never appended to the model history.
    """
    t0 = time.time()
    skill = case["workflow"]
    target = run_root / skill / case["id"]
    pages = scaffold(case, target)
    skill_hash = sha256(workflow_root / skill)
    running = {
        "id": case["id"], "workflow": skill, "title": case["title"],
        "kind": case.get("kind", ""), "task": case["task"],
        "interactive": bool(case.get("interactive")), "model": model,
        "skill_hash": skill_hash, "status": "running", "ok": False,
        "smoke_ok": False, "created_at": now(),
        "artifact": str((pages / "index.html").relative_to(run_root)),
        "agent_loop": "core.builder.build_one",
        "workflow_root": str(workflow_root.resolve()),
    }
    write_json(target / "result.json", running)
    trace_path = target / "trace.jsonl"
    page = core_builder.Page(
        pid=case["id"],
        prompt=prompt_for(case, pages),
        required=(skill,),
        primary_workflow=skill,
        skill_mode="workflow",
    )
    instructions = (
        core_builder.IDENTITY + "\n\n"
        + core_skills.assigned_workflow(skill, workflow_root)
    )
    error = ""
    try:
        page = core_builder.build_one(
            page, pages, trace_path, workflow_root, instructions, effort
        )
    except Exception as exc:
        error = f"{type(exc).__name__}: {exc}"
    try:
        smoke_ok, smoke_report, shot = smoke(
            pages, bool(case.get("interactive")), workflow_root
        )
    except Exception as exc:
        smoke_ok, smoke_report, shot = (
            False, f"smoke 失败: {type(exc).__name__}: {exc}", None
        )
    loaded = skill in page.loaded_skills
    rendered = "Check" in page.steps or "SELFCHECK" in page.steps
    if not error and not page.ok:
        error = page.why
    ok = page.ok and loaded and rendered and smoke_ok and not error
    total_in, total_out = trace_usage(trace_path)
    result = {
        "id": case["id"], "workflow": skill, "title": case["title"],
        "kind": case.get("kind", ""), "task": case["task"],
        "interactive": bool(case.get("interactive")), "model": model,
        "skill_hash": skill_hash, "status": "complete", "ok": ok,
        "agent_ok": page.ok, "loaded_skill": loaded,
        "rendered": rendered, "smoke_ok": smoke_ok, "smoke_report": smoke_report,
        "screenshot": shot, "final_text": page.why, "error": error,
        "input_tokens": total_in, "output_tokens": total_out,
        "seconds": round(time.time() - t0, 1), "calls": page.calls,
        "steps": page.steps, "reference_reads": page.reference_reads,
        "termination": page.termination, "images": page.images,
        "agent_loop": "core.builder.build_one",
        "workflow_root": str(workflow_root.resolve()),
        "task_sha256": hashlib.sha256(case["task"].encode()).hexdigest(),
        "created_at": now(),
        "artifact": str((pages / "index.html").relative_to(run_root)),
    }
    target.mkdir(parents=True, exist_ok=True)
    write_json(target / "result.json", result)
    return result


def choose_cases(args) -> list[dict]:
    rows = load_cases()
    if args.case:
        wanted = set(args.case)
        rows = [r for r in rows if r["id"] in wanted]
        missing = wanted - {r["id"] for r in rows}
        if missing:
            raise SystemExit("未知 case: " + ", ".join(sorted(missing)))
    elif args.skill:
        wanted = set(args.skill)
        rows = [r for r in rows if r["workflow"] in wanted]
        missing = wanted - {r["workflow"] for r in rows}
        if missing:
            raise SystemExit("未知 workflow: " + ", ".join(sorted(missing)))
    elif not args.all:
        raise SystemExit("run 需要 --case、--skill 或 --all")
    return rows


def _link_or_copy(src: str, dst: str) -> str:
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)
    return dst


def assemble_runs(source_ids: list[str], run_id: str) -> Path:
    """Promote the newest current-hash passing artifact for every case into one review run."""
    target = RUNS / run_id
    if target.exists():
        raise SystemExit(f"目标 run 已存在: {run_id}")
    cases = load_cases()
    expected = {row["id"]: row for row in cases}
    picked: dict[str, tuple[str, dict]] = {}
    for source_id in source_ids:
        manifest_path = RUNS / source_id / "run.json"
        if not manifest_path.is_file():
            raise SystemExit(f"来源 run 不存在: {source_id}")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for row in manifest.get("results", []):
            case_id = row.get("id")
            workflow = row.get("workflow")
            if case_id not in expected or workflow != expected[case_id]["workflow"]:
                continue
            current_hash = sha256(WORKFLOWS / workflow)
            if row.get("status") == "complete" and row.get("ok") is True \
                    and row.get("skill_hash") == current_hash:
                picked[case_id] = (source_id, row)
    missing = [row["id"] for row in cases if row["id"] not in picked]
    if missing:
        raise SystemExit("没有当前 skill hash 的通过结果: " + ", ".join(missing))

    target.mkdir(parents=True)
    results = []
    inherited_reviews = []
    reviews = load_reviews()
    for case in cases:
        source_id, row = picked[case["id"]]
        source = RUNS / source_id / row["workflow"] / row["id"]
        dest = target / row["workflow"] / row["id"]
        shutil.copytree(source, dest, copy_function=_link_or_copy)
        promoted = dict(row)
        promoted["source_run"] = source_id
        write_json(dest / "result.json", promoted)
        results.append(promoted)
        source_key = f"{source_id}/{row['workflow']}/{row['id']}"
        review = reviews.get(source_key) or {}
        if review.get("decision") in {"accept", "revise"} \
                and review.get("skill_hash") == row.get("skill_hash"):
            inherited = dict(review)
            inherited["inherited_from"] = source_key
            inherited_reviews.append((
                f"{run_id}/{row['workflow']}/{row['id']}", inherited
            ))
    models = sorted({row.get("model", "") for row in results})
    write_json(target / "run.json", {
        "run_id": run_id,
        "model": models[0] if len(models) == 1 else models,
        "created_at": now(),
        "status": "complete",
        "source_runs": source_ids,
        "results": results,
    })
    if inherited_reviews:
        with REVIEW_LOCK:
            reviews = load_reviews()
            reviews.update(dict(inherited_reviews))
            write_json(REVIEWS, reviews)
    return target / "run.json"


def run_many(args) -> None:
    rows = choose_cases(args)
    run_id = args.run_id or datetime.now().strftime("%Y%m%d-%H%M%S")
    run_root = RUNS / run_id
    run_root.mkdir(parents=True, exist_ok=True)
    workflow_root = Path(args.workflows).resolve()
    if not workflow_root.is_dir():
        raise SystemExit(f"workflow root 不存在: {workflow_root}")
    missing = sorted({row["workflow"] for row in rows
                      if not (workflow_root / row["workflow"] / "SKILL.md").is_file()})
    if missing:
        raise SystemExit("workflow root 缺少: " + ", ".join(missing))
    llm.override(name=args.model)
    print(f"run={run_id} model={args.model} cases={len(rows)} jobs={args.jobs} "
          f"loop=core.builder.build_one workflows={workflow_root}")
    manifest = {
        "run_id": run_id, "model": args.model, "created_at": now(), "status": "running",
        "agent_loop": "core.builder.build_one", "workflow_root": str(workflow_root),
        "results": [{
            "id": row["id"], "workflow": row["workflow"], "title": row["title"],
            "kind": row.get("kind", ""), "task": row["task"],
            "interactive": bool(row.get("interactive")), "model": args.model,
            "status": "queued", "ok": False, "smoke_ok": False,
            "artifact": f"{row['workflow']}/{row['id']}/pages/index.html",
        } for row in rows],
    }
    write_json(run_root / "run.json", manifest)
    results = []
    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        futures = {
            pool.submit(run_case, row, run_root, args.model, args.effort, workflow_root): row
            for row in rows
        }
        for fut in as_completed(futures):
            row = futures[fut]
            try:
                result = fut.result()
            except Exception as exc:
                result = {"id": row["id"], "workflow": row["workflow"], "ok": False,
                          "error": f"{type(exc).__name__}: {exc}"}
            results.append(result)
            merged = {x["id"]: x for x in manifest["results"]}
            merged[result["id"]] = result
            manifest["results"] = sorted(merged.values(), key=lambda x: x["id"])
            write_json(run_root / "run.json", manifest)
            print(f"  {'✓' if result.get('ok') else '✗'} {row['id']} "
                  f"{result.get('seconds', 0):.1f}s {result.get('error', '')}", flush=True)
    manifest["status"] = "complete"
    manifest["results"] = sorted(results, key=lambda x: x["id"])
    write_json(run_root / "run.json", manifest)
    print(f"结果: {run_root / 'run.json'}")
    print(f"预览: python3 {HERE / 'lab.py'} serve --run {run_id} --port 4176")


def validate() -> int:
    errors = []
    names = workflow_names()
    cases = load_cases()
    catalog = yaml.safe_load(CATALOG.read_text(encoding="utf-8")) or {}
    listed = [x["name"] for x in catalog.get("workflows") or []]
    if names != sorted(listed):
        errors.append(f"catalog workflow 不一致: dirs={names}, catalog={sorted(listed)}")
    old = {p.name for p in (ROOT / "legacy/notale-v2/vendor-skills").iterdir() if (p / "SKILL.md").is_file()}
    accounted = {
        source for row in catalog.get("workflows") or [] for source in row.get("sources") or []
    } | {row["name"] for row in catalog.get("not_imported") or []}
    if old != accounted:
        errors.append(
            f"旧 skill 迁移表不完备: missing={sorted(old-accounted)}, extra={sorted(accounted-old)}"
        )
    counts = {n: 0 for n in names}
    ids = set()
    for row in cases:
        if row.get("id") in ids:
            errors.append(f"重复 case id: {row.get('id')}")
        ids.add(row.get("id"))
        if row.get("workflow") not in counts:
            errors.append(f"case {row.get('id')} 指向未知 workflow {row.get('workflow')}")
        else:
            counts[row["workflow"]] += 1
    for name, count in counts.items():
        if count != 2:
            errors.append(f"{name} 需要正好 2 个 case，当前 {count}")
        text = (WORKFLOWS / name / "SKILL.md").read_text(encoding="utf-8")
        if "TODO" in text:
            errors.append(f"{name}/SKILL.md 仍有 TODO")
        for ref in re.findall(r"\]\((references/[^)]+)\)", text):
            if not (WORKFLOWS / name / ref).is_file():
                errors.append(f"{name} 缺 reference: {ref}")
        agent = yaml.safe_load((WORKFLOWS / name / "agents/openai.yaml").read_text())
        default = ((agent or {}).get("interface") or {}).get("default_prompt", "")
        if f"${name}" not in default:
            errors.append(f"{name}/agents/openai.yaml default_prompt 未显式写 ${name}")
        validator = CORE_SKILL_CREATOR / "scripts" / "quick_validate.py"
        import subprocess
        proc = subprocess.run([sys.executable, str(validator), str(WORKFLOWS / name)],
                              capture_output=True, text=True)
        if proc.returncode:
            errors.append(f"{name} validator: {(proc.stdout + proc.stderr).strip()}")
    if errors:
        print("\n".join("✗ " + e for e in errors))
        return 1
    print(f"✓ {len(names)} workflows；{len(cases)} cases；metadata/reference/validator 全部通过")
    return 0


def load_reviews() -> dict:
    if not REVIEWS.is_file():
        return {}
    try:
        return json.loads(REVIEWS.read_text(encoding="utf-8"))
    except Exception:
        return {}


def latest_run() -> str:
    rows = sorted(p.name for p in RUNS.iterdir() if (p / "run.json").is_file()) if RUNS.exists() else []
    if not rows:
        raise SystemExit("还没有可预览的 run")
    return rows[-1]


def gallery(run_id: str) -> str:
    manifest = json.loads((RUNS / run_id / "run.json").read_text(encoding="utf-8"))
    reviews = load_reviews()
    cards = []
    for row in manifest["results"]:
        key = f"{run_id}/{row['workflow']}/{row['id']}"
        review = reviews.get(key) or {}
        current_hash = sha256(WORKFLOWS / row["workflow"])
        artifact_current = row.get("skill_hash") == current_hash
        fresh = artifact_current and review.get("skill_hash") == row.get("skill_hash")
        decision = review.get("decision") if fresh else "pending"
        artifact = f"/artifacts/{run_id}/{row['artifact']}"
        shot = ""
        if row.get("screenshot"):
            base = Path(row["artifact"]).parent.parent
            shot_path = base / row["screenshot"]
            shot = f'<img src="/artifacts/{run_id}/{html.escape(str(shot_path))}" alt="最终截图">'
        cards.append(f"""
<article class="card" data-key="{html.escape(key)}">
  <header><div><span class="kind">{html.escape(row.get('kind',''))}</span>
  <h2>{html.escape(row['workflow'])} · {html.escape(row['title'])}</h2></div>
  <span class="status {html.escape(decision or 'pending')}">{html.escape(decision or 'pending')}</span></header>
  <p>{html.escape(row['task'])}</p>
  <div class="meta">model {html.escape(row.get('model',''))} · smoke {'✓' if row.get('smoke_ok') else '✗'} · {row.get('seconds',0)}s</div>
  <div class="views">{shot}<iframe src="{artifact}" title="live preview"></iframe></div>
  <textarea placeholder="接受理由或修改意见">{html.escape(review.get('note','') if fresh else '')}</textarea>
  <div class="actions"><button data-decision="accept">接受</button><button data-decision="revise">需要修改</button></div>
</article>""")
    return f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Workflow Skill Review · {html.escape(run_id)}</title><style>
:root{{--bg:#101113;--panel:#181a1f;--line:#30343c;--text:#f1f3f5;--muted:#9aa2ad;--accent:#70d6b3}}*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif}}main{{width:min(1500px,96vw);margin:32px auto}}
h1{{font-size:28px;margin:0 0 6px}}.lead{{color:var(--muted);margin:0 0 28px}}.grid{{display:grid;gap:24px}}
.card{{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px}}header{{display:flex;justify-content:space-between;gap:24px;align-items:start}}
h2{{font-size:18px;margin:4px 0}}.kind,.meta{{color:var(--muted);font-size:13px}}.status{{padding:4px 10px;border:1px solid var(--line);border-radius:99px}}
.status.accept{{color:#70d6b3;border-color:#397b67}}.status.revise{{color:#ff9b8f;border-color:#87483f}}.views{{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}}
.views img,.views iframe{{width:100%;aspect-ratio:16/9;border:1px solid var(--line);background:#08090a;border-radius:8px;object-fit:contain}}textarea{{width:100%;min-height:72px;background:#101216;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:10px}}
.actions{{display:flex;gap:10px;margin-top:10px}}button{{border:1px solid var(--line);background:#242830;color:var(--text);border-radius:8px;padding:8px 14px;cursor:pointer}}button:first-child{{background:#174f40;border-color:#397b67}}
@media(max-width:900px){{.views{{grid-template-columns:1fr}}}}
</style></head><body><main><h1>Workflow Skill 人工验收</h1><p class="lead">run {html.escape(run_id)} · 每个结果都需人工确认；skill 内容改变后确认自动失效。</p><section class="grid">{''.join(cards)}</section></main>
<script>document.addEventListener('click',async e=>{{const b=e.target.closest('button[data-decision]');if(!b)return;const card=b.closest('.card');const note=card.querySelector('textarea').value;const r=await fetch('/api/review',{{method:'POST',headers:{{'content-type':'application/json'}},body:JSON.stringify({{key:card.dataset.key,decision:b.dataset.decision,note}})}});const d=await r.json();if(!r.ok){{alert(d.error||'保存失败');return}}const s=card.querySelector('.status');s.textContent=d.decision;s.className='status '+d.decision;}});</script></body></html>"""


class ReviewHandler(BaseHTTPRequestHandler):
    run_id = ""

    def send_bytes(self, data: bytes, content_type: str, status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == "/":
            return self.send_bytes(gallery(self.run_id).encode(), "text/html; charset=utf-8")
        prefix = f"/artifacts/{self.run_id}/"
        if path.startswith(prefix):
            rel = path[len(prefix):]
            root = (RUNS / self.run_id).resolve()
            file = (root / rel).resolve()
            if root not in file.parents or not file.is_file():
                return self.send_bytes(b"not found", "text/plain", 404)
            return self.send_bytes(file.read_bytes(), mimetypes.guess_type(file.name)[0] or "application/octet-stream")
        self.send_bytes(b"not found", "text/plain", 404)

    def do_POST(self):
        if urlparse(self.path).path != "/api/review":
            return self.send_bytes(b'{"error":"not found"}', "application/json", 404)
        try:
            size = int(self.headers.get("content-length", "0"))
            data = json.loads(self.rfile.read(size) or b"{}")
            key, decision = data.get("key", ""), data.get("decision", "")
            if decision not in {"accept", "revise"} or not key.startswith(self.run_id + "/"):
                raise ValueError("invalid review")
            _, workflow, case_id = key.split("/", 2)
            result_path = RUNS / self.run_id / workflow / case_id / "result.json"
            result = json.loads(result_path.read_text(encoding="utf-8"))
            if result.get("status") != "complete":
                raise ValueError("案例尚未生成完成，不能确认")
            with REVIEW_LOCK:
                reviews = load_reviews()
                reviews[key] = {"decision": decision, "note": str(data.get("note", ""))[:4000],
                                "skill_hash": result["skill_hash"], "reviewed_at": now()}
                tmp = REVIEWS.with_suffix(".tmp")
                tmp.write_text(json.dumps(reviews, ensure_ascii=False, indent=2), encoding="utf-8")
                os.replace(tmp, REVIEWS)
            self.send_bytes(json.dumps(reviews[key], ensure_ascii=False).encode(), "application/json")
        except Exception as exc:
            self.send_bytes(json.dumps({"error": str(exc)}).encode(), "application/json", 400)

    def log_message(self, fmt, *args):
        print("[preview] " + fmt % args)


def serve(args) -> None:
    run_id = args.run or latest_run()
    if not (RUNS / run_id / "run.json").is_file():
        raise SystemExit(f"run 不存在: {run_id}")
    ReviewHandler.run_id = run_id
    server = ThreadingHTTPServer((args.host, args.port), ReviewHandler)
    print(f"Workflow Skill Review: http://{args.host}:{args.port}/  (run={run_id})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


def list_all() -> None:
    cases = load_cases()
    for name in workflow_names():
        related = [x for x in cases if x["workflow"] == name]
        print(name)
        for row in related:
            print(f"  {row['id']}: {row['title']} [{row.get('kind','')}]")


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    sub.add_parser("validate")
    run = sub.add_parser("run")
    run.add_argument("--all", action="store_true")
    run.add_argument("--skill", action="append")
    run.add_argument("--case", action="append")
    run.add_argument("--model", default=MODEL)
    run.add_argument("--effort", default="medium")
    run.add_argument("--jobs", type=int, default=4)
    run.add_argument("--run-id")
    run.add_argument("--workflows", default=str(WORKFLOWS),
                     help="workflow 根目录；Agent 循环始终复用 core.builder.build_one")
    assemble = sub.add_parser("assemble")
    assemble.add_argument("--from-run", action="append", required=True)
    assemble.add_argument("--run-id", required=True)
    preview = sub.add_parser("serve")
    preview.add_argument("--run")
    preview.add_argument("--host", default="127.0.0.1")
    preview.add_argument("--port", type=int, default=4176)
    args = parser.parse_args()
    if args.command == "list":
        list_all()
        return 0
    if args.command == "validate":
        return validate()
    if args.command == "run":
        run_many(args)
        return 0
    if args.command == "assemble":
        path = assemble_runs(args.from_run, args.run_id)
        print(f"最终验收 run: {path}")
        print(f"预览: python3 {HERE / 'lab.py'} serve --run {args.run_id} --port 4176")
        return 0
    if args.command == "serve":
        serve(args)
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
