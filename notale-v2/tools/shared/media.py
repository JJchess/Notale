"""Shared media execution. Callers choose images; this module knows no page plan."""

from __future__ import annotations

import json
import http.client
import ipaddress
import socket
import ssl
import subprocess
import time
import uuid
import warnings
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx
from PIL import Image

from tools.image_search import tool as image_search
from tools.image_gen import tool as image_gen
from core.redact import redact

SCHEMAS = [image_search.SCHEMA, image_gen.SCHEMA]
NAMES = frozenset(s["name"] for s in SCHEMAS)


def search_backend() -> str:
    from core.llm import config
    return config().get("media", {}).get("image_search_backend", "gemini")


def _error(source: str, exc: Exception) -> dict:
    code = type(exc).__name__
    message = str(exc)
    if isinstance(exc, httpx.HTTPStatusError):
        code = str(exc.response.status_code)
        # No response body or request headers: they may contain credentials.
        message = f"HTTP {code}: {exc.response.reason_phrase}"
    row = {"source": source, "code": code, "message": redact(message)[:500]}
    if isinstance(exc, httpx.HTTPStatusError):
        delay = exc.response.headers.get("Retry-After", "")
        if delay.isdigit():
            row["retry_after_seconds"] = int(delay)
    return row


def _public_connection(url: str, timeout: float):
    """Pin the connection to a checked public IP; keep TLS/Host at the original host."""
    parsed = urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("图片地址必须是无凭据的公开 HTTP(S) URL")
    host = parsed.hostname.encode("idna").decode("ascii")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError("图片地址解析到非公网地址")
    conn = http.client.HTTPConnection(host, port, timeout=timeout)
    sock = socket.create_connection((addresses[0][4][0], port), timeout=timeout)
    try:
        if parsed.scheme == "https":
            sock = ssl.create_default_context().wrap_socket(sock, server_hostname=host)
        conn.sock = sock
        return conn, parsed
    except Exception:
        sock.close()
        raise


