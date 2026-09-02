#!/usr/bin/env python3
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "pages"
SHOTS = ROOT / "screenshots" / "final"
CHROME = "/data1/home/zhuyifan/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome"
SONG_COUNTS = {2: 100, 3: 100, 4: 200, 6: 100, 8: 100, 11: 100, 15: 80, 16: 5}
TOP_STATES = {13, 14, 17}


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=PAGES))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f"http://127.0.0.1:{server.server_port}"
    report = {"status": "FAIL", "origin": origin, "states": [], "checks": []}
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, executable_path=CHROME, args=["--no-sandbox"])
            context = browser.new_context(viewport={"width": 1600, "height": 900})
            page = context.new_page()
            errors, requests = [], []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("request", lambda r: requests.append(r.url))
            page.goto(origin, wait_until="networkidle")
            page.wait_for_function("window.__vocalSample && document.querySelectorAll('.dot').length === 62")
            page.wait_for_timeout(2600)

            for state in range(18):
                page.evaluate("n => window.__vocalSample.go(n)", state)
                page.wait_for_timeout(2600 if state == 0 else 950)
                actual = page.evaluate("window.__vocalSample.state")
                check(actual == state, f"state {state} did not settle")
                check(page.locator("#copy").inner_text().strip(), f"state {state} has no claim")
                check(page.locator("#line").get_attribute("d").startswith("M"), "line path missing")
                if state in SONG_COUNTS:
                    check(page.locator(".song").count() == SONG_COUNTS[state], f"state {state} song count")
                    check("off" in page.locator("#chart").get_attribute("class"), f"state {state} chart visible")
                else:
                    check(page.locator("#selected circle").count() == (1 if state in {0, 1, 5, 7, 9, 10, 12} else 0), f"state {state} annotation")
                    check(page.locator(".dot.on").count() == (62 if state in TOP_STATES else 0), f"state {state} top dots")
                if state == 14:
                    check(page.locator(".dot.ring").count() == 1, "2019 emphasis ring missing")
                overflow = page.evaluate("""() => ({x:document.documentElement.scrollWidth-document.documentElement.clientWidth,
                    y:document.documentElement.scrollHeight-document.documentElement.clientHeight})""")
                check(overflow == {"x": 0, "y": 0}, f"state {state} overflow: {overflow}")
                page.screenshot(path=SHOTS / f"state-{state:02}.png")
                report["states"].append({"state": state, "songs": page.locator(".song").count()})

            page.evaluate("window.__vocalSample.go(0)")
            page.keyboard.press("ArrowRight")
            check(page.evaluate("window.__vocalSample.state") == 1, "ArrowRight")
            page.keyboard.press("ArrowLeft")
            check(page.evaluate("window.__vocalSample.state") == 0, "ArrowLeft")
            page.evaluate("window.__vocalSample.go(9)")
            page.keyboard.press("r")
            check(page.evaluate("window.__vocalSample.state") == 0, "keyboard reset")
            page.locator("#next").click()
            page.locator("#prev").click()
            check(page.evaluate("window.__vocalSample.state") == 0, "pointer navigation")
            page.evaluate("window.__vocalSample.go(12)")
            page.locator("#reset").click()
            first = page.evaluate("() => [window.__vocalSample.state, document.querySelector('#line').getAttribute('d'), document.querySelector('#copy').textContent]")
            page.evaluate("window.__vocalSample.go(12)")
            page.locator("#reset").click()
            second = page.evaluate("() => [window.__vocalSample.state, document.querySelector('#line').getAttribute('d'), document.querySelector('#copy').textContent]")
            check(first == second and first[0] == 0, "reset drift")
            report["checks"].append("18 states, keyboard, pointer navigation, and double reset")

            page.evaluate("window.__vocalSample.go(13)")
            page.set_viewport_size({"width": 1280, "height": 720})
            page.wait_for_timeout(100)
            check(page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--scale').trim()") == "0.8", "1280 scale")
            check(page.evaluate("document.documentElement.scrollWidth === document.documentElement.clientWidth"), "1280 overflow")
            page.screenshot(path=SHOTS / "viewport-1280x720.png")
            page.set_viewport_size({"width": 1600, "height": 900})
            check(page.evaluate("window.__vocalSample.state") == 13, "resize changed state")
            report["checks"].append("1600x900 and 1280x720 resize")

            external = [u for u in requests if urlparse(u).scheme in {"http", "https"} and not u.startswith(origin)]
            check(not external, f"external requests: {external}")
            check(not errors, f"browser errors: {errors}")
            report["requests"] = requests
            report["checks"].append("no console errors or external requests")

            reduced = browser.new_context(viewport={"width": 1600, "height": 900}, reduced_motion="reduce")
            rp = reduced.new_page()
            reduced_errors = []
            rp.on("console", lambda m: reduced_errors.append(m.text) if m.type == "error" else None)
            rp.on("pageerror", lambda e: reduced_errors.append(str(e)))
            rp.goto(origin, wait_until="networkidle")
            rp.wait_for_function("window.__vocalSample && document.querySelectorAll('.dot').length === 62")
            rp.evaluate("window.__vocalSample.go(13)")
            rp.wait_for_timeout(80)
            check(rp.locator(".dot.on").count() == 62, "reduced-motion final evidence")
            check(rp.evaluate("getComputedStyle(document.querySelector('#chart')).transitionDuration") == "0s", "reduced-motion CSS")
            check(not reduced_errors, f"reduced-motion errors: {reduced_errors}")
            rp.screenshot(path=SHOTS / "reduced-motion.png")
            reduced.close()
            report["checks"].append("reduced-motion final state")

            page.evaluate("window.__vocalSample.go(5); window.__vocalSample.teardown()")
            page.keyboard.press("ArrowRight")
            page.locator("#next").click()
            check(page.evaluate("window.__vocalSample.state") == 5, "teardown left listeners")
            report["checks"].append("teardown removes owned listeners and animation")
            context.close()
            browser.close()
        report["status"] = "PASS"
    except Exception as error:
        report["error"] = str(error)
        raise
    finally:
        server.shutdown()
        (ROOT / "tests" / "results.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
