#!/usr/bin/env python3
"""Fresh, payload-matched AdaBoost Builder comparison for two model profiles."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import shutil
import subprocess
import sys
import time
from collections import Counter
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


HERE = Path(__file__).resolve().parent
V2 = HERE.parents[1]
FIXTURE = HERE / "fixtures" / "adaboost"
CHASSIS = V2 / "vendor" / "chassis"
BRIEF = V2 / "prompts" / "brief.md"
REVIEW = HERE / "dual-builder-review"
PAGES = ("page-01", "page-08", "page-12", "page-14")
TOTAL = 16
ARMS = {
    "sonnet": {
        "label": "adaboost-builder-sonnet5-low-20260831",
        "profile": "sonnet5-low",
        "title": "Sonnet 5 · low",
    },
    "deepseek": {
        "label": "adaboost-builder-deepseek-v4-flash-20260831",
        "profile": "deepseek-v4-flash-siliconflow",
        "title": "DeepSeek V4 Flash · low",
    },
}


def json_read(path: Path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else default


def skeleton(number: int) -> str:
    return f"""<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="assets/theme.css">
</head>
<body data-page="{number:02d}" data-total="{TOTAL}">
  <div id="stage"></div>
  <script src="assets/base.js"></script>
</body>
</html>
"""


def tree_hash(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def prepare_run(root: Path) -> str:
    if root.exists():
        raise FileExistsError(f"fresh comparison refuses existing run: {root}")
    pages = root / "pages"
    assets = pages / "assets"
    shutil.copytree(CHASSIS, assets)
    shutil.copy2(FIXTURE / "pages" / "assets" / "theme.css", assets / "theme.css")
    shutil.copytree(FIXTURE / "pages" / "plan", pages / "plan")
    for number in range(1, TOTAL + 1):
        (pages / f"page-{number:02d}.html").write_text(skeleton(number), encoding="utf-8")

    query = json_read(FIXTURE / "planner-input.json")["query"]
    template = BRIEF.read_text(encoding="utf-8")
    briefs = [
        {
            "description": f"Build page-{number:02d}",
            "prompt": template.format(query=query, pid=f"page-{number:02d}", total=TOTAL),
        }
        for number in range(1, TOTAL + 1)
    ]
    (root / "briefs.json").write_text(
        json.dumps(briefs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return tree_hash(root)


def prepare_pair() -> dict[str, str]:
    hashes = {}
    for arm, cfg in ARMS.items():
        hashes[arm] = prepare_run(V2 / "runs" / cfg["label"])
    if len(set(hashes.values())) != 1:
        raise RuntimeError(f"comparison payloads differ before model invocation: {hashes}")
    print(f"prepared two byte-matched runs · sha256 {next(iter(hashes.values()))}", flush=True)
    return hashes


def builder_command(cfg: dict) -> list[str]:
    command = [
        sys.executable,
        "-m",
        "core.builder",
        "--label",
        cfg["label"],
        "--profile",
        cfg["profile"],
        "--concurrency",
        str(len(PAGES)),
        "--rebuild",
    ]
    for pid in PAGES:
        command += ["--only", pid]
    return command


def run_pair() -> None:
    roots = {arm: V2 / "runs" / cfg["label"] for arm, cfg in ARMS.items()}
    if not all(root.is_dir() for root in roots.values()):
        prepare_pair()
    payload_hashes = {arm: tree_hash(root) for arm, root in roots.items()}
    if len(set(payload_hashes.values())) != 1:
        raise RuntimeError(f"runs are no longer payload-matched: {payload_hashes}")

    processes = {}
    logs = {}
    for arm, cfg in ARMS.items():
        log_path = roots[arm] / "builder.log"
        log = log_path.open("w", encoding="utf-8")
        logs[arm] = log
        processes[arm] = subprocess.Popen(
            builder_command(cfg), cwd=V2, stdout=log, stderr=subprocess.STDOUT, text=True
        )
        print(f"started {cfg['title']} · pid {processes[arm].pid} · {log_path}", flush=True)

    started = time.monotonic()
    try:
        while any(proc.poll() is None for proc in processes.values()):
            states = " · ".join(
                f"{arm}={'running' if proc.poll() is None else 'exit ' + str(proc.returncode)}"
                for arm, proc in processes.items()
            )
            print(f"{time.monotonic() - started:5.0f}s · {states}", flush=True)
            time.sleep(20)
    except KeyboardInterrupt:
        for proc in processes.values():
            if proc.poll() is None:
                proc.terminate()
        raise
    finally:
        for log in logs.values():
            log.close()

    failed = {arm: proc.returncode for arm, proc in processes.items() if proc.returncode}
    if failed:
        tails = []
        for arm in failed:
            text = (roots[arm] / "builder.log").read_text(encoding="utf-8", errors="replace")
            tails.append(f"\n[{arm}]\n" + "\n".join(text.splitlines()[-30:]))
        raise RuntimeError(f"builder arm failed: {failed}" + "".join(tails))
    make_review()


def context_text(step: dict) -> str:
    record = step.get("workflow_context") or {}
    samples = record.get("samples") or []
    sample_id = lambda row: row.get("id") or row.get("name") or "—"
    main = next((sample_id(row) for row in samples if row.get("role") == "main"), "—")
    aux = [sample_id(row) for row in samples if row.get("role") == "aux"]
    return f"{record.get('reference', '—')} · 主 {main} · 辅 {', '.join(aux) if aux else '—'}"


def tool_text(step: dict) -> str:
    counts = Counter(step.get("steps") or [])
    return " ".join(f"{name}×{count}" for name, count in counts.items()) or "—"


def card_metadata(arm: str, pid: str) -> str:
    cfg = ARMS[arm]
    root = V2 / "runs" / cfg["label"]
    manifest = json_read(root / "builder-manifest.json", {}) or {}
    step = (json_read(root / "steps.json", {}) or {}).get(pid, {})
    check_count = Counter(step.get("steps") or []).get("Check", 0)
    rows = (
        ("模型", manifest.get("model", cfg["title"])),
        ("Context", context_text(step)),
        ("工具", tool_text(step)),
        ("时间", f"{step.get('seconds', 0):.1f}s"),
        ("Token", f"in {step.get('tok_in', 0):,} · out {step.get('tok_out', 0):,}"),
        ("Check", f"{check_count} 次 · {'clean' if step.get('check_ok') else 'not clean'}"),
        ("视觉输入", "on" if manifest.get("visionInput") else "off（仅文本报告）"),
    )
    return "".join(
        f"<div><span>{html.escape(label)}</span>{html.escape(str(value))}</div>"
        for label, value in rows
    )


def make_review() -> Path:
    REVIEW.mkdir(parents=True, exist_ok=True)
    for arm, cfg in ARMS.items():
        link = REVIEW / arm
        if link.is_symlink():
            link.unlink()
        elif link.exists():
            raise FileExistsError(f"review projection is not a symlink: {link}")
        link.symlink_to(V2 / "runs" / cfg["label"] / "pages", target_is_directory=True)

    specs = {
        pid: (FIXTURE / "pages" / "plan" / f"p{pid.removeprefix('page-')}.md")
        .read_text(encoding="utf-8")
        .splitlines()[-1]
        for pid in PAGES
    }
    sections = []
    for pid in PAGES:
        cards = []
        for arm, cfg in ARMS.items():
            cards.append(
                f"""<article class="arm">
  <h3>{html.escape(cfg['title'])}</h3>
  <div class="meta">{card_metadata(arm, pid)}</div>
  <div class="viewport"><iframe src="{arm}/{pid}.html" title="{html.escape(cfg['title'])} {pid}"></iframe></div>
