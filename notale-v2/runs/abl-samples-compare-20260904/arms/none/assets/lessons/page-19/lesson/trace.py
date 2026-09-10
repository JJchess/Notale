# trace.py: 提取梯度提升迭代过程中的关键语义状态并输出给原生视图

def capture(frame, event, previous_state):
    # 只在每轮追加完 history 的关键点采集
    if event != "line":
        return None
    
    hist = frame.f_locals.get("history")
    if not isinstance(hist, list) or len(hist) == 0:
        return None

    current_round = len(hist)
    # 如果当前轮和前一次采集的一致，不重复生成多余 frame
    if isinstance(previous_state, dict) and previous_state.get("round") == current_round:
        return None

    cur = hist[-1]
    best_step = min(hist, key=lambda s: s["val_mse"])
    
    n_est = frame.f_globals.get("n_estimators", current_round)
    lr = frame.f_globals.get("learning_rate", 0.2)

    status = "normal"
    if cur["val_mse"] > best_step["val_mse"] * 1.08:
        status = "overfitting"
    elif current_round < 6 and cur["train_mse"] > 0.12:
        status = "underfitting"
    elif current_round == best_step["round"]:
        status = "optimal"

    state = {
        "round": current_round,
        "n_estimators": n_est,
        "learning_rate": lr,
        "history": list(hist),
        "status": status,
        "best_round": best_step["round"],
        "min_val_mse": best_step["val_mse"],
        "curve": {
            "train_x": frame.f_globals.get("train_x", []),
            "train_y": frame.f_globals.get("train_y", []),
            "train_preds": [round(p, 3) for p in frame.f_locals.get("train_preds", [])],
            "val_x": frame.f_globals.get("val_x", []),
            "val_y": frame.f_globals.get("val_y", []),
            "val_preds": [round(p, 3) for p in frame.f_locals.get("val_preds", [])],
        },
    }

    return {
        "kind": "gradient_boosting",
        "state": state,
        "focus": [{"role": "round", "index": current_round}],
        "changes": [{"role": "update_mse", "index": current_round}],
        "metrics": {
            "当前轮数": current_round,
            "训练 MSE": f"{cur['train_mse']:.4f}",
            "验证 MSE": f"{cur['val_mse']:.4f}",
            "最优轮数": f"第 {best_step['round']} 轮",
        },
        "annotation": f"第 {current_round} 轮：新弱树沿负梯度修正误差（训练 MSE: {cur['train_mse']:.4f}）。",
    }

def finalize(namespace, previous_state):
    hist = namespace.get("history", [])
    if not hist:
        return previous_state

    current_round = len(hist)
    best_step = min(hist, key=lambda s: s["val_mse"])
    last_step = hist[-1]
    
    n_est = namespace.get("n_estimators", current_round)
    lr = namespace.get("learning_rate", 0.2)

    status = "normal"
    if last_step["val_mse"] > best_step["val_mse"] * 1.08:
        status = "overfitting"
    elif current_round < 6 and last_step["train_mse"] > 0.12:
        status = "underfitting"
    elif current_round == best_step["round"]:
        status = "optimal"

    state = {
        "round": current_round,
        "n_estimators": n_est,
        "learning_rate": lr,
        "history": list(hist),
        "status": status,
        "best_round": best_step["round"],
        "min_val_mse": best_step["val_mse"],
        "curve": {
            "train_x": namespace.get("train_x", []),
            "train_y": namespace.get("train_y", []),
            "train_preds": [round(p, 3) for p in namespace.get("train_preds", [])],
            "val_x": namespace.get("val_x", []),
            "val_y": namespace.get("val_y", []),
            "val_preds": [round(p, 3) for p in namespace.get("val_preds", [])],
        },
    }

    return {
        "kind": "gradient_boosting",
        "state": state,
        "focus": [],
        "changes": [],
        "metrics": {
            "总轮数": current_round,
            "终态训 MSE": f"{last_step['train_mse']:.4f}",
            "终态验 MSE": f"{last_step['val_mse']:.4f}",
            "最优轮数": f"第 {best_step['round']} 轮",
        },
        "annotation": f"训练结束：共 {current_round} 轮。最优验证集轮数为第 {best_step['round']} 轮 (Val MSE: {best_step['val_mse']:.4f})。",
    }
