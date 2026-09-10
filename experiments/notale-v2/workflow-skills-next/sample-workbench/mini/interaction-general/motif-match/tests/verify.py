#!/usr/bin/env python3
"""Browser contract checks for the motif-match mini candidate."""

from contextlib import contextmanager
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "candidate" / "pages"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


@contextmanager
def serve():
    handler = lambda *args, **kwargs: QuietHandler(*args, directory=PAGES, **kwargs)
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/index.html"
    finally:
        server.shutdown()
        thread.join()


def snapshot(page):
    return page.evaluate("MotifMini.snapshot()")


def check_report():
    report = json.loads((ROOT / "report.json").read_text())
    total = 0
    for record in report["author_files"]:
        path = ROOT / record["path"]
        text = path.read_text()
        assert len(text) == record["chars"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == record["sha256"]
        total += len(text)
    assert total == report["mini_chars"] == 9781
    assert total <= 9800 and total < report["budget"] + 1
    for record in report["reused_files"]:
        path = ROOT / record["path"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == record["sha256"]


def choose(page, *notes):
    for note in notes:
        page.click(f'[data-note="{note}"]')


def open_page(browser, url, width=1600, height=900, reduced=False):
    page = browser.new_page(
        viewport={"width": width, "height": height},
        reduced_motion="reduce" if reduced else "no-preference",
    )
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.goto(url, wait_until="networkidle")
    return page, errors


def check_viewports(browser, url):
    for width, height in ((1600, 900), (1280, 720)):
        page, errors = open_page(browser, url, width, height)
        assert page.locator(".key").count() == 15
        assert page.locator(".marker").count() == 8
        assert page.evaluate("[...document.querySelectorAll('.key')].map(x=>+x.dataset.note)") == list(range(60, 75))
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert page.evaluate("document.documentElement.scrollHeight <= innerHeight")
        stage = page.locator("#stage").bounding_box()
        assert round(stage["width"]) == width and round(stage["height"]) == height
        assert not errors, errors
        page.close()


def check_learning_loop(browser, url):
    page, errors = open_page(browser, url)
    assert snapshot(page) == {
        "phase": "build", "round": 0, "notes": [60, None, None, None],
        "selected": 1, "clip": None, "markers": [0, 0, 0, 0],
    }

    choose(page, 72)
    page.click("#check")
    assert snapshot(page)["phase"] == "missing"
    assert "3、4" in page.locator("#message").inner_text()

    page.click('[data-action="reset"]')
    choose(page, 72, 71, 66)
    page.click("#check")
    assert snapshot(page)["phase"] == "error"
    assert page.locator(".interval.bad").count() == 1
    assert page.locator(".interval").all_inner_texts() == ["+12", "-1", "-5 偏 -1"]

    page.click('[data-index="3"]')
    choose(page, 67)
    assert snapshot(page)["phase"] == "edited"
    assert page.locator(".interval.bad").count() == 0
    assert page.locator(".interval").all_inner_texts() == ["+12", "-1", "-4"]
    page.click("#check")
    assert snapshot(page)["phase"] == "success"

    page.click("#check")
    assert snapshot(page)["notes"] == [62, None, None, None]
    assert snapshot(page)["phase"] == "transfer"
    choose(page, 74, 73, 69)
    page.click("#check")
    assert snapshot(page)["phase"] == "complete"
    assert page.locator(".interval").all_inner_texts() == ["+12", "-1", "-4"]

    page.click('[data-action="reset"]')
    assert snapshot(page)["notes"] == [60, None, None, None]
    assert snapshot(page)["phase"] == "build"
    assert not errors, errors
    page.close()


def check_rhythm_reset_and_dispose(browser, url):
    page, errors = open_page(browser, url)
    page.click('[data-clip="u"]')
    page.wait_for_timeout(900)
    assert snapshot(page)["markers"] == [0, 0, 0, 0]
    page.click('[data-clip="r"]')
    page.wait_for_timeout(850)
    assert snapshot(page)["markers"] == [True, 0, 0, 0]
    assert page.locator(".key.down").count() == 1

    page.click('[data-action="reset"]')
    page.wait_for_timeout(1100)
    assert snapshot(page)["markers"] == [0, 0, 0, 0]
    assert snapshot(page)["clip"] is None
    before = snapshot(page)
    page.evaluate("MotifMini.dispose()")
    page.click('[data-note="74"]')
    assert snapshot(page) == before
    page.reload(wait_until="networkidle")
    assert snapshot(page)["notes"] == [60, None, None, None]
    assert not errors, errors
    page.close()


def check_reduced_and_audio_fallback(browser, url):
    page, errors = open_page(browser, url, reduced=True)
    assert page.locator(".marker").first.evaluate("x=>getComputedStyle(x).transitionDuration") == "0s"
    page.click('[data-clip="r"]')
    page.wait_for_timeout(850)
    assert snapshot(page)["markers"][0] is True
    assert page.locator(".marker.on").count() == 1
    assert not errors, errors
    page.close()

    page, errors = open_page(browser, url + "?audio=off")
    choose(page, 72, 71, 67)
    page.click("#check")
    assert snapshot(page)["phase"] == "success"
    assert "声音不可用" in page.locator("#audioState").inner_text()
    assert not errors, errors
    page.close()


def main():
    check_report()
    with serve() as url, sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        check_viewports(browser, url)
        check_learning_loop(browser, url)
        check_rhythm_reset_and_dispose(browser, url)
        check_reduced_and_audio_fallback(browser, url)
        browser.close()
    print("PASS motif-match mini: viewport, model, rhythm, fallback, lifecycle")


if __name__ == "__main__":
    main()