</article>"""
            )
        sections.append(
            f"<section><h2>{pid} <small>{html.escape(specs[pid])}</small></h2>"
            f"<div class=pair>{''.join(cards)}</div></section>"
        )
    document = f"""<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>AdaBoost Builder · 双模型</title>
<style>
*{{box-sizing:border-box}}html{{background:#ecebe7;color:#171716;font:14px/1.45 ui-sans-serif,system-ui,sans-serif}}
body{{margin:0}}header{{position:sticky;top:0;z-index:4;padding:18px 28px;background:#171716;color:#f7f5ef;display:flex;align-items:baseline;gap:20px}}
h1{{font-size:22px;margin:0;font-weight:650}}header p{{margin:0;color:#aaa79f}}main{{padding:22px 28px 60px;min-width:1100px}}
section{{margin:0 0 34px}}h2{{margin:0 0 10px;font-size:17px}}h2 small{{font-weight:450;color:#67645e;margin-left:8px}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}.arm{{min-width:0;background:#fff;border:1px solid #cbc9c2}}
.arm h3{{margin:0;padding:10px 13px;border-bottom:1px solid #ddd9d1;font-size:15px}}
.meta{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 16px;padding:9px 13px;background:#f6f5f1;color:#333}}
.meta div{{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}.meta span{{color:#858078;margin-right:6px}}
.viewport{{position:relative;width:100%;overflow:hidden;background:#111;aspect-ratio:16/9}}
iframe{{position:absolute;left:0;top:0;width:1600px;height:900px;border:0;transform-origin:0 0}}
</style></head><body><header><h1>AdaBoost Builder</h1><p>同一 fixture · 同一 workflow · low · 四页并发</p></header>
<main>{''.join(sections)}</main>
<script>
for(const box of document.querySelectorAll('.viewport')){{
 const frame=box.querySelector('iframe');
 new ResizeObserver(()=>{{frame.style.transform=`scale(${{box.clientWidth/1600}})`}}).observe(box);
}}
</script></body></html>"""
    (REVIEW / "index.html").write_text(document, encoding="utf-8")
    print(f"review ready: {REVIEW / 'index.html'}", flush=True)
    return REVIEW


def serve(port: int) -> None:
    make_review()
    os.chdir(REVIEW)
    server = ThreadingHTTPServer(("0.0.0.0", port), SimpleHTTPRequestHandler)
    print(f"serving http://127.0.0.1:{port}/", flush=True)
    server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("prepare")
    sub.add_parser("run")
    sub.add_parser("review")
    serve_parser = sub.add_parser("serve")
    serve_parser.add_argument("--port", type=int, default=4177)
    args = parser.parse_args()
    if args.command == "prepare":
        prepare_pair()
    elif args.command == "run":
        run_pair()
    elif args.command == "review":
        make_review()
    else:
        serve(args.port)


if __name__ == "__main__":
    main()
