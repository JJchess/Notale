import importlib.util
import json
from pathlib import Path

import pytest

from notale.core.observability import EventLog
from notale.tests.fake_llm import FakeClient
from notale.tools.agent_tools import PageToolState
from notale.tools.create_minigame import CreateMinigameInput, CreateMinigameTool


_SKILL_VALIDATOR_PATH = (
    Path(__file__).resolve().parents[1]
    / "skills" / "build-minigame-from-query" / "scripts" / "validate_game.py"
)


def _load_skill_validator():
    spec = importlib.util.spec_from_file_location("skill_validate_game", _SKILL_VALIDATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _plan(*, visual_medium: str = "pixel_art_canvas", tag_name: str = "lawn-mower-game") -> str:
    return json.dumps({
        "core_verb": "mow",
        "model_summary": "a grid lawn with tree obstacles",
        "result_summary": "every grass cell is cut in as few moves as possible",
        "initial_state": "a 6x9 grid with trees and the mower on a free cell",
        "allowed_actions": "move the mower up/down/left/right one cell",
        "invalid_actions": "moving into a tree or off the grid",
        "completion_rule": "every grass cell has been mowed",
        "reset_behavior": "generate a new lawn layout",
        "uses_score": True,
        "score_rule": "compare total moves to a boustrophedon benchmark",
        "visual_medium": visual_medium,
        "medium_reason": "a tile grid with a moving agent is a tangible world",
        "tag_name": tag_name,
        "title": "Lawn Mower",
    }, ensure_ascii=False)


def _component_js(*, tag_name: str = "lawn-mower-game", with_canvas: bool = True,
                   with_reset_event: bool = True) -> str:
    canvas_bits = (
        '<canvas width="180" height="120"></canvas>'
        if with_canvas else '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'
    )
    canvas_ctx = (
        'const ctx = this.shadowRoot.querySelector("canvas").getContext("2d");\n'
        '    ctx.fillStyle = "#3f7d32"; ctx.fillRect(0, 0, 10, 10);'
        if with_canvas else ""
    )
    reset_emit = '    this._emit("game-reset", {});' if with_reset_event else ""
    class_name = "".join(part.capitalize() for part in tag_name.split("-"))
    return f"""const GAME_TITLE = "Lawn Mower";
class {class_name} extends HTMLElement {{
  constructor() {{
    super();
    this.attachShadow({{ mode: "open" }});
    this.shadowRoot.innerHTML = `
      <style>
        button:focus-visible {{ outline: 3px solid yellow; }}
        @media (prefers-reduced-motion: reduce) {{ * {{ transition: none; }} }}
      </style>
      {canvas_bits}
      <p aria-live="polite" data-message></p>
      <button type="button" data-action="go">Go</button>
    `;
    this._state = {{ phase: "idle", moves: 0 }};
  }}
  connectedCallback() {{
    this.shadowRoot.addEventListener("click", () => this._move());
    this.shadowRoot.addEventListener("keydown", () => this._move());
    {canvas_ctx}
  }}
  start() {{
    this._state.phase = "active";
    this._emit("game-start", {{}});
  }}
  reset() {{
    this._state = {{ phase: "idle", moves: 0 }};
{reset_emit}
  }}
  getState() {{
    return JSON.parse(JSON.stringify(this._state));
  }}
  _move() {{
    if (this._state.phase !== "active") return;
    this._state.moves += 1;
    this._emit("game-progress", {{ state: this.getState(), action: {{}}, metrics: {{}} }});
    if (this._state.moves >= 3) {{
      this._state.phase = "complete";
      this._emit("game-complete", {{ score: 1, metrics: {{}}, trace: [] }});
    }}
  }}
  _emit(type, detail) {{
    this.dispatchEvent(new CustomEvent(type, {{ detail, bubbles: true, composed: true }}));
  }}
}}
customElements.define("{tag_name}", {class_name});
"""


def _index_html(*, tag_name: str = "lawn-mower-game") -> str:
    return f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Lawn Mower</title></head>
<body>
<{tag_name}></{tag_name}>
<script type="module" src="./game-component.js"></script>
</body>
</html>"""


def _build_response(*, tag_name: str = "lawn-mower-game", with_canvas: bool = True,
                     with_reset_event: bool = True) -> str:
    header = json.dumps(
        {"title": "Lawn Mower", "assistant_text": "Mow every cell in as few moves as possible."},
        ensure_ascii=False,
    )
    return (
        header
        + "\n<index_html>\n" + _index_html(tag_name=tag_name) + "\n</index_html>\n"
        + "<game_component_js>\n"
        + _component_js(tag_name=tag_name, with_canvas=with_canvas, with_reset_event=with_reset_event)
        + "\n</game_component_js>"
    )


@pytest.mark.asyncio
async def test_create_minigame_end_to_end_writes_two_files_and_manifest(tmp_path: Path):
    client = FakeClient(by_purpose={
        "component:p1:minigame-plan": _plan(),
        "component:p1:minigame-build": _build_response(),
    })
    state = PageToolState(tmp_path, 1, EventLog(tmp_path), llm=client)

    result = await CreateMinigameTool(state).execute(
        CreateMinigameInput(brief="Why some people mow a lawn better than others"), None
    )

    assert not result.is_error, result.output
    output = json.loads(result.output)
    assert set(output) == {"minigame_id", "tag_name", "title", "index_path", "component_path"}
    assert output["tag_name"] == "lawn-mower-game"

    index_path = tmp_path / output["index_path"]
    component_path = tmp_path / output["component_path"]
    assert index_path.is_file()
    assert component_path.is_file()

    manifest = json.loads((tmp_path / "minigames" / "manifest.json").read_text())
    record = manifest["minigames"][0]
    assert record["model_calls"] == 2
    assert record["repair_calls"] == 0
    assert [purpose for purpose, _ in client.calls] == [
        "component:p1:minigame-plan", "component:p1:minigame-build",
    ]

    # Cross-check against the skill's own validator: it should also see a clean pass with no hint,
    # since this fixture already uses canvas (not a bare-rect/circle stand-in).
    validator = _load_skill_validator()
    failures, hints = validator.validate(index_path.parent)
    assert failures == []
    assert hints == []


@pytest.mark.asyncio
async def test_medium_mismatch_triggers_one_repair_then_succeeds(tmp_path: Path):
    client = FakeClient(by_purpose={
        "component:p1:minigame-plan": _plan(),
        "component:p1:minigame-build": _build_response(with_canvas=False),
        "component:p1:minigame-repair-build": _build_response(with_canvas=True),
    })
    state = PageToolState(tmp_path, 1, EventLog(tmp_path), llm=client)

    result = await CreateMinigameTool(state).execute(
        CreateMinigameInput(brief="Why some people mow a lawn better than others"), None
    )

    assert not result.is_error, result.output
    manifest = json.loads((tmp_path / "minigames" / "manifest.json").read_text())
    record = manifest["minigames"][0]
    assert record["model_calls"] == 3
    assert record["repair_calls"] == 1
    assert [purpose for purpose, _ in client.calls] == [
        "component:p1:minigame-plan", "component:p1:minigame-build",
        "component:p1:minigame-repair-build",
    ]


@pytest.mark.asyncio
async def test_build_missing_lifecycle_event_fails_after_one_repair(tmp_path: Path):
    client = FakeClient(by_purpose={
        "component:p1:minigame-plan": _plan(),
        "component:p1:minigame-build": _build_response(with_reset_event=False),
        "component:p1:minigame-repair-build": _build_response(with_reset_event=False),
    })
    state = PageToolState(tmp_path, 1, EventLog(tmp_path), llm=client)

    result = await CreateMinigameTool(state).execute(
        CreateMinigameInput(brief="Why some people mow a lawn better than others"), None
    )

    assert result.is_error
    assert "game-reset" in result.output
    assert not (tmp_path / "minigames" / "manifest.json").is_file()


@pytest.mark.asyncio
async def test_blank_brief_is_rejected_without_any_model_call(tmp_path: Path):
    client = FakeClient()
    state = PageToolState(tmp_path, 1, EventLog(tmp_path), llm=client)

    result = await CreateMinigameTool(state).execute(CreateMinigameInput(brief="   "), None)

    assert result.is_error
    assert "brief is required" in result.output
    assert client.calls == []


@pytest.mark.asyncio
async def test_second_attempt_on_same_state_is_budget_blocked(tmp_path: Path):
    client = FakeClient(by_purpose={
        "component:p1:minigame-plan": _plan(),
        "component:p1:minigame-build": _build_response(),
    })
    state = PageToolState(tmp_path, 1, EventLog(tmp_path), llm=client)
    tool = CreateMinigameTool(state)

    first = await tool.execute(CreateMinigameInput(brief="a lawn mowing game"), None)
    assert not first.is_error, first.output

    second = await tool.execute(CreateMinigameInput(brief="a lawn mowing game"), None)
    assert second.is_error
    assert "budget is exhausted" in second.output
