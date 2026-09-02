#!/usr/bin/env python3
"""Capture the four pre-chart authored states from the pinned upstream build."""

import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright


ROOT = Path(__file__).resolve().parents[1]
SHOT_DIR = ROOT / "screenshots" / "upstream"
URL = "http://127.0.0.1:43245/lenna/"


async def main() -> None:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    metrics = []

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        page = await browser.new_page(viewport={"width": 1600, "height": 900})
        await page.goto(URL, wait_until="domcontentloaded")
        await page.wait_for_selector(".step")
        await page.wait_for_timeout(1600)

        for index, name in enumerate(("five", "field", "contexts", "portrait")):
            await page.locator(".step").nth(index).evaluate(
                """el => {
                    const r = el.getBoundingClientRect();
                    const y = window.scrollY + r.top - (window.innerHeight - r.height) / 2;
                    window.scrollTo(0, y);
                }"""
            )
            await page.wait_for_timeout(2900)
            details = await page.evaluate(
                """() => ({
                    scrollY: Math.round(window.scrollY),
                    activeStep: [...document.querySelectorAll('.step')]
                        .findIndex(el => el.classList.contains('active')),
                    images: [...document.querySelectorAll('.sticky img')]
                        .filter(el => /\/(memes|screenshots)\//.test(el.src))
                        .map(el => {
                            const r = el.getBoundingClientRect();
                            const s = getComputedStyle(el);
                            return {
                                file: el.src.split('/').pop(),
                                group: el.src.includes('/memes/') ? 'meme' : 'screenshot',
                                x: Math.round(r.x), y: Math.round(r.y),
                                w: Math.round(r.width), h: Math.round(r.height),
                                opacity: Number(s.opacity),
                                borderWidth: s.borderTopWidth,
                                borderColor: s.borderTopColor
                            };
                        }),
                    canvas: (() => {
                        const el = document.querySelector('.sticky canvas');
                        if (!el) return null;
                        const r = el.getBoundingClientRect();
                        const s = getComputedStyle(el);
                        return {x: Math.round(r.x), y: Math.round(r.y),
                                w: Math.round(r.width), h: Math.round(r.height),
                                opacity: Number(s.opacity), display: s.display};
                    })()
                })"""
            )
            metrics.append({"state": index, "name": name, **details})
            await page.screenshot(path=str(SHOT_DIR / f"upstream-{index}-{name}.png"))

        await browser.close()

    (ROOT / "audit" / "upstream-metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    asyncio.run(main())
