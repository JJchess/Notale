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
from notale.core.models import (
    LecturePlan,
    PageArtifact,
    PageRunStatus,
    StylePackRef,
)
from notale.core.observability import EventLog, build_summary, write_summary
from notale.core.state import RunStore
from notale.core.stages.contract import (
    PLANNER_SKILL_CATALOG,
    SKILL_CATALOG,
    STYLE_STUDIO,
    plan_lecture,
)
from notale.core.stages.page_check import make_fallback_page
from notale.roles.profiles import BUILDER, PLANNER
from notale.style_studio.build.from_topic import build_from_topic
from notale.style_studio.exemplars import render_pack_exemplars_async
from notale.style_studio.materialize import materialize_to_run
from notale.style_studio.decoration import page_role_for
from notale.style_studio.scrub import scrub_topic_for_content
from notale.style_studio.models import StylePack
from notale.style_studio.registry import get_pack
from notale.tools.agent_tools import OPTIONAL_PAGE_TOOLS
from notale.utils.config import CONFIG_PATH, get_config
from notale.utils.skill_catalog import GeneratedDesignSkill, load_generated_style
from notale.web.deck import prepare_deck_runtime, write_deck_package


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
        root / "core" / "state.py",
        root / "core" / "stages" / "contract.py",
        root / "core" / "stages" / "page_check.py",
        root / "agents" / "loop.py",
        root / "agents" / "builder.py",
        root / "agents" / "style.py",
        root / "tools" / "base.py",
        root / "tools" / "agent_tools.py",
        root / "tools" / "inspection.py",
        root / "tools" / "media.py",
        root / "utils" / "skill_catalog.py",
        root / "web" / "browser.py",
        root / "web" / "deck.py",
    ):
        if path is not None:
            digest.update(Path(path).read_bytes())
    # Pack *contents* deliberately stay out of the contract hash — they are
    # resolved after it is computed, and a run records its own pack digest in
    # run.json instead. Only the code that compiles a pack belongs here.
    for path in sorted((root / "style_studio").rglob("*.py")):
        digest.update(str(path.relative_to(root)).encode())
        digest.update(path.read_bytes())
    # The deck runtime CSS decides how every page renders, so a change to it must
    # invalidate a resume exactly like a code change does.
    for path in sorted((root / "web" / "runtime").rglob("*")):
        if path.is_file():
            digest.update(str(path.relative_to(root)).encode())
            digest.update(path.read_bytes())
    for path in sorted((root / "components").rglob("*")):
        if path.is_file():
            digest.update(str(path.relative_to(root)).encode())
            digest.update(path.read_bytes())
    digest.update(SKILL_CATALOG.sha256.encode())
    digest.update(PLANNER_SKILL_CATALOG.sha256.encode())
    digest.update(STYLE_STUDIO.sha256.encode())
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
            "style": {
                STYLE_STUDIO.name: {
                    "sha256": STYLE_STUDIO.sha256,
                    "description": STYLE_STUDIO.description,
                }
            },
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
    style.validate_plan(plan)
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


def _assert_style_pack_unchanged(store: RunStore) -> None:
    """Refuse to resume onto a StylePack that was edited since the run started.

    Packs live outside the run and outside the contract hash, so nothing else
    would notice a repalette between a run and its resume — the deck would just
    come out half in one style and half in another.
    """
    recorded = store.state.style_pack
    if recorded is None:
        return
    try:
        pack = get_pack(recorded.pack_id, validate=False)
    except (KeyError, FileNotFoundError) as exc:
        raise ValueError(
            f"run used StylePack {recorded.pack_id!r}, which no longer exists"
        ) from exc
    digest = hashlib.sha256((pack.pack_dir / "pack.json").read_bytes()).hexdigest()
    if digest != recorded.sha256:
        raise ValueError(
            f"StylePack {recorded.pack_id!r} changed since this run started; "
            "start a new run or restore the pack"
        )


def _pack_ref(pack: StylePack) -> StylePackRef:
    digest = hashlib.sha256((pack.pack_dir / "pack.json").read_bytes()).hexdigest()
    return StylePackRef(pack_id=pack.id, version=pack.version or "0.0.0", sha256=digest)


