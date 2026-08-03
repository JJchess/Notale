import io
import sys

import cv2
import numpy as np
from PIL import Image


def main():
    source = sys.stdin.buffer.read()
    data = np.frombuffer(source, dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError("cannot decode generated image")
    role = sys.argv[1] if len(sys.argv) > 1 else "cutout"
    key_hex = sys.argv[2] if len(sys.argv) > 2 else "#00ff00"
    key_hex = key_hex.lstrip("#")
    if len(key_hex) != 6:
        raise RuntimeError("invalid chroma key color")
    key_rgb = np.array([int(key_hex[0:2], 16), int(key_hex[2:4], 16), int(key_hex[4:6], 16)], dtype=np.float32)
    key_bgr = key_rgb[::-1]
    pixels = image.astype(np.float32)
    distance = np.linalg.norm(pixels - key_bgr, axis=2)
    # Compression and antialiasing move edge pixels away from the exact key.
    # The two-threshold matte removes the key field while retaining subject detail.
    key = np.clip((105.0 - distance) / 82.0, 0.0, 1.0)
    alpha = ((1.0 - key) * 255.0).astype(np.uint8)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 1.2)
    rgba = cv2.cvtColor(image.astype(np.uint8), cv2.COLOR_BGR2RGBA)
    rgba[:, :, 3] = alpha
    spill = key[:, :, None].astype(np.float32)
    rgb = rgba[:, :, :3].astype(np.float32)
    neutral = np.mean(rgb, axis=2, keepdims=True)
    rgba[:, :, :3] = np.clip(rgb * (1.0 - 0.35 * spill) + neutral * (0.35 * spill), 0, 255).astype(np.uint8)
    opaque = alpha > 40
    residual_key = opaque & (distance < 65.0)
    if residual_key.sum() / max(1, opaque.sum()) > 0.003:
        raise RuntimeError("chroma QA failed: opaque key-color residue remains")
    output = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(output, format="PNG", optimize=True)
    sys.stdout.buffer.write(output.getvalue())


if __name__ == "__main__":
    main()
