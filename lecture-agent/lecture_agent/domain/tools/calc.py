"""calc 工具：在给定变量值下求一个受限数学表达式，返回数值或错误。

用途：让生成 sim 块的 LLM **真跑一遍**候选的 update/objective 表达式，确认产出有限数（非 NaN/inf/除零），
把 `schema.validate` 只做的**静态**白名单检查，补成**运行时**数值验证。纯函数、无 I/O、无 `eval`——
自建 AST 遍历，只放行数字/白名单函数/给定变量，安全可复现。
"""

from __future__ import annotations

import ast
import math
import operator
from collections.abc import Callable
from typing import Any

from ...ports.tool import ToolSpec

_FUNCS: dict[str, Callable[..., Any]] = {
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "exp": math.exp,
    "log": math.log,
    "sqrt": math.sqrt,
    "floor": math.floor,
    "abs": abs,
    "pow": pow,
    "min": min,
    "max": max,
    "round": round,
}
_CONSTS: dict[str, float] = {"PI": math.pi, "E": math.e}
_BIN: dict[type, Callable[..., Any]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY: dict[type, Callable[..., Any]] = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_CMP: dict[type, Callable[..., Any]] = {
    ast.Lt: operator.lt,
    ast.Gt: operator.gt,
    ast.LtE: operator.le,
    ast.GtE: operator.ge,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
}

_SPEC: ToolSpec = {
    "name": "calc",
    "description": (
        "在给定变量值下求一个受限数学表达式，返回数值或 ERROR。"
        "支持 + - * / % **、比较，函数 sin/cos/tan/exp/log/sqrt/floor/abs/pow/min/max/round，常量 PI/E。"
        "用它验证 sim 表达式在定义域内产出有限数（非 NaN/inf/除零）。"
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "expr": {"type": "string", "description": "受限数学表达式"},
            "vars": {
                "type": "object",
                "description": "变量名→数值，供表达式代入",
                "additionalProperties": {"type": "number"},
            },
        },
        "required": ["expr"],
    },
}


def _eval(node: ast.AST, variables: dict[str, float]) -> float:
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            return float(node.value)
        raise ValueError(f"非法常量: {node.value!r}")
    if isinstance(node, ast.Name):
        if node.id in variables:
            return float(variables[node.id])
        if node.id in _CONSTS:
            return _CONSTS[node.id]
        raise NameError(f"未知标识符: {node.id}")
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN:
        return float(_BIN[type(node.op)](_eval(node.left, variables), _eval(node.right, variables)))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
        return float(_UNARY[type(node.op)](_eval(node.operand, variables)))
    if isinstance(node, ast.Compare) and len(node.ops) == 1 and type(node.ops[0]) in _CMP:
        left = _eval(node.left, variables)
        right = _eval(node.comparators[0], variables)
        return 1.0 if _CMP[type(node.ops[0])](left, right) else 0.0
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _FUNCS:
        args = [_eval(a, variables) for a in node.args]
        return float(_FUNCS[node.func.id](*args))
    raise ValueError(f"不允许的表达式结构: {type(node).__name__}")


class CalcTool:
    @property
    def spec(self) -> ToolSpec:
        return _SPEC

    async def run(self, args: dict[str, Any]) -> str:
        expr = str(args.get("expr", ""))
        raw_vars = args.get("vars") or {}
        variables = {str(k): float(v) for k, v in raw_vars.items()}
        try:
            tree = ast.parse(expr, mode="eval")
            result = _eval(tree.body, variables)
        except Exception as e:  # noqa: BLE001 - 把任何求值错误当观察返回给模型
            return f"ERROR: {type(e).__name__}: {e}"
        if not math.isfinite(result):
            return f"ERROR: 非有限值 ({result})——表达式在此取值下发散/无定义"
        return f"{result}"
