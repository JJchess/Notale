from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest

from notale.core.models import PagePlan, PageType
from notale.core.observability import EventLog
from notale.tests.fake_llm import ScriptedClient, _default_style, text_msg
from notale.tools.agent_tools import (
    EditPageInput,
    EditPageTool,
    PageToolState,
    SubmitPageInput,
    SubmitPageTool,
)
from notale.tools.base import ToolContext
from notale.tools.inspection import InspectPageInput, InspectPageTool
from notale.utils.skill_catalog import create_generated_style


def _finding(severity: str = "major") -> dict[str, str]:
    return {
        "severity": severity,
        "location": "layout",
        "problem": "大面积失衡空白",
        "fix": "重新平衡版面",
    }


def _revise(html: str, findings: list[dict[str, str]] | None = None) -> str:
    return json.dumps(
        {"decision": "revise", "findings": findings or [_finding()], "html": html},
        ensure_ascii=False,
    )


async def _state_with_page(
    tmp_path: Path, html: str, client: ScriptedClient | None = None
) -> PageToolState:
    state = PageToolState(tmp_path, 1, EventLog(tmp_path), llm=client or ScriptedClient([]))
    result = await EditPageTool(state).execute(
        EditPageInput(mode="replace", revision=0, html=html),
        ToolContext(state.workspace, {"turn": 1}),
    )
    assert not result.is_error
    return state


@pytest.mark.asyncio
async def test_inspect_runs_isolated_review_and_returns_compact_success(tmp_path: Path):
    html = '<section data-notale-page><h1>标题</h1><p>完整知识内容</p></section>'
    state = await _state_with_page(tmp_path, html)

    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1),
        ToolContext(state.workspace, {"turn": 2}),
    )

    assert not result.is_error
    payload = json.loads(result.output)
    assert payload["status"] == "success"
    assert payload["revision"] == 1
    assert "html" not in payload
    assert "browser_facts" not in payload
    assert result.images == ()
    assert state.submission is None
    assert state.tool_state["inspected_revision"] == 1
    report = json.loads((tmp_path / "inspections" / "p1.json").read_text())
    assert report["status"] == "success"
    assert (tmp_path / report["rounds"][0]["screenshot"]).is_file()
    assert "facts" not in report["rounds"][0]
    assert report["rounds"][0]["decision"] == "success"
    assert report["rounds"][0]["findings"] == []


@pytest.mark.asyncio
async def test_inspector_request_is_fresh_multimodal_style_context_without_tools(
    tmp_path: Path,
):
    html = '<section data-notale-page><h1>唯一页面内容</h1></section>'
    client = ScriptedClient([])
    style = create_generated_style(**_default_style())
    page_plan = PagePlan(
        type=PageType.WORKED_EXAMPLE,
        composition="route-field",
        claim="绝不传入的 Planner 命题",
        learning_action="绝不传入的学习动作",
        narrative_role="绝不传入的叙事角色",
    )
    state = PageToolState(
        tmp_path, 1, EventLog(tmp_path),
        llm=client, style=style, page_plan=page_plan,
    )
    await EditPageTool(state).execute(
        EditPageInput(mode="replace", revision=0, html=html),
        ToolContext(state.workspace, {"turn": 1}),
    )

    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )

    assert not result.is_error
    assert len(client.inspection_requests) == 1
    body = client.inspection_requests[0].to_openai_body()
    assert "tools" not in body
    assert body["response_format"]["json_schema"]["name"] == "notale_inspection"
    assert [item["role"] for item in body["messages"]] == ["system", "user"]
    assert [part["type"] for part in body["messages"][1]["content"]] == [
        "text", "image_url",
    ]
    prompt = body["messages"][1]["content"][0]["text"]
    assert prompt.startswith("Make this the best possible 1280×720 presentation page.")
    assert "Run design Skill: pathways-field-guide" in prompt
    assert "Assigned page composition" in prompt
    assert '"accent": "#176b87"' in prompt
    assert html in prompt
    assert "Inspection round 1." in prompt
    assert "Inspector revision budget: 0/4 used." in prompt
    assert "first review of this page" in prompt
    assert "prior draft or conversation" not in prompt
    assert "preserve every visible word" not in json.dumps(body, ensure_ascii=False).lower()
    assert "绝不传入的 Planner 命题" not in prompt
    assert "# Builder" not in json.dumps(body, ensure_ascii=False)
    assert body["messages"][1]["content"][1]["image_url"]["detail"] == "high"
    snapshot = json.loads(
        (tmp_path / "llm-requests" / "inspection-p1" / "turn-0001.json").read_text()
    )
    assert "tools" not in snapshot["request"]


