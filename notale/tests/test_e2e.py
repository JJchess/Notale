import json
from pathlib import Path

import pytest

from notale.core.workflow import generate
from notale.tests.fake_llm import FakeClient, no_network


def page_fixture(number: int) -> str:
    return json.dumps({
        "html": f"<section data-notale-page><h1>页面 {number}</h1><p>有效知识内容</p></section>",
        "notes": f"讲稿 {number}",
    }, ensure_ascii=False)


@pytest.mark.asyncio
async def test_planner_then_parallel_builders_with_complete_logs(tmp_path: Path, plan_data):
    fixtures = {"plan": json.dumps(plan_data, ensure_ascii=False)}
    fixtures.update({f"build:p{number}": page_fixture(number) for number in range(1, 5)})
    client = FakeClient(by_purpose=fixtures, delay=0.01)
    with no_network():
        result = await generate(client, "四页路径讲义", out_root=tmp_path)

    assert result.completed == ["p1", "p2", "p3", "p4"]
    assert not result.degraded
    assert result.deck_path.is_file()
    assert (result.run_dir / "plan.json").is_file()
    assert (result.run_dir / "run.json").is_file()
    assert (result.run_dir / "summary.json").is_file()
    assert not (result.run_dir / "manifest.json").exists()
    assert not (result.run_dir / "agents").exists()
    assert not (result.run_dir / "page-contexts").exists()
    assert not (result.run_dir / "assets" / "manifest.json").exists()
    request_files = sorted((result.run_dir / "llm-requests").glob("*/turn-*.json"))
    assert len(request_files) == 10
    plan = json.loads((result.run_dir / "plan.json").read_text())
    style_dir = result.run_dir / "skills" / plan["design"]["name"]
    assert (style_dir / "SKILL.md").is_file()
    assert (style_dir / "tokens.json").is_file()
    assert (style_dir / "compositions.json").is_file()
    builder_request = json.loads(
        (result.run_dir / "llm-requests" / "builder-p1" / "turn-0001.json").read_text()
    )
    builder_system = builder_request["request"]["messages"][0]["content"]
    assert "Run design Skill: pathways-field-guide" in builder_system
    assert "Assigned page composition" in builder_system
    assert '\"id\": \"route-field\"' in builder_system
    assert '\"id\": \"forked-ledger\"' not in builder_system
    assert "Available composition catalog" not in builder_system
    assert "narrative-keynote" not in builder_system
    assert "--notale-accent: #176b87" in (
        result.run_dir / "runtime" / "global.css"
    ).read_text()

    events = [json.loads(line) for line in (result.run_dir / "events.jsonl").read_text().splitlines()]
    kinds = [event["kind"] for event in events]
    snapshot = next(event for event in events if event["kind"] == "run.snapshot")
    assert "style-studio" in snapshot["payload"]["skills"]["planner"]
    assert kinds.index("planner.completed") < kinds.index("builder.started")
    assert [event["seq"] for event in events] == list(range(1, len(events) + 1))
    summary = json.loads((result.run_dir / "summary.json").read_text())
    assert summary["peak_builder_concurrency"] >= 2
    assert summary["model_calls"] >= 10
    assert summary["model_calls"] == len(request_files)
    assert summary["total_tokens"] > 0
    assert summary["planner"]["grouped"] is False
    assert summary["planner"]["pages"] == 4
    assert summary["planner"]["style"]["name"] == plan["design"]["name"]


@pytest.mark.asyncio
async def test_current_resume_reuses_plan_and_terminal_pages(tmp_path: Path, plan_data):
    fixtures = {"plan": json.dumps(plan_data, ensure_ascii=False)}
    fixtures.update({f"build:p{number}": page_fixture(number) for number in range(1, 5)})
    first = await generate(FakeClient(by_purpose=fixtures), "topic", out_root=tmp_path)
    idle = FakeClient()
    resumed = await generate(idle, "topic", resume_dir=first.run_dir)
    assert resumed.deck_path == first.deck_path
    assert idle.calls == []


@pytest.mark.asyncio
async def test_resume_rejects_tampered_run_style(tmp_path: Path, plan_data):
    fixtures = {"plan": json.dumps(plan_data, ensure_ascii=False)}
    fixtures.update({f"build:p{number}": page_fixture(number) for number in range(1, 5)})
    first = await generate(FakeClient(by_purpose=fixtures), "topic", out_root=tmp_path)
    plan = json.loads((first.run_dir / "plan.json").read_text())
    tokens = first.run_dir / "skills" / plan["design"]["name"] / "tokens.json"
    tokens.write_text(tokens.read_text().replace("#176b87", "#000000"))
    with pytest.raises(ValueError, match="hash mismatch"):
        await generate(FakeClient(), "topic", resume_dir=first.run_dir)


@pytest.mark.asyncio
async def test_builder_block_creates_same_schema_fallback(tmp_path: Path, plan_data):
    fixtures = {"plan": json.dumps(plan_data, ensure_ascii=False)}
    fixtures.update({f"build:p{number}": page_fixture(number) for number in range(1, 5)})
    fixtures["build:p2"] = json.dumps({"block": "fixture blocker"})
    result = await generate(FakeClient(by_purpose=fixtures), "topic", out_root=tmp_path)
    assert result.degraded == ["p2"]
    fallback = json.loads((result.run_dir / "pages" / "p2.json").read_text())
    assert set(fallback) == {"html", "notes"}
    assert "安全降级" in fallback["html"]


@pytest.mark.asyncio
async def test_resume_rejects_old_or_changed_contract(tmp_path: Path, plan_data):
    old = tmp_path / "old"
    old.mkdir()
    (old / "manifest.json").write_text("{}")
    with pytest.raises(ValueError, match="run.json"):
        await generate(FakeClient(), "topic", resume_dir=old)

    fixtures = {"plan": json.dumps(plan_data, ensure_ascii=False)}
    fixtures.update({f"build:p{number}": page_fixture(number) for number in range(1, 5)})
    result = await generate(FakeClient(by_purpose=fixtures), "topic", out_root=tmp_path)
    run = json.loads((result.run_dir / "run.json").read_text())
    run["contract_hash"] = "old"
    (result.run_dir / "run.json").write_text(json.dumps(run))
    with pytest.raises(ValueError, match="contract changed"):
        await generate(FakeClient(), "topic", resume_dir=result.run_dir)
