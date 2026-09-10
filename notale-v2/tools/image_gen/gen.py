#!/usr/bin/env python3
"""生成一张插图并存到本地。零第三方依赖,只用标准库。

    python3 gen.py "prompt" --out pages/assets/img/xxx.png [--size 2048x1152] [--n 1]

密钥查找顺序:环境变量 PARATERA_API_KEY → /data1/home/zhuyifan/ws2/Notale/notale/.env.local
返回的图会连同 prompt 一起写进同目录的 illustrations.json,便于事后追溯是哪句话生成的。
"""

import argparse
import base64
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

# 接口的硬下限,实测出来的:小于这个像素数直接 400
# ("image size must be at least 921600 pixels")。921600 = 1280×720。
MIN_PIXELS = 921_600

ENDPOINT = "https://llmapi.paratera.com/v1/images/generations"
MODEL = "Doubao-Seedream-4.0"
ENV_FILE = Path("/data1/home/zhuyifan/ws2/Notale/notale/.env.local")


def api_key() -> str:
    k = os.environ.get("PARATERA_API_KEY")
    if k:
        return k
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8", errors="replace").splitlines():
            m = re.match(r"\s*PARATERA_API_KEY\s*=\s*(.+?)\s*$", line)
            if m:
                return m.group(1).strip().strip("'\"")
    raise SystemExit("找不到 PARATERA_API_KEY(环境变量和 .env.local 都没有)")


def check_size(size: str) -> None:
    """先在本地把尺寸拦下来。

    接口要求 ≥921,600 像素,低于就 400。而 400 的正文埋在 HTTPError 里 ——
    不捕获的话调用方只看到一串 traceback,试一次就会放弃配图。
    实测 1024×576(589,824 像素)会被拒,2048×1152 正常。
    """
    m = re.fullmatch(r"(\d+)x(\d+)", size.strip())
    if not m:
        raise SystemExit(f"--size 要写成 宽x高,比如 2048x1152(你给的是 {size!r})")
    w, h = int(m.group(1)), int(m.group(2))
    if w * h < MIN_PIXELS:
        raise SystemExit(
            f"--size {size} 只有 {w*h:,} 像素,接口要求至少 {MIN_PIXELS:,}(=1280×720)。\n"
            f"    16:9 的话用 2048x1152(默认)或 1280x720;要更小就别用这个接口。")


def generate(prompt: str, size: str, n: int) -> list[bytes]:
    check_size(size)
    body = json.dumps({"model": MODEL, "prompt": prompt, "size": size, "n": n}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, headers={
        "Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"})
    try:
        r = json.loads(urllib.request.urlopen(req, timeout=300).read())
    except urllib.error.HTTPError as e:
        # 把接口自己的报错原文交出来。裸 traceback 对调用方没有任何可操作信息。
        detail = e.read().decode("utf-8", "replace")[:400]
        raise SystemExit(f"接口返回 HTTP {e.code}:\n    {detail}")
    except urllib.error.URLError as e:
        raise SystemExit(f"连不上接口({e.reason})。这台机器要能出网才能生成插图。")
    out = []
    for d in r.get("data") or []:
        if d.get("b64_json"):
            out.append(base64.b64decode(d["b64_json"]))
        elif d.get("url"):
            out.append(urllib.request.urlopen(d["url"], timeout=180).read())
    if not out:
        raise SystemExit(f"没有返回图片: {json.dumps(r)[:300]}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prompt")
    ap.add_argument("--out", required=True, help="输出文件路径,多张时自动加 -1 -2 后缀")
    ap.add_argument("--size", default="2048x1152", help="默认 16:9,贴合 1600x900 画布")
    ap.add_argument("--n", type=int, default=1)
    a = ap.parse_args()

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    t = time.time()
    imgs = generate(a.prompt, a.size, a.n)

    paths = []
    for i, data in enumerate(imgs):
        p = out if len(imgs) == 1 else out.with_stem(f"{out.stem}-{i+1}")
        p.write_bytes(data)
        paths.append(p)
        print(f"  {p}  {len(data):,} bytes")

    log = out.parent / "illustrations.json"
    rows = json.loads(log.read_text(encoding="utf-8")) if log.exists() else []
    for p in paths:
        rows.append({"file": p.name, "prompt": a.prompt, "model": MODEL, "size": a.size})
    log.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  {time.time()-t:.1f}s  已记录到 {log}")


if __name__ == "__main__":
    main()
