import json
from pathlib import Path

import pytest

from notale.agents.builder import BuilderWorker
from notale.tools.create_widget.guidance import (
    compose_bundle,
    direction_spec,
    example_widget_code,
    notale_override,
)
from notale.tools.create_code_runtime import CreateCodeRuntimeInput, CreateCodeRuntimeTool
from notale.tools.create_code_runtime.models import CodeRuntimeSpec
from notale.tools.create_code_runtime.validation import validate_runtime_execution
from notale.tools.create_widget import CreateWidgetInput, CreateWidgetTool
from notale.core.models import Chapter, LecturePlan, PageArtifact, PagePlan
from notale.core.observability import EventLog
from notale.core.stages.page_check import page_delivery_failures
from notale.tests.fake_llm import FakeClient, ScriptedClient, _default_style
from notale.tools.agent_tools import PageToolState
from notale.utils.skill_catalog import create_generated_style
from notale.web.deck import write_deck_package


def _page(page_type: str) -> PagePlan:
    return PagePlan.model_validate({
        "type": page_type,
        "composition": "decision-bench",
        "claim": "参数改变会重排系统轨迹",
        "learning_action": "操纵参数并解释状态变化",
        "narrative_role": "揭示机制",
        "links": [],
        "tools": ["create_widget"] if page_type == "sim-explorable" else ["create_code_runtime"],
    })


def _widget_plan() -> str:
    return json.dumps({
        "core_insight": "阈值改变会重排两条轨迹",
        "render_medium": "svg",
        "render_medium_reason": "两条路径需要清晰的矢量线",
        "aesthetic_direction": "blueprint",
        "direction_reason": "机制适合工程图表达",
        "signature_detail": "沿路径移动的强调节点",
        "layout_pattern": "stage-readout-row",
        "layout_skeleton": "control row / dominant SVG stage / compact readout",
        "state_model": [{
            "name": "threshold", "type": "float", "range_or_values": "0..10", "initial": "4",
        }],
        "interactions": [{
            "trigger": "range#threshold input", "effect": "update threshold and both paths",
        }],
        "render_contract": "update() derives the readout and SVG path positions from threshold",
        "initial_paint": "threshold 4 with both paths already separated",
    }, ensure_ascii=False)


def _valid_widget(title: str = "阈值轨迹") -> str:
    code = """<style>
[data-notale-widget-root]{width:100%;height:100%;display:grid;grid-template-rows:auto 1fr;background:var(--notale-bg);color:var(--notale-ink);border:1px solid var(--notale-line)}
.stage{background:var(--notale-surface)} button{color:var(--notale-accent)}
</style>
<section data-notale-widget-root><div><label>阈值 <input id="threshold" type="range" min="0" max="10" value="4"></label><button data-action="reset">重置</button></div><div class="stage"><svg viewBox="0 0 600 260" aria-label="两条轨迹"><path id="trace" d="M20 200 Q300 30 580 130" fill="none" stroke="var(--notale-accent-2)" stroke-width="8"/></svg><output id="readout">阈值 4</output></div></section>
<script>
(()=>{"use strict";const slider=document.querySelector("#threshold");const out=document.querySelector("#readout");let threshold=4;function update(){out.textContent=`阈值 ${threshold}`;document.querySelector("#trace").style.transform=`translateY(${threshold}px)`}function reset(){threshold=4;slider.value="4";update()}slider.addEventListener("input",()=>{threshold=Number(slider.value);update()});document.querySelector('[data-action="reset"]').addEventListener("click",reset);update()})();
</script>"""
    return json.dumps(
        {"title": title, "widget_type": "interactive", "assistant_text": "操纵阈值观察轨迹。"},
        ensure_ascii=False,
    ) + "\n<widget_code>\n" + code + "\n</widget_code>"


def _runtime_spec(*, wrong_expected: bool = False) -> str:
    return json.dumps({
        "title": "实现数组求和",
        "instruction": "补全 solve(input)，让它返回数组中全部数字的和。",
        "starter_code": "function solve(input) { return input.length; }",
        "reference_code": "function solve(input) { return input.reduce((sum, value) => sum + value, 0); }",
        "fixtures": [
            {"name": "正数", "input_json": "[1,2,3]", "expected_json": "7" if wrong_expected else "6"},
            {"name": "含负数", "input_json": "[-2,5,1]", "expected_json": "4"},
        ],
    }, ensure_ascii=False)


