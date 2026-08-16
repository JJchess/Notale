"""Style Lab: build a matrix of packs and judge them, locally and for free.

Ported from deckbase's `style_lab`, minus the thing that shaped it most. Every
`confirm_spend` gate, `dry_run` sentinel, and `PermissionError` in that package
exists to protect an image-generation budget: a cell cost money to render, so the
default had to be "don't". notale renders HTML in a headless browser, so a cell
costs a second and the default is simply to run it.

That inversion also upgrades the verdict. deckbase's deck smoke could only assert
`returncode == 0` — it had no way to look at the pixels it paid for. Here a cell
renders the pack's own specimens and runs the same `page_qa` checks the inspector
gets, so "this cell is fine" means contrast, palette, type scale and overflow were
actually measured. deckbase's own roadmap files that as unfinished work.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from notale.core.stages.page_qa import QaCheck, evaluate_page_qa, summarize
from notale.style_studio.build.registry_user import user_pack_dir
from notale.style_studio.build.service import (
    apply_patch,
    ensure_user_draft,
    from_images,
    from_pdf,
    from_pptx,
    from_text,
    pack_exists,
)
from notale.style_studio.paths import notale_root, style_build_gallery_root
from notale.style_studio.preview import check_pack
from notale.style_studio.registry import get_pack, list_packs, reload_registry

MATRIX_PATH = notale_root() / "styles" / "lab" / "matrix.json"


@dataclass
class CellResult:
    cell_id: str
    pack_id: str
    build: str
    ok: bool
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    qa: dict[str, int] = field(default_factory=dict)
    qa_failures: list[str] = field(default_factory=list)
    rendered: dict[str, list[str]] = field(default_factory=dict)
    contrast: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "cell_id": self.cell_id,
            "pack_id": self.pack_id,
            "build": self.build,
            "ok": self.ok,
            "failures": self.failures,
            "warnings": self.warnings,
            "qa": self.qa,
            "qa_failures": self.qa_failures,
            "rendered": self.rendered,
            "contrast": self.contrast,
        }


def load_matrix(path: Path | None = None) -> dict[str, Any]:
    target = Path(path or MATRIX_PATH)
    if not target.is_file():
        raise FileNotFoundError(f"style lab matrix not found: {target}")
    return json.loads(target.read_text(encoding="utf-8"))


def cell_by_id(matrix: Mapping[str, Any], cell_id: str) -> dict[str, Any]:
    for cell in matrix.get("cells") or []:
        if str(cell.get("id")) == cell_id:
            return dict(cell)
    raise KeyError(f"unknown matrix cell: {cell_id}")


def resolve_ids(matrix: Mapping[str, Any], wanted: Sequence[str]) -> list[str]:
    """Accept exact ids, unambiguous prefixes, or 'all'."""
    ids = [str(cell.get("id")) for cell in matrix.get("cells") or []]
    if not wanted or list(wanted) == ["all"]:
        return ids
    out: list[str] = []
    for name in wanted:
        if name in ids:
            out.append(name)
            continue
        matches = [item for item in ids if item.startswith(f"{name}_") or item.startswith(name)]
        if len(matches) == 1:
            out.append(matches[0])
        elif not matches:
            raise KeyError(f"unknown matrix cell: {name}")
        else:
            raise KeyError(f"ambiguous cell {name!r}: {matches}")
    return out


def ensure_cell_pack(cell: Mapping[str, Any]) -> str:
    """Materialize the pack a cell describes. Idempotent: a re-run does not clobber."""
    pack_id = str(cell["pack_id"])
    build = str(cell.get("build") or "preset")
    parent = str(cell.get("parent") or "")
    label = str(cell.get("label") or pack_id)
    root = notale_root().parent

    if build == "preset":
        get_pack(pack_id, validate=False)
        return pack_id
    if build == "fork_patch":
        if not pack_exists(pack_id):
            ensure_user_draft(pack_id, parent_id=parent, label=label)
        if cell.get("patch"):
            apply_patch(pack_id, dict(cell["patch"]))
        return pack_id
    if build == "from_text":
        from_text(pack_id, str(cell.get("text") or ""), parent_id=parent, label=label)
        return pack_id
    if build == "from_images":
        images = [root / str(item) for item in (cell.get("image_globs") or [])]
        existing = [path for path in images if path.is_file()]
        if not existing:
            raise FileNotFoundError(f"cell {cell.get('id')} has no readable images: {images}")
        from_images(pack_id, existing, parent_id=parent, label=label)
        return pack_id
    if build == "from_pptx":
        from_pptx(pack_id, root / str(cell["pptx"]), parent_id=parent, label=label)
        return pack_id
    if build == "from_pdf":
        source = cell.get("pdf_fixture") or cell.get("pdf")
        from_pdf(pack_id, root / str(source), parent_id=parent, label=label)
        return pack_id
    raise ValueError(f"unsupported build type: {build!r}")


async def run_cell(cell: Mapping[str, Any], *, render: bool = True) -> CellResult:
    """Build the cell's pack, render its specimens, and measure the result."""
    from notale.style_studio.exemplars import render_pack_exemplars_async

    cell_id = str(cell.get("id") or cell.get("pack_id"))
    pack_id = ensure_cell_pack(cell)
    reload_registry()

    report = check_pack(pack_id)
    result = CellResult(
        cell_id=cell_id,
        pack_id=pack_id,
        build=str(cell.get("build") or "preset"),
        ok=bool(report["ok"]),
        failures=list(report["failures"]),
        warnings=list(report["warnings"]),
        contrast=str(cell.get("contrast") or ""),
    )
    if not render or not result.ok:
        return result

    pack = get_pack(pack_id)
    try:
        result.rendered = await render_pack_exemplars_async(pack)
    except Exception as exc:  # noqa: BLE001 — a missing browser costs the render, not the cell
        result.warnings.append(f"render skipped: {type(exc).__name__}: {exc}")
        return result

    checks = await _measure_specimens(get_pack(pack_id))
    result.qa = summarize(checks)
    result.qa_failures = [
        f"{check.check_id}: {check.detail}" for check in checks if check.status == "fail"
    ]
    if result.qa_failures:
        result.ok = False
    return result


