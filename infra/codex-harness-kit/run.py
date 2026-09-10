#!/usr/bin/env python3
"""One fresh Codex experiment: prepare → capture → run → archive → measure."""
import argparse
import hashlib
import importlib.metadata
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import threading
import tomllib
from pathlib import Path

from capture.common import now, scrub, secrets_from_auth, sha256, write_json
from capture.collect import collect
from capture.pptx import inspect_pptx
from capture.assets import archive_generated_assets
from measure.trace import analyze

KIT = Path(__file__).resolve().parent


def binary(name):
    path = shutil.which(name)
    if not path:
        raise ValueError(f"required executable unavailable: {name}")
    return str(Path(path).absolute())


def bwrap_binary(codex):
    if shutil.which("bwrap"):
        return binary("bwrap")
    # npm Codex ships its own bwrap on Linux; no new system package needed.
    root = Path(codex).resolve().parents[1]
    options = list(root.glob("node_modules/@openai/codex-linux-*/vendor/*/codex-resources/bwrap"))
    if len(options) != 1:
        raise ValueError("bwrap unavailable; install bubblewrap (isolation never silently disabled)")
    return str(options[0])


def snapshot(root):
    result = {}
    for path in sorted(Path(root).rglob("*")):
        relative = str(path.relative_to(root))
        if ".git" in path.relative_to(root).parts:
            continue
        if path.is_symlink():
            result[relative] = {"symlink": os.readlink(path)}
        elif path.is_file():
            result[relative] = {"sha256": sha256(path), "bytes": path.stat().st_size}
    return result


def scrub_text_tree(root, secrets):
    """Scrub only the archival copy; binary assets and symlinks stay untouched."""
    for path in root.rglob("*"):
        if path.is_symlink() or not path.is_file():
            continue
        raw = path.read_bytes()
        if b"\x00" in raw:
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        clean = scrub(text, secrets)
        if clean != text:
            path.write_text(clean)


def environment(home):
    # No inherited application keys, CODEX_* routing, npm credentials, or shell RC.
    allowed = ("PATH", "TERM", "COLORTERM", "LANG", "LC_ALL", "TZ", "USER", "LOGNAME")
    env = {k: os.environ[k] for k in allowed if k in os.environ}
    env.update(HOME=str(home), CODEX_HOME=str(home / ".codex"),
               XDG_CONFIG_HOME=str(home / ".config"), XDG_CACHE_HOME=str(home / ".cache"),
               SHELL="/bin/bash")
    return env


def jail_command(bwrap, real_home, private_home, work, runtimes, resources, command, readonly=()):
    args = [bwrap, "--die-with-parent", "--unshare-user", "--unshare-pid", "--unshare-uts", "--unshare-ipc"]
    # Construct a new root from runtime trees, not a view of the whole host.
    for path in ("/usr", "/bin", "/sbin", "/lib", "/lib64", "/etc"):
        if Path(path).is_symlink():
            args += ["--symlink", os.readlink(path), path]
        elif Path(path).exists():
            args += ["--ro-bind", path, path]
    args += ["--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
             "--bind", str(private_home), str(real_home)]
    for path in sorted(set(runtimes + resources), key=lambda p: len(str(p))):
        args += ["--ro-bind", str(path), str(path)]
    args += ["--bind", str(work), str(work)]
    for path in readonly:
        args += ["--ro-bind", str(path), str(path)]
    args += ["--chdir", str(work), "--", *command]
    return args


def load_experiment(name):
    path = Path(name).resolve() if Path(name).is_file() else KIT / "experiments" / (name + ".toml")
    if not path.is_file():
        raise ValueError("experiment not found: " + name)
    cfg = tomllib.loads(path.read_text())
    def expand(value):
        return Path(os.path.expandvars(value.replace("{infra}", str(KIT.parent)))).expanduser().resolve()
    return cfg, expand


