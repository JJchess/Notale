#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from itertools import combinations
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
THRESHOLDS = {
    "minimumMeanStyleCentroidSimilarity": 0.90,
    "minimumPageStyleCentroidSimilarity": 0.70,
    "minimumMeanPaletteSimilarity": 0.75,
    "minimumMeanLayoutDiversity": 0.10,
    "minimumPairLayoutDiversity": 0.025,
    "minimumPlannedLayoutCount": 8,
}


def normalize(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=np.float64).ravel()
    norm = np.linalg.norm(values)
    return values / norm if norm > 0 else values


def cosine(first: np.ndarray, second: np.ndarray) -> float:
    denominator = np.linalg.norm(first) * np.linalg.norm(second)
    return float(np.dot(first, second) / denominator) if denominator > 0 else 0.0


def grid_means(values: np.ndarray, rows: int = 4, cols: int = 8) -> np.ndarray:
    height, width = values.shape
    result = []
    for row in range(rows):
        y0, y1 = round(row * height / rows), round((row + 1) * height / rows)
        for col in range(cols):
            x0, x1 = round(col * width / cols), round((col + 1) * width / cols)
            result.append(float(values[y0:y1, x0:x1].mean()))
    return normalize(np.asarray(result))


def feature_for(path: Path) -> dict[str, np.ndarray | float]:
    image = Image.open(path).convert("RGB").resize((256, 144), Image.Resampling.LANCZOS)
    rgb = np.asarray(image, dtype=np.float64) / 255.0
    hsv = np.asarray(image.convert("HSV"), dtype=np.float64) / 255.0
    all_hist, _ = np.histogramdd(
        hsv.reshape(-1, 3), bins=(12, 4, 4), range=((0, 1), (0, 1), (0, 1))
    )
    chroma_pixels = hsv[(hsv[:, :, 1] > 0.15) | (hsv[:, :, 2] < 0.82)]
    chroma_hist, _ = np.histogramdd(
        chroma_pixels if len(chroma_pixels) else hsv.reshape(-1, 3),
        bins=(12, 4, 4),
        range=((0, 1), (0, 1), (0, 1)),
    )
    palette = normalize(0.35 * normalize(all_hist) + 0.65 * normalize(chroma_hist))
    luminance = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    gradient_x = np.abs(np.diff(luminance, axis=1, prepend=luminance[:, :1]))
    gradient_y = np.abs(np.diff(luminance, axis=0, prepend=luminance[:1, :]))
    edges = np.hypot(gradient_x, gradient_y)
    luminance_hist, _ = np.histogram(luminance, bins=16, range=(0, 1))
    gradient_hist, _ = np.histogram(np.clip(edges, 0, 0.5), bins=12, range=(0, 0.5))
    style = normalize(np.concatenate([
        0.72 * palette,
        0.18 * normalize(luminance_hist),
        0.10 * normalize(gradient_hist),
    ]))
    return {
        "palette": palette,
        "style": style,
        "layout": grid_means(edges),
        "luminance": float(luminance.mean()),
        "saturation": float(hsv[:, :, 1].mean()),
        "edgeDensity": float((edges > 0.08).mean()),
    }


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit full-deck style stability and rendered layout diversity.")
    parser.add_argument("--run", required=True)
    parser.add_argument("--out", default="style-stability-audit.json")
    args = parser.parse_args()
    run = Path(args.run)
    if not run.is_absolute():
        run = ROOT / run

    visual_plan = json.loads((run / "visual-plan.json").read_text(encoding="utf-8"))
    pages = visual_plan["pages"]
    page_ids = [page["id"] for page in pages]
    features = {
        page_id: feature_for(run / "evidence" / page_id / "ref.jpg")
        for page_id in page_ids
    }
    style_centroid = normalize(np.mean([features[page]["style"] for page in page_ids], axis=0))
    style_similarities = {
        page: cosine(features[page]["style"], style_centroid)
        for page in page_ids
    }

    palette_pairs = []
    layout_pairs = []
    plan_by_id = {page["id"]: page for page in pages}
    for first, second in combinations(page_ids, 2):
        palette_similarity = cosine(features[first]["palette"], features[second]["palette"])
        layout_diversity = 1 - cosine(features[first]["layout"], features[second]["layout"])
        layout_pair = {
            "pages": [first, second],
            "diversity": round(layout_diversity, 4),
            "sameLayoutBlueprint": (
                plan_by_id[first]["layoutBlueprint"]["id"]
                == plan_by_id[second]["layoutBlueprint"]["id"]
            ),
        }
        palette_pairs.append(palette_similarity)
        layout_pairs.append(layout_pair)

    planned_layouts = sorted({page["layoutBlueprint"]["id"] for page in pages})
    page_types = sorted({page["pageType"] for page in pages})
    all_layout_diversities = [pair["diversity"] for pair in layout_pairs]
    cross_blueprint_diversities = [
        pair["diversity"] for pair in layout_pairs if not pair["sameLayoutBlueprint"]
    ]
    near_duplicates = sorted(
        [pair for pair in layout_pairs if pair["diversity"] < THRESHOLDS["minimumPairLayoutDiversity"]],
        key=lambda item: item["diversity"],
    )

    mean_style_similarity = mean(list(style_similarities.values()))
    minimum_style_similarity = min(style_similarities.values())
    mean_palette_similarity = mean(palette_pairs)
    mean_layout_diversity = mean(all_layout_diversities)
    minimum_layout_diversity = min(all_layout_diversities)
    checks = {
        "meanStyleStability": mean_style_similarity >= THRESHOLDS["minimumMeanStyleCentroidSimilarity"],
        "noSevereStyleOutlier": minimum_style_similarity >= THRESHOLDS["minimumPageStyleCentroidSimilarity"],
        "paletteConsistency": mean_palette_similarity >= THRESHOLDS["minimumMeanPaletteSimilarity"],
        "renderedLayoutDiversity": mean_layout_diversity >= THRESHOLDS["minimumMeanLayoutDiversity"],
        "noNearDuplicateLayout": not near_duplicates,
        "plannedLayoutCoverage": len(planned_layouts) >= THRESHOLDS["minimumPlannedLayoutCount"],
    }

    timings_path = run / "timings-summary.json"
    timings = json.loads(timings_path.read_text(encoding="utf-8")) if timings_path.exists() else {}
    reference_durations = sorted(item["durationMs"] for item in timings.get("referencePages", []))
    report = {
        "version": "1.0",
        "scope": "visual style stability and rendered layout diversity only; semantic text/topology accuracy is audited separately",
        "run": str(run),
        "pageCount": len(page_ids),
        "thresholds": THRESHOLDS,
        "summary": {
            "meanStyleCentroidSimilarity": round(mean_style_similarity, 4),
            "minimumPageStyleCentroidSimilarity": round(minimum_style_similarity, 4),
            "meanPairPaletteSimilarity": round(mean_palette_similarity, 4),
            "meanRenderedLayoutDiversity": round(mean_layout_diversity, 4),
            "minimumPairLayoutDiversity": round(minimum_layout_diversity, 4),
            "meanCrossBlueprintLayoutDiversity": round(mean(cross_blueprint_diversities), 4),
            "plannedLayoutCount": len(planned_layouts),
            "pageTypeCount": len(page_types),
            "nearDuplicatePairCount": len(near_duplicates),
            "checks": checks,
            "status": "pass" if all(checks.values()) else "fail",
        },
        "plannedLayouts": planned_layouts,
        "pageTypes": page_types,
        "styleOutliers": [
            {"pageId": page, "similarity": round(similarity, 4)}
            for page, similarity in sorted(style_similarities.items(), key=lambda item: item[1])[:5]
        ],
        "closestLayoutPairs": sorted(layout_pairs, key=lambda item: item["diversity"])[:10],
        "nearDuplicatePairs": near_duplicates,
        "pageSignals": {
            page: {
                "styleCentroidSimilarity": round(style_similarities[page], 4),
                "meanLuminance": round(float(features[page]["luminance"]), 4),
                "meanSaturation": round(float(features[page]["saturation"]), 4),
                "edgeDensity": round(float(features[page]["edgeDensity"]), 4),
                "pageType": plan_by_id[page]["pageType"],
                "layoutBlueprint": plan_by_id[page]["layoutBlueprint"]["id"],
            }
            for page in page_ids
        },
        "timing": {
            "pipelineDurationMs": timings.get("totalDurationMs"),
            "summedReferenceDurationMs": timings.get("summedReferenceDurationMs"),
            "referenceConcurrency": timings.get("referenceConcurrency"),
            "referencePageMeanMs": round(mean(reference_durations), 1) if reference_durations else None,
            "referencePageMinMs": min(reference_durations) if reference_durations else None,
            "referencePageMaxMs": max(reference_durations) if reference_durations else None,
            "referencePageP95Ms": int(np.percentile(reference_durations, 95)) if reference_durations else None,
        },
    }
    (run / args.out).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    if report["summary"]["status"] != "pass":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
