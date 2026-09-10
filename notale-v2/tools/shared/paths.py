from __future__ import annotations
from pathlib import Path
import re


_PAGE_FILE = re.compile(r"page-\d+\.html")


_ABS_PATH = re.compile(r"(?:^|[\s'\"=(:])(/[\w./-]+)")


_CONTENT_KEYS = frozenset({"content", "old_string", "new_string", "edits"})


def _is_workflow_resource(path: Path, resource_root: Path | None) -> bool:
    """References and generated sample bundles are deliberate full-file reads."""
    if resource_root is None:
        return False
    try:
        rel = path.resolve().relative_to(resource_root.resolve())
    except (OSError, ValueError):
        return False
    return (
        path.suffix.lower() == ".md"
        and (
            (len(rel.parts) == 2 and rel.parts[0] == "references")
            or (len(rel.parts) >= 3 and rel.parts[:2] == ("samples", "bundles"))
        )
    )


def _out_of_bounds(
    name: str,
    args: dict,
    cwd: Path,
    pid: str,
    resource_root: Path | None = None,
) -> str | None:
    """→ 越界的那个东西(用于拒绝语),没越界就 None。"""
    root = cwd.resolve()
    for k, v in args.items():
        if k in _CONTENT_KEYS:
            continue
        s = str(v)
        if k == "command":
            # Bash 只能扫命令串 —— 逃出 run 目录的绝对路径就拒。
            outside = [p for p in _ABS_PATH.findall(s)
                       if not Path(p).resolve().is_relative_to(root)]
        else:
            # 路径型参数能解析,就精确判。**只比基名挡不住「别的 run 里的同名页」。**
            target = (Path(s) if Path(s).is_absolute() else cwd / s).resolve()
            image_root = root / "assets/img"
            if name in {"Write", "Edit", "Patch"} and target.is_relative_to(image_root):
                relative = target.relative_to(image_root)
                if not relative.parts or not relative.parts[0].startswith(pid + "-"):
                    return f"{s}(共享或其他页面的素材只读)"
            # Check 的截图存在 run/.shots/(见 _selfcheck),报告会列出没内联的
            # 那些路径让模型自己 Read。实测模型照做被这里拒了,然后凭前两张收尾。
            allowed_resource = name == "Read" and (
                _is_workflow_resource(target, resource_root)
                or target.is_relative_to(root.parent / ".shots")
            )
            outside = [] if target.is_relative_to(root) or allowed_resource else [s]
        if outside:
            return f"{outside[0]}(在本页的 run 目录之外)"
        for m in _PAGE_FILE.findall(s):
            if m != f"{pid}.html":
                return m
    return None