def run(args):
    os.umask(0o077)
    real_home = Path.home().resolve()
    codex = binary("codex")
    bwrap = bwrap_binary(codex)
    exp, expand = load_experiment(args.exp)
    pptx = inspect_pptx(args.pptx) if args.pptx else None
    if exp.get("input_kind") == "pptx" and pptx is None:
        raise ValueError("template2html requires --pptx /absolute/template.pptx")
    task = Path(args.task).resolve() if args.task else expand(exp["task"])
    if not task.is_file():
        raise ValueError(f"task missing: {task}")
    prompt = task.read_text()
    if not prompt.strip():
        raise ValueError("empty task")
    if len(prompt.encode()) > 100000 and not args.exec:
        raise ValueError("TUI prompt too large for argv; use --exec")
    label = args.label or f"{Path(args.exp).stem}-{time.strftime('%Y%m%d-%H%M%S')}-{os.getpid()}"
    if not all(c.isalnum() or c in "-_." for c in label) or label in (".", ".."):
        raise ValueError("label must be a simple directory name")
    out = (Path(args.runs).resolve() / label) if args.runs else KIT / "runs" / label
    work = (Path(args.work_base).resolve() if args.work_base else expand(exp["work_base"])) / label
    if out.exists() or work.exists():
        raise ValueError("run label/work directory already exists; choose a fresh label (nothing is reset)")
    if out == work or out in work.parents or work in out.parents:
        raise ValueError("work and archive must be separate trees")
    auth = Path(args.auth_file).resolve() if args.auth_file else real_home / ".codex/auth.json"
    if not auth.is_file():
        raise ValueError(f"login credentials unavailable: {auth}; log in with Codex first")
    auth_data = json.loads(auth.read_text())
    auth_mode = "chatgpt" if auth_data.get("tokens") else "api"
    upstream = args.upstream or ("https://chatgpt.com/backend-api/codex" if auth_mode == "chatgpt" else "https://api.openai.com/v1")
    resources = [expand(p) for p in exp.get("resources", [])] + [Path(p).resolve() for p in args.resource]
    runtimes = [p for p in (real_home / ".npm-global", real_home / "miniforge3") if p.exists()]
    runtimes += [Path(p).resolve() for p in args.runtime]
    runtimes += [expand(p) for p in exp.get("optional_runtimes", []) if expand(p).exists()]
    preset = Path(args.preset).resolve() if args.preset else expand(exp["preset"]) if exp.get("preset") else None
    for path in resources + runtimes:
        if not path.exists():
            raise ValueError(f"allowlisted path missing: {path}")
        if path == real_home or path in real_home.parents or path == KIT.parent or path == KIT:
            raise ValueError(f"allowlist exposes researcher home/kit: {path}")
        if path == out or path in out.parents or path == work or path in work.parents:
            raise ValueError(f"allowlist must not expose run/work ancestors: {path}")
    if preset and not preset.is_dir():
        raise ValueError("preset missing: " + str(preset))
    manifest = {"schema_version": 1, "label": label, "experiment": args.exp,
        "created_at": now(), "model": args.model, "effort": args.effort,
        "service_tier": args.service_tier, "mode": "exec" if args.exec else "tui",
        "capture_mode": "native-only" if args.native_only else "native+wire",
        "auth_mode": auth_mode, "upstream": upstream, "task_source": str(task),
        "task_sha256": sha256(task), "work": str(work), "archive": str(out),
        "input_pptx": pptx, "features_enabled": exp.get("features", []),
        "required_capabilities": exp.get("required_capabilities", []),
        "preset": str(preset) if preset else None,
        "resources": [str(p) for p in resources], "runtimes": [str(p) for p in runtimes],
        "isolation": "fresh bwrap root/home/tmp/pid; shared network; read-only allowlists; workspace-write Codex sandbox",
        "state": "planned", "errors": []}
    if args.dry_run:
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 0
    if not args.exec and not sys.stdin.isatty():
        raise ValueError("TUI needs a terminal; use --exec for automation")
    if not args.native_only:
        for dep in ("aiohttp", "zstandard"):
            manifest.setdefault("dependencies", {})[dep] = importlib.metadata.version(dep)
    out.mkdir(parents=True, exist_ok=False)
    private_home = out / ".private-home"
    codex_home = private_home / ".codex"
    codex_home.mkdir(parents=True)
    work.mkdir(parents=True, exist_ok=False)
    proxy = child = None
    watchdog_stop = threading.Event()
    watchdog = None
    secrets = secrets_from_auth(auth)
    previous_handlers = {}
    interrupted = None
    try:
        if preset:
            # Materialize preset links so the baseline does not silently change mid-run.
            shutil.copytree(preset, work, dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns(".claude", ".git", "auth.json"))
        readonly = []
        if pptx:
            (out / "inputs").mkdir()
            (work / "input").mkdir(exist_ok=True)
            archived_input = out / "inputs/template.pptx"
            subject_input = work / "input/template.pptx"
            if subject_input.exists() or subject_input.is_symlink():
                raise ValueError("preset must not already contain input/template.pptx")
            shutil.copyfile(pptx["source_path"], archived_input)
            if sha256(archived_input) != pptx["sha256"]:
                raise ValueError("PPTX changed during preparation; retry with a stable input")
            shutil.copyfile(archived_input, subject_input)
            readonly.append(subject_input)
            write_json(out / "input-pptx.json", pptx)
        subprocess.run(["git", "init", "--quiet", str(work)], check=True, capture_output=True)
        (out / "task.md").write_text(scrub(prompt, secrets))
        write_json(out / "initial-files.json", snapshot(work), secrets)
        shutil.copyfile(auth, codex_home / "auth.json")
        (codex_home / "auth.json").chmod(0o600)
        # Copy only catalog, never config, memories, rules, plugins, history, or state DBs.
        catalog = auth.parent / "models_cache.json"
        if catalog.is_file():
            shutil.copyfile(catalog, codex_home / catalog.name)
        config = [f'model = {json.dumps(args.model)}', f'model_reasoning_effort = {json.dumps(args.effort)}',
                  'sandbox_mode = "workspace-write"', 'approval_policy = "on-request"',
                  'cli_auth_credentials_store = "file"', 'check_for_update_on_startup = false']
        if args.service_tier:
            config += [f'service_tier = {json.dumps(args.service_tier)}']
        config += ['[features]', 'memories = false']
        for feature in exp.get("features", []):
            if feature != "image_generation":
                raise ValueError("unreviewed experiment feature: " + str(feature))
            config += [f'{feature} = true']
        (codex_home / "config.toml").write_text("\n".join(config) + "\n")
        shutil.copyfile(codex_home / "config.toml", out / "config.toml")
        env = environment(real_home)
        version_env = {**os.environ, "CODEX_HOME": str(codex_home)}
        manifest["codex_version"] = subprocess.check_output([codex, "--version"], env=version_env, text=True).strip()
        command = [codex]
        if args.exec:
            command += ["exec", "--json"]
        else:
            command += ["--no-alt-screen"]
        command += ["--strict-config", "-m", args.model, "-c", f'model_reasoning_effort={json.dumps(args.effort)}',
                    "-s", "workspace-write", "-C", str(work)]
        if not args.native_only:
            proxy_log = (out / "proxy.log").open("w")
            proxy = subprocess.Popen([sys.executable, str(KIT / "capture/proxy.py"), "--upstream", upstream,
                "--out", str(out / "wire"), "--ready", str(out / "proxy-ready.json"),
                "--auth-file", str(auth)], stdout=proxy_log, stderr=subprocess.STDOUT)
            proxy_log.close()
            deadline = time.monotonic() + 15
            while not (out / "proxy-ready.json").exists():
                if proxy.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError("proxy failed to start; inspect proxy.log")
                time.sleep(0.1)
            proxy_url = json.loads((out / "proxy-ready.json").read_text())["url"]
            command += ["-c", f'openai_base_url={json.dumps(proxy_url)}']
        command += ["-"] if args.exec else [prompt]
        # The command manifest references task.md; avoid duplicating prompt in metadata.
        manifest["argv"] = command[:-1] + ["<task.md via stdin>" if args.exec else "<task.md>"]
        jailed = jail_command(bwrap, real_home, private_home, work, runtimes, resources, command, readonly)
        # A real preflight executes in exactly the view that the subject will receive.
        preflight = jail_command(bwrap, real_home, private_home, work, runtimes, resources,
                                ["/bin/sh", "-c", 'test -r "$CODEX_HOME/auth.json" && test ! -e "$HOME/.claude" && test ! -e "$HOME/.agents" && test ! -e "$CODEX_HOME/history.jsonl"'], readonly)
        subprocess.run(preflight, env=env, cwd="/", check=True, capture_output=True)
        manifest.update(state="running", started_at=now())
        write_json(out / "manifest.json", manifest, secrets)
        print(f"Codex {args.model} / {args.effort} · {label}\n工作目录 {work}\n采集 {out}", flush=True)
        def forward(sig, frame):
            nonlocal interrupted
            interrupted = sig
            if child and child.poll() is None:
                child.send_signal(sig)
        for sig in (signal.SIGTERM, signal.SIGINT):
            previous_handlers[sig] = signal.signal(sig, forward)
        def watch_proxy():
            while not watchdog_stop.wait(0.5):
                if proxy and proxy.poll() is not None:
                    manifest["errors"].append("proxy exited while Codex was running; stopped subject to avoid retry contamination")
                    if child and child.poll() is None:
                        child.terminate()
                    return
        if args.exec:
            with (out / "events.jsonl").open("w") as stdout, (out / "stderr.log").open("w") as stderr:
                child = subprocess.Popen(jailed, env=env, cwd="/", stdin=subprocess.PIPE, stdout=stdout, stderr=stderr, text=True)
                if proxy:
                    watchdog = threading.Thread(target=watch_proxy, daemon=True)
                    watchdog.start()
                child.communicate(prompt)
        else:
            child = subprocess.Popen(jailed, env=env, cwd="/")
            if proxy:
                watchdog = threading.Thread(target=watch_proxy, daemon=True)
                watchdog.start()
            child.wait()
        manifest.update(exit_code=child.returncode, state="interrupted" if interrupted else
                        "exited" if child.returncode == 0 else "failed", signal=interrupted)
    except Exception as e:
        manifest.update(state="failed")
        manifest["errors"].append(type(e).__name__ + ": " + str(e))
        if isinstance(e, subprocess.CalledProcessError) and e.stderr:
            manifest["errors"].append(e.stderr.decode(errors="replace") if isinstance(e.stderr, bytes) else e.stderr)
    finally:
        watchdog_stop.set()
        if watchdog:
            watchdog.join()
        if child and child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        if proxy and proxy.poll() is None:
            proxy.terminate()
            try:
                proxy.wait(timeout=20)
            except subprocess.TimeoutExpired:
                proxy.kill()
                proxy.wait()
                manifest["errors"].append("proxy shutdown timed out; capture may be incomplete")
        for sig, handler in previous_handlers.items():
            signal.signal(sig, handler)
        try:
            collect(codex_home, out, secrets=secrets)
        except Exception as e:
            manifest["errors"].append("archive sessions: " + str(e))
        try:
            archive_generated_assets(codex_home, out)
        except Exception as e:
            manifest["errors"].append("archive generated assets: " + str(e))
        try:
            # Preserve links without traversing arbitrary paths created by the subject.
            shutil.copytree(work, out / "deliverable", symlinks=True,
                            ignore=shutil.ignore_patterns(".git", ".codex", ".claude", "auth.json"))
            write_json(out / "final-files.json", snapshot(work), secrets)
            scrub_text_tree(out / "deliverable", secrets)
            write_json(out / "deliverable-files.json", snapshot(out / "deliverable"), secrets)
            for name in ("events.jsonl", "stderr.log", "proxy.log"):
                path = out / name
                if path.is_file():
                    path.write_text(scrub(path.read_text(errors="replace"), secrets))
        except Exception as e:
            manifest["errors"].append("archive files: " + str(e))
        # Only the kit-created credential copy is removed; the user's auth remains untouched.
        (codex_home / "auth.json").unlink(missing_ok=True)
        manifest.update(ended_at=now(), finalized=True)
        write_json(out / "manifest.json", manifest, secrets)
        report = analyze(out)
        manifest["quality"] = {"native_sessions": len(report["sessions"]),
            "warnings": len(report["warnings"]), "wire_issues": len(report["wire"]["issues"]),
            "missing_wire_response_ids": len(report["missing_wire_response_ids"]),
            "schema_evidence_ready": bool(report["unique_usage_response_count"] and not args.native_only
                 and not report["missing_wire_response_ids"] and not report["wire"]["issues"]
                 and not report["warnings"] and not manifest["errors"] and manifest["state"] == "exited")}
        manifest["quality"]["required_capabilities_advertised"] = all(
            report["wire"]["capabilities"].get(name, {}).get("status") == "advertised"
            for name in manifest["required_capabilities"])
        write_json(out / "manifest.json", manifest, secrets)
    print(json.dumps({"archive": str(out), "state": manifest["state"], "quality": manifest["quality"],
                      "errors": manifest["errors"]}, ensure_ascii=False, indent=2))
    return 0 if manifest["state"] == "exited" and not manifest["errors"] and manifest["quality"]["native_sessions"] else 1


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("label", nargs="?")
    p.add_argument("--exp", default="template2html")
    p.add_argument("--pptx", help="source PowerPoint template; required for template2html")
    p.add_argument("--task")
    p.add_argument("--preset")
    p.add_argument("--runs")
    p.add_argument("--work-base")
    p.add_argument("--auth-file")
    p.add_argument("--upstream", help="explicit Responses base URL; default follows auth mode")
    p.add_argument("--model", default="gpt-6-astra")
    p.add_argument("--effort", default="high", choices=("low", "medium", "high", "xhigh", "max", "ultra"))
    p.add_argument("--service-tier", choices=("priority", "flex", "default"))
    p.add_argument("--resource", action="append", default=[])
    p.add_argument("--runtime", action="append", default=[])
    p.add_argument("--exec", action="store_true", help="headless JSONL mode; default is interactive TUI")
    p.add_argument("--native-only", action="store_true", help="no proxy; cannot establish request schema")
    p.add_argument("--dry-run", action="store_true", help="print preparation plan; no run dirs or model calls")
    try:
        raise SystemExit(run(p.parse_args()))
    except (ValueError, OSError, importlib.metadata.PackageNotFoundError) as e:
        p.exit(2, f"codex-kit: {e}\n")


if __name__ == "__main__":
    main()
