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


def observe(context):
    global _forward_snapshot
    local = context.locals
    if context.event == "line" and context.function == "update_params":
        name, updated = local.get("name"), local.get("updated", {})
        if name not in updated:
            return None
        state = _base(context, "update")
        state.update(_arrays(updated))
        state.update(_arrays({
            "before": local["params"][name], "after": updated[name],
            "grad": local["grads"]["d" + name],
        }))
        return {**state, "param": name, "lr": float(local["lr"]),
                "updated_names": [key for key in PARAM_NAMES if key in updated]}
    stages = {"forward": "forward", "binary_cross_entropy": "loss",
              "backward": "backward", "train_loop": "done"}
    stage = stages.get(context.function)
    if context.event != "return" or stage is None:
        return None
    state = _base(context, stage)
    result = context.return_value
    if stage == "done":
        state["losses"] = [float(value) for value in result["losses"]]
    else:
        state.update(_arrays(result))
    if stage == "forward":
        _forward_snapshot = dict(state)
    return state