@pytest.mark.asyncio
async def test_builder_can_fully_relayout_then_reinspect_and_submit(tmp_path: Path):
    state = await _state_with_page(
        tmp_path,
        '<section data-notale-page><h1>标题</h1><p>正文内容</p></section>',
    )
    inspector = InspectPageTool(state)
    first = await inspector.execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )
    assert not first.is_error

    redesigned = (
        '<main data-notale-page style="display:grid;background:#111;color:#eee">'
        '<header style="font-size:64px"><h1>标题</h1></header>'
        '<article style="margin:80px"><p>正文内容</p></article></main>'
    )
    edited = await EditPageTool(state).execute(
        EditPageInput(mode="replace", revision=1, html=redesigned),
        ToolContext(state.workspace, {"turn": 3}),
    )
    assert not edited.is_error
    second = await inspector.execute(
        InspectPageInput(revision=2), ToolContext(state.workspace, {"turn": 4})
    )
    assert not second.is_error
    submitted = await SubmitPageTool(state).execute(
        SubmitPageInput(revision=2, notes="ready"),
        ToolContext(state.workspace, {"turn": 5}),
    )

    assert not submitted.is_error
    assert state.submission is not None
    assert state.submission.html == redesigned
    assert state.submission.notes == "ready"
    report = json.loads((tmp_path / "inspections" / "p1.json").read_text())
    assert report["status"] == "submitted"
    assert [item["revision"] for item in report["rounds"]] == [1, 2]


@pytest.mark.asyncio
async def test_inspector_revision_is_saved_and_requires_a_fresh_review(tmp_path: Path):
    original = '<section data-notale-page><h1>标题</h1><p>正文内容</p></section>'
    revised = (
        '<section data-notale-page style="padding:72px">'
        '<h1>标题</h1><p>正文内容</p></section>'
    )
    client = ScriptedClient([], inspection_script=[
        _revise(revised),
        json.dumps({"decision": "success", "findings": [], "html": ""}, ensure_ascii=False),
    ])
    state = await _state_with_page(tmp_path, original, client)
    inspector = InspectPageTool(state)

    first = await inspector.execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )

    assert not first.is_error
    assert json.loads(first.output)["status"] == "revised"
    assert state.revision == 2
    assert state.page_path.read_text() == revised
    assert state.tool_state["inspector_revisions"] == 1
    assert "inspected_revision" not in state.tool_state
    stale = await SubmitPageTool(state).execute(
        SubmitPageInput(revision=2), ToolContext(state.workspace, {"turn": 3})
    )
    assert stale.is_error

    second = await inspector.execute(
        InspectPageInput(revision=2), ToolContext(state.workspace, {"turn": 4})
    )
    assert not second.is_error
    assert json.loads(second.output)["status"] == "success"
    assert state.tool_state["inspected_revision"] == 2
    submitted = await SubmitPageTool(state).execute(
        SubmitPageInput(revision=2), ToolContext(state.workspace, {"turn": 5})
    )
    assert not submitted.is_error


@pytest.mark.asyncio
async def test_inspector_accepts_success_when_provider_echoes_html(tmp_path: Path):
    html = '<section data-notale-page><h1>标题</h1><p>正文内容</p></section>'
    client = ScriptedClient([], inspection_script=[json.dumps({
        "decision": "success",
        "html": html,
    }, ensure_ascii=False)])
    state = await _state_with_page(tmp_path, html, client)

    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )

    assert not result.is_error
    assert json.loads(result.output)["status"] == "success"
    assert state.page_path.read_text() == html


