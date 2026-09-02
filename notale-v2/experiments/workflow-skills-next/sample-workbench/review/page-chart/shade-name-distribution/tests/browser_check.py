#!/usr/bin/env python3
"""Exercise the complete local interaction matrix in Chromium."""

import contextlib
import http.server
import json
import threading
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).parents[1]
SHOTS = ROOT / "screenshots"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        pass


@contextlib.contextmanager
def server():
    handler = lambda *args, **kwargs: QuietHandler(  # noqa: E731
        *args, directory=str(ROOT / "pages"), **kwargs
    )
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{httpd.server_port}/"
    finally:
        httpd.shutdown()
        thread.join()


def run_view(browser, url: str, width: int, height: int) -> dict:
    context = browser.new_context(viewport={"width": width, "height": height})
    page = context.new_page()
    console_errors, page_errors, requests, failures = [], [], [], []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on("request", lambda request: requests.append(request.url))
    page.on("requestfailed", lambda request: failures.append([request.url, request.failure]))
    page.goto(url, wait_until="networkidle")

    assert page.locator("#count").inner_text() == "5,307 shades"
    assert page.locator("#summary").inner_text() == "4,104 of 5,307 shades are above 50% lightness."
    assert page.locator("#brand option").count() == 94
    assert page.locator("#category option").count() == 18
    assert page.locator("body").evaluate("e => e.scrollWidth === e.clientWidth && e.scrollHeight === e.clientHeight")
    stage = page.locator("#stage").bounding_box()
    assert stage and stage["width"] <= width + 0.1 and stage["height"] <= height + 0.1
    page.screenshot(path=str(SHOTS / f"browser-{width}x{height}-initial.png"))

    page.select_option("#brand", label="bareMinerals")
    assert page.locator("#count").inner_text() == "370 shades"
    assert page.locator("#category option").count() == 14
    page.select_option("#category", label="food")
    assert page.locator("#count").inner_text() == "51 shades"
    assert page.locator("#summary").inner_text() == "37 of 51 shades are above 50% lightness."

    chart_box = page.locator("#chart").bounding_box()
    assert chart_box
    point = {"x": chart_box["width"] * 0.5, "y": chart_box["height"] - 45}
    page.locator("#chart").hover(position=point)
    if not page.locator("#tip").is_visible():
        for x in range(30, int(chart_box["width"] - 20), 15):
            point = {"x": x, "y": chart_box["height"] - 45}
            page.locator("#chart").hover(position=point)
            if page.locator("#tip").is_visible():
                break
    assert page.locator("#tip").is_visible() and page.locator("#hilite").is_visible()
    assert "Lightness" in page.locator("#tip").inner_text()
    page.locator("#chart").click(position=point)
    page.locator("#title").hover()
    assert page.locator("#tip").is_visible()
    page.keyboard.press("Escape")
    assert page.locator("#tip").is_hidden() and page.locator("#hilite").is_hidden()

    page.check("#compare")
    assert page.locator("#compare").is_checked()
    page.screenshot(path=str(SHOTS / f"browser-{width}x{height}-compare.png"))
    page.check('input[value="names"]')
    assert page.locator("#compare").locator("xpath=..").is_hidden()
    canvas_size = page.locator("#names").evaluate("e => [e.width, e.height, e.offsetWidth, e.offsetHeight, e.getAttribute('aria-label')]")
    assert canvas_size[4] == "51 shade names ordered from darkest to lightest"
    page.check('input[value="table"]')
    assert page.locator("#rows tr").count() == 10
    assert page.locator("#page").inner_text() == "1 of 6"
    page.click("#next")
    assert page.locator("#page").inner_text() == "2 of 6"

    page.click("#reset")
    assert page.locator("#brand").input_value() == ""
    assert page.locator("#category").input_value() == ""
    assert page.locator('input[value="swatches"]').is_checked()
    assert page.locator("#count").inner_text() == "5,307 shades"
    page.locator("#chart").focus()
    page.keyboard.press("ArrowRight")
    assert page.locator("#tip").is_visible()
    page.keyboard.press("Enter")
    assert page.locator("#tip").is_visible()
    page.keyboard.press("Escape")
    assert page.locator("#tip").is_hidden()

    page.check('input[value="names"]')
    all_names = page.locator("#names").evaluate("e => [e.offsetHeight, e.getAttribute('aria-label')]")
    assert all_names[0] > 7000 and all_names[1] == "5,307 shade names ordered from darkest to lightest"
    page.locator("#nameView").evaluate("e => e.scrollTop = e.scrollHeight")
    assert page.locator("#nameView").evaluate("e => e.scrollTop > 7000")

    allowed = {"", "127.0.0.1"}
    assert all(urlparse(request).hostname in allowed for request in requests)
    assert not console_errors and not page_errors and not failures
    page.dispatch_event("body", "pagehide")
    page.goto("about:blank")
    context.close()
    return {
        "viewport": [width, height],
        "requests": len(requests),
        "pointer_tooltip": True,
        "keyboard_inspection": True,
        "filter_result": 51,
        "all_names_canvas_height": all_names[0],
        "overflow": False,
        "errors": 0,
    }


def main() -> None:
    SHOTS.mkdir(exist_ok=True)
    with server() as url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        results = [run_view(browser, url, 1600, 900), run_view(browser, url, 1280, 720)]

        reduced = browser.new_context(viewport={"width": 1600, "height": 900}, reduced_motion="reduce")
        page = reduced.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(url, wait_until="networkidle")
        page.screenshot(path=str(SHOTS / "browser-reduced-motion.png"))
        assert not errors and page.locator("#count").inner_text() == "5,307 shades"
        reduced.close()

        fallback = browser.new_context(viewport={"width": 1600, "height": 900})
        page = fallback.new_page()
        page.route("**/data/shades.js", lambda route: route.abort())
        page.goto(url, wait_until="domcontentloaded")
        assert page.locator("#error").is_visible()
        fallback.close()
        browser.close()

    report = {"normal": results, "reduced_motion": True, "data_failure_fallback": True, "external_requests": 0}
    (ROOT / "browser-check.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
