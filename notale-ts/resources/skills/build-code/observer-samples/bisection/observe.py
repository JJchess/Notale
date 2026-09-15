"""从真实调用读取初始区间、精度和完整二分结果；不重复求解。"""
_initial = None


def observe(context):
    global _initial
    local = context.locals
    if context.function == "bisect" and context.event == "line" and _initial is None:
        _initial = {"initial": [float(local["a"]), float(local["b"])], "tol": float(local["tol"])}
    if context.event != "return" or _initial is None:
        return None
    result = context.return_value
    if context.function == "bisect_step":
        a, b, fa, fb, m = result
        return {**_initial, "stage": "step", "a": a, "b": b, "fa": fa, "fb": fb,
                "m": m, "fm": local["fm"]}
    if context.function == "bisect":
        initial, _initial = _initial, None
        if not isinstance(result, dict):
            return None
        a, b = result["interval"]
        return {**initial, "stage": "done", "a": a, "b": b, "m": result["root"],
                "fm": result["residual"], "steps": result["steps"]}
    return None
