"""Exact-viewport Chromium rendering used by the page inspection gate."""

from __future__ import annotations

import asyncio
import base64
import json
import os
import signal
import shutil
import socket
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
from websockets.asyncio.client import connect

from notale.utils.config import get_config


_CONFIG = get_config()
_SEMAPHORE: asyncio.Semaphore | None = None
_SEMAPHORE_LOOP: asyncio.AbstractEventLoop | None = None


class BrowserUnavailable(RuntimeError):
    """No usable local Chromium executable could be started."""


class BrowserRenderError(RuntimeError):
    """Chromium started, but the requested page could not be rendered."""


@dataclass(frozen=True)
class RenderedPage:
    screenshot: bytes
    # Empty when the caller did not ask for measurement, or when a renderer
    # cannot provide one. Downstream checks read an absent measurement as
    # "unknown" rather than "passed", so this default is load-bearing.
    measurements: dict[str, Any] = field(default_factory=dict)

    @property
    def screenshot_data_url(self) -> str:
        encoded = base64.b64encode(self.screenshot).decode("ascii")
        return f"data:image/png;base64,{encoded}"


def _browser_semaphore() -> asyncio.Semaphore:
    global _SEMAPHORE, _SEMAPHORE_LOOP
    loop = asyncio.get_running_loop()
    if _SEMAPHORE is None or _SEMAPHORE_LOOP is not loop:
        _SEMAPHORE = asyncio.Semaphore(_CONFIG.inspection.browser_concurrency)
        _SEMAPHORE_LOOP = loop
    return _SEMAPHORE


def browser_candidates() -> list[Path]:
    """Return explicit, system, then Playwright-cache Chromium candidates."""

    candidates: list[Path] = []
    explicit = os.environ.get(_CONFIG.inspection.browser_path_env, "").strip()
    if explicit:
        candidates.append(Path(explicit).expanduser())
    for command in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable"):
        found = shutil.which(command)
        if found:
            candidates.append(Path(found))
    cache = Path.home() / ".cache" / "ms-playwright"
    candidates.extend(sorted(cache.glob("chromium-*/chrome-linux/chrome")))
    candidates.extend(sorted(cache.glob("chromium-*/chrome-linux64/chrome")))
    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate.resolve(strict=False))
        if key not in seen and candidate.is_file():
            seen.add(key)
            unique.append(candidate)
    return unique


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class _CDPConnection:
    def __init__(self, websocket: Any, timeout: float) -> None:
        self.websocket = websocket
        self.timeout = timeout
        self._next_id = 0
        self._pending: dict[int, asyncio.Future[dict[str, Any]]] = {}
        self._reader = asyncio.create_task(self._read(), name="notale-cdp-reader")

    async def _read(self) -> None:
        try:
            async for raw in self.websocket:
                message = json.loads(raw)
                call_id = message.get("id")
                if isinstance(call_id, int):
                    future = self._pending.pop(call_id, None)
                    if future is not None and not future.done():
                        future.set_result(message)
        except BaseException as exc:
            for future in self._pending.values():
                if not future.done():
                    future.set_exception(exc)
            self._pending.clear()

    async def call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self._next_id += 1
        call_id = self._next_id
        future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending[call_id] = future
        await self.websocket.send(
            json.dumps({"id": call_id, "method": method, "params": params or {}})
        )
        try:
            message = await asyncio.wait_for(future, timeout=self.timeout)
        except BaseException:
            self._pending.pop(call_id, None)
            raise
        if "error" in message:
            raise BrowserRenderError(f"CDP {method} failed: {message['error']}")
        return dict(message.get("result") or {})

    async def evaluate(self, expression: str, *, await_promise: bool = False) -> Any:
        result = await self.call(
            "Runtime.evaluate",
            {
                "expression": expression,
                "awaitPromise": await_promise,
                "returnByValue": True,
                "userGesture": False,
            },
        )
        value = result.get("result") or {}
        if value.get("subtype") == "error":
            raise BrowserRenderError(str(value.get("description") or "browser evaluation failed"))
        return value.get("value")

    async def close(self) -> None:
        await self.websocket.close()
        self._reader.cancel()
        try:
            await self._reader
        except (asyncio.CancelledError, Exception):
            pass


