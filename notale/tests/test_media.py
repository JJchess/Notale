import base64
import json
import struct
from pathlib import Path

import httpx
import pytest

from notale.core.observability import EventLog
from notale.tools.agent_tools import PageToolState
from notale.tools.media import (
    FindImageInput,
    FindImageTool,
    MakeImageInput,
    MakeImageTool,
    MakeBackplateInput,
    MakeBackplateTool,
    ensure_asset_manifest,
    inspect_image,
    load_asset_manifest,
)
from notale.style_studio.materialize import materialize_to_run


def test_media_tools_have_plain_names_and_arguments(tmp_path: Path):
    state = PageToolState(tmp_path, 1, EventLog(tmp_path))
    assert FindImageTool(state).name == "find_image"
    assert MakeImageTool(state).name == "make_image"
    assert FindImageInput(query="Paris", kind="place", alt="巴黎").alt == "巴黎"
    assert MakeImageInput(prompt="an abstract path planning field", alt="路径插画").alt == "路径插画"


def test_manifest_is_created_only_on_demand_and_has_no_version(tmp_path: Path):
    with pytest.raises(ValueError, match="does not exist"):
        load_asset_manifest(tmp_path, create=False)
    path = ensure_asset_manifest(tmp_path)
    assert path == tmp_path / "assets" / "manifest.json"
    value = load_asset_manifest(tmp_path, create=False)
    assert value == {"assets": [], "attempts": {"find": 0, "make": 0}}
    assert "schemaVersion" not in value


def test_image_probe_accepts_png():
    data = b"\x89PNG\r\n\x1a\n" + b"\0" * 8 + struct.pack(">II", 640, 480) + b"\0" * 1100
    assert inspect_image(data) == ("image/png", "png", 640, 480)


@pytest.mark.asyncio
async def test_make_image_missing_key_fails_without_network(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("PARATERA_API_KEY", raising=False)
    state = PageToolState(tmp_path, 1, EventLog(tmp_path))
    result = await MakeImageTool(state).execute(
        MakeImageInput(prompt="an abstract path planning field", alt="路径插画"), None
    )
    assert result.is_error
    assert "missing media API key" in result.output


@pytest.mark.asyncio
async def test_make_image_uses_paratera_seedream(tmp_path: Path, monkeypatch):
    image = b"\x89PNG\r\n\x1a\n" + b"\0" * 8 + struct.pack(">II", 1280, 720) + b"\0" * 1100
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "llmapi.paratera.com":
            return httpx.Response(
                200,
                json={
                    "data": [{"url": "https://seedream-output.test/generated.png"}],
                    "usage": {"generated_images": 1},
                },
            )
        if request.url.host == "seedream-output.test":
            return httpx.Response(200, content=image, headers={"content-type": "image/png"})
        return httpx.Response(404)

    def client_factory(**kwargs):
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setenv("PARATERA_API_KEY", "test-secret")
    state = PageToolState(tmp_path, 1, EventLog(tmp_path))
    result = await MakeImageTool(state, client_factory).execute(
        MakeImageInput(prompt="an abstract path planning field", alt="路径插画"), None
    )

    assert not result.is_error
    assert requests[0].url == "https://llmapi.paratera.com/v1/images/generations"
    payload = json.loads(requests[0].content)
    assert payload["model"] == "Doubao-Seedream-4.0"
    assert set(payload) == {"model", "prompt"}
    manifest = load_asset_manifest(tmp_path, create=False)
    record = manifest["assets"][0]
    assert record["model"] == "Doubao-Seedream-4.0"
    assert record["usage"] == {"generated_images": 1}
    assert "test-secret" not in json.dumps(manifest)


@pytest.mark.asyncio
async def test_backplate_flattens_negative_contract_without_changing_wire_shape(
    tmp_path: Path, monkeypatch
):
    image = b"\x89PNG\r\n\x1a\n" + b"\0" * 8 + struct.pack(">II", 1280, 720) + b"\0" * 1100
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={"data": [{"b64_json": base64.b64encode(image).decode()}]},
        )

    def client_factory(**kwargs):
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setenv("PARATERA_API_KEY", "test-secret")
    materialize_to_run("swiss-modern", tmp_path)
    state = PageToolState(tmp_path, 1, EventLog(tmp_path))
    result = await MakeBackplateTool(state, client_factory).execute(
        MakeBackplateInput(
            subject="an abstract quantum probability field",
            safe_areas=[{"role": "title", "x": 0.06, "y": 0.08, "w": 0.5, "h": 0.2}],
        ),
        None,
    )

    assert not result.is_error
    payload = json.loads(requests[0].content)
    assert set(payload) == {"model", "prompt"}
    assert "Avoid: text, letters, numbers" in payload["prompt"]
    manifest = load_asset_manifest(tmp_path, create=False)
    record = manifest["assets"][0]
    assert record["negative_prompt"]
    assert record["attempts"] == 1
