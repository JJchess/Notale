"""PlaywrightVerifier —— 真机无头渲染验证，实现 ports.RenderVerifier。

对应旧 tools/render-check.mjs + browser.mjs（手写 CDP → 改用 Playwright）。断言 0 console error、
无横向溢出、字体加载、无插值泄漏等。**前置**：需把 reveal.js 运行时 vendored 进 assets/runtime/
并提供 doc→HTML 装配页（见 PROJECT_STRUCTURE §6，后续轮次补）。当前给出可扩展骨架。
"""

from __future__ import annotations

from pathlib import Path

from ...ports.renderer import RenderReport

_RUNTIME = Path(__file__).resolve().parents[3] / "assets" / "runtime"


class PlaywrightVerifier:
    def __init__(self, runtime_dir: str | Path | None = None) -> None:
        self.runtime_dir = Path(runtime_dir) if runtime_dir else _RUNTIME

    async def verify(self, html: str) -> RenderReport:
        if not self.runtime_dir.exists():
            return RenderReport(
                ok=False,
                errors=[
                    f"reveal.js 运行时未 vendored（缺 {self.runtime_dir}）——"
                    "真机渲染验证待补，见 PROJECT_STRUCTURE §6；当前请用 StructuralVerifier。"
                ],
            )
        # 运行时就位后：用 playwright.async_api 起无头页、注入 html、收集 console/溢出断言。
        from playwright.async_api import async_playwright  # 延迟导入，避免无浏览器环境报错

        errors: list[str] = []
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page(viewport={"width": 1280, "height": 720})
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            await page.set_content(html, wait_until="networkidle")
            overflow = await page.evaluate(
                "document.documentElement.scrollWidth > document.documentElement.clientWidth"
            )
            if overflow:
                errors.append("横向溢出（scrollWidth > clientWidth）")
            await browser.close()
        return RenderReport(ok=not errors, errors=errors)
