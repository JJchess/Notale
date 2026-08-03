"""三处枚举真相源必须一致：enums.mjs ⇄ lecture-doc.schema.json ⇄ Python StrEnum。

为什么值得一个专门的守卫：这套系统的枚举同时活在三个地方（JS 渲染/校验侧、JSON Schema、
Python 生成侧），加一个块类型要同时改三处。历史上 legacy/tools/check-consistency.mjs 守过
这条线，但它 import 的是早已删掉的 JS agent 与改名前的 demo/schema/，随目录重组一起烂掉了——
守卫本身失效后，漂移就再没人管。这次用 pytest 重写最核心的那条断言，好处是它跟着 `pytest`
自动跑，不像独立脚本那样"没人记得执行"。
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
from lecture_agent.schema.enums import BlockType

_REPO = Path(__file__).resolve().parents[2]
_SCHEMA = _REPO / "viewer" / "schema" / "lecture-doc.schema.json"
_ENUMS_MJS = _REPO / "viewer" / "schema" / "enums.mjs"


def _schema_block_types() -> set[str]:
    schema = json.loads(_SCHEMA.read_text(encoding="utf-8"))
    return set(schema["$defs"]["block"]["properties"]["type"]["enum"])


def _mjs_enums() -> dict[str, list[str]]:
    """让 node 把 enums.mjs 的导出 dump 成 JSON——比正则刮源码可靠。"""
    node = shutil.which("node")
    if not node:
        pytest.skip("本机无 node，跳过 enums.mjs 对齐检查")
    src = f"import('file://{_ENUMS_MJS.as_posix()}').then(m => console.log(JSON.stringify(m)))"
    out = subprocess.run([node, "-e", src], capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, f"无法加载 enums.mjs: {out.stderr[-400:]}"
    return json.loads(out.stdout)


def test_schema_json_matches_python_block_types() -> None:
    py = {b.value for b in BlockType}
    assert _schema_block_types() == py, (
        "lecture-doc.schema.json 的 block.type 枚举与 Python BlockType 不一致；"
        f"仅 schema 有={_schema_block_types() - py}，仅 Python 有={py - _schema_block_types()}"
    )


def test_enums_mjs_matches_schema_json() -> None:
    mjs = _mjs_enums()
    assert set(mjs["BLOCK_TYPES"]) == _schema_block_types(), (
        "enums.mjs 的 BLOCK_TYPES 与 lecture-doc.schema.json 不一致——"
        "加块类型要三处同改（enums.mjs / schema JSON / Python BlockType）"
    )


def test_enums_mjs_diagram_and_graph_types_match_schema() -> None:
    mjs = _mjs_enums()
    schema = json.loads(_SCHEMA.read_text(encoding="utf-8"))
    assert set(mjs["DIAGRAM_TYPES"]) == set(schema["$defs"]["diagramBlock"]["properties"]["diagramType"]["enum"])
    assert set(mjs["GRAPH_TYPES"]) == set(schema["$defs"]["graphBlock"]["properties"]["graphType"]["enum"])


def test_skill_mirror_is_in_sync() -> None:
    """技能镜像必须与 viewer/schema 一致（sync.mjs --check）。

    镜像漂移过一次，根因是 sync.mjs 自己在目录重组后失效了却没人发现。把 --check 纳入测试
    等于让"同步脚本还能不能用"这件事本身也被守住。
    """
    node = shutil.which("node")
    if not node:
        pytest.skip("本机无 node，跳过镜像同步检查")
    out = subprocess.run(
        [node, str(_REPO / "lecture-agent" / "sync.mjs"), "--check"],
        capture_output=True, text=True, cwd=str(_REPO), timeout=60,
    )
    assert out.returncode == 0, out.stdout + out.stderr
