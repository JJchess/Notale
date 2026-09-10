#!/usr/bin/env python3
"""Capture every authored state and exercise the sample's navigation contract."""

import asyncio
import json
from pathlib import Path

from playwright.async_api import Page, async_playwright


ROOT = Path(__file__).resolve().parents[1]
SHOT_DIR = ROOT / "screenshots" / "sample"
REDUCED_DIR = SHOT_DIR / "reduced"
URL = "http://127.0.0.1:43246/"
STATE_NAMES = ("five", "sprout", "field", "exchange", "contexts", "gather", "portrait")


SNAPSHOT = """() => {
  const item = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      id: el.dataset.identity || el.id || el.className,
      file: el.currentSrc ? el.currentSrc.split('/').pop() : null,
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
      opacity: Number(Number(s.opacity).toFixed(3)),
      visibility: s.visibility,
      borderWidth: s.borderTopWidth,
      borderColor: s.borderTopColor,
      scale: s.transform
    };
  };
  const visible = el => {
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && Number(s.opacity) > 0.05;
  };
  const portrait = document.querySelector('#portrait');
  const portraitImage = portrait.querySelector('img');
  const field = document.querySelector('#pixel-field');
  const caption = [...document.querySelectorAll('.caption-copy')].find(visible);
  const stage = document.querySelector('#stage').getBoundingClientRect();
  return {
    controller: NotaleStory.getState(),
    stage: {x: Math.round(stage.x), y: Math.round(stage.y),
            w: Math.round(stage.width), h: Math.round(stage.height)},
    scroll: {
      x: window.scrollX, y: window.scrollY,
      bodyW: document.body.scrollWidth, bodyH: document.body.scrollHeight,
      rootW: document.documentElement.scrollWidth,
      rootH: document.documentElement.scrollHeight
    },
    caption: caption ? caption.textContent.trim() : null,
    fieldOpacity: Number(getComputedStyle(field).opacity),
    memes: [...document.querySelectorAll('.network-image.meme')].map(item),
    contexts: [...document.querySelectorAll('.network-image.context')].map(item),
    visibleMemes: [...document.querySelectorAll('.network-image.meme')].filter(visible).length,
    visibleContexts: [...document.querySelectorAll('.network-image.context')].filter(visible).length,
    portrait: item(portrait),
    portraitImage: {
      ...item(portraitImage),
      naturalWidth: portraitImage.naturalWidth,
      naturalHeight: portraitImage.naturalHeight,
      imageRendering: getComputedStyle(portraitImage).imageRendering
    },
    identities: [...document.querySelectorAll('[data-identity]')].map(el => el.dataset.identity)
  };
}"""


async def ready(page: Page) -> None:
    await page.goto(URL, wait_until="load")
    await page.wait_for_function("window.__NOTALE_READY__ === true")
    await page.evaluate(
        """() => Promise.all([...document.images].map(img =>
          img.complete ? Promise.resolve() : new Promise(resolve => {
            img.addEventListener('load', resolve, {once:true});
            img.addEventListener('error', resolve, {once:true});
          })
        ))"""
    )


async def wait_state(page: Page, index: int) -> None:
    await page.wait_for_function(
        "i => NotaleStory.getState().index === i && !NotaleStory.getState().animating",
        arg=index,
        timeout=5000,
    )


async def capture_states(page: Page, directory: Path) -> list[dict]:
    directory.mkdir(parents=True, exist_ok=True)
    rows = []
    for index, name in enumerate(STATE_NAMES):
        await page.evaluate("i => NotaleStory.goTo(i, {immediate:true})", index)
        await page.wait_for_timeout(80)
        row = await page.evaluate(SNAPSHOT)
        row["state"] = index
        row["name"] = name
        rows.append(row)
        await page.screenshot(path=str(directory / f"state-{index}-{name}.png"))
    return rows


