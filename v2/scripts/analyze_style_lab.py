from __future__ import annotations

import json
import math
from itertools import combinations
from pathlib import Path
import argparse

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description="Audit style consistency, separation and layout diversity.")
parser.add_argument("--root", default="runs/style-lab-curated")
parser.add_argument("--styles", default="handdrawn-technical,swiss-editorial,dark-data-editorial,retro-flat-learning")
parser.add_argument("--pages", default="page-003,page-017,page-020")
parser.add_argument("--out", default="quantitative-audit.json")
args = parser.parse_args()
CURATED = Path(args.root)
if not CURATED.is_absolute():
    CURATED = ROOT / CURATED
OUT_FILE = CURATED / args.out
STYLES = [value.strip() for value in args.styles.split(",") if value.strip()]
PAGES = [value.strip() for value in args.pages.split(",") if value.strip()]

THRESHOLDS = {
    "minimumWithinStylePaletteSimilarity": 0.55,
    "minimumCrossStylePaletteDistance": 0.12,
    "minimumLayoutDiversity": 0.08,
    "minimumCoherenceMargin": 0.05,
}


def normalize(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float64)
    norm = np.linalg.norm(values)
    return values / norm if norm > 0 else values


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / denom) if denom > 0 else 0.0


def grid_means(values: np.ndarray, rows: int = 4, cols: int = 8) -> np.ndarray:
    height, width = values.shape
    result = []
    for row in range(rows):
        y0, y1 = round(row * height / rows), round((row + 1) * height / rows)
        for col in range(cols):
            x0, x1 = round(col * width / cols), round((col + 1) * width / cols)
            result.append(float(values[y0:y1, x0:x1].mean()))
    return normalize(np.asarray(result))


