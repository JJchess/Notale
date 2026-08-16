"""Shared artifact protocol for Builder-owned managed component tools."""

from __future__ import annotations

import hashlib
import html
import json
import re
import threading
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from notale.core.models import PageArtifact, PagePlan, PageType
from notale.utils.node import run_node
from notale.utils.skill_catalog import GeneratedDesignSkill
from notale.web.font_catalog import (
    LEGACY_FONT_TOKEN_KEYS,
    NEW_FONT_TOKEN_KEYS,
    font_variable_declarations,
)


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ComponentRecord(_StrictModel):
    component_id: str = Field(
        pattern=r"^p[1-9][0-9]*-(?:widget|code-runtime)-[0-9a-f]{12}$"
    )
    page: int = Field(ge=1)
    kind: Literal["widget", "code-runtime"]
    title: str = Field(min_length=1)
    widget_type: str = Field(min_length=1)
    width: int
    height: int
    local_path: str = Field(pattern=r"^components/[A-Za-z0-9._-]+\.html$")
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    mount_html: str = Field(min_length=1)
    model_calls: int = Field(ge=1, le=3)
    repair_calls: int = Field(ge=0, le=1)
    provenance: str = Field(min_length=1)


class ComponentManifest(_StrictModel):
    version: Literal[1] = 1
    components: list[ComponentRecord] = Field(default_factory=list)


_LOCK = threading.Lock()
_COMPONENT_ID = re.compile(r"^p[1-9][0-9]*-(?:widget|code-runtime)-[0-9a-f]{12}$")
_OUTER_SCRIPT = re.compile(r"<script\b", re.I)
_SCRIPT = re.compile(r"<script(?P<attrs>[^>]*)>(?P<code>.*?)</script\s*>", re.I | re.S)


def render_component_document(
    fragment: str,
    *,
    style: GeneratedDesignSkill,
    language: str,
    title: str,
    width: int,
    height: int,
) -> str:
    """Wrap a tool-generated fragment in the shared sandboxed component document."""

    tokens = dict(style.tokens)
    font_keys = NEW_FONT_TOKEN_KEYS | LEGACY_FONT_TOKEN_KEYS
    declarations = "\n".join(
        f"    --notale-{key}: {value};"
        for key, value in tokens.items()
        if key not in font_keys
    )
    declarations += "\n" + "\n".join(
        f"    --notale-{key}: {value};"
        for key, value in font_variable_declarations(tokens).items()
    )
    return f"""<!doctype html>
<html lang="{html.escape(language, quote=True)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width={width}, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline' blob:; worker-src blob:; img-src data: blob:; connect-src 'none'; font-src 'self'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>{html.escape(title)}</title>
  <link rel="stylesheet" href="../runtime/fonts.css">
  <style>
  :root {{
{declarations}
    --notale-radius-md: 10px;
    --notale-radius-lg: 16px;
    --notale-radius-xl: 24px;
  }}
  html, body {{ width:{width}px; height:{height}px; margin:0; overflow:hidden; background:transparent; }}
  *, *::before, *::after {{ box-sizing:border-box; }}
  body {{ color:var(--notale-ink); font-family:var(--notale-font-body); }}
  button, input, select, textarea {{ font:inherit; }}
  </style>
</head>
<body>
{fragment}
</body>
</html>
"""


async def inline_script_failure(
    fragment: str,
    *,
    workspace: Path,
    label: str,
    timeout_sec: float,
    error_chars: int,
) -> str:
    """Syntax-check the inline JavaScript shared by both managed component tools."""

    scripts: list[str] = []
    for match in _SCRIPT.finditer(fragment):
        if re.search(r"\bsrc\s*=", match.group("attrs"), re.I):
            return "component scripts must be inline"
        scripts.append(match.group("code"))
    if not scripts:
        return ""
    workspace.mkdir(parents=True, exist_ok=True)
    path = workspace / f"check-{label}.js"
    path.write_text("\n;\n".join(scripts), encoding="utf-8")
    try:
        result = await run_node(["--check", str(path)], timeout_sec=timeout_sec)
        if result.returncode:
            detail = (result.stdout + result.stderr).decode("utf-8", errors="replace")
            return "component JavaScript is invalid: " + detail[:error_chars]
        return ""
    finally:
        path.unlink(missing_ok=True)


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, default=str), encoding="utf-8"
    )
    temporary.replace(path)