async def _resolve_style(
    llm: Any,
    store: RunStore,
    logger: EventLog,
    *,
    style_pack: str | None,
) -> tuple[GeneratedDesignSkill, StylePackRef]:
    """Resolve the run's StylePack, then materialize it into the run.

    Naming a pack renders from the library and costs no model call at all;
    otherwise the topic drives one call that patches a forked parent. Either way
    the run ends up holding a real pack, and the design Skill the rest of the
    pipeline consumes is produced the same way.
    """
    if style_pack:
        pack = get_pack(style_pack)
        logger.emit(
            "style.pack.selected",
            pack_id=pack.id,
            version=pack.version,
            status=pack.status,
            source="explicit",
        )
    elif not _CONFIG.style.allow_generation:
        raise RuntimeError(
            "style.allow_generation is false; pass --style-pack to name a published pack"
        )
    else:
        pack = await build_from_topic(
            llm,
            store.state.topic,
            run_dir=store.run_dir,
            logger=logger,
            skill_text=STYLE_STUDIO.body,
            parent_id=_CONFIG.style.default_pack,
            discriminator=store.state.run_id.rsplit("-", 1)[-1],
        )
        # A fresh pack has no specimens of its own, and it must not borrow its
        # parent's. Render its baseline now so page inspection has something
        # true to compare against; a missing browser costs the baseline, not
        # the run.
        if _CONFIG.style.exemplar_pages > 0:
            try:
                await render_pack_exemplars_async(pack)
                pack = get_pack(pack.id)
            except Exception as exc:  # noqa: BLE001
                logger.emit(
                    "style.exemplars.skipped",
                    pack_id=pack.id,
                    error=f"{type(exc).__name__}: {exc}",
                )
    style = materialize_to_run(pack, store.run_dir)
    logger.emit(
        "style.completed",
        agent_id="style",
        pack_id=pack.id,
        version=pack.version,
        name=style.name,
        sha256=style.sha256,
    )
    return style, _pack_ref(pack)


async def _session(
    llm: Any,
    store: RunStore,
    logger: EventLog,
    *,
    style_pack: str | None = None,
) -> GenerateResult:
    run_dir = store.run_dir
    if store.state.plan_status == "completed":
        plan, style = _load_plan(store)
        logger.emit(
            "planner.reused",
            pages=len(plan.pages),
            style={"name": style.name, "sha256": style.sha256},
        )
    else:
        if store.state.style_status == "completed":
            if store.state.style is None:
                raise ValueError("run says style completed but has no Style reference")
            style = load_generated_style(run_dir / "skills", store.state.style)
            logger.emit(
                "style.reused", name=style.name, sha256=style.sha256
            )
        elif store.state.style_status == "pending":
            store.start_style()
            style_started = time.monotonic()
            logger.emit("stage.started", stage="style")
            try:
                style, pack_ref = await _resolve_style(
                    llm, store, logger, style_pack=style_pack
                )
            except BaseException as exc:
                store.fail_style(f"{type(exc).__name__}: {exc}")
                raise
            store.finish_style(style.reference, pack_ref)
            logger.emit(
                "stage.completed",
                stage="style",
                duration_ms=round((time.monotonic() - style_started) * 1000),
            )
        elif store.state.style_status == "failed":
            raise RuntimeError(
                "Style generation previously failed; start a new run: "
                + store.state.style_error
            )
        else:
            raise RuntimeError(
                "Style generation has an unknown outcome and will not be replayed"
            )

        started = time.monotonic()
        logger.emit("stage.started", stage="planner")
        scrubbed = scrub_topic_for_content(store.state.topic)
        planner_topic = scrubbed.text or store.state.topic.strip()
        logger.emit(
            "style.prompt_scrubbed",
            changed=scrubbed.changed,
            removed_count=len(scrubbed.removed),
            removed=scrubbed.removed[:8],
            fallback_to_raw=not bool(scrubbed.text),
            planner_topic_sha256=hashlib.sha256(
                planner_topic.encode("utf-8")
            ).hexdigest(),
        )
        try:
            plan = await plan_lecture(
                llm,
                planner_topic,
                run_dir=run_dir,
                logger=logger,
                style=style,
            )
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

    # Inspection must render the same global CSS, style tokens, assets, and
    # component-relative paths that final deck assembly will use.
    prepare_deck_runtime(run_dir, style.tokens, type_scale=style.type_scale)

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
            style_ref = {
                **plan.design.model_dump(mode="json"),
                "source": "run",
            }
            tools = sorted(set(spec.tools))
            store.start_page(number)
            started = time.monotonic()
            logger.emit(
                "builder.started",
                agent_id=f"builder:p{number}",
                page=number,
                style=style_ref,
                tools=tools,
                page_type=spec.type.value,
                composition=spec.composition,
            )
            worker = BuilderWorker(
                llm=llm,
                run_dir=run_dir,
                plan=plan,
                page=number,
                style=style,
                logger=logger,
            )
            try:
                artifact = await build_page(worker)
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
        type_scale=style.type_scale,
        page_roles=[
            page_role_for(spec.type, number)
            for number, spec in enumerate(plan.pages, 1)
        ],
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
    style_pack: str | None = None,
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
        _assert_style_pack_unchanged(store)
    logger = EventLog(store.run_dir)
    logger.emit("run.started", run_id=store.state.run_id, resume=resume_dir is not None, topic=topic)
    _snapshot(logger, llm, contract_hash)
    try:
        async with asyncio.timeout(_CONFIG.pipeline.run_timeout_sec):
            result = await _session(llm, store, logger, style_pack=style_pack)
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