def image_info(path: Path) -> tuple[str, int, int]:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as img:
                ext = {"JPEG": ".jpg", "PNG": ".png", "GIF": ".gif", "WEBP": ".webp"}.get(img.format)
                if not ext:
                    raise ValueError(f"不支持的浏览器图片格式：{img.format}")
                img.load()
                return ext, img.width, img.height
    except (Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
        raise ValueError(f"图片超过解码器的安全尺寸：{exc}") from exc


def _download_image(url: str, out: Path, index: int, deadline: float) -> tuple[Path, int, int]:
    """Download public originals only; redirects are checked and no API credentials leave here."""
    partial = out / f"{index:02d}.part"
    try:
        for _ in range(6):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("图片下载超时")
            conn, parsed = _public_connection(url, min(30, remaining))
            try:
                target = parsed.path or "/"
                if parsed.query:
                    target += "?" + parsed.query
                conn.request("GET", target, headers={"User-Agent": "Notale-image-search/1.0"})
                response = conn.getresponse()
                if response.status in (301, 302, 303, 307, 308):
                    location = response.getheader("Location")
                    if not location:
                        raise ValueError("图片重定向缺少 Location")
                    url = urljoin(url, location)
                    continue
                if response.status != 200:
                    raise OSError(f"图片下载 HTTP {response.status}: {response.reason}")
                with partial.open("xb") as file:
                    while True:
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            raise TimeoutError("图片下载超时")
                        if conn.sock:
                            conn.sock.settimeout(min(30, remaining))
                        chunk = response.read(64 * 1024)
                        if not chunk:
                            break
                        file.write(chunk)
                ext, width, height = image_info(partial)
                target = out / f"{index:02d}{ext}"
                partial.replace(target)
                return target, width, height
            finally:
                conn.close()
        raise ValueError("图片重定向过多")
    finally:
        # Only this call's incomplete download, never an existing user asset.
        partial.unlink(missing_ok=True)




def fetch(name: str, args: dict, pages: Path, owner: str, *, backend: str | None = None
          ) -> tuple[Path, list[dict], list[dict]]:
    """Private directory per call: shared assets and concurrent calls cannot collide."""
    if name not in NAMES or not owner or Path(owner).name != owner or owner in {".", ".."}:
        raise ValueError("invalid media operation or owner")
    key = "count" if name == "ImageSearch" else "n"
    count = args.get(key, 3 if name == "ImageSearch" else 1)
    if type(count) is not int or count < 1:
        raise ValueError(f"{key} must be a positive integer")
    out = pages / "assets" / "img" / f"{owner}-{uuid.uuid4().hex[:12]}"
    out.resolve().relative_to(pages.resolve())
    out.mkdir(parents=True, exist_ok=False)
    errors = []
    if name == "ImageSearch":
        backend = backend or search_backend()
        try:
            if backend == "gemini":
                from tools.image_search.tool import search
                raw_rows, errors = search(args.get("query"), count, out)
            else:
                raise ValueError(f"未知图片检索后端：{backend}")
        except (OSError, ValueError, RuntimeError, httpx.HTTPError, subprocess.TimeoutExpired) as exc:
            return out, [], [_error(backend, exc)]
    else:
        raw_rows = image_gen.generate(args, count, out)
    records = []
    for raw in raw_rows:
        if name == "ImageSearch" and not isinstance(raw, dict):
            errors.append(_error(backend, ValueError("图片候选不是对象")))
            continue
        row = dict(raw)
        if row.get("download_error"):
            row["error"] = row.pop("download_error")
        filename = row.pop("file", None)
        if filename:
            try:
                if not isinstance(filename, str):
                    raise ValueError("图片文件名不是字符串")
                path = (out / filename).resolve()
                path.relative_to(out.resolve())
                if path.is_file():
                    row["path"] = path.relative_to(pages.resolve()).as_posix()
            except ValueError as exc:
                if name != "ImageSearch":
                    raise
                row["error"] = _error(backend, exc)["message"]
        records.append(row)
    return out, records, errors


def record_search(out: Path, pages: Path, args: dict, backend: str, elapsed: float,
                  result: dict, records: list[dict]) -> None:
    """One private invocation report; preserve the legacy attribution array."""
    rows = []
    for item in records:
        row = dict(item)
        path = row.pop("path", None)
        if path:
            row["file"] = (pages / path).resolve().relative_to(out.resolve()).as_posix()
        rows.append(row)
    (out / "attribution.json").write_text(redact(json.dumps(rows, ensure_ascii=False, indent=2)))
    report = {"query": args.get("query"), "backend": backend,
              "requested_count": args.get("count", 3), "duration_ms": round(elapsed * 1000),
              "result": result}
    (out / "search.json").write_text(redact(json.dumps(report, ensure_ascii=False, indent=2)))


def sources(pages: Path) -> dict[str, dict]:
    """Read existing vendor provenance, without a second asset registry."""
    records = {}
    for filename in ("attribution.json", "illustrations.json"):
        for log in sorted((pages / "assets/img").glob(f"*/{filename}")):
            try:
                for raw in json.loads(log.read_text()):
                    if not raw.get("file"):
                        continue
                    path = (log.parent / raw["file"]).resolve()
                    path.relative_to(log.parent.resolve())
                    if path.is_file():
                        records[path.relative_to(pages.resolve()).as_posix()] = raw
            except (OSError, ValueError, TypeError, AttributeError) as exc:
                print(f"  来源记录无法读取：{log.name}: {exc}")
    return records


def describe(path: str, record: dict) -> str:
    """Human-readable provenance; no required metadata invented for the provider."""
    parts = [str(record[k]) for k in ("title", "page_url" if record.get("page_url") else "url",
                                    "author", "license", "model") if record.get(k)]
    return f"- `{path}`" + (" — " + " · ".join(parts) if parts else "")


def write_credits(pages: Path) -> None:
    """One writer after the batch; explicitly a fetched-materials record, not usage proof."""
    records = sources(pages)
    if records:
        (pages / "assets/img/CREDITS.md").write_text(
            "# 素材来源\n\n取图结果记录，包含未采用候选；不代表页面实际加载。\n\n"
            + "\n".join(describe(path, row) for path, row in records.items()) + "\n")
