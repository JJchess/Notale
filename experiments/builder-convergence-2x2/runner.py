#!/usr/bin/env python3
"""Isolated 2x2 screen for Builder convergence causes."""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import os
import re
import shutil
import statistics
import sys
import threading
import time
import traceback
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable

import yaml


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
V2 = REPO / "notale-v2"
SOURCE = V2 / "runs" / "net-s1"
LEGACY_SKILLS = V2 / "vendor" / "skills"
WORKFLOW_SKILLS = V2 / "experiments" / "workflow-skills" / "workflows"
CATALOG = V2 / "experiments" / "workflow-skills" / "catalog.yaml"
CASES_FILE = HERE / "cases.yaml"
RUNS = HERE / ".runs"

sys.path.insert(0, str(V2))

from core import llm  # noqa: E402
from core import skills as core_skills  # noqa: E402
from core import tools as core_tools  # noqa: E402
from core.builder import _replay, evict_images  # noqa: E402
from core.llm import respond, text_of  # noqa: E402


MODEL = "AWS-GPT-5.6-Terra"
EFFORT = "medium"
MAX_STEPS = 100
CONVERGENCE_TARGET = 32
MAX_SECONDS = 3600
WRITE_LOCK = threading.Lock()

ARMS = (
    {"id": "legacy-builder", "skill_mode": "legacy", "tool_mode": "builder"},
    {"id": "workflow-builder", "skill_mode": "workflow", "tool_mode": "builder"},
    {"id": "legacy-lab", "skill_mode": "legacy", "tool_mode": "lab"},
    {"id": "workflow-lab", "skill_mode": "workflow", "tool_mode": "lab"},
)

IDENTITY = """你是 Notale 的单页构建 agent，只负责一个 1600×900 HTML 页面。
按任务读契约、单页规划和指派的 Skill，再施工。使用当前可用的页面渲染/检查工具看真实画面并修订。
只修改任务指定的页面和它自己的沙箱，不修改 Skill、harness 或只读依赖。做完直接结束，不问问题。
""".strip()

RENDER_SPEC = {
    "type": "function",
    "name": "Render",
    "description": "真实渲染当前页面、返回精简检查报告和截图；after 可在截图前执行页面 JS。",
    "parameters": {
        "type": "object",
        "properties": {
            "after": {
                "type": "array",
                "items": {"type": "string"},
                "description": "依次执行的页面 JavaScript，用于查看交互后状态。",
            }
        },
        "additionalProperties": False,
    },
}

