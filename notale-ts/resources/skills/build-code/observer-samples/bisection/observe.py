"""从 bisect 的参数读初始区间与精度，从每步和最终的返回值读结果；不重复求解。"""
_initial = None
_curve = []


def sample_curve(f, a, b, n=40):
    # 参考曲线用 starter 里真实的 f 采样，画面不在 JS 里重写公式；范围比区间各宽 10%，和镜头一致。
    pad = 0.1 * (b - a)
    xs = [a - pad + (b - a + 2 * pad) * i / n for i in range(n + 1)]
    return [[x, float(f(x))] for x in xs]


def observe(context):
    global _initial, _curve
    if context.function == "bisect" and context.event == "call":
        local = context.locals
        _initial = {"initial": [float(local["a"]), float(local["b"])], "tol": float(local["tol"])}
        return None
    if context.event != "return" or _initial is None:
        return None
    result = context.return_value
    if context.function == "bisect_step":
        local = context.locals
        _curve = sample_curve(context.globals["f"], float(local["a"]), float(local["b"]))
        a, b, fa, fb, m = result
        return {**_initial, "stage": "step", "a": a, "b": b, "fa": fa, "fb": fb,
                "m": m, "fm": local["fm"], "curve": _curve}
    if context.function == "bisect":
        initial, _initial = _initial, None
        if not isinstance(result, dict):
            return None
        a, b = result["interval"]
        return {**initial, "stage": "done", "a": a, "b": b, "m": result["root"],
                "fm": result["residual"], "steps": result["steps"], "curve": _curve}
    return None
