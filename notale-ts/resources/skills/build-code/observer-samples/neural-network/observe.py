"""只记录真实中间量；参数更新期间保留本轮前向结果，不重新计算激活。"""
import numpy as np

PARAM_NAMES = ("W1", "b1", "W2", "b2")
_forward_snapshot = {}


def _arrays(values):
    return {name: np.asarray(value, dtype=float).tolist() for name, value in values.items()}


def _base(context, stage):
    local = context.locals
    params = local.get("params", {})
    data = {name: params[name] for name in PARAM_NAMES if name in params}
    for name in ("X", "Y"):
        value = local.get(name, context.globals.get(name))
        if value is not None:
            data[name] = value
    return {**_forward_snapshot, **_arrays(data), "stage": stage}


_updated = {}


def observe(context):
    global _forward_snapshot, _updated
    local = context.locals
    if context.event != "return":
        return None
    if context.function == "update_one":
        # 一个参数刚更新完：参数在 locals，新值就是返回值。
        name = local["name"]
        _updated[name] = context.return_value
        state = _base(context, "update")
        state.update(_arrays(_updated))
        state.update(_arrays({
            "before": local["params"][name], "after": context.return_value,
            "grad": local["grads"]["d" + name],
        }))
        return {**state, "param": name, "lr": float(local["lr"]),
                "updated_names": [key for key in PARAM_NAMES if key in _updated]}
    stages = {"forward": "forward", "binary_cross_entropy": "loss",
              "backward": "backward", "train_loop": "done"}
    stage = stages.get(context.function)
    if stage is None:
        return None
    state = _base(context, stage)
    result = context.return_value
    if stage == "done":
        state["losses"] = [float(value) for value in result["losses"]]
    else:
        state.update(_arrays(result))
    if stage == "forward":
        _forward_snapshot = dict(state)
        _updated = {}
    return state
