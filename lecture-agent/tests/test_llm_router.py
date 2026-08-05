from __future__ import annotations

from lecture_agent.adapters.llm import FakeClient, PurposeRouterClient


async def test_widget_purposes_use_dedicated_client() -> None:
    default = FakeClient(queue=["default"])
    sim = FakeClient(queue=["sim-plan", "sim-build", "sim-repair"])
    router = PurposeRouterClient(default=default, routes={"widget:": sim})

    assert await router.complete([], purpose="widget:plan") == "sim-plan"
    assert await router.complete([], purpose="widget:build") == "sim-build"
    assert await router.complete([], purpose="widget:quality-repair") == "sim-repair"
    assert await router.complete([], purpose="block:statement") == "default"

    assert [purpose for purpose, _ in sim.calls] == [
        "widget:plan",
        "widget:build",
        "widget:quality-repair",
    ]
    assert [purpose for purpose, _ in default.calls] == ["block:statement"]


async def test_quality_purposes_use_dedicated_client() -> None:
    default = FakeClient(queue=["default"])
    quality = FakeClient(queue=["review", "replan"])
    router = PurposeRouterClient(default=default, routes={"quality:": quality})

    assert await router.complete([], purpose="quality:page") == "review"
    assert await router.complete([], purpose="quality:replan") == "replan"
    assert await router.complete([], purpose="block:chart") == "default"
    assert [purpose for purpose, _ in quality.calls] == ["quality:page", "quality:replan"]
