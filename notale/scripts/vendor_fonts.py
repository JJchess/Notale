#!/usr/bin/env python3
"""Vendor Notale's pinned offline font catalog as deterministic WOFF2 assets."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import shutil
import tempfile
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
FONT_ROOT = ROOT / "web" / "fonts"
CATALOG_PATH = FONT_ROOT / "catalog.json"
GOOGLE_COMMIT = "038b637da7b3fd956a4ed93ffc607c3d5e4ce172"


@dataclass(frozen=True)
class FontFile:
    output: str
    source_url: str
    weight: str
    member: str | None = None


@dataclass(frozen=True)
class FontFamily:
    id: str
    name: str
    category: str
    scripts: tuple[str, ...]
    roles: tuple[str, ...]
    personality: str
    repository: str
    revision: str
    license_url: str
    files: tuple[FontFile, ...]

    @property
    def css_family(self) -> str:
        return "Notale " + self.name


def _google_file(family: str, filename: str) -> str:
    encoded = urllib.parse.quote(filename, safe="")
    return (
        "https://raw.githubusercontent.com/google/fonts/"
        f"{GOOGLE_COMMIT}/ofl/{family}/{encoded}"
    )


def _google_license(family: str) -> str:
    return (
        "https://raw.githubusercontent.com/google/fonts/"
        f"{GOOGLE_COMMIT}/ofl/{family}/OFL.txt"
    )


def _google(
    id: str,
    name: str,
    directory: str,
    filename: str,
    *,
    category: str,
    scripts: tuple[str, ...],
    roles: tuple[str, ...],
    personality: str,
    weight: str = "400",
    extra_files: tuple[tuple[str, str, str], ...] = (),
) -> FontFamily:
    files = [
        FontFile(
            output=f"{id}-{'vf' if ' ' in weight else weight}.woff2",
            source_url=_google_file(directory, filename),
            weight=weight,
        )
    ]
    files.extend(
        FontFile(output=output, source_url=_google_file(directory, source), weight=file_weight)
        for output, source, file_weight in extra_files
    )
    return FontFamily(
        id=id,
        name=name,
        category=category,
        scripts=scripts,
        roles=roles,
        personality=personality,
        repository="https://github.com/google/fonts",
        revision=GOOGLE_COMMIT,
        license_url=_google_license(directory),
        files=tuple(files),
    )


FAMILIES: tuple[FontFamily, ...] = (
    _google(
        "noto-sans-sc", "Noto Sans SC", "notosanssc", "NotoSansSC[wght].ttf",
        category="sans-serif", scripts=("latin", "zh-Hans"), roles=("display", "body"),
        personality="neutral, highly legible Chinese grotesk", weight="100 900",
    ),
    _google(
        "noto-serif-sc", "Noto Serif SC", "notoserifsc", "NotoSerifSC[wght].ttf",
        category="serif", scripts=("latin", "zh-Hans"), roles=("display", "body"),
        personality="bookish Chinese serif with editorial authority", weight="200 900",
    ),
    FontFamily(
        id="lxgw-wenkai", name="LXGW WenKai", category="serif",
        scripts=("latin", "zh-Hans"), roles=("display", "body"),
        personality="warm handwritten Kai voice for humane explanation",
        repository="https://github.com/lxgw/LxgwWenKai-Lite", revision="v1.522",
        license_url="https://raw.githubusercontent.com/lxgw/LxgwWenKai-Lite/v1.522/OFL.txt",
        files=(
            FontFile(
                output="lxgw-wenkai-400.woff2", weight="400",
                source_url="https://github.com/lxgw/LxgwWenKai-Lite/releases/download/v1.522/LXGWWenKaiLite-Regular.ttf",
            ),
            FontFile(
                output="lxgw-wenkai-500.woff2", weight="500",
                source_url="https://github.com/lxgw/LxgwWenKai-Lite/releases/download/v1.522/LXGWWenKaiLite-Medium.ttf",
            ),
        ),
    ),
    FontFamily(
        id="zhuque-fangsong", name="Zhuque Fangsong", category="serif",
        scripts=("latin", "zh-Hans"), roles=("display", "body"),
        personality="formal Fangsong with documentary and archival texture",
        repository="https://github.com/TrionesType/zhuque", revision="v0.212",
        license_url="https://raw.githubusercontent.com/TrionesType/zhuque/v0.212/LICENSE.txt",
        files=(FontFile(
            output="zhuque-fangsong-400.woff2", weight="400",
            source_url="https://github.com/TrionesType/zhuque/releases/download/v0.212/ZhuqueFangsong-v0.212.zip",
            member="ZhuqueFangsong-Regular.ttf",
        ),),
    ),
    FontFamily(
        id="smiley-sans", name="Smiley Sans", category="sans-serif",
        scripts=("latin", "zh-Hans"), roles=("display",),
        personality="narrow oblique poster lettering with lively geometry",
        repository="https://github.com/atelier-anchor/smiley-sans", revision="v2.0.1",
        license_url="https://raw.githubusercontent.com/atelier-anchor/smiley-sans/v2.0.1/LICENSE",
        files=(FontFile(
            output="smiley-sans-400.woff2", weight="400",
            source_url="https://github.com/atelier-anchor/smiley-sans/releases/download/v2.0.1/smiley-sans-v2.0.1.zip",
            member="SmileySans-Oblique.ttf.woff2",
        ),),
    ),
    _google(
        "zcool-qingke-huangyou", "ZCOOL QingKe HuangYou", "zcoolqingkehuangyou",
        "ZCOOLQingKeHuangYou-Regular.ttf", category="sans-serif",
        scripts=("latin", "zh-Hans"), roles=("display",),
        personality="compressed geometric Chinese display face",
    ),
    _google(
        "zcool-xiaowei", "ZCOOL XiaoWei", "zcoolxiaowei", "ZCOOLXiaoWei-Regular.ttf",
        category="serif", scripts=("latin", "zh-Hans"), roles=("display",),
        personality="delicate literary Chinese display serif",
    ),
    _google(
        "zcool-kuaile", "ZCOOL KuaiLe", "zcoolkuaile", "ZCOOLKuaiLe-Regular.ttf",
        category="sans-serif", scripts=("latin", "zh-Hans"), roles=("display",),
        personality="rounded playful Chinese lettering",
    ),
    _google(
        "ma-shan-zheng", "Ma Shan Zheng", "mashanzheng", "MaShanZheng-Regular.ttf",
        category="cursive", scripts=("latin", "zh-Hans"), roles=("display",),
        personality="confident brush handwriting for short statements",
    ),
    _google(
        "long-cang", "Long Cang", "longcang", "LongCang-Regular.ttf",
        category="cursive", scripts=("latin", "zh-Hans"), roles=("display",),
        personality="raw historical brush texture for sparse headlines",
    ),
    _google(
        "liu-jian-mao-cao", "Liu Jian Mao Cao", "liujianmaocao",
        "LiuJianMaoCao-Regular.ttf", category="cursive", scripts=("latin", "zh-Hans"),
        roles=("display",), personality="swift cursive brush with strong motion",
    ),
    _google(
        "zhi-mang-xing", "Zhi Mang Xing", "zhimangxing", "ZhiMangXing-Regular.ttf",
        category="cursive", scripts=("latin", "zh-Hans"), roles=("display",),
        personality="casual handwritten Chinese marks and annotations",
    ),
    _google(
        "inter", "Inter", "inter", "Inter[opsz,wght].ttf", category="sans-serif",
        scripts=("latin",), roles=("display", "body"),
        personality="neutral screen sans with strong information hierarchy", weight="100 900",
    ),
    _google(
        "source-serif-4", "Source Serif 4", "sourceserif4", "SourceSerif4[opsz,wght].ttf",
        category="serif", scripts=("latin",), roles=("display", "body"),
        personality="scholarly editorial serif for sustained reading", weight="200 900",
    ),
    _google(
        "space-grotesk", "Space Grotesk", "spacegrotesk", "SpaceGrotesk[wght].ttf",
        category="sans-serif", scripts=("latin",), roles=("display", "body"),
        personality="technical geometric sans with distinctive proportions", weight="300 700",
    ),
    _google(
        "barlow-condensed", "Barlow Condensed", "barlowcondensed",
        "BarlowCondensed-Regular.ttf", category="sans-serif", scripts=("latin",),
        roles=("display",), personality="condensed industrial headline face",
        extra_files=(("barlow-condensed-700.woff2", "BarlowCondensed-Bold.ttf", "700"),),
    ),
    _google(
        "fraunces", "Fraunces", "fraunces", "Fraunces[SOFT,WONK,opsz,wght].ttf",
        category="serif", scripts=("latin",), roles=("display",),
        personality="expressive soft display serif with optical contrast", weight="100 900",
    ),
    _google(
        "unbounded", "Unbounded", "unbounded", "Unbounded[wght].ttf",
        category="sans-serif", scripts=("latin",), roles=("display",),
        personality="wide futuristic display voice", weight="200 900",
    ),
    _google(
        "jetbrains-mono", "JetBrains Mono", "jetbrainsmono", "JetBrainsMono[wght].ttf",
        category="monospace", scripts=("latin",), roles=("mono",),
        personality="compact technical mono optimized for code", weight="100 800",
    ),
    _google(
        "ibm-plex-mono", "IBM Plex Mono", "ibmplexmono", "IBMPlexMono-Regular.ttf",
        category="monospace", scripts=("latin",), roles=("mono",),
        personality="editorial industrial mono for data and code",
        extra_files=(("ibm-plex-mono-700.woff2", "IBMPlexMono-Bold.ttf", "700"),),
    ),
)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _download(url: str, cache: dict[str, bytes]) -> bytes:
    if url not in cache:
        request = urllib.request.Request(url, headers={"User-Agent": "Notale-font-vendor/1"})
        with urllib.request.urlopen(request, timeout=180) as response:
            cache[url] = response.read()
    return cache[url]


def _extract(source: bytes, member: str | None) -> bytes:
    if member is None:
        return source
    with zipfile.ZipFile(io.BytesIO(source)) as archive:
        return archive.read(member)


def _to_woff2(data: bytes, source_name: str, destination: Path) -> None:
    if source_name.lower().endswith(".woff2"):
        destination.write_bytes(data)
        return
    suffix = Path(source_name).suffix or ".ttf"
    with tempfile.NamedTemporaryFile(suffix=suffix) as source:
        source.write(data)
        source.flush()
        font = TTFont(source.name, recalcTimestamp=False)
        font.flavor = "woff2"
        font.save(destination, reorderTables=False)


def _load_lock() -> dict[str, object] | None:
    if not CATALOG_PATH.is_file():
        return None
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def _expected_files(lock: dict[str, object] | None) -> dict[str, dict[str, object]]:
    if lock is None:
        return {}
    expected: dict[str, dict[str, object]] = {}
    for family in lock.get("families", []):
        for item in family.get("files", []):
            expected[str(item["path"])] = item
    return expected


def vendor(*, refresh_lock: bool) -> None:
    if len(FAMILIES) != 20 or len({item.id for item in FAMILIES}) != 20:
        raise RuntimeError("font specification must contain exactly 20 unique families")
    lock = _load_lock()
    if lock is None and not refresh_lock:
        raise RuntimeError("catalog.json is missing; run once with --refresh-lock")
    expected = _expected_files(lock)
    cache: dict[str, bytes] = {}
    with tempfile.TemporaryDirectory(prefix="notale-font-vendor-") as temporary:
        build_root = Path(temporary)
        files_dir = build_root / "files"
        licenses_dir = build_root / "licenses"
        files_dir.mkdir()
        licenses_dir.mkdir()
        built: list[dict[str, object]] = []

        for family in FAMILIES:
            license_data = _download(family.license_url, cache)
            (licenses_dir / f"{family.id}-OFL.txt").write_bytes(license_data)
            rendered_files: list[dict[str, object]] = []
            for item in family.files:
                source = _download(item.source_url, cache)
                extracted = _extract(source, item.member)
                destination = files_dir / item.output
                _to_woff2(extracted, item.member or item.source_url, destination)
                output = destination.read_bytes()
                path = f"files/{item.output}"
                record = {
                    "path": path,
                    "weight": item.weight,
                    "style": "normal",
                    "source_url": item.source_url,
                    "source_member": item.member,
                    "source_sha256": _sha256(source),
                    "sha256": _sha256(output),
                    "bytes": len(output),
                }
                if not refresh_lock:
                    prior = expected.get(path)
                    if prior is None:
                        raise RuntimeError(f"font is absent from catalog lock: {path}")
                    for key in ("source_sha256", "sha256", "bytes"):
                        if record[key] != prior.get(key):
                            raise RuntimeError(
                                f"font lock mismatch for {path} {key}: "
                                f"expected {prior.get(key)!r}, got {record[key]!r}"
                            )
                rendered_files.append(record)
            built.append({
                "id": family.id,
                "name": family.name,
                "css_family": family.css_family,
                "category": family.category,
                "scripts": list(family.scripts),
                "roles": list(family.roles),
                "personality": family.personality,
                "license": "OFL-1.1",
                "license_file": f"licenses/{family.id}-OFL.txt",
                "license_sha256": _sha256(license_data),
                "source": {"repository": family.repository, "revision": family.revision},
                "files": rendered_files,
            })

        catalog = {"version": 1, "fallback": "noto-sans-sc", "families": built}
        rendered = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
        if not refresh_lock:
            if rendered != CATALOG_PATH.read_text(encoding="utf-8"):
                raise RuntimeError("catalog metadata differs from the checked-in lock")
            return
        FONT_ROOT.mkdir(parents=True, exist_ok=True)
        for name in ("files", "licenses"):
            target = FONT_ROOT / name
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(build_root / name, target)
        CATALOG_PATH.write_text(rendered, encoding="utf-8")


def verify() -> None:
    lock = _load_lock()
    if lock is None:
        raise RuntimeError("catalog.json is missing")
    families = lock.get("families", [])
    if len(families) != 20:
        raise RuntimeError(f"catalog must contain exactly 20 families, got {len(families)}")
    for family in families:
        license_path = FONT_ROOT / family["license_file"]
        if _sha256(license_path.read_bytes()) != family["license_sha256"]:
            raise RuntimeError(f"license hash mismatch: {license_path}")
        for item in family["files"]:
            path = FONT_ROOT / item["path"]
            data = path.read_bytes()
            if len(data) != item["bytes"] or _sha256(data) != item["sha256"]:
                raise RuntimeError(f"font hash mismatch: {path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh-lock", action="store_true")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        verify()
    else:
        vendor(refresh_lock=args.refresh_lock)


if __name__ == "__main__":
    main()