def test_full_generativaui_bundle_is_available_but_notale_overrides_the_host_contract():
    for widget_type in (
        "interactive", "chart", "chart_interactive", "mockup", "art",
        "art_interactive", "diagram",
    ):
        bundle = compose_bundle(widget_type)
        assert len(bundle) > 10000
        assert "--color-" not in bundle
        assert "cdnjs.cloudflare.com" not in bundle
    for direction in (
        "lab-dark", "paper-editorial", "studio-pop", "terminal-data",
        "soft-organic", "blueprint", "ink-wash", "host-calm",
    ):
        assert direction_spec(direction)
        assert len(example_widget_code(direction)) > 1000
    override = notale_override(900, 460)
    assert "exactly 900×460px" in override
    assert "Style Studio is authoritative" in override
    assert "no remote assets" in override.lower()


def test_builder_receives_only_assigned_component_tool_and_no_retired_skill(tmp_path: Path):
    style = create_generated_style(**_default_style())
    page = _page("sim-explorable")
    plan = LecturePlan(
        title="组件边界", language="zh", audience="学习者", throughline="观察机制",
        chapters=[Chapter(
            id="whole", title="全章", pages=1, goal="理解", entry="观察", payoff="解释",
        )],
        design=style.reference,
        pages=[page],
    )
    worker = BuilderWorker(
        llm=ScriptedClient([]), run_dir=tmp_path, plan=plan, page=1,
        style=style, logger=EventLog(tmp_path),
    )
    names = [tool.name for tool in worker.agent.tools]
    assert "create_widget" in names
    assert "create_code_runtime" not in names
    assert "create-sim" not in worker.agent.system_prompt
    assert "create-code-runtime" not in worker.agent.system_prompt
    assert "Assigned page composition" in worker.agent.system_prompt


def test_component_brief_is_optional_and_has_no_length_bounds():
    for model in (CreateWidgetInput, CreateCodeRuntimeInput):
        schema = model.model_json_schema()
        brief = schema["properties"]["brief"]
        assert brief["default"] == ""
        assert "brief" not in schema.get("required", [])
        assert "minLength" not in brief
        assert "maxLength" not in brief

    assert len(CreateWidgetInput(brief="x" * 10_000).brief) == 10_000


@pytest.mark.asyncio
async def test_create_widget_uses_two_isolated_calls_and_returns_only_mount(tmp_path: Path):
    page = _page("sim-explorable")
    style = create_generated_style(**_default_style())
    client = FakeClient(by_purpose={
        "component:p1:widget-plan": _widget_plan(),
        "component:p1:widget-build": _valid_widget(),
    })
    state = PageToolState(
        tmp_path, 1, EventLog(tmp_path), page_plan=page, style=style,
        lecture_language="zh", llm=client,
    )

    result = await CreateWidgetTool(state).execute(
        CreateWidgetInput(brief="展示阈值如何改变两条系统轨迹", width=900, height=460), None
    )

    assert not result.is_error, result.output
    output = json.loads(result.output)
    assert set(output) == {"component_id", "mount_html", "title", "width", "height"}
    assert "widget_code" not in result.output
    assert "<svg" not in result.output
    assert [purpose for purpose, _ in client.calls] == [
        "component:p1:widget-plan", "component:p1:widget-build",
    ]
    manifest = json.loads((tmp_path / "components" / "manifest.json").read_text())
    assert manifest["components"][0]["model_calls"] == 2
    assert manifest["components"][0]["provenance"].startswith("JJchess/GenerativeUI@")
    source = (tmp_path / manifest["components"][0]["local_path"]).read_text()
    assert "Content-Security-Policy" in source
    assert "--notale-accent" in source

    artifact = PageArtifact(
        html=f'<section data-notale-page><p>解释轨迹变化</p><div class="mount">{output["mount_html"]}</div></section>'
    )
    assert not await page_delivery_failures(
        artifact, page=1, run_dir=tmp_path, page_plan=page
    )
    deck = write_deck_package(tmp_path, [artifact], "组件测试", style_tokens=style.tokens)
    slide = (tmp_path / "slides" / "p1.html").read_text()
    assert deck.is_file()
    assert f'src="../components/{output["component_id"]}.html"' in slide
    assert 'sandbox="allow-scripts"' in slide


@pytest.mark.asyncio
async def test_widget_allows_one_targeted_repair_and_no_more(tmp_path: Path):
    page = _page("sim-explorable")
    style = create_generated_style(**_default_style())
    client = FakeClient(by_purpose={
        "component:p1:widget-plan": _widget_plan(),
        "component:p1:widget-build": '{"title":"坏输出"}',
        "component:p1:widget-repair-build": _valid_widget("修复后的轨迹"),
    })
    state = PageToolState(
        tmp_path, 1, EventLog(tmp_path), page_plan=page, style=style,
        lecture_language="zh", llm=client,
    )
    result = await CreateWidgetTool(state).execute(
        CreateWidgetInput(brief="展示阈值如何改变两条系统轨迹"), None
    )
    assert not result.is_error, result.output
    manifest = json.loads((tmp_path / "components" / "manifest.json").read_text())
    assert manifest["components"][0]["model_calls"] == 3
    assert manifest["components"][0]["repair_calls"] == 1
    assert len(client.calls) == 3


