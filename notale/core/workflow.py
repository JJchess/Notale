"""The complete deterministic workflow: Planner -> parallel Builders -> deck."""

from __future__ import annotations

import asyncio
import hashlib
import json
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from notale.agents.builder import BuilderWorker, build_page
from notale.agents.loop import AgentBlocked
from notale.core.models import LecturePlan, PageArtifact, PageRunStatus
from notale.core.observability import EventLog, build_summary, write_summary
from notale.core.state import RunStore
from notale.core.stages.contract import (
    PLANNER_SKILL_CATALOG,
    SKILL_CATALOG,
    plan_lecture,
)
from notale.core.stages.page_check import make_fallback_page
from notale.roles.profiles import BUILDER, PLANNER
from notale.tools.agent_tools import OPTIONAL_PAGE_TOOLS
from notale.utils.config import CONFIG_PATH, get_config
from notale.utils.skill_catalog import GeneratedDesignSkill, load_generated_style
from notale.web.deck import write_deck_package


_CONFIG = get_config()


@dataclass
class GenerateResult:
    run_dir: Path
    deck_path: Path
    completed: list[str]
    degraded: list[str]
    usage: dict[str, int] = field(default_factory=dict)


def _atomic_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def _contract_hash() -> str:
    digest = hashlib.sha256()
    root = Path(__file__).resolve().parents[1]
    for path in (
        CONFIG_PATH,
        PLANNER.document_path,
        BUILDER.document_path,
        root / "core" / "models.py",
        root / "core" / "stages" / "contract.py",
        root / "core" / "stages" / "page_check.py",
        root / "agents" / "loop.py",
        root / "agents" / "builder.py",
        root / "tools" / "base.py",
        root / "tools" / "agent_tools.py",
        root / "tools" / "media.py",
        root / "utils" / "skill_catalog.py",
    ):
        if path is not None:
            digest.update(Path(path).read_bytes())
    digest.update(SKILL_CATALOG.sha256.encode())
    digest.update(PLANNER_SKILL_CATALOG.sha256.encode())
    return digest.hexdigest()


def _git_snapshot() -> dict[str, Any]:
    root = Path(__file__).resolve().parents[2]
    try:
        commit = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=root, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True,
        ).stdout.strip()
        status = subprocess.run(
            ["git", "status", "--short"], cwd=root, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True,
        ).stdout.splitlines()
        return {"commit": commit, "dirty": bool(status), "status": status}
    except (OSError, subprocess.CalledProcessError):
        return {"commit": "", "dirty": True, "status": ["git unavailable"]}


def _snapshot(logger: EventLog, llm: Any, contract_hash: str) -> None:
    logger.emit(
        "run.snapshot",
        raw=True,
        contract_hash=contract_hash,
        git=_git_snapshot(),
        config=_CONFIG.model_dump(mode="json"),
        model={
            "name": getattr(llm, "model", _CONFIG.model.name),
            "base_url": getattr(llm, "base_url", _CONFIG.model.base_url),
        },
        roles={
            role.name: {
                "sha256": role.document_sha256,
                "system_prompt": role.system_prompt,
                "tools": role.allowed_tools,
                "skills": role.skill_policy.metadata(),
            }
            for role in (PLANNER, BUILDER)
        },
        skills={
            "planner": PLANNER_SKILL_CATALOG.snapshot(),
            "builder": SKILL_CATALOG.snapshot(),
        },
        optional_tools=sorted(OPTIONAL_PAGE_TOOLS),
    )


def _load_plan(store: RunStore) -> tuple[LecturePlan, GeneratedDesignSkill]:
    path = store.run_dir / "plan.json"
    if not path.is_file():
        raise ValueError("run says plan completed but plan.json is missing")
    plan = LecturePlan.model_validate_json(path.read_text(encoding="utf-8"))
    plan = SKILL_CATALOG.validate_plan(plan, OPTIONAL_PAGE_TOOLS)
    style = load_generated_style(store.run_dir / "skills", plan.design)
    return plan, style


def _load_terminal_pages(store: RunStore) -> list[PageArtifact]:
    pages: list[PageArtifact] = []
    for number, state in enumerate(store.state.pages, 1):
        if state.status not in {PageRunStatus.COMPLETED, PageRunStatus.DEGRADED}:
            raise ValueError(f"page {number} is not terminal")
        path = store.run_dir / "pages" / f"p{number}.json"
        if not path.is_file():
            raise ValueError(f"terminal page {number} is missing its artifact")
        pages.append(PageArtifact.model_validate_json(path.read_text(encoding="utf-8")))
    return pages