HARD_FAILURES = (
    "✗ JS 报错",
    "✗ console.error",
    "✗ 资源加载失败",
    "✗ 超出画布",
    "✗ 被裁",
    "Traceback",
    "TargetClosedError",
    "BrowserType.launch",
    "失败:",
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def append_jsonl(path: Path, value: dict) -> None:
    line = json.dumps(value, ensure_ascii=False) + "\n"
    with WRITE_LOCK:
        with path.open("a", encoding="utf-8") as f:
            f.write(line)


def sha256_path(path: Path) -> str:
    h = hashlib.sha256()
    files = [path] if path.is_file() else sorted(p for p in path.rglob("*") if p.is_file())
    for f in files:
        h.update(str(f.relative_to(path) if path.is_dir() else f.name).encode())
        h.update(b"\0")
        h.update(f.read_bytes())
        h.update(b"\0")
    return h.hexdigest()


def dependency_hashes() -> dict[str, str]:
    return {
        "llm": sha256_path(V2 / "core" / "llm.py"),
        "tools": sha256_path(V2 / "core" / "tools.py"),
        "source": sha256_path(SOURCE),
        "legacy_skills": sha256_path(LEGACY_SKILLS),
        "workflow_skills": sha256_path(WORKFLOW_SKILLS),
        "catalog": sha256_path(CATALOG),
    }


def load_cases() -> list[dict]:
    data = yaml.safe_load(CASES_FILE.read_text(encoding="utf-8")) or {}
    return list(data.get("cases") or [])


def load_catalog() -> dict[str, dict]:
    data = yaml.safe_load(CATALOG.read_text(encoding="utf-8")) or {}
    return {row["name"]: row for row in data.get("workflows") or []}


def arm_by_id(arm_id: str) -> dict:
    return next(a for a in ARMS if a["id"] == arm_id)


def assigned_skills(case: dict, arm: dict) -> tuple[Path, list[str]]:
    if arm["skill_mode"] == "workflow":
        return WORKFLOW_SKILLS, [case["workflow"]]
    row = load_catalog()[case["workflow"]]
    return LEGACY_SKILLS, list(row.get("sources") or [])


def tool_specs(mode: str) -> list[dict]:
    wanted = (
        {"Read", "Write", "Edit", "Patch", "Check", "Look", "Bash", "Skill"}
        if mode == "builder"
        else {"Read", "Write", "Edit", "Bash", "Skill"}
    )
    specs = [s for s in core_tools.specs() if s.get("name") in wanted]
    if mode == "lab":
        specs.append(RENDER_SPEC)
    return specs


def validate() -> list[str]:
    errors: list[str] = []
    cases = load_cases()
    catalog = load_catalog()
    if len(cases) != 8 or len({c.get("page") for c in cases}) != 8:
        errors.append("cases.yaml 必须包含 8 个不同页面")
    if len(cases) * len(ARMS) != 32:
        errors.append("矩阵必须是 8×4=32 个任务")
    expected = {
        "builder": {"Read", "Write", "Edit", "Patch", "Check", "Look", "Bash", "Skill"},
        "lab": {"Read", "Write", "Edit", "Bash", "Skill", "Render"},
    }
    for mode, names in expected.items():
        got = {s["name"] for s in tool_specs(mode)}
        if got != names:
            errors.append(f"{mode} 工具集不对: {sorted(got)}")
    briefs = SOURCE / "briefs.json"
    if not briefs.is_file():
        errors.append(f"缺少 {briefs}")
    for case in cases:
        workflow = case.get("workflow")
        if workflow not in catalog:
            errors.append(f"{case.get('page')} 的 workflow 不在 catalog: {workflow}")
            continue
        if not (WORKFLOW_SKILLS / workflow / "SKILL.md").is_file():
            errors.append(f"缺少 workflow: {workflow}")
        if not (SOURCE / "pages" / "plan" / case.get("spec", "")).is_file():
            errors.append(f"缺少单页规划: {case.get('spec')}")
        for name in catalog[workflow].get("sources") or []:
            if not (LEGACY_SKILLS / name / "SKILL.md").is_file():
                errors.append(f"缺少 legacy skill: {name}")
    return errors


def skeleton(page: str, total: int = 22) -> str:
    number = int(page.rsplit("-", 1)[1])
    return (
        '<!doctype html>\n<html lang="zh">\n<head>\n<meta charset="utf-8">\n'
        '<link rel="stylesheet" href="assets/base.css">\n'
        '<link rel="stylesheet" href="assets/theme.css">\n</head>\n'
        f'<body data-page="{number:02d}" data-total="{total:02d}">\n'
        '<div id="stage"></div>\n<script src="assets/base.js"></script>\n'
        '<script src="assets/lec.js"></script>\n</body>\n</html>\n'
    )


def scaffold(case: dict, target: Path) -> tuple[Path, Path]:
    workspace = target / "workspace"
    pages = workspace / "pages"
    (pages / "plan").mkdir(parents=True)
    shutil.copytree(SOURCE / "pages" / "assets", pages / "assets")
    shutil.copy2(SOURCE / "CONTRACT.md", workspace / "CONTRACT.md")
    shutil.copy2(SOURCE / "pages" / "plan" / case["spec"], pages / "plan" / case["spec"])
    shutil.copy2(SOURCE / "pages" / "plan" / "deck.md", pages / "plan" / "deck.md")
    page_path = pages / f"{case['page']}.html"
    page_path.write_text(skeleton(case["page"]), encoding="utf-8")
    return workspace, pages


def source_brief(page: str) -> str:
    rows = json.loads((SOURCE / "briefs.json").read_text(encoding="utf-8"))
    description = f"Build {page}"
    return next(row["prompt"] for row in rows if row["description"] == description)


def prompt_for(case: dict, arm: dict, workspace: Path, names: list[str]) -> str:
    prompt = source_brief(case["page"]).replace(str(SOURCE), str(workspace))
    bullets = "\n".join(f"  - {name}" for name in names)
    prompt = re.sub(
        r"规划为本页指派了以下技法文档。用 Skill 工具逐一读取后再施工：\n\n.*?\n\n把现有",
        "本实验为这一页指派了以下技法文档。开工前用 Skill 工具读取适用项：\n\n"
        + bullets + "\n\n把现有",
        prompt,
        flags=re.S,
    )
    prompt = re.sub(
        r"完成前用 `Check` 检查.*?有交互时，用 `after` 覆盖每个主要状态；只检查初始状态不算完成。",
        "完成前使用当前实验组提供的页面渲染/检查工具查看真实画面，"
        "修复 JS 错误、资源失败、越界与裁切。有交互时覆盖主要状态。",
        prompt,
        flags=re.S,
    )
    prompt = re.sub(
        r"修复时优先用 `Patch`.*?不要另写 Playwright 脚本。",
        "修复时从当前实验组的可用工具中选择合适的，不要另写 Playwright 脚本。",
        prompt,
        flags=re.S,
    )
    prompt = prompt.replace(
        "回复一行：本页做了什么；最后一次 `Check` 的结果。",
        "回复一行：本页做了什么；最后一次页面检查的结果。",
    )
    if str(SOURCE) in prompt:
        raise AssertionError("任务 prompt 仍泄漏生产 run 路径")
    return prompt


def compact_report(text: str) -> str:
    keep = []
    for line in text.splitlines():
        if any(key in line for key in (
            "截图 ", "JS 报错", "console.error", "资源加载失败", "超出画布",
            "被裁", "文字叠压", "画面占用", "Traceback", "TargetClosedError",
            "BrowserType.launch", "失败:"
        )):
            keep.append(line)
    return "\n".join(keep) or "渲染完成；详细审美判断留给盲评。"


def inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def dispatch(
    name: str,
    args: dict,
    pages: Path,
    page_name: str,
    skill_root: Path,
    allowed_skills: list[str],
    tool_mode: str,
):
    if name == "Skill" and args.get("skill") not in allowed_skills:
        return "本任务可读的 Skill 只有: " + "、".join(allowed_skills)
    if name in {"Write", "Edit"}:
        raw = args.get("file_path")
        target = Path(raw) if raw else Path("")
        if not target.is_absolute():
            target = pages / target
        if target.resolve() != (pages / page_name).resolve():
            return f"拒绝写入沙箱目标页之外的路径: {target}"
        args = {**args, "file_path": str(target)}
    if name in {"Patch", "Check", "Look"} and args.get("page") != page_name:
        return f"本任务只能操作 {page_name}"
    if name == "Bash":
        command = str(args.get("command") or "")
        writes_v2 = str(V2) in command and re.search(
            r"(?:^|[;&|]\s*)(?:rm|mv|cp|tee|truncate|chmod|chown|sed\s+-i)\b|>{1,2}\s*"
            + re.escape(str(V2)),
            command,
        )
        if writes_v2:
            return "拒绝通过 Bash 修改只读的 notale-v2 依赖"
    if name == "Render":
        out = core_tools.run(
            "Check", {"page": page_name, "after": args.get("after") or [], "shot": True},
            pages, skill_root,
        )
        if isinstance(out, core_tools.Out):
            return core_tools.Out(compact_report(out.text), out.images)
        return compact_report(str(out))
    return core_tools.run(name, args, pages, skill_root)


def summarized_args(name: str, raw: str) -> dict:
    try:
        args = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {"invalid_json": raw[:500]}
    out = dict(args)
    for key in ("content", "old_string", "new_string"):
        if key in out and isinstance(out[key], str):
            value = out[key]
            out[key] = {"chars": len(value), "sha256": hashlib.sha256(value.encode()).hexdigest()[:12]}
    if isinstance(out.get("command"), str) and len(out["command"]) > 500:
        out["command"] = out["command"][:500] + "…"
    if isinstance(out.get("edits"), list):
        out["edits"] = [{"old_chars": len(str(x.get("old", ""))),
                         "new_chars": len(str(x.get("new", "")))} for x in out["edits"]]
    return out


def tool_label(name: str, raw: str) -> str:
    args = summarized_args(name, raw)
    if name == "Skill":
        return f"Skill({args.get('skill', '?')})"
    if name in {"Read", "Write", "Edit"}:
        return f"{name}({Path(str(args.get('file_path', '?'))).name})"
    if name in {"Check", "Look", "Patch"}:
        return f"{name}({args.get('page', '?')})"
    return name


def external_check(pages: Path, page_name: str, skill_root: Path, target: Path) -> tuple[bool, str, str | None]:
    out = core_tools.run("Check", {"page": page_name, "after": [], "shot": True}, pages, skill_root)
    report = out.text if isinstance(out, core_tools.Out) else str(out)
    page_path = pages / page_name
    hard_ok = page_path.is_file() and page_path.stat().st_size > 1000 \
        and not any(mark in report for mark in HARD_FAILURES)
    shots = sorted((pages.parent / ".shots").glob("*.png"), key=lambda p: p.stat().st_mtime)
    screenshot = None
    if shots:
        final = target / "final.png"
        shutil.copy2(shots[-1], final)
        screenshot = str(final)
    return hard_ok, report, screenshot


def run_trial(
    case: dict,
    arm: dict,
    run_root: Path,
    model: str,
    effort: str,
    rebuild: bool = False,
    respond_fn: Callable = respond,
    do_external_check: bool = True,
) -> dict:
    target = run_root / arm["id"] / case["page"]
    result_file = target / "result.json"
    if result_file.is_file() and not rebuild:
        prior = json.loads(result_file.read_text(encoding="utf-8"))
        if prior.get("status") == "complete":
            return prior
        raise RuntimeError(f"{target} 有未完成尝试；用 --rebuild 显式重跑")
    if target.exists():
        if not inside(target, RUNS):
            raise RuntimeError(f"拒绝清理实验目录外的路径: {target}")
        shutil.rmtree(target)
    target.mkdir(parents=True)

    workspace, pages = scaffold(case, target)
    page_name = f"{case['page']}.html"
    skill_root, names = assigned_skills(case, arm)
    instructions = IDENTITY + "\n\n" + core_skills.assigned(names, skill_root)
    prompt = prompt_for(case, arm, workspace, names)
    specs = tool_specs(arm["tool_mode"])
    history: list = [{"role": "user", "content": prompt}]
    trace_file = target / "trace.jsonl"
    oneline_file = target / "trace.oneline.txt"
    tools_used: Counter = Counter()
    loaded: list[str] = []
    total_in = total_out = images = 0
    final_text = error = ""
    termination = ""
    started_at = now()
    t0 = time.time()

    running = {
        "status": "running", "page": case["page"], "arm": arm["id"],
        "workflow": case["workflow"], "assigned_skills": names,
        "model": model, "effort": effort, "started_at": started_at,
    }
    write_json(result_file, running)

    try:
        for step in range(1, MAX_STEPS + 1):
            if time.time() - t0 > MAX_SECONDS:
                termination = "max_seconds"
                error = f"超过 {MAX_SECONDS}s"
                break
            response = respond_fn(instructions, history, specs, effort, tag=f"{arm['id']}/{case['page']}")
            usage = getattr(response, "usage", None)
            total_in += int(getattr(usage, "input_tokens", 0) or 0)
            total_out += int(getattr(usage, "output_tokens", 0) or 0)
            calls = [x for x in response.output if getattr(x, "type", "") == "function_call"]
            final_text = text_of(response).strip()
            labels = [tool_label(c.name, c.arguments) for c in calls]
            row = {
                "step": step, "at": now(), "text": re.sub(r"\s+", " ", final_text)[:500],
                "tools": [{"name": c.name, "arguments": summarized_args(c.name, c.arguments)} for c in calls],
            }
            append_jsonl(trace_file, row)
            with oneline_file.open("a", encoding="utf-8") as f:
                summary = " ".join(re.sub(r"\s+", " ", final_text).split())[:180]
                f.write(f"{step:03d}  {' '.join(labels) if labels else 'STOP'}"
                        + (f"  | {summary}" if summary else "") + "\n")

            if not calls:
                termination = "no_tool_use"
                break

            history += [_replay(x.model_dump()) for x in response.output]
            for call in calls:
                tools_used[call.name] += 1
                try:
                    args = json.loads(call.arguments or "{}")
                except json.JSONDecodeError as exc:
                    history.append({"type": "function_call_output", "call_id": call.call_id,
                                    "output": f"arguments 不是合法 JSON: {exc}。请缩短后重试。"})
                    continue
                result = dispatch(call.name, args, pages, page_name, skill_root, names, arm["tool_mode"])
                allowed_skill = call.name == "Skill" and args.get("skill") in names
                if allowed_skill and args["skill"] not in loaded:
                    loaded.append(args["skill"])
                if isinstance(result, core_tools.Out):
                    output, returned_images = result.text, result.images
                else:
                    output, returned_images = str(result), []
                history.append({"type": "function_call_output", "call_id": call.call_id, "output": output})
                for media_type, data in returned_images:
                    history.append({"role": "user", "content": [{
                        "type": "input_image", "image_url": f"data:{media_type};base64,{data}"
                    }]})
                    images += 1
                evict_images(history)
        else:
            termination = "max_steps"
            error = f"达到 {MAX_STEPS} 次调用上限"
    except Exception as exc:  # noqa: BLE001
        termination = "exception"
        error = f"{type(exc).__name__}: {exc}"
        append_jsonl(trace_file, {"at": now(), "exception": traceback.format_exc()})

    hard_ok, check_report, screenshot = False, "测试模式未执行外部 Check", None
    if do_external_check:
        try:
            hard_ok, check_report, screenshot = external_check(pages, page_name, skill_root, target)
        except Exception as exc:  # noqa: BLE001
            check_report = f"external Check 失败: {type(exc).__name__}: {exc}"

    calls_count = sum(1 for line in trace_file.read_text(encoding="utf-8").splitlines()
                      if line.strip() and '"step"' in line)
    source_inputs_hash = hashlib.sha256(
        ((SOURCE / "CONTRACT.md").read_bytes()
         + (SOURCE / "pages" / "plan" / case["spec"]).read_bytes())
    ).hexdigest()
    result = {
        "status": "complete", "page": case["page"], "arm": arm["id"],
        "skill_mode": arm["skill_mode"], "tool_mode": arm["tool_mode"],
        "workflow": case["workflow"], "cohort": case["cohort"],
        "historical_calls": case["historical_calls"], "assigned_skills": names,
        "loaded_skills": loaded, "loaded_any_skill": bool(loaded),
        "loaded_all_skills": set(loaded) == set(names), "model": model, "effort": effort,
        "calls": calls_count, "converged": termination == "no_tool_use",
        "within_32": termination == "no_tool_use" and calls_count <= CONVERGENCE_TARGET,
        "termination": termination, "error": error, "seconds": round(time.time() - t0, 1),
        "input_tokens": total_in, "output_tokens": total_out,
        "tool_counts": dict(sorted(tools_used.items())), "images_to_model": images,
        "hard_ok": hard_ok, "check_report": check_report,
        "page_bytes": (pages / page_name).stat().st_size if (pages / page_name).is_file() else 0,
        "final_text": final_text, "artifact": str((pages / page_name).relative_to(run_root)),
        "screenshot": str(Path(screenshot).relative_to(run_root)) if screenshot else None,
        "source_inputs_hash": source_inputs_hash,
        "skill_hash": sha256_path(skill_root / names[0]) if len(names) == 1 else
                      hashlib.sha256("".join(sha256_path(skill_root / n) for n in names).encode()).hexdigest(),
        "started_at": started_at, "finished_at": now(),
    }
    write_json(result_file, result)
    print(f"  {case['page']} {arm['id']:<16} calls={calls_count:>3} "
          f"term={termination:<11} skill={len(loaded)}/{len(names)} "
          f"check={'ok' if hard_ok else 'FAIL'}", flush=True)
    return result


def load_results(run_root: Path) -> list[dict]:
    rows = []
    for result in sorted(run_root.glob("*/*/result.json")):
        row = json.loads(result.read_text(encoding="utf-8"))
        if row.get("status") == "complete":
            rows.append(row)
    return rows


def arm_stats(rows: list[dict]) -> list[dict]:
    out = []
    for arm in ARMS:
        group = [r for r in rows if r["arm"] == arm["id"]]
        calls = [int(r["calls"]) for r in group]
        out.append({
            "arm": arm["id"], "n": len(group),
            "calls_median": statistics.median(calls) if calls else None,
            "calls_mean": round(statistics.mean(calls), 2) if calls else None,
            "within_32": sum(bool(r["within_32"]) for r in group),
            "over_32": sum(int(r["calls"]) > CONVERGENCE_TARGET for r in group),
            "max_steps": sum(r["termination"] == "max_steps" for r in group),
            "hard_ok": sum(bool(r["hard_ok"]) for r in group),
            "loaded_any": sum(bool(r["loaded_any_skill"]) for r in group),
        })
    return out


def contrast(rows: list[dict], candidate: str, baseline: str) -> dict:
    by = {(r["arm"], r["page"]): r for r in rows}
    pages = sorted({r["page"] for r in rows})
    pairs = [(by[(candidate, p)], by[(baseline, p)]) for p in pages
             if (candidate, p) in by and (baseline, p) in by]
    wins = sum(a["calls"] < b["calls"] for a, b in pairs)
    ties = sum(a["calls"] == b["calls"] for a, b in pairs)
    hard_candidate = sum(bool(a["hard_ok"]) for a, _ in pairs)
    hard_baseline = sum(bool(b["hard_ok"]) for _, b in pairs)
    return {
        "candidate": candidate, "baseline": baseline, "n": len(pairs),
        "call_wins": wins, "ties": ties,
        "paired_call_delta": sum(a["calls"] - b["calls"] for a, b in pairs),
        "hard_ok_candidate": hard_candidate, "hard_ok_baseline": hard_baseline,
        "screening_pass": len(pairs) == 8 and wins >= 6 and hard_candidate >= hard_baseline,
    }


def summarize(run_root: Path, rows: list[dict]) -> dict:
    contrasts = [
        contrast(rows, "workflow-builder", "legacy-builder"),
        contrast(rows, "workflow-lab", "legacy-lab"),
        contrast(rows, "legacy-lab", "legacy-builder"),
        contrast(rows, "workflow-lab", "workflow-builder"),
    ]
    return {"generated_at": now(), "n": len(rows), "arms": arm_stats(rows), "contrasts": contrasts}


CSV_FIELDS = (
    "page", "arm", "skill_mode", "tool_mode", "workflow", "cohort", "historical_calls",
    "calls", "converged", "within_32", "termination", "seconds", "input_tokens",
    "output_tokens", "loaded_any_skill", "loaded_all_skills", "hard_ok", "page_bytes",
)


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def report(run_root: Path) -> tuple[Path, Path]:
    rows = load_results(run_root)
    summary = summarize(run_root, rows)
    write_json(run_root / "summary.json", summary)
    write_csv(run_root / "results.csv", rows)
    by = {(r["page"], r["arm"]): r for r in rows}
    cases = load_cases()

    arm_rows = "".join(
        "<tr>" + "".join(f"<td>{html.escape(str(s.get(k, '')))}</td>" for k in
                           ("arm", "n", "calls_median", "calls_mean", "within_32", "over_32",
                            "max_steps", "hard_ok", "loaded_any")) + "</tr>"
        for s in summary["arms"]
    )
    contrast_rows = "".join(
        "<tr>" + "".join(
            f"<td>{html.escape(str(value))}</td>" for value in (
                c["candidate"], c["baseline"], c["call_wins"], c["ties"],
                c["paired_call_delta"], c["hard_ok_candidate"], c["hard_ok_baseline"],
                "PASS" if c["screening_pass"] else "—",
            )
        ) + "</tr>"
        for c in summary["contrasts"]
    )
    cards = []
    for case in cases:
        cells = []
        for arm in ARMS:
            r = by.get((case["page"], arm["id"]))
            if not r:
                cells.append("<article class='missing'>missing</article>")
                continue
            shot = html.escape(r.get("screenshot") or "")
            artifact = html.escape(r["artifact"])
            cells.append(
                f"<article><h3>{html.escape(arm['id'])}</h3>"
                f"<p>{r['calls']} calls · {html.escape(r['termination'])} · "
                f"skill {len(r['loaded_skills'])}/{len(r['assigned_skills'])} · "
                f"check {'ok' if r['hard_ok'] else 'FAIL'}</p>"
                + (f"<img src='{shot}' alt='final screenshot'>" if shot else "")
                + f"<a href='{artifact}' target='_blank'>open page</a></article>"
            )
        cards.append(f"<section><h2>{case['page']} · {case['workflow']}</h2><div class='grid'>"
                     + "".join(cells) + "</div></section>")
    css = """
    :root{font-family:Inter,system-ui,sans-serif;color:#18202b;background:#f4f1e9}
    body{margin:0;padding:28px}h1{margin:0 0 8px}table{border-collapse:collapse;background:white}
    th,td{padding:8px 11px;border:1px solid #ccd1d8;text-align:right}th:first-child,td:first-child{text-align:left}
    section{margin:34px 0}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
    article{background:white;border:1px solid #ccd1d8;border-radius:8px;padding:10px;box-shadow:0 5px 18px #18202b12}
    article h3{margin:0}article p{min-height:36px;font-size:13px;color:#586171}img{width:100%;aspect-ratio:16/9;object-fit:contain;background:#111}
    a{display:inline-block;margin-top:8px;color:#175ec8}@media(max-width:1100px){.grid{grid-template-columns:repeat(2,1fr)}}
    """
    report_html = f"""<!doctype html><meta charset='utf-8'><title>2x2 convergence report</title>
    <style>{css}</style><h1>Builder convergence 2×2</h1><p>{len(rows)}/32 complete · <a href='review.html'>blind review</a></p>
    <table><thead><tr><th>arm</th><th>n</th><th>median</th><th>mean</th><th>≤32</th><th>&gt;32</th><th>max100</th><th>hard ok</th><th>skill loaded</th></tr></thead>
    <tbody>{arm_rows}</tbody></table>
    <h2>Paired contrasts</h2><table><thead><tr><th>candidate</th><th>baseline</th><th>wins / 8</th><th>ties</th><th>total call Δ</th><th>candidate check</th><th>baseline check</th><th>screen</th></tr></thead>
    <tbody>{contrast_rows}</tbody></table>{''.join(cards)}"""
    (run_root / "report.html").write_text(report_html, encoding="utf-8")

    review_sections = []
    blind_map = {}
    for case in cases:
        order = sorted(
            [a["id"] for a in ARMS],
            key=lambda a: hashlib.sha256(f"{run_root.name}/{case['page']}/{a}".encode()).hexdigest(),
        )
        blind_map[case["page"]] = {chr(65 + i): arm for i, arm in enumerate(order)}
        variants = []
        for i, arm_id in enumerate(order):
            r = by.get((case["page"], arm_id))
            if not r:
                continue
            code = chr(65 + i)
            shot = html.escape(r.get("screenshot") or "")
            artifact = html.escape(r["artifact"])
            variants.append(
                f"<article><h3>Variant {code}</h3>"
                + (f"<img src='{shot}' alt='Variant {code}'>" if shot else "")
                + f"<p><a href='{artifact}' target='_blank'>interactive page</a></p>"
                f"<button onclick=\"rate('{case['page']}','{code}','accept')\">accept</button> "
                f"<button onclick=\"rate('{case['page']}','{code}','revise')\">revise</button>"
                f" <span id='{case['page']}-{code}'></span></article>"
            )
        review_sections.append(f"<section><h2>{case['page']}</h2><div class='grid'>"
                               + "".join(variants) + "</div></section>")
    write_json(run_root / "blind-map.json", blind_map)
    review_html = f"""<!doctype html><meta charset='utf-8'><title>Blind review</title><style>{css}
    button{{padding:6px 10px}}</style><h1>Blind visual review</h1><p>Arm 名已隐去；评价保存在当前浏览器 localStorage。
    <button onclick='exportRatings()'>Export ratings JSON</button></p>{''.join(review_sections)}
    <script>const key='notale-2x2-{html.escape(run_root.name)}';let ratings=JSON.parse(localStorage.getItem(key)||'{{}}');
    function paint(){{for(const [k,v] of Object.entries(ratings)){{const e=document.getElementById(k);if(e)e.textContent=v}}}}
    function rate(page,variant,value){{ratings[page+'-'+variant]=value;localStorage.setItem(key,JSON.stringify(ratings));paint()}}
    function exportRatings(){{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(ratings,null,2)],{{type:'application/json'}}));a.download='ratings.json';a.click()}}paint();</script>"""
    (run_root / "review.html").write_text(review_html, encoding="utf-8")
    return run_root / "report.html", run_root / "review.html"


def run_all(args) -> Path:
    errors = validate()
    if errors:
        raise SystemExit("\n".join("✗ " + e for e in errors))
    llm.override(name=args.model)
    run_root = RUNS / args.run_id
    run_root.mkdir(parents=True, exist_ok=True)
    before = dependency_hashes()
    selected_cases = [c for c in load_cases() if not args.case or c["page"] in set(args.case)]
    selected_arms = [a for a in ARMS if not args.arm or a["id"] in set(args.arm)]
    manifest = {
        "run_id": args.run_id, "status": "running", "model": args.model,
        "effort": args.effort, "max_steps": MAX_STEPS, "max_seconds": MAX_SECONDS,
        "convergence_target": CONVERGENCE_TARGET, "dependencies_before": before,
        "cases": [c["page"] for c in selected_cases], "arms": [a["id"] for a in selected_arms],
        "started_at": now(),
    }
    write_json(run_root / "run.json", manifest)

    # 同一页的四个 arm 同时跑，再转下一页，避免端点时段成为 arm 偏差。
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for case in selected_cases:
            futures = [pool.submit(run_trial, case, arm, run_root, args.model, args.effort, args.rebuild)
                       for arm in selected_arms]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as exc:  # noqa: BLE001
                    print(f"  ✗ runner task crashed: {type(exc).__name__}: {exc}", flush=True)
            rows = load_results(run_root)
            manifest["completed"] = len(rows)
            write_json(run_root / "run.json", manifest)

    after = dependency_hashes()
    rows = load_results(run_root)
    manifest.update({
        "status": "complete", "completed": len(rows), "finished_at": now(),
        "dependencies_after": after, "dependencies_unchanged": before == after,
        "summary": summarize(run_root, rows),
    })
    write_json(run_root / "run.json", manifest)
    report(run_root)
    return run_root


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("validate")

    run = sub.add_parser("run")
    run.add_argument("--run-id", required=True)
    run.add_argument("--jobs", type=int, default=4)
    run.add_argument("--model", default=MODEL)
    run.add_argument("--effort", default=EFFORT)
    run.add_argument("--case", action="append", choices=[c["page"] for c in load_cases()])
    run.add_argument("--arm", action="append", choices=[a["id"] for a in ARMS])
    run.add_argument("--rebuild", action="store_true")

    rep = sub.add_parser("report")
    rep.add_argument("--run-id", required=True)

    serve = sub.add_parser("serve")
    serve.add_argument("--run-id", required=True)
    serve.add_argument("--host", default="0.0.0.0")
    serve.add_argument("--port", type=int, default=4176)

    args = parser.parse_args()
    if args.command == "validate":
        errors = validate()
        if errors:
            print("\n".join("✗ " + e for e in errors))
            return 1
        print("✓ 8 cases × 4 arms = 32 tasks")
        print("✓ Builder/Lab 工具集、Skill 映射与只读输入齐全")
        return 0
    if args.command == "run":
        root = run_all(args)
        print(f"\n完成: {root}\n报告: {root / 'report.html'}\n盲评: {root / 'review.html'}")
        return 0
    run_root = RUNS / args.run_id
    if not run_root.is_dir():
        raise SystemExit(f"找不到 run: {run_root}")
    if args.command == "report":
        out = report(run_root)
        print("\n".join(str(p) for p in out))
        return 0
    report(run_root)
    handler = partial(SimpleHTTPRequestHandler, directory=str(run_root))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"http://{args.host}:{args.port}/report.html", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
