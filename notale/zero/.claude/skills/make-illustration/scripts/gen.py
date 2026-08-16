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
import urllib.request
from pathlib import Path

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


def generate(prompt: str, size: str, n: int) -> list[bytes]:
    body = json.dumps({"model": MODEL, "prompt": prompt, "size": size, "n": n}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, headers={
        "Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"})
    r = json.loads(urllib.request.urlopen(req, timeout=300).read())
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
