"""Workspace-scoped dispatch; implementations live under tool-name directories."""
from __future__ import annotations
import json
import time
from copy import deepcopy
from pathlib import Path
from core.redact import redact
from . import read, write, edit, patch, check, bash
from .shared import media
from .shared.result import CAP, Out, _cap
from .shared.paths import _out_of_bounds, _is_workflow_resource
from .shared.image import _image
from .read import resolve_read_path
from .check import MAX_IMAGES, check_use

WORKFLOW_RESOURCE_CAP = 160_000

SCHEMAS = [read.SCHEMA, write.SCHEMA, edit.SCHEMA, patch.SCHEMA, check.SCHEMA, bash.SCHEMA]

def specs(workflow: str | None = None, *, vision_input: bool = True) -> list[dict]:
    rows = [{"type": "function", **deepcopy(s)} for s in SCHEMAS]
    if workflow == "build-code":
        rows = [s for s in rows if s["name"] in {"Read", "Write", "Edit", "Check"}]
    elif workflow:
        rows = [s for s in rows if s["name"] != "Edit"]
    for s in rows:
        if s["name"] == "Check" and not vision_input:
            for key in ("box", "zoom"):
                s["parameters"]["properties"].pop(key, None)
            s["description"] = s["description"].replace(
                "默认返回整页截图；需要看局部细节时用 box 指定区域，裁图不改变整页检查范围。", "")
        if s["name"] == "Write" and workflow:
            edit = "Edit" if workflow == "build-code" else "Patch"
            s["description"] = f"写完整文件，用于创建或整体重构；局部修正用 {edit}。"
    if vision_input:
        rows += media.SCHEMAS
    return rows


def media_call(name: str, args: dict, cwd: Path, owner: str) -> Out:
    """Same executor and image-return path for Planner and Builders."""
    started = time.monotonic()
    backend = media.search_backend() if name == "ImageSearch" else None
    out, rows, errors = media.fetch(name, args, cwd, owner, backend=backend)
    images = []
    for row in rows:
        if "path" not in row:
            row.setdefault("error", "未取得可用图片")
            continue
        try:
            if name == "ImageSearch":
                _, row["w"], row["h"] = media.image_info(cwd / row["path"])
            shot = _image(cwd / row["path"])
            images.extend(shot.images)
        except (OSError, ValueError) as exc:
            row["error"] = str(exc)
            row.pop("path", None)
    if name == "ImageSearch":
        fields = ("query_index", "title", "source", "page_url", "url", "author", "license", "path", "w", "h", "error")
        result = {"results": [{k: row[k] for k in fields if row.get(k) is not None and row.get(k) != ""}
                              for row in rows], "errors": errors}
        result = json.loads(redact(json.dumps(result, ensure_ascii=False)))
        try:
            media.record_search(out, cwd, args, backend, time.monotonic() - started, result, rows)
        except (OSError, ValueError) as exc:
            result["errors"].append(media._error("record", exc))
        return Out(json.dumps(result, ensure_ascii=False), images)
    return Out(json.dumps(rows, ensure_ascii=False), images)


def run(
    name: str,
    args: dict,
    cwd: Path,
    resource_root: Path | None,
    pid: str,
) -> str | Out:
    """`pid` 是本页的 id(形如 `page-06`),**必填**。

    不给默认值是故意的:默认值等于「忘了传就静默不设防」,而静默退化正是这个仓库
    反复栽过的形状 —— 分不清「设防了」和「以为设防了」。
    """
    if name in media.NAMES:
        try:
            return media_call(name, args, cwd, pid)
        except Exception as exc:
            return f"{type(exc).__name__}: {exc}"
    off = _out_of_bounds(name, args, cwd, pid, resource_root)
    if off:
        return (f"拒绝:`{off}` 不在当前页面的工作范围内。"
                f"只能修改 `{pid}.html` 及宿主明确授予的代码 lesson 文件；"
                f"当前 workflow 资源只读。")
    # The scope guard has always interpreted relative file paths from ``pages/``.  Dispatch
    # must use the same base.  Otherwise a valid ``page-08.html`` passes the guard and is then
    # written relative to the harness process cwd, outside the run it was checked against.
    call_args = dict(args)
    if name in {"Read", "Write", "Edit"} and call_args.get("file_path"):
        path = Path(str(call_args["file_path"]))
        if name == "Read":
            call_args["file_path"] = str(resolve_read_path(str(path), cwd, resource_root))
        elif not path.is_absolute():
            call_args["file_path"] = str((cwd / path).resolve())
    try:
        r = _dispatch(name, call_args, cwd, resource_root)
        cap = CAP
        if name == "Read" and call_args.get("file_path") \
                and (_is_workflow_resource(Path(call_args["file_path"]), resource_root)
                     or Path(call_args["file_path"]).resolve() == (cwd / "assets/lib/LIBS.md").resolve()):
            cap = WORKFLOW_RESOURCE_CAP
        return Out(_cap(r.text, cap), r.images) if isinstance(r, Out) else _cap(r, cap)
    except Exception as e:  # 工具出错要回给模型让它自己修,不能把循环打断
        return f"{type(e).__name__}: {e}"

def _dispatch(name: str, a: dict, cwd: Path, resource_root: Path | None) -> str | Out:
    if name == "Read":
        return read.execute(a, cwd, resource_root)
    if name == "Write":
        return write.execute(a, cwd, resource_root)
    if name == "Edit":
        return edit.execute(a, cwd, resource_root)
    if name == "Patch":
        return patch._patch(cwd, a)
    if name == "Check":
        return check._check(cwd, a, resource_root.name if resource_root else None)
    if name == "Bash":
        return bash.execute(a, cwd, resource_root)
    return f"未知工具 {name}"
