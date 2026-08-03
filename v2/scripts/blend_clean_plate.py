#!/usr/bin/env python3
"""Keep untouched source pixels and blend a clean plate only inside a layer mask."""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--clean", required=True)
    parser.add_argument("--mask", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--feather", type=float, default=5.0)
    args = parser.parse_args()

    source = cv2.imread(args.source, cv2.IMREAD_COLOR)
    clean = cv2.imread(args.clean, cv2.IMREAD_COLOR)
    mask = cv2.imread(args.mask, cv2.IMREAD_GRAYSCALE)
    if source is None or clean is None or mask is None:
        raise SystemExit("cannot read source, clean plate, or mask")
    if source.shape != clean.shape or source.shape[:2] != mask.shape:
        raise SystemExit(f"shape mismatch: source={source.shape}, clean={clean.shape}, mask={mask.shape}")

    if args.feather > 0:
        sigma = float(args.feather)
        mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=sigma, sigmaY=sigma)
    alpha = (mask.astype(np.float32) / 255.0)[..., None]
    blended = np.clip(source.astype(np.float32) * (1 - alpha) + clean.astype(np.float32) * alpha, 0, 255).astype(np.uint8)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.suffix.lower() == ".png":
        cv2.imwrite(str(out), blended, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    else:
        cv2.imwrite(str(out), blended, [cv2.IMWRITE_JPEG_QUALITY, 97])
    print(out)


if __name__ == "__main__":
    main()
