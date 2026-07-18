"""从 LLM 输出里容错抽取 JSON（去代码围栏，取第一个 {…} 对象）。对应旧 llm.mjs parseJson。"""

from __future__ import annotations

import json
import re
from typing import Any

_FENCE_HEAD = re.compile(r"^```[a-z]*\n?", re.I)
_FENCE_TAIL = re.compile(r"```$")


def parse_json(txt: str) -> Any:
    t = _FENCE_TAIL.sub("", _FENCE_HEAD.sub("", str(txt).strip())).strip()
    i, j = t.find("{"), t.rfind("}")
    if i < 0 or j < 0:
        raise ValueError("输出里没有 JSON 对象")
    return json.loads(t[i : j + 1])