async def exercise_normal(page: Page) -> dict:
    results = {
        "keyboardForward": [],
        "keyboardReverse": [],
        "wheel": [],
        "touch": [],
        "reset": None,
    }

    await page.evaluate("NotaleStory.reset({immediate:true})")
    initial = await page.evaluate(SNAPSHOT)

    for index in range(1, len(STATE_NAMES)):
        await page.keyboard.press("ArrowRight")
        await wait_state(page, index)
        results["keyboardForward"].append((await page.evaluate("NotaleStory.getState()"))["name"])

    for index in range(len(STATE_NAMES) - 2, -1, -1):
        await page.keyboard.press("ArrowLeft")
        await wait_state(page, index)
        results["keyboardReverse"].append((await page.evaluate("NotaleStory.getState()"))["name"])

    await page.mouse.move(800, 450)
    await page.mouse.wheel(0, 120)
    await wait_state(page, 1)
    results["wheel"].append("forward:" + (await page.evaluate("NotaleStory.getState().name")))
    await page.mouse.wheel(0, -120)
    await wait_state(page, 0)
    results["wheel"].append("reverse:" + (await page.evaluate("NotaleStory.getState().name")))

    cdp = await page.context.new_cdp_session(page)
    await cdp.send("Input.dispatchTouchEvent", {
        "type": "touchStart", "touchPoints": [{"x": 800, "y": 650, "id": 1}]
    })
    await cdp.send("Input.dispatchTouchEvent", {
        "type": "touchMove", "touchPoints": [{"x": 800, "y": 300, "id": 1}]
    })
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    await wait_state(page, 1)
    results["touch"].append("forward:" + (await page.evaluate("NotaleStory.getState().name")))

    await cdp.send("Input.dispatchTouchEvent", {
        "type": "touchStart", "touchPoints": [{"x": 800, "y": 300, "id": 2}]
    })
    await cdp.send("Input.dispatchTouchEvent", {
        "type": "touchMove", "touchPoints": [{"x": 800, "y": 650, "id": 2}]
    })
    await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    await wait_state(page, 0)
    results["touch"].append("reverse:" + (await page.evaluate("NotaleStory.getState().name")))

    await page.evaluate("NotaleStory.goTo(6, {immediate:true})")
    await page.keyboard.press("r")
    await wait_state(page, 0)
    reset = await page.evaluate(SNAPSHOT)
    results["reset"] = {
        "state": reset["controller"],
        "seedGeometryMatchesInitial": [
            (m["id"], m["x"], m["y"], m["w"], m["h"], m["opacity"])
            for m in reset["memes"][:5]
        ] == [
            (m["id"], m["x"], m["y"], m["w"], m["h"], m["opacity"])
            for m in initial["memes"][:5]
        ],
        "identityOrderMatchesInitial": reset["identities"] == initial["identities"],
    }
    return results


async def main() -> None:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    errors = []
    failed_requests = []

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()

        context = await browser.new_context(viewport={"width": 1600, "height": 900})
        page = await context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.on("requestfailed", lambda request: failed_requests.append(request.url))
        await ready(page)
        metrics = await capture_states(page, SHOT_DIR)
        interactions = await exercise_normal(page)
        await context.close()

        reduced_context = await browser.new_context(
            viewport={"width": 1600, "height": 900}, reduced_motion="reduce"
        )
        reduced_page = await reduced_context.new_page()
        reduced_page.on("pageerror", lambda error: errors.append("reduced: " + str(error)))
        reduced_page.on(
            "console",
            lambda message: errors.append("reduced: " + message.text) if message.type == "error" else None,
        )
        reduced_page.on("requestfailed", lambda request: failed_requests.append(request.url))
        await ready(reduced_page)
        reduced_metrics = await capture_states(reduced_page, REDUCED_DIR)
        reduced_checks = []
        await reduced_page.evaluate("NotaleStory.reset({immediate:true})")
        for index in range(1, len(STATE_NAMES)):
            await reduced_page.keyboard.press("ArrowRight")
            await reduced_page.wait_for_timeout(30)
            state = await reduced_page.evaluate("NotaleStory.getState()")
            reduced_checks.append({
                "expected": index,
                "actual": state["index"],
                "animating": state["animating"],
                "reducedMotion": state["reducedMotion"],
            })
        await reduced_context.close()
        await browser.close()

    comparison = {
        "initial": {
            "visibleMemes": metrics[0]["visibleMemes"],
            "seedRects": [
                {key: item[key] for key in ("id", "x", "y", "w", "h", "opacity", "borderWidth", "borderColor")}
                for item in metrics[0]["memes"][:5]
            ],
        },
        "field": {
            "visibleMemes": metrics[2]["visibleMemes"],
            "allThumbnailWidths": sorted({item["w"] for item in metrics[2]["memes"]}),
        },
        "contexts": {
            "visibleMemes": metrics[4]["visibleMemes"],
            "visibleContexts": metrics[4]["visibleContexts"],
            "contextRects": [
                {key: item[key] for key in ("id", "x", "y", "w", "h", "opacity", "borderWidth", "borderColor")}
                for item in metrics[4]["contexts"]
            ],
        },
        "portrait": {
            "rect": {key: metrics[6]["portrait"][key] for key in ("x", "y", "w", "h", "opacity")},
            "native": [metrics[6]["portraitImage"]["naturalWidth"], metrics[6]["portraitImage"]["naturalHeight"]],
            "imageRendering": metrics[6]["portraitImage"]["imageRendering"],
        },
        "noScroll": all(
            row["scroll"]["x"] == 0
            and row["scroll"]["y"] == 0
            and row["scroll"]["bodyW"] == 1600
            and row["scroll"]["bodyH"] == 900
            for row in metrics
        ),
        "errors": errors,
        "failedRequests": failed_requests,
    }

    (ROOT / "audit" / "sample-metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )
    (ROOT / "audit" / "reduced-metrics.json").write_text(
        json.dumps(reduced_metrics, indent=2), encoding="utf-8"
    )
    (ROOT / "audit" / "interaction-results.json").write_text(
        json.dumps({
            "interactions": interactions,
            "reducedChecks": reduced_checks,
            "comparison": comparison,
        }, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    asyncio.run(main())