@pytest.mark.asyncio
async def test_inspector_extracts_decision_after_provider_explanation(tmp_path: Path):
    original = '<section data-notale-page><h1>标题</h1><p>正文内容</p></section>'
    revised = (
        '<section data-notale-page style="padding:72px">'
        '<h1>标题</h1><p>正文内容</p></section>'
    )
    raw = "I found a layout issue and rebuilt the page.\n" + _revise(revised)
    client = ScriptedClient([], inspection_script=[raw])
    state = await _state_with_page(tmp_path, original, client)

    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )

    assert not result.is_error
    assert json.loads(result.output)["status"] == "revised"
    assert state.page_path.read_text() == revised


@pytest.mark.asyncio
async def test_inspector_can_freely_remove_content_controls_and_scripts(tmp_path: Path):
    original = (
        '<section data-notale-page><h1>冗长标题</h1><p>可以删除的正文</p>'
        '<button type="button">可以删除的控件</button>'
        '<script>window.answer = 1;</script></section>'
    )
    revised = '<section data-notale-page><h1>精简后的重点</h1></section>'
    client = ScriptedClient([], inspection_script=[_revise(revised)])
    state = await _state_with_page(tmp_path, original, client)

    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )

    assert not result.is_error
    assert json.loads(result.output)["status"] == "revised"
    assert state.revision == 2
    assert state.page_path.read_text() == revised
    assert state.tool_state["inspector_revisions"] == 1


@pytest.mark.asyncio
async def test_invalid_inspector_response_does_not_change_the_page(tmp_path: Path):
    original = '<section data-notale-page><h1>标题</h1><p>稳定正文</p></section>'
    client = ScriptedClient([], inspection_script=["not valid json"])
    state = await _state_with_page(tmp_path, original, client)

    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )

    assert result.is_error
    assert "inspection failed" in result.output
    assert state.revision == 1
    assert state.page_path.read_text() == original
    assert "inspected_revision" not in state.tool_state
    report = json.loads((tmp_path / "inspections" / "p1.json").read_text())
    assert report["status"] == "failed"
    assert report["rounds"][0]["response"].endswith("turn-0001.json")


@pytest.mark.asyncio
async def test_four_inspector_revisions_still_allow_a_later_success_review(tmp_path: Path):
    original = '<section data-notale-page><h1>标题</h1><p>正文内容</p></section>'
    revisions = [
        (
            f'<section data-notale-page style="padding:{amount}px">'
            '<h1>标题</h1><p>正文内容</p></section>'
        )
        for amount in (20, 30, 40, 50, 60)
    ]
    decisions = [_revise(html) for html in revisions] + [
        json.dumps({"decision": "success", "findings": [], "html": ""})
    ]
    client = ScriptedClient([], inspection_script=decisions)
    state = await _state_with_page(tmp_path, original, client)
    inspector = InspectPageTool(state)

    for turn in range(2, 6):
        result = await inspector.execute(
            InspectPageInput(revision=state.revision),
            ToolContext(state.workspace, {"turn": turn}),
        )
        assert not result.is_error
        assert json.loads(result.output)["status"] == "revised"

    assert state.revision == 5
    assert state.tool_state["inspector_revisions"] == 4
    assert state.page_path.read_text() == revisions[3]

    exhausted = await inspector.execute(
        InspectPageInput(revision=5), ToolContext(state.workspace, {"turn": 6})
    )
    assert not exhausted.is_error
    payload = json.loads(exhausted.output)
    assert payload["status"] == "review_discarded"
    assert payload["findings"] == [_finding()]
    assert any("budget exhausted" in reason for reason in payload["discarded_because"])
    assert "edit_page" in payload["instruction"]
    assert state.revision == 5
    assert state.page_path.read_text() == revisions[3]

    accepted = await inspector.execute(
        InspectPageInput(revision=5), ToolContext(state.workspace, {"turn": 7})
    )
    assert not accepted.is_error
    assert json.loads(accepted.output)["status"] == "success"
    submitted = await SubmitPageTool(state).execute(
        SubmitPageInput(revision=5), ToolContext(state.workspace, {"turn": 8})
    )
    assert not submitted.is_error
    report = json.loads((tmp_path / "inspections" / "p1.json").read_text())
    assert len(report["rounds"]) == 6
    assert report["rounds"][4]["outcome"] == "discarded"