class BrowserPageRenderer:
    """Render one final-shell page at the exact presentation viewport."""

    def __init__(self) -> None:
        self._semaphore: asyncio.Semaphore | None = None
        self._process: asyncio.subprocess.Process | None = None
        self._process_group: int | None = None
        self._profile: tempfile.TemporaryDirectory[str] | None = None
        self._cdp: _CDPConnection | None = None
        self.executable: Path | None = None

    async def __aenter__(self) -> "BrowserPageRenderer":
        self._semaphore = _browser_semaphore()
        await self._semaphore.acquire()
        try:
            await self._launch()
        except BaseException:
            self._semaphore.release()
            self._semaphore = None
            raise
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, traceback: Any) -> None:
        del exc_type, exc, traceback
        await self.close()

    async def _launch_candidate(self, executable: Path) -> None:
        port = _free_port()
        self._profile = tempfile.TemporaryDirectory(
            prefix="notale-chromium-", ignore_cleanup_errors=True
        )
        command = [
            str(executable),
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-crash-reporter",
            "--disable-breakpad",
            "--disable-background-networking",
            "--allow-file-access-from-files",
            "--remote-allow-origins=*",
            f"--remote-debugging-port={port}",
            f"--user-data-dir={self._profile.name}",
            "about:blank",
        ]
        self._process = await asyncio.create_subprocess_exec(
            *command,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
            start_new_session=True,
        )
        self._process_group = self._process.pid
        endpoint = f"http://127.0.0.1:{port}/json/list"
        deadline = asyncio.get_running_loop().time() + min(
            12.0, _CONFIG.inspection.browser_timeout_sec
        )
        pages: list[dict[str, Any]] = []
        async with httpx.AsyncClient(timeout=1.0, trust_env=False) as client:
            while asyncio.get_running_loop().time() < deadline:
                if self._process.returncode is not None:
                    break
                try:
                    response = await client.get(endpoint)
                    response.raise_for_status()
                    pages = list(response.json())
                    if pages:
                        break
                except (httpx.HTTPError, ValueError):
                    pass
                await asyncio.sleep(0.1)
        page = next((item for item in pages if item.get("type") == "page"), None)
        if page is None or not page.get("webSocketDebuggerUrl"):
            raise BrowserUnavailable(f"Chromium did not expose a debuggable page: {executable}")
        websocket = await connect(
            str(page["webSocketDebuggerUrl"]),
            open_timeout=min(10.0, _CONFIG.inspection.browser_timeout_sec),
            max_size=64 * 1024 * 1024,
        )
        self._cdp = _CDPConnection(websocket, _CONFIG.inspection.browser_timeout_sec)
        for method in ("Page.enable", "Runtime.enable"):
            await self._cdp.call(method)
        await self._cdp.call(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": 1280,
                "height": 720,
                "deviceScaleFactor": 1,
                "mobile": False,
                "screenWidth": 1280,
                "screenHeight": 720,
            },
        )
        await self._cdp.call(
            "Emulation.setEmulatedMedia",
            {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]},
        )
        self.executable = executable

    async def _discard_process(self) -> None:
        if self._cdp is not None:
            try:
                await self._cdp.close()
            except Exception:
                pass
            self._cdp = None
        if self._process_group is not None:
            try:
                os.killpg(self._process_group, signal.SIGTERM)
            except ProcessLookupError:
                pass
        if self._process is not None and self._process.returncode is None:
            try:
                await asyncio.wait_for(self._process.wait(), timeout=3)
            except TimeoutError:
                if self._process_group is not None:
                    try:
                        os.killpg(self._process_group, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                await self._process.wait()
        self._process = None
        self._process_group = None
        if self._profile is not None:
            await asyncio.sleep(0.05)
            self._profile.cleanup()
            self._profile = None

    async def _launch(self) -> None:
        errors: list[str] = []
        for candidate in browser_candidates():
            try:
                await self._launch_candidate(candidate)
                return
            except Exception as exc:
                errors.append(f"{candidate}: {type(exc).__name__}: {exc}")
                await self._discard_process()
        detail = "; ".join(errors) if errors else "no Chromium executable found"
        raise BrowserUnavailable(detail)

    async def render(self, document_path: Path, *, measure: bool = False) -> RenderedPage:
        if self._cdp is None:
            raise BrowserRenderError("renderer is not open")
        path = Path(document_path).resolve()
        if not path.is_file():
            raise BrowserRenderError(f"inspection document does not exist: {path}")
        await self._cdp.call("Page.navigate", {"url": path.as_uri()})
        deadline = asyncio.get_running_loop().time() + _CONFIG.inspection.browser_timeout_sec
        while True:
            ready = await self._cdp.evaluate("document.readyState")
            if ready == "complete":
                break
            if asyncio.get_running_loop().time() >= deadline:
                raise BrowserRenderError("page load timed out")
            await asyncio.sleep(0.05)
        settle_ms = int(_CONFIG.inspection.render_settle_ms)
        await self._cdp.evaluate(
            """(async () => {
              await document.fonts.ready;
              const wait = item => item.complete ? Promise.resolve() : new Promise(resolve => {
                item.addEventListener('load', resolve, {once:true});
                item.addEventListener('error', resolve, {once:true});
              });
              await Promise.all([...document.images].map(wait));
              const waitFrame = frame => {
                // A sandboxed component without allow-same-origin has an opaque origin, so
                // contentDocument is permanently null. The top document reaching "complete"
                // has already waited for that subframe; attaching a late load listener here
                // would otherwise hang until the CDP timeout.
                let child = null;
                try { child = frame.contentDocument; } catch (_) { return Promise.resolve(); }
                if (!child || child.readyState === 'complete') return Promise.resolve();
                return new Promise(resolve => {
                  frame.addEventListener('load', resolve, {once:true});
                  frame.addEventListener('error', resolve, {once:true});
                });
              };
              await Promise.all([...document.querySelectorAll('iframe')].map(waitFrame));
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              await new Promise(resolve => setTimeout(resolve, %d));
              return true;
            })()""" % settle_ms,
            await_promise=True,
        )
        # Measure after the page has settled but before the screenshot, so the
        # numbers describe exactly the frame that gets captured.
        measurements: dict[str, Any] = {}
        if measure:
            from notale.web.measure import MEASURE_JS

            try:
                result = await self._cdp.evaluate(MEASURE_JS, await_promise=True)
                if isinstance(result, dict):
                    measurements = result
            except Exception as exc:  # noqa: BLE001 — measurement must not fail a render
                measurements = {"error": f"{type(exc).__name__}: {exc}"}
        screenshot = await self._cdp.call(
            "Page.captureScreenshot",
            {
                "format": "png",
                "fromSurface": True,
                "captureBeyondViewport": False,
                "clip": {"x": 0, "y": 0, "width": 1280, "height": 720, "scale": 1},
            },
        )
        raw = screenshot.get("data")
        if not isinstance(raw, str):
            raise BrowserRenderError("Chromium returned no screenshot data")
        return RenderedPage(screenshot=base64.b64decode(raw), measurements=measurements)

    async def close(self) -> None:
        await self._discard_process()
        if self._semaphore is not None:
            self._semaphore.release()
            self._semaphore = None