def _manifest_path(run_dir: Path) -> Path:
    return Path(run_dir) / "components" / "manifest.json"


def ensure_component_manifest(run_dir: Path) -> Path:
    path = _manifest_path(run_dir)
    with _LOCK:
        if not path.exists():
            _atomic_json(path, ComponentManifest().model_dump(mode="json"))
    return path


def load_component_manifest(run_dir: Path, *, create: bool = False) -> ComponentManifest:
    path = ensure_component_manifest(run_dir) if create else _manifest_path(run_dir)
    if not path.is_file():
        raise ValueError("component manifest does not exist")
    try:
        return ComponentManifest.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError(f"component manifest is unreadable: {exc}") from exc


def page_components(run_dir: Path, page: int) -> list[ComponentRecord]:
    try:
        manifest = load_component_manifest(run_dir)
    except ValueError:
        return []
    return [item for item in manifest.components if item.page == page]


def make_component_id(page: int, kind: str, seed: str) -> str:
    slug = "code-runtime" if kind == "code-runtime" else "widget"
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:12]
    return f"p{page}-{slug}-{digest}"


def make_mount_html(
    component_id: str, *, title: str, kind: str, width: int, height: int
) -> str:
    if _COMPONENT_ID.fullmatch(component_id) is None:
        raise ValueError(f"invalid component id: {component_id}")
    return (
        f'<iframe data-notale-component="{component_id}" data-notale-kind="{kind}" '
        f'title="{html.escape(title, quote=True)}" width="{width}" height="{height}" '
        f'style="display:block;border:0;width:{width}px;height:{height}px" '
        'sandbox="allow-scripts"></iframe>'
    )


def write_component(
    run_dir: Path,
    *,
    component_id: str,
    page: int,
    kind: str,
    title: str,
    widget_type: str,
    width: int,
    height: int,
    document: str,
    model_calls: int,
    repair_calls: int,
    provenance: str,
) -> ComponentRecord:
    if _COMPONENT_ID.fullmatch(component_id) is None:
        raise ValueError(f"invalid component id: {component_id}")
    components_dir = Path(run_dir) / "components"
    components_dir.mkdir(parents=True, exist_ok=True)
    local_path = f"components/{component_id}.html"
    path = Path(run_dir) / local_path
    raw = document.encode("utf-8")
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(raw)
    temporary.replace(path)
    record = ComponentRecord(
        component_id=component_id,
        page=page,
        kind=kind,
        title=title,
        widget_type=widget_type,
        width=width,
        height=height,
        local_path=local_path,
        sha256=hashlib.sha256(raw).hexdigest(),
        mount_html=make_mount_html(
            component_id, title=title, kind=kind, width=width, height=height
        ),
        model_calls=model_calls,
        repair_calls=repair_calls,
        provenance=provenance,
    )
    manifest_path = ensure_component_manifest(run_dir)
    with _LOCK:
        manifest = ComponentManifest.model_validate_json(
            manifest_path.read_text(encoding="utf-8")
        )
        existing_page = [item for item in manifest.components if item.page == page]
        if existing_page:
            path.unlink(missing_ok=True)
            raise ValueError(f"page {page} already owns a managed component")
        manifest.components.append(record)
        _atomic_json(manifest_path, manifest.model_dump(mode="json"))
    return record


class _MountParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.mounts: list[tuple[str, dict[str, str]]] = []
        self.non_iframe_markers = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        component_id = values.get("data-notale-component")
        if component_id is None:
            return
        if tag.lower() != "iframe":
            self.non_iframe_markers += 1
            return
        self.mounts.append((component_id, values))

    handle_startendtag = handle_starttag


