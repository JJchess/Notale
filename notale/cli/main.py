"""Notale CLI —— 生成与预览 HTML-native 互动讲义。

用法：
    python -m notale generate --topic "60 分钟《数据结构》讲义，大二，要代码演示和课堂练习"
    python -m notale serve --port 3002
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from dotenv import load_dotenv

from notale.core.models import Globals, Outline, PageSpec
from notale.utils.llm import HttpxClient
from notale.core.workflow import generate
from notale.tools.retriever import FetchTool
from notale.web.preview import serve


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def load_cli_env(root: Path = PROJECT_ROOT) -> None:
    """加载 CLI 本地配置；外部环境 > .env.local > .env。"""
    load_dotenv(root / ".env.local", override=False)
    load_dotenv(root / ".env", override=False)


async def _cli_confirm(outline: Outline, globals_: Globals, specs: list[PageSpec]) -> tuple[bool, str]:
    """人在环确认契约——走错方向返工成本最高的点。"""
    print("\n=== 课程契约（待确认）===")
    for i, ch in enumerate(outline.chapters, 1):
        print(f"  第{i}章 {ch.title}  页 {ch.pageRange[0]}–{ch.pageRange[1]}  依据: {ch.rationale}")
    print(f"  共 {len(specs)} 页；术语 {len(globals_.terminology)} 条；符号 {len(globals_.notation)} 条")
    for s in specs:
        print(f"    {s.pageId} [{s.pageType.value}] {s.centralMessage[:50]} ({s.timeBudgetSec}s)")
    ans = input("\n确认？[Y/n/修改意见] ").strip()
    if ans in ("", "y", "Y"):
        return True, ""
    if ans.lower() == "n":
        return False, "用户拒绝"
    # 修改意见不是批准；当前轮必须停在契约门，避免记录了意见却按旧契约继续生成。
    return False, ans


def main() -> None:
    load_cli_env()
    parser = argparse.ArgumentParser(prog="notale")
    sub = parser.add_subparsers(dest="cmd", required=True)
    gen = sub.add_parser("generate", help="生成互动讲义")
    gen.add_argument("--topic", required=True, help="讲义请求（自然语言）")
    gen.add_argument("--material", default=None, help="上传材料文件路径（可选）")
    gen.add_argument("--yes", action="store_true", help="跳过契约人工确认")
    gen.add_argument("--resume", default=None, help="从既有 run 目录断点续跑")
    gen.add_argument(
        "--out",
        default=str(PROJECT_ROOT / "runs"),
        help="run 输出根目录（默认 notale/runs/）",
    )
    preview = sub.add_parser("serve", help="预览最新生成的讲义")
    preview.add_argument("--host", default="0.0.0.0")
    preview.add_argument("--port", default=3002, type=int)
    args = parser.parse_args()

    if args.cmd == "serve":
        serve(args.host, args.port, root=PROJECT_ROOT)
        return

    material = Path(args.material).read_text(encoding="utf-8") if args.material else None

    from notale.core.stages.contract import auto_confirm

    confirm = auto_confirm if args.yes else _cli_confirm
    llm = HttpxClient()
    retriever = FetchTool()

    result = asyncio.run(
        generate(
            llm,
            retriever,
            args.topic,
            out_root=Path(args.out),
            uploaded_material=material,
            confirm=confirm,
            resume_dir=Path(args.resume) if args.resume else None,
        )
    )
    print(f"\n✔ run 目录: {result.run_dir}")
    print(f"✔ deck: {result.deck_path}")
    print(f"  verified {len(result.verified)} 页 / degraded {len(result.degraded)} 页")
    print(f"  token 用量: {llm.usage}")


if __name__ == "__main__":
    main()
