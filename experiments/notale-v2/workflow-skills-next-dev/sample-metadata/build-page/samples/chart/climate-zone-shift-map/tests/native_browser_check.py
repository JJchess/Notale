#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright


ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "pages/index.html"
SHOTS = ROOT / ".codex-shots/native-final"


async def inspect_page(browser, reduced: bool = False):
    context = await browser.new_context(
        viewport={"width": 1600, "height": 900},
        device_scale_factor=1,
        reduced_motion="reduce" if reduced else "no-preference",
    )
    page = await context.new_page()
    errors: list[str] = []
    requests: list[str] = []
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: requests.append(request.url))
    await page.goto(PAGE.as_uri(), wait_until="load")
    assert await page.evaluate("ClimateChart.ready") is True
    await page.wait_for_timeout(120)
    assert await page.locator(".city").count() == 70
    visible_label_count = int(await page.locator("#mapLabels").get_attribute("data-visible-labels") or 0)
    assert visible_label_count > 0
    assert not errors, errors
    assert all(url.startswith("file:") for url in requests), requests

    if reduced:
        await page.evaluate("ClimateChart.setYear('future')")
        await page.wait_for_timeout(40)
        opacity = float(await page.locator("#futureMap").evaluate("el => getComputedStyle(el).opacity"))
        assert opacity > 0.99, opacity
        await page.screenshot(path=SHOTS / "reduced-1600.png")
        await context.close()
        return {"reduced_future_opacity": opacity, "errors": errors}

    await page.evaluate("ClimateChart.reset()")
    await page.wait_for_timeout(80)
    await page.screenshot(path=SHOTS / "present-1600.png")
    present_state = await page.evaluate("ClimateChart.getState()")

    await page.evaluate("ClimateChart.setYear('future')")
    await page.wait_for_timeout(1000)
    midpoint_opacity = float(await page.locator("#futureMap").evaluate("el => getComputedStyle(el).opacity"))
    assert 0.35 < midpoint_opacity < 0.65, midpoint_opacity
    await page.screenshot(path=SHOTS / "midpoint-1600.png")
    await page.wait_for_timeout(1100)
    future_opacity = float(await page.locator("#futureMap").evaluate("el => getComputedStyle(el).opacity"))
    assert future_opacity > 0.99, future_opacity
    await page.screenshot(path=SHOTS / "future-1600.png")

    await page.evaluate("ClimateChart.setYear('present')")
    await page.wait_for_timeout(700)
    reversing_opacity = float(await page.locator("#futureMap").evaluate("el => getComputedStyle(el).opacity"))
    assert reversing_opacity < 0.75, reversing_opacity

    await page.evaluate("ClimateChart.setFocus('temperate')")
    assert await page.locator('[data-zone="temperate"]').get_attribute("aria-pressed") == "true"
    assert (await page.evaluate("ClimateChart.getState()"))["focus"] == "temperate"
    await page.screenshot(path=SHOTS / "focus-temperate-1600.png")

    await page.evaluate("ClimateChart.setFocus('')")
    await page.locator('[data-year="present"]').focus()
    await page.keyboard.press("ArrowRight")
    assert (await page.evaluate("ClimateChart.getState()"))["year"] == "future"
    await page.keyboard.press("Home")
    assert (await page.evaluate("ClimateChart.getState()"))["year"] == "present"

    await page.locator(".city").first.focus()
    assert await page.locator("#tip").is_visible()
    assert "Oslo" in await page.locator("#tip").inner_text()
    await page.keyboard.press("Escape")
    assert not await page.locator("#tip").is_visible()

    await page.set_viewport_size({"width": 1280, "height": 720})
    await page.wait_for_timeout(80)
    bounds = await page.locator("#stage").bounding_box()
    assert bounds and abs(bounds["width"] - 1280) < 1 and abs(bounds["height"] - 720) < 1, bounds
    assert await page.evaluate("document.documentElement.scrollWidth === innerWidth && document.documentElement.scrollHeight === innerHeight")
    await page.screenshot(path=SHOTS / "present-1280.png")

    await page.set_viewport_size({"width": 1600, "height": 900})
    await page.evaluate("ClimateChart.reset()")
    await page.wait_for_timeout(2100)
    reset_state = await page.evaluate("ClimateChart.getState()")
    assert reset_state == present_state, (reset_state, present_state)

    await page.evaluate("ClimateChart.destroy()")
    dimensions = await page.locator("#presentMap").evaluate("el => [el.width, el.height]")
    assert dimensions == [1, 1], dimensions
    await context.close()
    return {
        "city_count": 70,
        "visible_label_count": visible_label_count,
        "midpoint_opacity": midpoint_opacity,
        "future_opacity": future_opacity,
        "reversing_opacity": reversing_opacity,
        "requests": requests,
        "errors": errors,
        "reset_state": reset_state,
        "teardown_canvas": dimensions,
    }


async def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        normal = await inspect_page(browser)
        reduced = await inspect_page(browser, reduced=True)
        await browser.close()
    result = {"normal": normal, "reduced": reduced}
    (ROOT / "native-browser-check.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
