"""builder 的工具面。

给哪几个,是数出来的:nn-06 的 subagent 有 59 个工具可用,**实际只碰了 5 个** ——
Read 241 / Bash 213 / Edit 133 / Write 23 / Monitor 3。Monitor 是 Claude Code 的
后台任务轮询,我们没有这个特性,所以是 4 个,再加回一个 Skill。

前四个的 schema 从抓包里原样取,只裁掉我们没有的 CLI 特性(Read 的 pages、
Bash 的 run_in_background 和 dangerouslyDisableSandbox)。

Bash 不设白名单。审计过那 213 次的真实用途:

    selfcheck 143 · heredoc 写一次性脚本 37 · grep 自己的页面 9
    cat/sed 读文件 8 · 跑自己写的脚本 8 · python -c 5 · node -e 1

白名单要覆盖这些就等于放开全部,挡住任何一类都会逼模型绕路 —— 禁掉 heredoc
它就没法做轨道数值验算。改成三条护栏:cwd 钉死、超时、输出截断。
这不是沙箱:模型仍然写得到目录外。忠实照抄和绝对安全在这里不可兼得。
"""

from __future__ import annotations

import subprocess
from pathlib import Path

from . import skills

CAP = 30_000  # 单个 tool_result 的字符上限。实测 nn-06 最大一个 679,500 字符,
              # 不截断的话一次就把上下文灌爆。
TIMEOUT = 120


def _cap(s: str) -> str:
    return s if len(s) <= CAP else s[:CAP] + f"\n…（已截断，原文 {len(s):,} 字符）"


SCHEMAS = [
    {"name": "Read", "description": "读一个文件。返回带行号的内容。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "绝对路径"},
         "offset": {"type": "integer", "description": "从第几行开始读"},
         "limit": {"type": "integer", "description": "读多少行"}},
         "required": ["file_path"], "additionalProperties": False}},
    {"name": "Write", "description": "写文件,已存在则整体覆盖。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "绝对路径"},
         "content": {"type": "string", "description": "完整内容"}},
         "required": ["file_path", "content"], "additionalProperties": False}},
    {"name": "Edit", "description": "精确字符串替换。old_string 必须唯一匹配,否则失败。",
     "parameters": {"type": "object", "properties": {
         "file_path": {"type": "string", "description": "绝对路径"},
         "old_string": {"type": "string", "description": "要被替换的原文"},
         "new_string": {"type": "string", "description": "替换成什么"},
         "replace_all": {"type": "boolean", "description": "替换全部出现处"}},
         "required": ["file_path", "old_string", "new_string"], "additionalProperties": False}},
    {"name": "Bash", "description": f"执行 shell 命令。工作目录固定为该页所在的 pages/,超时 {TIMEOUT}s。",
     "parameters": {"type": "object", "properties": {
         "command": {"type": "string", "description": "要执行的命令"},
         "description": {"type": "string", "description": "一句话说明这条命令做什么"}},
         "required": ["command"], "additionalProperties": False}},
    {"name": "Skill", "description": "取一份技法文档的正文。名字从清单里选。",
     "parameters": {"type": "object", "properties": {
         "skill": {"type": "string", "description": "skill 名字"}},
         "required": ["skill"], "additionalProperties": False}},
]


def specs() -> list[dict]:
    return [{"type": "function", **s} for s in SCHEMAS]


def run(name: str, args: dict, cwd: Path, skill_root: Path) -> str:
    try:
        return _cap(_dispatch(name, args, cwd, skill_root))
    except Exception as e:  # 工具出错要回给模型让它自己修,不能把循环打断
        return f"{type(e).__name__}: {e}"


def _dispatch(name: str, a: dict, cwd: Path, skill_root: Path) -> str:
    if name == "Read":
        lines = Path(a["file_path"]).read_text(encoding="utf-8", errors="replace").split("\n")
        off = max(0, int(a.get("offset") or 1) - 1)
        lines = lines[off:off + int(a.get("limit") or 2000)]
        return "\n".join(f"{off + i + 1:6}\t{l}" for i, l in enumerate(lines))

    if name == "Write":
        p = Path(a["file_path"])
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(a["content"], encoding="utf-8")
        return f"已写入 {p}({len(a['content']):,} 字符)"

    if name == "Edit":
        p = Path(a["file_path"])
        s = p.read_text(encoding="utf-8")
        old, new = a["old_string"], a["new_string"]
        n = s.count(old)
        if n == 0:
            return "失败:old_string 在文件里找不到。先 Read 确认当前内容。"
        if n > 1 and not a.get("replace_all"):
            return f"失败:old_string 出现了 {n} 次,不唯一。加长上下文,或用 replace_all。"
        p.write_text(s.replace(old, new) if a.get("replace_all") else s.replace(old, new, 1),
                     encoding="utf-8")
        return f"已替换 {n if a.get('replace_all') else 1} 处"

    if name == "Bash":
        r = subprocess.run(a["command"], shell=True, cwd=cwd, capture_output=True,
                           text=True, timeout=TIMEOUT)
        out = (r.stdout or "") + (("\n[stderr]\n" + r.stderr) if r.stderr else "")
        return out.strip() or f"(无输出,退出码 {r.returncode})"

    if name == "Skill":
        return skills.load(a["skill"], skill_root)

    return f"未知工具 {name}"
