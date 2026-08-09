"""Documentary/generated media tools and manifest-bound page checks."""

from __future__ import annotations

import json
import struct
from types import SimpleNamespace

import httpx

from notale.core.models import PageArtifact
from notale.core.stages.page_check import page_delivery_failures
from notale.tools.media import (
    AcquireMediaInput,
    AcquireMediaTool,
    GenerateMediaInput,
    GenerateMediaTool,
)
from notale.utils.config import get_config


def _png(width: int = 640, height: int = 360) -> bytes:
    header = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + struct.pack(">II", width, height)
    return header + b"\x08\x06\x00\x00\x00" + bytes(2048)


class _State:
    def __init__(self, run_dir):
        self.run_dir = run_dir
        self.validation_context = {"page_id": "p15"}
        self.task = SimpleNamespace(workerId="p15")
        self.tool_state = {}
        self.events = []

    def save_tool_state(self):
        pass

    def event(self, kind, **fields):
        self.events.append({"kind": kind, **fields})


def _factory(transport):
    def create(**kwargs):
        return httpx.AsyncClient(transport=transport, **kwargs)
    return create


async def test_acquire_media_downloads_commons_asset_and_binds_manifest(tmp_path):
    image = _png()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "commons.wikimedia.org":
            return httpx.Response(200, json={
                "query": {"pages": [{
                    "title": "File:John von Neumann.jpg",
                    "imageinfo": [{
                        "mime": "image/jpeg",
                        "thumburl": "https://upload.test/neumann.png",
                        "thumbwidth": 640,
                        "thumbheight": 360,
                        "descriptionurl": "https://commons.wikimedia.org/wiki/File:John_von_Neumann.jpg",
                        "extmetadata": {
                            "Artist": {"value": "<b>Los Alamos</b>"},
                            "LicenseShortName": {"value": "Public domain"},
                            "LicenseUrl": {"value": "https://creativecommons.org/publicdomain/mark/1.0/"},
                        },
                    }],
                }]},
            })
        if request.url.host == "upload.test":
            return httpx.Response(200, content=image, headers={"content-type": "image/png"})
        return httpx.Response(404)

    state = _State(tmp_path)
    tool = AcquireMediaTool(state, _factory(httpx.MockTransport(handler)))
    result = await tool.execute(AcquireMediaInput(
        query="John von Neumann portrait", kind="person", alt_text="冯·诺依曼肖像"
    ), None)  # type: ignore[arg-type]
    assert not result.is_error
    output = json.loads(result.output)
    assert output["htmlSrc"].startswith("../assets/")
    manifest = json.loads((tmp_path / "asset-manifest.json").read_text())
    record = manifest["assets"][0]
    assert record["pageId"] == "p15" and record["sourceType"] == "wikimedia-commons"
    assert record["license"] == "Public domain" and record["creator"] == "Los Alamos"
    assert (tmp_path / record["localPath"]).read_bytes() == image

    page = PageArtifact(
        pageId="p15",
        html=(f'<section data-notale-page><figure><img src="{output["htmlSrc"]}" alt="{output["alt"]}">'
              '<figcaption>1945 年的算法研究背景</figcaption></figure></section>'),
    )
    checked = page_delivery_failures(page, set(), run_dir=tmp_path)
    assert checked == []

    missing_alt = PageArtifact(pageId="p15", html=f'<img src="{output["htmlSrc"]}" alt="">')
    assert any(
        "alt" in failure
        for failure in page_delivery_failures(missing_alt, set(), run_dir=tmp_path)
    )


async def test_generate_media_uses_paratera_seedream_and_records_prompt(tmp_path, monkeypatch):
    image = _png(1280, 720)
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "llmapi.paratera.com":
            return httpx.Response(200, json={
                "data": [{"url": "https://seedream-output.test/generated.png"}],
                "usage": {"generated_images": 1},
            })
        if request.url.host == "seedream-output.test":
            return httpx.Response(200, content=image, headers={"content-type": "image/png"})
        return httpx.Response(404)

    monkeypatch.setenv("PARATERA_API_KEY", "test-secret")
    state = _State(tmp_path)
    tool = GenerateMediaTool(state, _factory(httpx.MockTransport(handler)))
    result = await tool.execute(GenerateMediaInput(
        prompt="Abstract array cells separating around a pivot, editorial paper-cut style",
        role="editorial-illustration",
        alt_text="围绕枢轴分开的数组",
    ), None)  # type: ignore[arg-type]
    assert not result.is_error
    assert requests[0].url == "https://llmapi.paratera.com/v1/images/generations"
    body = json.loads(requests[0].content)
    assert set(body) == {"model", "prompt"}
    assert body["model"] == "Doubao-Seedream-4.0"
    assert "non-documentary editorial illustration" in body["prompt"]
    manifest_text = (tmp_path / "asset-manifest.json").read_text()
    assert "test-secret" not in manifest_text
    record = json.loads(manifest_text)["assets"][0]
    assert record["sourceType"] == "generated-editorial"
    assert record["promptSha256"] and record["usage"]["generated_images"] == 1


def test_unmanifested_image_fails_l0(tmp_path):
    page = PageArtifact(pageId="p1", html='<img src="../assets/ghost.png" alt="缺失素材">')
    result = page_delivery_failures(page, set(), run_dir=tmp_path)
    assert any("未登记" in failure for failure in result)

    background = PageArtifact(
        pageId="p1", html='<p style="background:url(../assets/ghost.png)">内容</p>'
    )
    result2 = page_delivery_failures(background, set(), run_dir=tmp_path)
    assert any("带 alt 的 img" in failure for failure in result2)


async def test_media_request_budget_prevents_provider_call(tmp_path):
    state = _State(tmp_path)
    state.tool_state["mediaAttempts"] = {
        "acquire": get_config().media.maximum_acquisitions_per_page,
    }

    def forbidden(**kwargs):
        del kwargs
        raise AssertionError("provider must not be called after budget exhaustion")

    tool = AcquireMediaTool(state, forbidden)
    result = await tool.execute(AcquireMediaInput(
        query="Ada Lovelace portrait", kind="person", alt_text="阿达·洛芙莱斯肖像"
    ), None)  # type: ignore[arg-type]
    assert result.is_error and "budget exhausted" in result.output
