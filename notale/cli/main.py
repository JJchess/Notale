"""Notale command-line interface."""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from dotenv import load_dotenv

from notale.core.workflow import generate
from notale.utils.config import get_config
from notale.web.preview import serve


PROJECT_ROOT = Path(__file__).resolve().parents[1]
_CONFIG = get_config()


def load_cli_env(root: Path = PROJECT_ROOT) -> None:
    load_dotenv(root / ".env.local", override=False)
    load_dotenv(root / ".env", override=False)


def main() -> None:
    load_cli_env()
    parser = argparse.ArgumentParser(prog="notale")
    commands = parser.add_subparsers(dest="cmd", required=True)

    generate_parser = commands.add_parser("generate", help="生成互动讲义")
    generate_parser.add_argument("--topic", required=True, help="讲义请求")
    generate_parser.add_argument("--resume", default=None, help="当前格式的 run 目录")
    generate_parser.add_argument(
        "--out",
        default=str(PROJECT_ROOT / "runs"),
        help="run 输出根目录",
    )

    preview_parser = commands.add_parser("serve", help="预览最新讲义")
    preview_parser.add_argument("--host", default=_CONFIG.preview.host)
    preview_parser.add_argument("--port", default=_CONFIG.preview.port, type=int)
    args = parser.parse_args()

    if args.cmd == "serve":
        serve(args.host, args.port, root=PROJECT_ROOT)
        return

    result = asyncio.run(
        generate(
            None,
            args.topic,
            out_root=Path(args.out),
            resume_dir=Path(args.resume) if args.resume else None,
        )
    )
    print(f"\n✔ run: {result.run_dir}")
    print(f"✔ deck: {result.deck_path}")
    print(f"  completed {len(result.completed)} / degraded {len(result.degraded)}")
    print(f"  usage: {result.usage}")


if __name__ == "__main__":
    main()