def dominant_colors(image: Image.Image, count: int = 6) -> list[dict[str, object]]:
    quantized = image.resize((128, 72)).quantize(colors=count, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette() or []
    counts = quantized.getcolors() or []
    total = sum(item[0] for item in counts) or 1
    result = []
    for pixels, index in sorted(counts, reverse=True):
        rgb = palette[index * 3:index * 3 + 3]
        result.append({
            "hex": "#" + "".join(f"{channel:02x}" for channel in rgb),
            "share": round(pixels / total, 4),
        })
    return result


def mark_making_profile(luminance: np.ndarray) -> np.ndarray:
    """Describe whether dark marks are fine lines, medium blocks or broad masses.

    Global colour histograms make pencil diagrams and ink-wash diagrams look alike
    when both use a large paper-white field.  Eroding dark masks at several scales
    measures how much of each mark survives: thin strokes disappear immediately,
    while brush masses and solid panels remain.
    """
    values = []
    for threshold in (0.31, 0.47, 0.63, 0.78, 0.88):
        mask = (luminance < threshold).astype(np.uint8)
        base_area = max(float(mask.mean()), 1e-6)
        mask_image = Image.fromarray(mask * 255, mode="L")
        for size in (3, 5, 9, 15, 25):
            eroded = np.asarray(mask_image.filter(ImageFilter.MinFilter(size)), dtype=np.float64) / 255.0
            values.append(float(eroded.mean()) / base_area)
    return np.asarray(values, dtype=np.float64)


def feature_for(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGB").resize((256, 144), Image.Resampling.LANCZOS)
    rgb = np.asarray(image, dtype=np.float64) / 255.0
    hsv = np.asarray(image.convert("HSV"), dtype=np.float64) / 255.0

    all_hist, _ = np.histogramdd(
        hsv.reshape(-1, 3),
        bins=(12, 4, 4),
        range=((0, 1), (0, 1), (0, 1)),
    )
    chroma_pixels = hsv[(hsv[:, :, 1] > 0.15) | (hsv[:, :, 2] < 0.82)]
    chroma_hist, _ = np.histogramdd(
        chroma_pixels if len(chroma_pixels) else hsv.reshape(-1, 3),
        bins=(12, 4, 4),
        range=((0, 1), (0, 1), (0, 1)),
    )
    palette_feature = normalize(0.35 * normalize(all_hist.ravel()) + 0.65 * normalize(chroma_hist.ravel()))

    luminance = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    gradient_x = np.abs(np.diff(luminance, axis=1, prepend=luminance[:, :1]))
    gradient_y = np.abs(np.diff(luminance, axis=0, prepend=luminance[:1, :]))
    edge_strength = np.hypot(gradient_x, gradient_y)
    layout_feature = grid_means(edge_strength)
    luminance_hist, _ = np.histogram(luminance, bins=16, range=(0, 1))
    gradient_hist, _ = np.histogram(np.clip(edge_strength, 0, 0.5), bins=12, range=(0, 0.5))
    style_feature = normalize(np.concatenate([
        0.72 * palette_feature,
        0.18 * normalize(luminance_hist),
        0.10 * normalize(gradient_hist),
    ]))

    return {
        "palette": palette_feature,
        "style": style_feature,
        "layout": layout_feature,
        "markMaking": mark_making_profile(luminance),
        "meanLuminance": float(luminance.mean()),
        "meanSaturation": float(hsv[:, :, 1].mean()),
        "edgeDensity": float((edge_strength > 0.08).mean()),
        "dominantColors": dominant_colors(image),
    }


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


features: dict[str, dict[str, dict[str, object]]] = {}
for style in STYLES:
    features[style] = {}
    for page in PAGES:
        features[style][page] = feature_for(CURATED / style / f"{page}.jpg")

style_results: dict[str, object] = {}
within_palette_values = []
layout_diversity_values = []
centroids: dict[str, np.ndarray] = {}
mark_making_centroids: dict[str, np.ndarray] = {}

for style in STYLES:
    page_pairs = list(combinations(PAGES, 2))
    palette_pairs = []
    layout_pairs = []
    for first, second in page_pairs:
        palette_similarity = cosine(features[style][first]["palette"], features[style][second]["palette"])
        layout_similarity = cosine(features[style][first]["layout"], features[style][second]["layout"])
        palette_pairs.append({"pages": [first, second], "similarity": round(palette_similarity, 4)})
        layout_pairs.append({"pages": [first, second], "diversity": round(1 - layout_similarity, 4)})

    palette_mean = mean([pair["similarity"] for pair in palette_pairs])
    layout_mean = mean([pair["diversity"] for pair in layout_pairs])
    within_palette_values.append(palette_mean)
    layout_diversity_values.append(layout_mean)
    centroids[style] = normalize(np.mean([features[style][page]["style"] for page in PAGES], axis=0))
    mark_making_centroids[style] = np.mean([features[style][page]["markMaking"] for page in PAGES], axis=0)

    style_results[style] = {
        "withinStylePaletteSimilarity": round(palette_mean, 4),
        "layoutDiversity": round(layout_mean, 4),
        "palettePairs": palette_pairs,
        "layoutPairs": layout_pairs,
        "pageSignals": {
            page: {
                "meanLuminance": round(features[style][page]["meanLuminance"], 4),
                "meanSaturation": round(features[style][page]["meanSaturation"], 4),
                "edgeDensity": round(features[style][page]["edgeDensity"], 4),
                "dominantColors": features[style][page]["dominantColors"],
            }
            for page in PAGES
        },
    }

cross_style_pairs = []
for first, second in combinations(STYLES, 2):
    color_texture_distance = 1 - cosine(centroids[first], centroids[second])
    mark_making_distance = float(np.max(np.abs(mark_making_centroids[first] - mark_making_centroids[second])))
    # A style can be distinctive through palette/tonality or through mark scale.
    # Probabilistic union keeps the combined score bounded without hiding either signal.
    distance = 1 - (1 - color_texture_distance) * (1 - mark_making_distance)
    cross_style_pairs.append({
        "styles": [first, second],
        "distance": round(distance, 4),
        "colorTextureDistance": round(color_texture_distance, 4),
        "markMakingDistance": round(mark_making_distance, 4),
    })

within_mean = mean(within_palette_values)
cross_distance_mean = mean([pair["distance"] for pair in cross_style_pairs])
cross_similarity_mean = 1 - cross_distance_mean
coherence_margin = within_mean - cross_similarity_mean

checks = {
    "withinStylePaletteConsistency": min(within_palette_values) >= THRESHOLDS["minimumWithinStylePaletteSimilarity"],
    "crossStylePaletteSeparation": min(pair["distance"] for pair in cross_style_pairs) >= THRESHOLDS["minimumCrossStylePaletteDistance"],
    "withinStyleLayoutDiversity": min(layout_diversity_values) >= THRESHOLDS["minimumLayoutDiversity"],
    "coherenceExceedsCrossStyleSimilarity": coherence_margin >= THRESHOLDS["minimumCoherenceMargin"],
}

report = {
    "version": "1.0",
    "method": {
        "palette": "HSV histogram with low-saturation background down-weighted; cosine similarity",
        "crossStyle": "bounded union of (a) HSV/luminance/gradient cosine distance and (b) multi-scale dark-mark erosion distance",
        "markMaking": "five luminance thresholds by five erosion sizes; maximum centroid difference distinguishes fine lines from broad ink or solid masses",
        "layout": "4x8 spatial grid of luminance edge energy; one minus cosine similarity",
        "interpretation": "palette similarity should be high within a style; layout diversity and cross-style palette distance should be high",
    },
    "thresholds": THRESHOLDS,
    "summary": {
        "meanWithinStylePaletteSimilarity": round(within_mean, 4),
        "meanCrossStylePaletteDistance": round(cross_distance_mean, 4),
        "meanLayoutDiversity": round(mean(layout_diversity_values), 4),
        "coherenceMargin": round(coherence_margin, 4),
        "checks": checks,
        "status": "pass" if all(checks.values()) else "fail",
    },
    "styles": style_results,
    "crossStylePairs": cross_style_pairs,
}

OUT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
if report["summary"]["status"] != "pass":
    raise SystemExit(1)