def _record_file_failure(record: ComponentRecord, run_dir: Path) -> str:
    path = Path(run_dir) / record.local_path
    if not path.is_file():
        return f"component source is missing: {record.component_id}"
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != record.sha256:
        return f"component source hash mismatch: {record.component_id}"
    return ""


def component_delivery_failures(
    artifact: PageArtifact,
    *,
    page: int,
    run_dir: Path | None,
    page_plan: PagePlan | None,
) -> list[str]:
    parser = _MountParser()
    parser.feed(artifact.html)
    failures: list[str] = []
    if parser.non_iframe_markers:
        failures.append("data-notale-component is only valid on a managed iframe")
    expected_kind = ""
    if page_plan is not None:
        if page_plan.type == PageType.SIM_EXPLORABLE:
            expected_kind = "widget"
        elif page_plan.type == PageType.CODE_RUNNABLE:
            expected_kind = "code-runtime"
    records = page_components(run_dir, page) if run_dir is not None else []
    by_id = {item.component_id: item for item in records}
    if expected_kind and not records:
        failures.append(f"{page_plan.type.value} page must mount its managed {expected_kind} component")
    if len(records) > 1 or len(parser.mounts) > 1:
        failures.append("a page may contain at most one managed component")
    mounted_ids = [component_id for component_id, _ in parser.mounts]
    for component_id, attrs in parser.mounts:
        record = by_id.get(component_id)
        if record is None:
            failures.append(f"component is not registered to page {page}: {component_id}")
            continue
        if attrs.get("src") or attrs.get("srcdoc"):
            failures.append("managed component placeholder must not contain src or srcdoc")
        if attrs.get("sandbox") != "allow-scripts":
            failures.append("managed component sandbox must be exactly allow-scripts")
        if attrs.get("width") != str(record.width) or attrs.get("height") != str(record.height):
            failures.append("managed component dimensions must match the tool result")
        if artifact.html.count(record.mount_html) != 1:
            failures.append("paste mount_html exactly; position it with an outer page wrapper")
        file_failure = _record_file_failure(record, Path(run_dir))
        if file_failure:
            failures.append(file_failure)
    for record in records:
        if record.component_id not in mounted_ids:
            failures.append(f"generated component is not mounted: {record.component_id}")
        if expected_kind and record.kind != expected_kind:
            failures.append(f"page type requires {expected_kind}, got {record.kind}")
    if (records or expected_kind) and _OUTER_SCRIPT.search(artifact.html):
        failures.append("a managed-component page must not contain outer-page scripts")
    return failures


def hydrate_component_mounts(html_fragment: str, *, page: int, run_dir: Path) -> str:
    result = html_fragment
    records = page_components(run_dir, page)
    initial_parser = _MountParser()
    initial_parser.feed(result)
    mounted_ids = {component_id for component_id, _ in initial_parser.mounts}
    for record in records:
        if record.component_id not in mounted_ids and record.mount_html not in result:
            # A degraded fallback may intentionally leave behind an unused component artifact,
            # or mention the component id in its visible failure note without mounting it.
            continue
        failure = _record_file_failure(record, run_dir)
        if failure:
            raise ValueError(failure)
        if result.count(record.mount_html) != 1:
            raise ValueError(f"component mount changed after submission: {record.component_id}")
        hydrated = record.mount_html.replace(
            ' sandbox="allow-scripts"',
            f' src="../{record.local_path}" sandbox="allow-scripts"',
        )
        result = result.replace(record.mount_html, hydrated, 1)
    parser = _MountParser()
    parser.feed(result)
    unknown = [component_id for component_id, _ in parser.mounts if component_id not in {r.component_id for r in records}]
    if unknown:
        raise ValueError(f"unregistered component mounts on page {page}: {unknown}")
    return result