@pytest.mark.asyncio
async def test_code_runtime_is_one_spec_call_plus_deterministic_compiler(tmp_path: Path):
    page = _page("code-runnable")
    style = create_generated_style(**_default_style())
    client = FakeClient(by_purpose={
        "component:p1:code-runtime-spec": _runtime_spec(),
    })
    state = PageToolState(
        tmp_path, 1, EventLog(tmp_path), page_plan=page, style=style,
        lecture_language="zh", llm=client,
    )

    result = await CreateCodeRuntimeTool(state).execute(
        CreateCodeRuntimeInput(brief="用 JavaScript 实现数组求和并通过测试"), None
    )

    assert not result.is_error, result.output
    assert [purpose for purpose, _ in client.calls] == ["component:p1:code-runtime-spec"]
    output = json.loads(result.output)
    manifest = json.loads((tmp_path / "components" / "manifest.json").read_text())
    record = manifest["components"][0]
    assert record["model_calls"] == 1
    source = (tmp_path / record["local_path"]).read_text()
    assert "new Worker" in source
    assert "data-action=\"run\"" in source
    assert "data-action=\"reset\"" in source
    assert "input.reduce" not in source
    artifact = PageArtifact(
        html=f'<section data-notale-page><p>实现并检验求和规则</p>{output["mount_html"]}</section>'
    )
    assert not await page_delivery_failures(
        artifact, page=1, run_dir=tmp_path, page_plan=page
    )


@pytest.mark.asyncio
async def test_runtime_reference_and_expected_values_are_checked_by_node(tmp_path: Path):
    spec = CodeRuntimeSpec.model_validate_json(_runtime_spec(wrong_expected=True))
    failures = await validate_runtime_execution(
        spec, workspace=tmp_path, timeout_sec=8, error_chars=1200
    )
    assert any("reference mismatch" in item for item in failures)


@pytest.mark.asyncio
async def test_submit_rejects_tampered_or_cross_page_component_mount(tmp_path: Path):
    page = _page("sim-explorable")
    style = create_generated_style(**_default_style())
    client = FakeClient(by_purpose={
        "component:p1:widget-plan": _widget_plan(),
        "component:p1:widget-build": _valid_widget(),
    })
    state = PageToolState(
        tmp_path, 1, EventLog(tmp_path), page_plan=page, style=style,
        lecture_language="zh", llm=client,
    )
    result = await CreateWidgetTool(state).execute(
        CreateWidgetInput(brief="展示阈值如何改变两条系统轨迹"), None
    )
    mount = json.loads(result.output)["mount_html"]
    tampered = PageArtifact(
        html=f'<section data-notale-page><p>轨迹</p>{mount.replace("width=\"960\"", "width=\"800\"")}</section>'
    )
    failures = await page_delivery_failures(
        tampered, page=1, run_dir=tmp_path, page_plan=page
    )
    assert any("dimensions" in item or "exactly" in item for item in failures)

    cross_page = PageArtifact(html=f'<section data-notale-page><p>跨页</p>{mount}</section>')
    failures = await page_delivery_failures(
        cross_page, page=2, run_dir=tmp_path, page_plan=None
    )
    assert any("not registered" in item for item in failures)

    outer_script = PageArtifact(
        html=f'<section data-notale-page><p>脚本</p>{mount}<script>console.log(1)</script></section>'
    )
    failures = await page_delivery_failures(
        outer_script, page=1, run_dir=tmp_path, page_plan=page
    )
    assert any("outer-page scripts" in item for item in failures)


def test_hydrate_skips_fallback_that_mentions_component_id_in_text(tmp_path: Path):
    from notale.core.stages.page_check import make_fallback_page
    from notale.tools.managed_component import hydrate_component_mounts, write_component

    record = write_component(
        tmp_path,
        component_id="p4-widget-aa37777d56e1",
        page=4,
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
    reason = (
        "无法完成确定性校验：已按 create_widget 返回的 mount_html 原样嵌入 "
        f'`<iframe data-notale-component="{record.component_id}" ...`'
    )
    fallback = make_fallback_page(4, _page("sim-explorable"), reason)

    hydrated = hydrate_component_mounts(fallback.html, page=4, run_dir=tmp_path)

    assert hydrated == fallback.html

    kept_mount = f'<section data-notale-page><p>正文</p>{record.mount_html}</section>'
    hydrated = hydrate_component_mounts(kept_mount, page=4, run_dir=tmp_path)
    assert f'src="../{record.local_path}"' in hydrated

    altered = kept_mount.replace('width="960"', 'width="800"')
    with pytest.raises(ValueError, match="changed after submission"):
        hydrate_component_mounts(altered, page=4, run_dir=tmp_path)