async def _session(llm: Any, store: RunStore, logger: EventLog) -> GenerateResult:
    run_dir = store.run_dir
    if store.state.plan_status == "completed":
        plan, style = _load_plan(store)
        logger.emit(
            "planner.reused",
            pages=len(plan.pages),
            style={"name": style.name, "sha256": style.sha256},
        )
    else:
        started = time.monotonic()
        logger.emit("stage.started", stage="planner")
        try:
            plan = await plan_lecture(llm, store.state.topic, run_dir=run_dir, logger=logger)
        except Exception as exc:
            logger.emit("planner.failed", error=f"{type(exc).__name__}: {exc}")
            raise
        style = load_generated_style(run_dir / "skills", plan.design)
        store.register_plan(len(plan.pages))
        logger.emit(
            "planner.completed",
            duration_ms=round((time.monotonic() - started) * 1000),
            pages=len(plan.pages),
            plan_sha256=hashlib.sha256((run_dir / "plan.json").read_bytes()).hexdigest(),
        )
        logger.emit(
            "stage.completed",
            duration_ms=round((time.monotonic() - started) * 1000),
            stage="planner",
        )
        shutil.rmtree(run_dir / ".work" / "planner", ignore_errors=True)

    if not store.state.pages:
        store.register_plan(len(plan.pages))
    if len(store.state.pages) != len(plan.pages):
        raise ValueError("run state page count does not match plan")

    reset = store.reset_running()
    for number in reset:
        shutil.rmtree(run_dir / ".work" / f"p{number}", ignore_errors=True)
        logger.emit("builder.reset", page=number, previous_status="running")

    pending = store.pending_pages()
    build_started = time.monotonic()
    logger.emit("stage.started", stage="build", pages=len(pending))
    semaphore = asyncio.Semaphore(_CONFIG.pipeline.page_concurrency)

    async def one_page(number: int) -> None:
        async with semaphore:
            spec = plan.pages[number - 1]
            skills = [
                {
                    **plan.design.model_dump(mode="json"),
                    "source": "run",
                }
            ] + [
                item.model_dump(mode="json") for item in spec.skills
            ]
            tools = sorted(set(spec.tools))
            store.start_page(number)
            started = time.monotonic()
            logger.emit(
                "builder.started",
                agent_id=f"builder:p{number}",
                page=number,
                skills=skills,
                tools=tools,
                page_type=spec.type.value,
            )
            try:
                artifact = await build_page(
                    BuilderWorker(
                        llm=llm,
                        run_dir=run_dir,
                        plan=plan,
                        page=number,
                        catalog=SKILL_CATALOG,
                        style=style,
                        logger=logger,
                    )
                )
            except Exception as exc:
                reason = f"{type(exc).__name__}: {exc}"
                artifact = make_fallback_page(number, spec, reason)
                _atomic_text(
                    run_dir / "pages" / f"p{number}.json",
                    artifact.model_dump_json(indent=2),
                )
                store.finish_page(number, PageRunStatus.DEGRADED, reason)
                logger.emit(
                    "builder.degraded",
                    agent_id=f"builder:p{number}",
                    page=number,
                    duration_ms=round((time.monotonic() - started) * 1000),
                    error=reason,
                    blocked=isinstance(exc, AgentBlocked),
                )
            else:
                store.finish_page(number, PageRunStatus.COMPLETED)
                logger.emit(
                    "builder.completed",
                    agent_id=f"builder:p{number}",
                    page=number,
                    duration_ms=round((time.monotonic() - started) * 1000),
                    chars=len(artifact.html),
                    sha256=hashlib.sha256(artifact.html.encode()).hexdigest(),
                )
            finally:
                shutil.rmtree(run_dir / ".work" / f"p{number}", ignore_errors=True)

    await asyncio.gather(*(one_page(number) for number in pending))
    logger.emit(
        "stage.completed",
        duration_ms=round((time.monotonic() - build_started) * 1000),
        stage="build",
        pages=len(pending),
    )

    pages = _load_terminal_pages(store)
    assemble_started = time.monotonic()
    logger.emit("stage.started", stage="assemble", pages=len(pages))
    deck_path = write_deck_package(
        run_dir,
        pages,
        plan.title,
        language=plan.language,
        style_tokens=style.tokens,
    )
    logger.emit(
        "stage.completed",
        duration_ms=round((time.monotonic() - assemble_started) * 1000),
        stage="assemble",
        pages=len(pages),
        path=str(deck_path),
        sha256=hashlib.sha256(deck_path.read_bytes()).hexdigest(),
    )
    work = run_dir / ".work"
    if work.is_dir() and not any(work.iterdir()):
        work.rmdir()
    return GenerateResult(
        run_dir=run_dir,
        deck_path=deck_path,
        completed=store.pages_with(PageRunStatus.COMPLETED),
        degraded=store.pages_with(PageRunStatus.DEGRADED),
    )


async def generate(
    llm: Any | None,
    topic: str,
    *,
    out_root: Path = Path("runs"),
    resume_dir: Path | None = None,
) -> GenerateResult:
    contract_hash = _contract_hash()
    if resume_dir is None:
        store = RunStore.create(out_root, topic, contract_hash)
    else:
        store = RunStore.load(resume_dir)
        if store.state.topic != topic:
            raise ValueError("resume topic does not match run.json")
        if store.state.contract_hash != contract_hash:
            raise ValueError("run contract changed; start a new run")
    logger = EventLog(store.run_dir)
    logger.emit("run.started", run_id=store.state.run_id, resume=resume_dir is not None, topic=topic)
    _snapshot(logger, llm, contract_hash)
    try:
        async with asyncio.timeout(_CONFIG.pipeline.run_timeout_sec):
            result = await _session(llm, store, logger)
    except BaseException as exc:
        error = f"{type(exc).__name__}: {exc}"
        logger.emit("run.failed", error=error)
        write_summary(store.run_dir, build_summary(store.run_dir, store.state, "failed", error))
        raise
    logger.emit("run.completed", deck=str(result.deck_path))
    summary = build_summary(store.run_dir, store.state, "completed")
    write_summary(store.run_dir, summary)
    result.usage = {
        "input_tokens": int(summary["input_tokens"]),
        "output_tokens": int(summary["output_tokens"]),
        "total_tokens": int(summary["total_tokens"]),
        "calls": int(summary["model_calls"]),
    }
    return result