@pytest.mark.asyncio
async def test_edit_after_inspection_requires_a_fresh_inspection(tmp_path: Path):
    state = await _state_with_page(
        tmp_path, '<section data-notale-page><h1>标题</h1></section>'
    )
    inspector = InspectPageTool(state)
    await inspector.execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )
    edited = await EditPageTool(state).execute(
        EditPageInput(
            mode="replace",
            revision=1,
            html='<section data-notale-page style="padding:60px"><h1>标题</h1></section>',
        ),
        ToolContext(state.workspace, {"turn": 3}),
    )
    assert not edited.is_error

    stale = await SubmitPageTool(state).execute(
        SubmitPageInput(revision=2), ToolContext(state.workspace, {"turn": 4})
    )

    assert stale.is_error
    assert "has not been visually inspected" in stale.output
    assert state.submission is None


@pytest.mark.asyncio
async def test_browser_failure_returns_to_builder_without_submitting(tmp_path: Path):
    class BrokenRenderer(ScriptedClient):
        async def render_inspection_page(self, *, document_path, page):
            del document_path, page
            raise RuntimeError("browser unavailable")

    state = await _state_with_page(
        tmp_path,
        '<section data-notale-page><h1>仍未检查</h1></section>',
        BrokenRenderer([]),
    )
    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )

    assert result.is_error
    assert "browser unavailable" in result.output
    assert state.submission is None
    assert "inspected_revision" not in state.tool_state
    report = json.loads((tmp_path / "inspections" / "p1.json").read_text())
    assert report["status"] == "failed"


