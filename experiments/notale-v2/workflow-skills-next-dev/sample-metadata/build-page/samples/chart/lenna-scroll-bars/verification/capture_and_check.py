#!/usr/bin/env python3
"""Capture every authored state at 1600×900 and verify the state machine."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
CANDIDATE_DIR = ROOT / "screenshots" / "candidate"
UPSTREAM_DIR = ROOT / "screenshots" / "upstream"
COMPARISON_DIR = ROOT / "screenshots" / "comparisons"
STATE_IDS = ["1972", "1991", "1995", "2014", "2019", "2021", "domains"]
EXPECTED_VALUES = {"1972": 2, "1991": 65, "1995": 287, "2014": 218, "2019": 175, "2021": 252}
EXPECTED_VISIBLE = {"1972": 1, "1991": 15, "1995": 19, "2014": 38, "2019": 43, "2021": 45}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compare_pair(label: str) -> None:
    upstream = Image.open(UPSTREAM_DIR / f"{label}.png").convert("RGB")
    candidate = Image.open(CANDIDATE_DIR / f"{label}.png").convert("RGB")
    assert upstream.size == (1600, 900), (label, "upstream", upstream.size)
    assert candidate.size == (1600, 900), (label, "candidate", candidate.size)
    pair = Image.new("RGB", (3200, 900))
    pair.paste(upstream, (0, 0))
    pair.paste(candidate, (1600, 0))
    pair.save(COMPARISON_DIR / f"{label}.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:43247/")
    args = parser.parse_args()

    CANDIDATE_DIR.mkdir(parents=True, exist_ok=True)
    COMPARISON_DIR.mkdir(parents=True, exist_ok=True)
    results: dict[str, object] = {
        "url": args.url,
        "viewport": [1600, 900],
        "states": {},
        "hover": {},
        "interactions": {},
        "motion": {},
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(
            viewport={"width": 1600, "height": 900},
            device_scale_factor=1,
            has_touch=True,
        )
        page = context.new_page()
        page_errors: list[str] = []
        console_errors: list[str] = []
        failed_requests: list[str] = []
        requests: list[str] = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("requestfailed", lambda request: failed_requests.append(request.url))
        page.on("request", lambda request: requests.append(request.url))

        page.goto(args.url, wait_until="load", timeout=30_000)
        page.wait_for_selector('#stage[data-ready="true"]', timeout=15_000)
        page.wait_for_timeout(300)

        assert page.evaluate("scrollY") == 0
        assert page.evaluate("document.documentElement.scrollHeight") == 900
        assert page.evaluate("document.body.scrollHeight") == 900
        canonical = page.evaluate("LennaStory.data()")
        assert sum(row["value"] for row in canonical) == 4801
        assert len(canonical) == 45
        assert max(row["value"] for row in canonical) == 287

        for index, state_id in enumerate(STATE_IDS):
            page.evaluate("i => LennaStory.setState(i,{animate:false})", index)
            page.wait_for_timeout(220)
            inspection = page.evaluate("LennaStory.inspect()")
            assert inspection["state"] == state_id
            assert abs(inspection["barWidth"] - 27.054108216432866) < 0.001
            assert inspection["baseline"] == 800
            assert page.evaluate("scrollY") == 0

            state_metrics: dict[str, object] = {
                "value": inspection["value"],
                "barWidth": inspection["barWidth"],
                "baseline": inspection["baseline"],
                "card": inspection["card"],
                "visibleBars": inspection["visibleBars"],
                "stackSegments": inspection["stackSegments"],
            }
            if state_id != "domains":
                assert inspection["value"] == EXPECTED_VALUES[state_id]
                assert inspection["visibleBars"] == EXPECTED_VISIBLE[state_id]
                assert page.locator("rect.year-bar.is-current").count() == 1
                assert page.locator(".x-axis text.is-current").text_content() == state_id
                current = page.locator("rect.year-bar.is-current")
                state_metrics["currentBar"] = {
                    "x": float(current.get_attribute("x")),
                    "y": float(current.get_attribute("y")),
                    "width": float(current.get_attribute("width")),
                    "height": float(current.get_attribute("height")),
                    "strokeWidth": page.evaluate("el => getComputedStyle(el).strokeWidth", current.element_handle()),
                }
            else:
                assert inspection["visibleBars"] == 45
                assert inspection["stackSegments"] == 143
                assert page.locator(".legend.is-visible").count() == 1
                stack_totals = page.evaluate("""() => {
                  const totals = {};
                  d3.selectAll('rect.stack-segment').each(function(d){ totals[d.year]=(totals[d.year]||0)+d.value; });
                  return totals;
                }""")
                assert all(stack_totals[str(row["year"])] == row["value"] for row in canonical)

            shot = CANDIDATE_DIR / f"{state_id}.png"
            page.screenshot(path=str(shot))
            assert Image.open(shot).size == (1600, 900)
            state_metrics["sha256"] = sha256(shot)
            results["states"][state_id] = state_metrics

        for legend_index, domain, label in [(0, ".org", "hover-org"), (2, ".com", "hover-com")]:
            page.locator(".legend-item").nth(legend_index).hover()
            page.wait_for_timeout(180)
            opacity = page.evaluate("""domain => {
              const rows=[...document.querySelectorAll('rect.stack-segment')];
              return {
                target:[...new Set(rows.filter(r=>r.dataset.domain===domain).map(r=>getComputedStyle(r).opacity))],
                context:[...new Set(rows.filter(r=>r.dataset.domain!==domain).map(r=>getComputedStyle(r).opacity))]
              };
            }""", domain)
            assert opacity["target"] == ["1"]
            assert opacity["context"] == ["0.28"]
            shot = CANDIDATE_DIR / f"{label}.png"
            page.screenshot(path=str(shot))
            results["hover"][domain] = {"opacity": opacity, "sha256": sha256(shot)}
        page.locator('.domain-word[data-domain=".edu"]').hover()
        page.wait_for_timeout(180)
        body_linkage = page.evaluate("""() => ({
          target:[...new Set([...document.querySelectorAll('rect.stack-segment[data-domain=".edu"]')].map(r=>getComputedStyle(r).opacity))],
          context:[...new Set([...document.querySelectorAll('rect.stack-segment:not([data-domain=".edu"])')].map(r=>getComputedStyle(r).opacity))]
        })""")
        assert body_linkage == {"target": ["1"], "context": ["0.28"]}
        results["hover"]["bodyCopy"] = {"domain": ".edu", "opacity": body_linkage}
        page.mouse.move(900, 80)
        page.evaluate("LennaStory.setHover(null)")

        # Deterministic reset: two independent resets must paint the same pixels.
        reset_a = ROOT / "verification" / "reset-a.png"
        reset_b = ROOT / "verification" / "reset-b.png"
        page.evaluate("LennaStory.setState(5,{animate:false}); LennaStory.reset()")
        page.wait_for_timeout(160)
        page.screenshot(path=str(reset_a))
        page.evaluate("LennaStory.setState(3,{animate:false}); LennaStory.reset()")
        page.wait_for_timeout(160)
        page.screenshot(path=str(reset_b))
        assert sha256(reset_a) == sha256(reset_b) == sha256(CANDIDATE_DIR / "1972.png")
        results["interactions"]["reset"] = {"deterministic": True, "sha256": sha256(reset_a)}

        # Wheel progression and reverse progression; body must never scroll.
        page.evaluate("LennaStory.reset()")
        page.mouse.move(800, 450)
        page.mouse.wheel(0, 520)
        page.wait_for_timeout(1050)
        assert page.evaluate("LennaStory.inspect().state") == "1991"
        assert page.evaluate("scrollY") == 0
        page.mouse.wheel(0, -520)
        page.wait_for_timeout(1050)
        assert page.evaluate("LennaStory.inspect().state") == "1972"
        results["interactions"]["wheel"] = {"forward": "1991", "reverse": "1972", "scrollY": 0}

        # Direction keys, reverse from the final state, and keyboard reset.
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(1000)
        assert page.evaluate("LennaStory.inspect().state") == "1991"
        page.keyboard.press("ArrowLeft")
        page.wait_for_timeout(1000)
        assert page.evaluate("LennaStory.inspect().state") == "1972"
        page.evaluate("LennaStory.setState(6,{animate:false})")
        page.keyboard.press("ArrowLeft")
        page.wait_for_timeout(1000)
        assert page.evaluate("LennaStory.inspect().state") == "2021"
        page.keyboard.press("r")
        assert page.evaluate("LennaStory.inspect().state") == "1972"
        results["interactions"]["keyboard"] = {"forward": True, "reverse": True, "reset": True}

        # Real touch input through Chromium's input domain.
        client = context.new_cdp_session(page)
        page.evaluate("LennaStory.reset()")
        client.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": 800, "y": 700, "radiusX": 4, "radiusY": 4}]})
        client.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": 800, "y": 350, "radiusX": 4, "radiusY": 4}]})
        client.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(1000)
        assert page.evaluate("LennaStory.inspect().state") == "1991"
        results["interactions"]["touch"] = {"swipeUp": "1991", "scrollY": page.evaluate("scrollY")}

        # Motion audit: outgoing card moves up, incoming card starts below, and new bars carry 80ms delays.
        page.evaluate("LennaStory.setState(1,{animate:false})")
        target_y = page.locator("#prose-card").bounding_box()["y"]
        page.evaluate("LennaStory.reset()")
        initial_y = page.locator("#prose-card").bounding_box()["y"]
        page.evaluate("LennaStory.setState(1,{animate:true})")
        leaving_class = page.locator("#prose-card").get_attribute("class")
        page.wait_for_timeout(160)
        leaving_y = page.locator("#prose-card").bounding_box()["y"]
        page.wait_for_timeout(210)
        entering_y = page.locator("#prose-card").bounding_box()["y"]
        image_clip = page.evaluate("getComputedStyle(document.querySelector('#card-image')).clipPath")
        delays = sorted(set(page.evaluate("LennaStory.inspect().revealDelays")))
        positive_delays = [delay for delay in delays if delay > 0]
        assert "is-leaving-up" in leaving_class
        assert leaving_y < initial_y
        assert entering_y > target_y
        assert positive_delays and all(b - a == 80 for a, b in zip(positive_delays, positive_delays[1:]))
        results["motion"] = {
            "card": {"initialY": initial_y, "leavingY": leaving_y, "incomingY": entering_y, "targetY": target_y},
            "imageClipDuringEntry": image_clip,
            "barRevealDelaysMs": delays,
            "intervalMs": 80,
        }

        page.emulate_media(reduced_motion="reduce")
        page.evaluate("LennaStory.reset(); LennaStory.next()")
        reduced = page.evaluate("LennaStory.inspect()")
        assert reduced["state"] == "1991"
        assert set(reduced["revealDelays"]) == {0}
        assert page.locator("#prose-card").get_attribute("class") == "prose-card is-settled"
        results["motion"]["reducedMotion"] = {"state": "1991", "delays": [0], "settled": True}
        page.emulate_media(reduced_motion="no-preference")

        allowed_origin = urlparse(args.url).netloc
        external = [url for url in requests if urlparse(url).netloc not in ("", allowed_origin)]
        assert not page_errors, page_errors
        assert not console_errors, console_errors
        assert not failed_requests, failed_requests
        assert not external, external
        results["runtime"] = {
            "pageErrors": page_errors,
            "consoleErrors": console_errors,
            "failedRequests": failed_requests,
            "externalRequests": external,
            "requestCount": len(requests),
        }
        browser.close()

    for label in STATE_IDS + ["hover-org", "hover-com"]:
        compare_pair(label)

    (ROOT / "verification" / "results.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "states": STATE_IDS,
        "hover": [".org", ".com"],
        "interactions": results["interactions"],
        "runtime": results["runtime"],
        "motion": results["motion"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
