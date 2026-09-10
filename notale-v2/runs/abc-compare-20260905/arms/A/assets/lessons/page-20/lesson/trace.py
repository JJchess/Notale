import math


def capture(frame, event, previous_state):
    # 只在 starter.py 的关键轮次循环体内捕获状态
    code = frame.f_code
    if not code.co_filename.endswith("starter.py"):
        return None

    vals = frame.f_locals
    g_vals = frame.f_globals

    dataset = vals.get("dataset") or g_vals.get("dataset")
    if not dataset or not isinstance(dataset, list):
        return None

    round_num = vals.get("round_num")
    if round_num is None:
        return None

    learning_rate = vals.get("learning_rate") or g_vals.get("learning_rate", 0.5)
    n_rounds = vals.get("n_rounds") or g_vals.get("n_rounds", 6)
    predictions = vals.get("predictions")
    residuals = vals.get("residuals")
    split = vals.get("split")
    left_val = vals.get("left_val")
    right_val = vals.get("right_val")

    if not predictions:
        return None

    # 计算即时 MSE
    mse = sum((dataset[i][1] - predictions[i]) ** 2 for i in range(len(dataset))) / len(dataset)

    # 动态残差：如果在 residuals 计算前，用 y - predictions 实时估算
    sample_states = []
    for i, (x, y) in enumerate(dataset):
        pred = predictions[i]
        res = (residuals[i] if (residuals and i < len(residuals)) else (y - pred))
        sample_states.append({
            "id": i,
            "x": x,
            "y": round(y, 3),
            "pred": round(pred, 3),
            "res": round(res, 3),
        })

    focus = []
    if split is not None:
        focus.append({"role": "split", "value": round(split, 2)})

    annotation = f"第 {round_num}/{n_rounds} 轮：学习率 η={learning_rate}，决策桩在 x={split:.2f} 处切分拟合残差。" if split else f"第 {round_num}/{n_rounds} 轮：计算当前残差分布并拟合决策桩。"

    return {
        "kind": "boosting_step",
        "state": {
            "round": round_num,
            "total_rounds": n_rounds,
            "eta": learning_rate,
            "mse": round(mse, 4),
            "split": round(split, 2) if split is not None else None,
            "left_val": round(left_val, 3) if left_val is not None else 0.0,
            "right_val": round(right_val, 3) if right_val is not None else 0.0,
            "samples": sample_states,
            "complete": False,
        },
        "focus": focus,
        "changes": [{"role": "update_round", "round": round_num}],
        "metrics": {
            "当前轮次": f"{round_num}/{n_rounds}",
            "学习率 η": f"{learning_rate:.2f}",
            "当前 MSE": f"{mse:.4f}",
        },
        "annotation": annotation,
    }


def finalize(namespace, previous_state):
    dataset = namespace.get("dataset", [])
    predictions = namespace.get("predictions", [])
    learning_rate = namespace.get("learning_rate", 0.5)
    n_rounds = namespace.get("n_rounds", 6)
    mse = namespace.get("mse", 0.0)
    trees = namespace.get("trees", [])

    sample_states = []
    for i, (x, y) in enumerate(dataset):
        pred = predictions[i] if i < len(predictions) else 0.0
        sample_states.append({
            "id": i,
            "x": x,
            "y": round(y, 3),
            "pred": round(pred, 3),
            "res": round(y - pred, 3),
        })

    last_split = trees[-1][0] if trees else None

    return {
        "kind": "boosting_step",
        "state": {
            "round": n_rounds,
            "total_rounds": n_rounds,
            "eta": learning_rate,
            "mse": round(mse, 4),
            "split": round(last_split, 2) if last_split is not None else None,
            "left_val": round(trees[-1][1], 3) if trees else 0.0,
            "right_val": round(trees[-1][2], 3) if trees else 0.0,
            "samples": sample_states,
            "complete": True,
        },
        "focus": [],
        "changes": [],
        "metrics": {
            "当前轮次": f"{n_rounds}/{n_rounds}",
            "学习率 η": f"{learning_rate:.2f}",
            "最终 MSE": f"{mse:.4f}",
        },
        "annotation": f"训练结束：总共集成 {n_rounds} 棵决策桩。较小步长需搭配更多轮数，而盲目扩大轮数将拟合噪声点。",
    }
