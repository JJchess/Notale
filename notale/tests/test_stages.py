import asyncio
import json
from pathlib import Path

import pytest

from notale.core.models import PageArtifact
from notale.core.observability import EventLog
from notale.core.stages.contract import SKILL_CATALOG
from notale.core.stages.page_check import clean_fragment, page_delivery_failures
from notale.tools.agent_tools import (
    PlanInput,
    PlanTool,
    PlannerRootState,
    EditPageInput,
    EditPageTool,
    PageToolState,
    ReadPageInput,
    ReadPageTool,
    RunJsInput,
    RunJsTool,
    SubmitPageInput,
    SubmitPageTool,
    StyleInput,
    StyleTool,
    assemble_plan,
)
from notale.tests.fake_llm import _default_style, _final_plan_to_root
from notale.tools.base import ToolContext
from notale.web.deck import write_deck_package


@pytest.mark.asyncio
async def test_root_plan_tool_and_deterministic_assembly(tmp_path: Path, plan_data):
    state = PlannerRootState(tmp_path, SKILL_CATALOG, EventLog(tmp_path))
    draft = PlanInput.model_validate(_final_plan_to_root(plan_data))
    context1 = ToolContext(state.workspace, {"turn": 1})
    before = await PlanTool(state).execute(draft, context1)
    assert before.is_error
    styled = await StyleTool(state).execute(
        StyleInput.model_validate(_default_style()), context1
    )
    assert not styled.is_error
    result = await PlanTool(state).execute(
        draft, ToolContext(state.workspace, {"turn": 2})
    )
    assert not result.is_error
    assert state.submission == draft
    assert state.style is not None
    plan = assemble_plan(
        draft, draft.chapter_pages, SKILL_CATALOG, state.style
    )
    assert plan.design == state.style.reference
    assert len(plan.pages) == len(plan_data["pages"])
    assert (tmp_path / ".work" / "planner" / "root" / "plan.json").is_file()


def test_planner_schema_has_no_derived_or_retired_fields():
    schema = PlanInput.model_json_schema()
    assert "callbacks" not in schema["$defs"]["PlanChapter"]["properties"]
    assert "pages" in schema["$defs"]["PlanChapter"]["properties"]
    assert "start" not in schema["$defs"]["PlanChapter"]["properties"]
    assert "end" not in schema["$defs"]["PlanChapter"]["properties"]
    assert "mode" not in schema["properties"]
    assert "terminology" not in schema["properties"]
    assert "notation" not in schema["properties"]


@pytest.mark.asyncio
async def test_page_transaction_revision_patch_and_submit(tmp_path: Path):
    state = PageToolState(tmp_path, 1, EventLog(tmp_path))
    edit = EditPageTool(state)
    result = await edit.execute(EditPageInput(
        mode="replace", revision=0, html="<section data-notale-page><h1>旧标题</h1></section>"
    ), None)
    assert json.loads(result.output)["revision"] == 1
    conflict = await edit.execute(EditPageInput(mode="patch", revision=0, find="旧", replace="新"), None)
    assert conflict.is_error
    patched = await edit.execute(EditPageInput(mode="patch", revision=1, find="旧标题", replace="新标题"), None)
    assert json.loads(patched.output)["revision"] == 2
    read = await ReadPageTool(state).execute(ReadPageInput(), None)
    assert "新标题" in json.loads(read.output)["html"]
    submitted = await SubmitPageTool(state).execute(SubmitPageInput(revision=2, notes="讲稿"), None)
    assert not submitted.is_error
    saved = PageArtifact.model_validate_json((tmp_path / "pages" / "p1.json").read_text())
    assert saved.notes == "讲稿"
    frozen = await edit.execute(EditPageInput(mode="replace", revision=2, html="<p>x</p>"), None)
    assert frozen.is_error


@pytest.mark.asyncio
async def test_concurrent_page_edits_cannot_overwrite_same_revision(tmp_path: Path):
    state = PageToolState(tmp_path, 1, EventLog(tmp_path))
    tool = EditPageTool(state)
    results = await asyncio.gather(
        tool.execute(EditPageInput(mode="replace", revision=0, html="<section data-notale-page>甲</section>"), None),
        tool.execute(EditPageInput(mode="replace", revision=0, html="<section data-notale-page>乙</section>"), None),
    )
    assert sum(bool(result.is_error) for result in results) == 1
    assert state.revision == 1


@pytest.mark.asyncio
async def test_shell_cleaning_and_delivery_checks(tmp_path: Path):
    fragment = clean_fragment(
        "<!doctype html><html><head><style>.x{color:red}</style></head>"
        "<body><section data-notale-page>正文</section></body></html>"
    )
    assert "<html" not in fragment
    assert "<style>" in fragment
    assert not await page_delivery_failures(PageArtifact(html=fragment), page=1, run_dir=tmp_path)
    failures = await page_delivery_failures(
        PageArtifact(html='<section data-notale-page><img src="https://x/a.png" alt="x">正文</section>'),
        page=1,
        run_dir=tmp_path,
    )
    assert any("remote" in item for item in failures)


@pytest.mark.asyncio
async def test_run_js_is_small_and_isolated(tmp_path: Path):
    state = PageToolState(tmp_path, 1, EventLog(tmp_path))
    result = await RunJsTool(state).execute(RunJsInput(code="console.log(2 + 3)"), None)
    assert not result.is_error
    assert result.output == "5"


def test_deck_derives_page_ids_and_embeds_notes(tmp_path: Path):
    pages = [
        PageArtifact(html="<section data-notale-page>甲</section>", notes="注一"),
        PageArtifact(html="<section data-notale-page>乙</section>"),
    ]
    path = write_deck_package(tmp_path, pages, "标题", style_tokens={"accent": "#f00"})
    assert path.is_file()
    assert (tmp_path / "slides" / "p1.html").is_file()
    assert "注一" in path.read_text()
    assert "--notale-accent: #f00" in (tmp_path / "runtime" / "global.css").read_text()
