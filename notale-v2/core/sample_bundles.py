"""Build model-readable sample bundles without changing runnable originals.

Visual workflows preserve the catalog-selected source verbatim, including CSS,
because composition and motion depend on it.  The fixed code workbench remains
the exception: its host owns view styling, so author-layer CSS stays omitted.
"""

from __future__ import annotations

import argparse
import json
import re
from fnmatch import fnmatch
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / "skills"
VISUAL_WORKFLOWS = frozenset({
    "build-cover",
    "build-page",
    "build-interaction",
})
LANGUAGES = {
    ".css": "css",
    ".html": "html",
    ".js": "javascript",
    ".jsx": "jsx",
    ".svelte": "svelte",
    ".json": "json",
    ".mjs": "javascript",
    ".py": "python",
    ".svg": "svg",
}
_STYLE = re.compile(r"\s*<style\b[^>]*>.*?</style>\s*", re.I | re.S)
_REF = re.compile(r'(?:src|href)="([^"#?]+)"')
# Chassis files and vendored libraries reach the Builder through <chassis> and
# the <tech> library index, so a sample may reference them without a note.
_PROVIDED = re.compile(r"(?:^|/)(?:base\.css|base\.js|[\w.-]+\.min\.js)$")
_PROVIDED_NOTE = (
    "provided by the deck chassis or the vendored library index; "
    "not part of this sample"
)


def _fence(text: str) -> str:
    longest = max((len(run) for run in re.findall(r"`+", text)), default=0)
    return "`" * max(3, longest + 1)


def _context_text(path: Path, *, include_css: bool) -> str | None:
    if include_css:
        return path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".css":
        return None
    text = path.read_text(encoding="utf-8")
    return _STYLE.sub("\n", text) if path.suffix.lower() == ".html" else text


def omitted_lines(sample: str, spec: dict, html: str) -> list[str]:
    """One ``<omitted>`` line per relative dependency the bundle does not carry.

    Every relative ``src``/``href`` in the HTML must be bundled, declared in the
    catalog's ``omitted`` map (fnmatch keys), or be a chassis/vendored file.
    Anything else raises: a silently missing data file is exactly the failure
    this guards against.
    """
    declared = dict(spec.get("omitted") or {})
    files = set(spec["files"])
    lines, missing, used = [], [], set()
    refs = {r[2:] if r.startswith("./") else r for r in _REF.findall(html)}
    for ref in sorted(refs):
        if ref.startswith(("http:", "https:", "data:", "//")) or ref in files:
            continue
        key = next((k for k in declared if fnmatch(ref, k)), None)
        if key is not None:
            used.add(key)
            note = declared[key]
        elif _PROVIDED.search(ref):
            note = _PROVIDED_NOTE
        else:
            missing.append(ref)
            continue
        lines.append(f'  <omitted path="{ref}">{note}</omitted>')
    unused = sorted(set(declared) - used)
    if missing or unused:
        raise ValueError(
            f"{sample}: undeclared relative dependencies {missing}; "
            f"declared but unreferenced {unused}"
        )
    return lines


def _variant(skill_dir: Path, row: dict, name: str, spec: dict) -> str:
    root = (skill_dir / spec["root"]).resolve()
    include_css = skill_dir.name in VISUAL_WORKFLOWS
    source_total = 0
    files: list[tuple[Path, str]] = []
    for rel in spec["files"]:
        path = (root / rel).resolve()
        path.relative_to(root)
        raw = path.read_text(encoding="utf-8")
        source_total += len(raw)
        text = _context_text(path, include_css=include_css)
        if text is not None:
            files.append((path, text))
    if source_total != spec["chars"]:
        raise ValueError(
            f"{skill_dir.name}/{row['id']} {name}: catalog says {spec['chars']}, "
            f"source has {source_total} characters"
        )

    lines = [
        f'<sample id="{row["id"]}" category="{row["category"]}" variant="{name}">'
    ]
    for path, text in files:
        rel = path.relative_to(skill_dir).as_posix()
        language = LANGUAGES.get(path.suffix.lower(), "text")
        fence = _fence(text)
        lines.extend(
            (
                f'  <file path="{rel}">',
                f"{fence}{language}",
                text.rstrip(),
                fence,
                "  </file>",
            )
        )
    # Preserve registered dependency notes without loading their source bodies.
    if include_css and spec.get("omitted"):
        html = next(t for p, t in files if p.suffix.lower() == ".html")
        lines.extend(omitted_lines(f"{skill_dir.name}/{row['id']}", spec, html))
    lines.append("</sample>")
    return "\n".join(lines) + "\n"


def render_all(workflows: Path = WORKFLOWS) -> dict[Path, str]:
    rendered: dict[Path, str] = {}
    for skill_dir in sorted(workflows.glob("build-*")):
        catalog_path = skill_dir / "samples" / "catalog.json"
        if not catalog_path.is_file():
            continue
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        for row in catalog.get("samples", []):
            for variant in ("mini", "one"):
                spec = row.get(variant)
                if not isinstance(spec, dict):
                    continue
                target = (
                    skill_dir
                    / "samples"
                    / "bundles"
                    / row["category"]
                    / f"{row['id']}.{variant}.md"
                )
                rendered[target] = _variant(skill_dir, row, variant, spec)
    return rendered


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = render_all()
    stale = []
    for path, text in rendered.items():
        if args.check:
            if not path.is_file() or path.read_text(encoding="utf-8") != text:
                stale.append(path)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
    if stale:
        raise SystemExit("stale sample bundles:\n" + "\n".join(map(str, stale)))
    print(f"{'checked' if args.check else 'wrote'} {len(rendered)} sample bundles")


if __name__ == "__main__":
    main()
