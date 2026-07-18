"""CLI 入口（L5 薄壳）：`lecture-agent generate --topic "梯度下降"`。

用 Hydra compose 装配配置后直接设 topic（避免中文/空格走 override 字符串解析）。
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from hydra import compose, initialize_config_dir

from .container import run_generation

_CONFIGS = Path(__file__).resolve().parents[2] / "configs"


def main() -> int:
    ap = argparse.ArgumentParser(prog="lecture-agent")
    ap.add_argument("command", nargs="?", default="generate", choices=["generate"])
    ap.add_argument("--topic", help="课题")
    ap.add_argument("--pages", type=int, default=8)
    ap.add_argument("--llm", default="replay", help="configs/llm 里的名字：replay | deepseek_v3")
    ap.add_argument("--generator", default="full", help="configs/generator：full | single_pass")
    args = ap.parse_args()

    if not args.topic:
        print(
            '用法: lecture-agent generate --topic "梯度下降" [--llm deepseek_v3]', file=sys.stderr
        )
        return 2

    with initialize_config_dir(version_base=None, config_dir=str(_CONFIGS)):
        cfg = compose(
            config_name="config", overrides=[f"llm={args.llm}", f"generator={args.generator}"]
        )
    cfg.topic = args.topic
    cfg.pages = args.pages

    result = asyncio.run(run_generation(cfg))
    n_scenes = len(result.doc.get("scenes", []))
    print(
        f"✓ 生成完成：{n_scenes} 页 / 丢弃 {len(result.dropped)} 块 / 校验错误 {len(result.errors)}",
        file=sys.stderr,
    )
    return 0 if not result.errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