class _VaryingRenderClient(ScriptedClient):
    """ScriptedClient whose fake browser returns a different screenshot per round."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.render_calls = 0

    async def render_inspection_page(self, *, document_path, page):
        del document_path, page
        self.render_calls += 1
        return {"screenshot": f"png-round-{self.render_calls}".encode()}


@pytest.mark.asyncio
async def test_second_round_carries_history_and_previous_screenshot(tmp_path: Path):
    original = '<section data-notale-page><h1>标题</h1><p>正文内容</p></section>'
    revised = (
        '<section data-notale-page style="padding:72px">'
        '<h1>标题</h1><p>正文内容</p></section>'
    )
    client = _VaryingRenderClient([], inspection_script=[
        _revise(revised),
        json.dumps({"decision": "success", "findings": [], "html": ""}, ensure_ascii=False),
    ])
    state = await _state_with_page(tmp_path, original, client)
    inspector = InspectPageTool(state)

    first = await inspector.execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )
    assert not first.is_error
    second = await inspector.execute(
        InspectPageInput(revision=2), ToolContext(state.workspace, {"turn": 3})
    )
    assert not second.is_error

    body = client.inspection_requests[1].to_openai_body()
    parts = body["messages"][1]["content"]
    assert [part["type"] for part in parts] == ["text", "image_url", "image_url"]
    prompt = parts[0]["text"]
    assert "Inspection round 2." in prompt
    assert "Inspector revision budget: 1/4 used." in prompt
    assert "Previous round outcome: revised." in prompt
    assert "大面积失衡空白" in prompt
    assert "The first image is the CURRENT render." in prompt
    assert '"revert"' in prompt
    previous_png = (tmp_path / "inspections" / "p1-round-1.png").read_bytes()
    expected = "data:image/png;base64," + base64.b64encode(previous_png).decode("ascii")
    assert parts[2]["image_url"]["url"] == expected
    assert parts[2]["image_url"]["detail"] == "high"


@pytest.mark.asyncio
async def test_identical_render_omits_previous_screenshot(tmp_path: Path):
    original = '<section data-notale-page><h1>标题</h1><p>正文内容</p></section>'
    revised = (
        '<section data-notale-page style="padding:72px">'
        '<h1>标题</h1><p>正文内容</p></section>'
    )
    client = ScriptedClient([], inspection_script=[
        _revise(revised),
        json.dumps({"decision": "success", "findings": [], "html": ""}, ensure_ascii=False),
    ])
    state = await _state_with_page(tmp_path, original, client)
    inspector = InspectPageTool(state)

    await inspector.execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )
    second = await inspector.execute(
        InspectPageInput(revision=2), ToolContext(state.workspace, {"turn": 3})
    )
    assert not second.is_error

    body = client.inspection_requests[1].to_openai_body()
    parts = body["messages"][1]["content"]
    assert [part["type"] for part in parts] == ["text", "image_url"]
    assert "identical to the previous round" in parts[0]["text"]


@pytest.mark.asyncio
async def test_revert_restores_page_before_the_last_inspector_revision(tmp_path: Path):
    original = '<section data-notale-page><h1>标题</h1><p>正文内容</p></section>'
    revised = (
        '<section data-notale-page style="padding:72px">'
        '<h1>标题</h1><p>正文内容</p></section>'
    )
    client = _VaryingRenderClient([], inspection_script=[
        _revise(revised),
        json.dumps({
            "decision": "revert",
            "findings": [_finding("major")],
            "html": "",
        }, ensure_ascii=False),
        json.dumps({"decision": "success", "findings": [], "html": ""}, ensure_ascii=False),
    ])
    state = await _state_with_page(tmp_path, original, client)
    inspector = InspectPageTool(state)

    first = await inspector.execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )
    assert json.loads(first.output)["status"] == "revised"

    reverted = await inspector.execute(
        InspectPageInput(revision=2), ToolContext(state.workspace, {"turn": 3})
    )
    assert not reverted.is_error
    payload = json.loads(reverted.output)
    assert payload["status"] == "reverted"
    assert payload["revision"] == 3
    assert state.page_path.read_text() == original
    assert state.tool_state["inspector_revisions"] == 1
    assert "inspected_revision" not in state.tool_state
    report = json.loads((tmp_path / "inspections" / "p1.json").read_text())
    assert report["rounds"][1]["outcome"] == "reverted"
    assert report["rounds"][1]["findings"] == [_finding("major")]

    final = await inspector.execute(
        InspectPageInput(revision=3), ToolContext(state.workspace, {"turn": 4})
    )
    assert json.loads(final.output)["status"] == "success"
    submitted = await SubmitPageTool(state).execute(
        SubmitPageInput(revision=3), ToolContext(state.workspace, {"turn": 5})
    )
    assert not submitted.is_error


@pytest.mark.asyncio
async def test_revert_without_prior_inspector_revision_is_discarded(tmp_path: Path):
    original = '<section data-notale-page><h1>标题</h1><p>正文内容</p></section>'
    client = ScriptedClient([], inspection_script=[
        json.dumps({"decision": "revert", "findings": [], "html": ""}, ensure_ascii=False),
    ])
    state = await _state_with_page(tmp_path, original, client)

    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )

    assert not result.is_error
    payload = json.loads(result.output)
    assert payload["status"] == "review_discarded"
    assert any("no inspector revision" in reason for reason in payload["discarded_because"])
    assert state.revision == 1
    assert state.page_path.read_text() == original


@pytest.mark.asyncio
async def test_revise_with_only_minor_findings_is_rejected(tmp_path: Path):
    original = '<section data-notale-page><h1>标题</h1><p>正文内容</p></section>'
    revised = (
        '<section data-notale-page style="padding:72px">'
        '<h1>标题</h1><p>正文内容</p></section>'
    )
    client = ScriptedClient([], inspection_script=[
        _revise(revised, findings=[_finding("minor")]),
    ])
    state = await _state_with_page(tmp_path, original, client)

    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )

    assert result.is_error
    assert "inspection failed" in result.output
    assert state.revision == 1
    assert state.page_path.read_text() == original


@pytest.mark.asyncio
async def test_success_with_blocking_findings_is_rejected(tmp_path: Path):
    original = '<section data-notale-page><h1>标题</h1><p>正文内容</p></section>'
    client = ScriptedClient([], inspection_script=[
        json.dumps({
            "decision": "success",
            "findings": [_finding("critical")],
            "html": "",
        }, ensure_ascii=False),
    ])
    state = await _state_with_page(tmp_path, original, client)

    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )

    assert result.is_error
    assert "inspection failed" in result.output
    assert "inspected_revision" not in state.tool_state


def test_inspection_prompt_pins_mount_contract_crowding_and_fix_all():
    from notale.tools.inspection import _INSPECTION_SYSTEM_PROMPT

    assert "byte-for-byte" in _INSPECTION_SYSTEM_PROMPT
    assert "data-notale-component" in _INSPECTION_SYSTEM_PROMPT
    assert "overcrowded" in _INSPECTION_SYSTEM_PROMPT
    assert "never by shrinking type or spacing" in _INSPECTION_SYSTEM_PROMPT
    assert "all of the listed findings together" in _INSPECTION_SYSTEM_PROMPT
    assert "List every critical and major defect" in _INSPECTION_SYSTEM_PROMPT


@pytest.mark.asyncio
async def test_component_page_review_dropping_mount_is_discarded(tmp_path: Path):
    from notale.tools.managed_component import write_component

    record = write_component(
        tmp_path,
        component_id="p1-widget-aa37777d56e1",
        page=1,
        kind="widget",
        title="阈值",
        widget_type="sim",
        width=960,
        height=540,
        document="<!doctype html><html><body></body></html>",
        model_calls=1,
        repair_calls=0,
        provenance="test",
    )
    original = f'<section data-notale-page><h1>标题</h1>{record.mount_html}</section>'
    inline_rewrite = (
        '<section data-notale-page><h1>标题</h1>'
        '<svg viewBox="0 0 10 10"></svg><script>window.state = 1;</script></section>'
    )
    client = ScriptedClient([], inspection_script=[_revise(inline_rewrite)])
    state = await _state_with_page(tmp_path, original, client)

    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )

    assert not result.is_error
    payload = json.loads(result.output)
    assert payload["status"] == "review_discarded"
    assert payload["findings"] == [_finding()]
    assert any("not mounted" in reason for reason in payload["discarded_because"])
    assert any("outer-page scripts" in reason for reason in payload["discarded_because"])
    assert state.revision == 1
    assert record.mount_html in state.page_path.read_text()
    assert state.tool_state.get("inspector_revisions", 0) == 0


@pytest.mark.asyncio
async def test_discarded_round_findings_appear_in_next_history(tmp_path: Path):
    original = '<section data-notale-page><h1>标题</h1><p>正文内容</p></section>'
    client = _VaryingRenderClient([], inspection_script=[
        json.dumps({
            "decision": "revert",
            "findings": [_finding("critical")],
            "html": "",
        }, ensure_ascii=False),
        json.dumps({"decision": "success", "findings": [], "html": ""}, ensure_ascii=False),
    ])
    state = await _state_with_page(tmp_path, original, client)
    inspector = InspectPageTool(state)

    first = await inspector.execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )
    assert json.loads(first.output)["status"] == "review_discarded"

    second = await inspector.execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 3})
    )
    assert not second.is_error

    prompt = client.inspection_requests[1].to_openai_body()["messages"][1]["content"][0]["text"]
    assert "Previous round outcome: discarded." in prompt
    assert "大面积失衡空白" in prompt


@pytest.mark.asyncio
async def test_initial_delivery_failure_does_not_render(tmp_path: Path):
    client = ScriptedClient([])
    state = await _state_with_page(tmp_path, "<div>没有页面根节点</div>", client)

    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )

    assert result.is_error
    assert state.submission is None
    assert "inspection_calls" not in state.tool_state


class _MeasuringRenderer(ScriptedClient):
    """A fake browser that also reports measurements, like the real one does."""

    measurements: dict = {}

    async def render_inspection_page(self, *, document_path, page):
        del document_path, page
        return {
            "screenshot": base64.b64decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAE/wJ/l4Z7WQAAAABJRU5ErkJggg=="
            ),
            "measurements": self.measurements,
        }


@pytest.mark.asyncio
async def test_advisory_defects_reach_the_inspector_and_a_report(tmp_path: Path):
    """A measured but non-gating defect becomes prompt text plus a report."""
    client = _MeasuringRenderer([text_msg(json.dumps({"decision": "success", "findings": [], "html": ""}))])
    client.measurements = {
        "schema_version": 1,
        "frame": {"width": 1280, "height": 720},
        "elements": [],
        "decorations": [],
        # A decorative bleed: worth telling the inspector, not worth blocking on.
        "overflow": [
            {"tag": "div", "reason": "escapes-frame", "text": "", "rect": {"x": 1200, "y": 0, "w": 400, "h": 400}}
        ],
        "palette": {},
        "text": "标题 内容",
        "backplate": None,
    }
    state = await _state_with_page(
        tmp_path, '<section data-notale-page><h1>标题</h1><p>内容</p></section>', client
    )
    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )
    assert not result.is_error

    prompt = client.inspection_requests[0].messages[0].content[0].text
    assert "Measured defects" in prompt
    assert "decoration_overflow" in prompt
    # The text matched the source, so that check passed rather than being noise.
    assert "rendered_text_matches_source" not in prompt

    report = json.loads((tmp_path / "inspections" / "p1-qa.json").read_text())
    assert any(c["check_id"] == "decoration_overflow" and c["status"] == "fail" for c in report["checks"])
    assert any(c["check_id"] == "frame_overflow" and c["status"] == "pass" for c in report["checks"])


@pytest.mark.asyncio
async def test_clipped_text_gates_before_the_model_is_called(tmp_path: Path):
    """Unreadable text is not a matter of taste, so it never reaches the inspector."""
    client = _MeasuringRenderer([text_msg(json.dumps({"decision": "success", "findings": [], "html": ""}))])
    client.measurements = {
        "schema_version": 1,
        "frame": {"width": 1280, "height": 720},
        "elements": [],
        "decorations": [],
        "overflow": [
            {"tag": "div", "reason": "escapes-frame", "text": "出框了", "rect": {"x": 0, "y": 0, "w": 1, "h": 1}}
        ],
        "palette": {},
        "text": "",
        "backplate": None,
    }
    state = await _state_with_page(
        tmp_path, '<section data-notale-page><h1>标题</h1><p>内容</p></section>', client
    )
    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )
    assert result.is_error
    assert "escapes the 1280x720 frame" in result.output
    assert client.inspection_requests == []
    assert "inspected_revision" not in state.tool_state


@pytest.mark.asyncio
async def test_decoration_bleeding_off_canvas_does_not_gate(tmp_path: Path):
    """A decorative bleed is a normal idiom; only text overflow is decisive."""
    client = _MeasuringRenderer([text_msg(json.dumps({"decision": "success", "findings": [], "html": ""}))])
    client.measurements = {
        "schema_version": 1,
        "frame": {"width": 1280, "height": 720},
        "elements": [],
        "decorations": [],
        "overflow": [
            {"tag": "div", "reason": "escapes-frame", "text": "", "rect": {"x": 1200, "y": 0, "w": 400, "h": 400}}
        ],
        "palette": {},
        "text": "",
        "backplate": None,
    }
    state = await _state_with_page(
        tmp_path, '<section data-notale-page><h1>标题</h1><p>内容</p></section>', client
    )
    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )
    assert not result.is_error
    assert len(client.inspection_requests) == 1


@pytest.mark.asyncio
async def test_absent_measurements_change_nothing_for_the_inspector(tmp_path: Path):
    """Why the whole suite stayed green: no measurement means no prompt change."""
    client = _MeasuringRenderer([text_msg(json.dumps({"decision": "success", "findings": [], "html": ""}))])
    client.measurements = {}
    state = await _state_with_page(
        tmp_path, '<section data-notale-page><h1>标题</h1><p>内容</p></section>', client
    )
    result = await InspectPageTool(state).execute(
        InspectPageInput(revision=1), ToolContext(state.workspace, {"turn": 2})
    )
    assert not result.is_error

    prompt = client.inspection_requests[0].messages[0].content[0].text
    assert "Measured defects" not in prompt

    report = json.loads((tmp_path / "inspections" / "p1-qa.json").read_text())
    assert report["summary"]["fail"] == 0
    assert report["summary"]["pending"] == len(report["checks"])
