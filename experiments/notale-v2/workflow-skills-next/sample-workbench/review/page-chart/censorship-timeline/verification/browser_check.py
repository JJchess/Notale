#!/usr/bin/env python3
"""Exercise every authored state and the fixed-page input/lifecycle contract."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
CANDIDATE = ROOT / "candidate"
ORIGINAL = ROOT / "original"
COMPARE = ROOT / "comparison"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:42006/")
    args = parser.parse_args()
    CANDIDATE.mkdir(exist_ok=True)
    COMPARE.mkdir(exist_ok=True)
    report = {"url": args.url, "states": {}, "inputs": {}, "motion": {}, "viewports": {}}

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={"width": 1600, "height": 900}, has_touch=True)
        page = context.new_page()
        errors, failed, requests = [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.on("requestfailed", lambda request: failed.append(request.url))
        page.on("request", lambda request: requests.append(request.url))
        page.goto(args.url, wait_until="load")
        page.wait_for_selector('#stage[data-ready="true"]')

        initial = page.evaluate("CensorshipTimeline.inspect()")
        assert initial == {
            "state": 0,
            "rowHeight": 7,
            "records": 206,
            "editedEpisodes": 77,
            "totalSeconds": 3700,
            "maxStop": 1251,
            "packedRows": 3,
            "visibleScenes": 0,
            "categorized": False,
            "packed": False,
        }
        assert page.locator(".row").count() == 100
        assert page.locator(".scene").count() == 206
        assert page.locator(".scene.sex").count() == 139
        assert page.locator(".scene.relation").count() == 22
        assert page.locator(".scene.disrespect").count() == 20

        for state in range(7):
            page.evaluate("i => CensorshipTimeline.setState(i,{animate:false})", state)
            inspection = page.evaluate("CensorshipTimeline.inspect()")
            assert inspection["state"] == state
            assert inspection["visibleScenes"] == (206 if state else 0)
            assert inspection["categorized"] == (state > 1)
            assert inspection["packed"] == (state == 6)
            assert page.locator("#chart-caption").inner_text().strip()
            shot = CANDIDATE / f"state-{state}.png"
            page.screenshot(path=str(shot))
            assert Image.open(shot).size == (1600, 900)
            report["states"][str(state)] = {**inspection, "sha256": digest(shot)}

        # Pointer zones advance on the right and reverse on the left.
        page.evaluate("CensorshipTimeline.reset()")
        page.mouse.click(1200, 500)
        assert page.evaluate("CensorshipTimeline.inspect().state") == 1
        page.wait_for_timeout(900)
        page.mouse.click(300, 500)
        assert page.evaluate("CensorshipTimeline.inspect().state") == 0
        report["inputs"]["pointer"] = True

        # Keyboard and wheel use the same bounded state machine.
        page.wait_for_timeout(900)
        page.keyboard.press("ArrowRight")
        assert page.evaluate("CensorshipTimeline.inspect().state") == 1
        page.keyboard.press("r")
        assert page.evaluate("CensorshipTimeline.inspect().state") == 0
        page.wait_for_timeout(900)
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(900)
        page.keyboard.press("ArrowLeft")
        assert page.evaluate("CensorshipTimeline.inspect().state") == 0
        page.wait_for_timeout(900)
        page.mouse.wheel(0, 200)
        assert page.evaluate("CensorshipTimeline.inspect().state") == 1
        assert page.evaluate("scrollY") == 0
        report["inputs"]["keyboardWheel"] = True

        # Real touch input through Chromium's input domain.
        page.evaluate("CensorshipTimeline.reset()")
        client = context.new_cdp_session(page)
        client.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": 800, "y": 650}]})
        client.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": 800, "y": 300}]})
        client.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        assert page.evaluate("CensorshipTimeline.inspect().state") == 1
        report["inputs"]["touch"] = True

        page.evaluate("CensorshipTimeline.setState(4,{animate:false})")
        page.locator("#reset").click()
        assert page.evaluate("CensorshipTimeline.inspect().state") == 0
        report["inputs"]["resetButtonAndKey"] = True

        # Two resets restore the same pixels and canonical state.
        reset_a, reset_b = CANDIDATE / "reset-a.png", CANDIDATE / "reset-b.png"
        page.mouse.move(800, 850)
        page.evaluate("CensorshipTimeline.setState(6,{animate:false});CensorshipTimeline.reset()")
        page.wait_for_timeout(1100)
        page.screenshot(path=str(reset_a))
        page.evaluate("CensorshipTimeline.setState(4,{animate:false});CensorshipTimeline.reset()")
        page.wait_for_timeout(1100)
        page.screenshot(path=str(reset_b))
        assert digest(reset_a) == digest(reset_b) == digest(CANDIDATE / "state-0.png")
        report["inputs"]["reset"] = {"deterministic": True, "sha256": digest(reset_a)}

        # The duration state preserves identity and actually traverses to packed coordinates.
        page.evaluate("CensorshipTimeline.setState(5,{animate:false})")
        before = page.locator(".scene").first.evaluate("e => getComputedStyle(e).transform")
        page.evaluate("CensorshipTimeline.setState(6)")
        page.wait_for_timeout(350)
        middle = page.locator(".scene").first.evaluate("e => getComputedStyle(e).transform")
        page.wait_for_timeout(3000)
        after = page.locator(".scene").first.evaluate("e => getComputedStyle(e).transform")
        assert len({before, middle, after}) == 3
        report["motion"]["packing"] = {"before": before, "middle": middle, "after": after}

        page.emulate_media(reduced_motion="reduce")
        page.wait_for_timeout(50)
        page.evaluate("CensorshipTimeline.setState(5,{animate:false});CensorshipTimeline.setState(6)")
        reduced_duration = page.locator(".scene").first.evaluate("e => getComputedStyle(e).transitionDuration")
        assert set(reduced_duration.split(", ")) == {"0s"}
        reduced_shot = CANDIDATE / "reduced-motion.png"
        page.screenshot(path=str(reduced_shot))
        assert digest(reduced_shot) == digest(CANDIDATE / "state-6.png")
        report["motion"]["reduced"] = {"transitionDuration": reduced_duration, "samePixels": True}
        page.emulate_media(reduced_motion="no-preference")

        # Required narrow review boundary: no page overflow or clipped narrative/control text.
        page.set_viewport_size({"width": 1280, "height": 720})
        page.wait_for_timeout(100)
        for state in (2, 6):
            page.evaluate("i => CensorshipTimeline.setState(i,{animate:false})", state)
            metrics = page.evaluate("""() => {
              const s=document.querySelector('#story').getBoundingClientRect();
              const r=document.querySelector('#reset').getBoundingClientRect();
              return {sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,
                story:[s.left,s.top,s.right,s.bottom],reset:[r.left,r.top,r.right,r.bottom]};
            }""")
            assert metrics["sw"] == 1280 and metrics["sh"] == 720
            assert metrics["story"][0] >= 0 and metrics["story"][1] >= 0
            assert metrics["story"][2] <= 1280 and metrics["story"][3] <= 720
            assert metrics["reset"][0] >= 0 and metrics["reset"][3] <= 720
            shot = CANDIDATE / f"state-{state}-1280x720.png"
            page.screenshot(path=str(shot))
            report["viewports"][f"state-{state}-1280x720"] = {"metrics": metrics, "sha256": digest(shot)}

        # Lifecycle cleanup removes every owned input and observer.
        frozen = page.evaluate("CensorshipTimeline.inspect().state")
        page.evaluate("CensorshipTimeline.teardown()")
        page.keyboard.press("ArrowLeft")
        page.mouse.click(1000, 400)
        page.set_viewport_size({"width": 1300, "height": 740})
        page.wait_for_timeout(100)
        assert page.evaluate("CensorshipTimeline.inspect().state") == frozen
        report["inputs"]["teardown"] = True

        # Renderer/data failure is explicit and does not fabricate marks.
        fallback = context.new_page()
        fallback.route("**/data.js", lambda route: route.fulfill(status=200, content_type="application/javascript", body=""))
        fallback.goto(args.url, wait_until="load")
        assert fallback.locator("#fallback").is_visible()
        assert fallback.locator(".scene").count() == 0
        report["fallback"] = True

        origin = urlparse(args.url).netloc
        external = [url for url in requests if urlparse(url).netloc not in ("", origin)]
        assert not errors, errors
        assert not failed, failed
        assert not external, external
        report["runtime"] = {"errors": errors, "failedRequests": failed, "externalRequests": external}
        browser.close()

    for state in (0, 2, 6):
        left = Image.open(ORIGINAL / f"upstream-settled-{state}.png" if state else ORIGINAL / "upstream-0.png").convert("RGB")
        right = Image.open(CANDIDATE / f"state-{state}.png").convert("RGB")
        pair = Image.new("RGB", (3200, 900))
        pair.paste(left, (0, 0))
        pair.paste(right, (1600, 0))
        pair.save(COMPARE / f"state-{state}.png", optimize=True)

    (ROOT / "verification/results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report["runtime"], ensure_ascii=False))


if __name__ == "__main__":
    main()