async def _measure_specimens(pack: Any) -> list[QaCheck]:
    """Render each specimen through the real runtime and judge it."""
    import tempfile

    from notale.style_studio.exemplars import _fragments
    from notale.web.browser import BrowserPageRenderer
    from notale.web.deck import prepare_deck_runtime, render_slide_document

    checks: list[QaCheck] = []
    scale = pack.type_scale()
    with tempfile.TemporaryDirectory(prefix="notale-lab-") as staging:
        stage = Path(staging)
        prepare_deck_runtime(stage, pack.notale_tokens(), type_scale=scale)
        async with BrowserPageRenderer() as renderer:
            for index, (_role, _stem, fragment) in enumerate(_fragments(pack, 2), 1):
                document = stage / "slides" / f"p{index}.html"
                document.write_text(
                    render_slide_document(fragment, page=index, run_dir=stage),
                    encoding="utf-8",
                )
                rendered = await renderer.render(document, measure=True)
                checks.extend(
                    evaluate_page_qa(
                        rendered.measurements,
                        tokens=pack.notale_tokens(),
                        type_scale=scale.model_dump(mode="json") if scale else None,
                    )
                )
    return checks


async def run_matrix(
    cell_ids: Sequence[str] = (),
    *,
    matrix_path: Path | None = None,
    render: bool = True,
    run_id: str = "",
) -> dict[str, Any]:
    """Run selected cells and write a report. Returns the payload."""
    matrix = load_matrix(matrix_path)
    ids = resolve_ids(matrix, cell_ids)
    results: list[CellResult] = []
    for cell_id in ids:
        results.append(await run_cell(cell_by_id(matrix, cell_id), render=render))

    payload = {
        "schema_version": "notale_style_lab.v1",
        "compare_hints": list(matrix.get("compare_hints") or []),
        "ok": all(item.ok for item in results),
        "cells": [item.to_dict() for item in results],
    }
    destination = style_build_gallery_root() / (run_id or "matrix")
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "report.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (destination / "compare.html").write_text(_compare_html(payload), encoding="utf-8")
    payload["out_dir"] = str(destination)
    return payload


def catalog_packs() -> list[dict[str, Any]]:
    """Every registered pack with the fields a shelf view needs."""
    reload_registry()
    out: list[dict[str, Any]] = []
    for entry in list_packs(include_draft=True):
        try:
            pack = get_pack(entry["id"], validate=False)
        except Exception as exc:  # noqa: BLE001 — a broken pack still belongs on the shelf
            out.append({**entry, "error": f"{type(exc).__name__}: {exc}"})
            continue
        out.append({
            **entry,
            "label": pack.label,
            "audience_hint": pack.audience_hint,
            "density_default": pack.density_default,
            "radius": pack.radius_scale(),
            "tokens": pack.notale_tokens(),
            "exemplars": [
                str((pack.pack_dir / rel).resolve())
                for role in ("cover", "content")
                for rel in pack.role_exemplar_relpaths(role)
            ][:4],
            "is_user": entry["root"] == "user",
            "pack_dir": str(pack.pack_dir),
        })
    return out


def _compare_html(payload: Mapping[str, Any]) -> str:
    rows: list[str] = []
    for cell in payload.get("cells") or []:
        status = "ok" if cell["ok"] else "fail"
        notes = "<br>".join(
            (cell.get("failures") or []) + (cell.get("qa_failures") or [])
        ) or "&mdash;"
        rows.append(
            f'<tr class="{status}"><td><code>{cell["cell_id"]}</code></td>'
            f'<td><code>{cell["pack_id"]}</code></td><td>{cell["build"]}</td>'
            f'<td>{status}</td><td>{cell.get("contrast") or ""}</td><td>{notes}</td></tr>'
        )
    hints = "".join(f"<li>{item}</li>" for item in payload.get("compare_hints") or [])
    return (
        "<!doctype html><meta charset=utf-8><title>Style Lab</title>"
        "<style>body{font:15px/1.5 system-ui;margin:32px;max-width:1100px}"
        "table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px;"
        "text-align:left;vertical-align:top}tr.fail{background:#fff2f2}"
        "tr.ok{background:#f4fbf4}code{font:13px ui-monospace}</style>"
        f"<h1>Style Lab</h1><ul>{hints}</ul>"
        "<table><tr><th>cell</th><th>pack</th><th>build</th><th>status</th>"
        f"<th>what it shows</th><th>notes</th></tr>{''.join(rows)}</table>"
    )
