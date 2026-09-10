def capture(frame, event, previous_state):
    # 捕获 boost 函数执行过程
    if not frame.f_code.co_filename.endswith("starter.py"):
        return None

    if frame.f_code.co_name != "boost":
        return None

    values = frame.f_locals
    round_idx = values.get("round_idx")
    if not isinstance(round_idx, int):
        return None

    # 只在每轮循环末尾捕获一次（当 train_errors 更新且长度等于 round_idx 时）
    train_errors = values.get("train_errors", [])
    val_errors = values.get("val_errors", [])
    if len(train_errors) != round_idx or len(val_errors) != round_idx:
        return None

    x_vals = values.get("x_vals", [])
    y_vals = values.get("y_vals", [])
    y_test = values.get("y_test", [])
    train_preds = values.get("train_preds", [])
    residuals = values.get("residuals", [])
    split = values.get("split")
    lr = values.get("lr", 0.4)
    n_rounds = values.get("n_rounds", 12)

    cur_train_mse = train_errors[-1]
    cur_val_mse = val_errors[-1]

    min_val_mse = min(val_errors)
    is_overfitting = bool(len(val_errors) > 2 and cur_val_mse > min_val_mse * 1.05 and cur_train_mse < min_val_mse)

    annotation = f"第 {round_idx} 轮：在切分点 x={split:.1f} 构建弱学习器，步长 η={lr} 更新总预测。"
    if is_overfitting:
        annotation += f" 验证误差回升（{cur_val_mse:.2f} > 最优 {min_val_mse:.2f}），提示过拟合风险！"

    return {
        "kind": "boosting_round",
        "state": {
            "round": round_idx,
            "totalRounds": n_rounds,
            "learningRate": lr,
            "x": [round(float(v), 2) for v in x_vals],
            "yTrain": [round(float(v), 2) for v in y_vals],
            "yVal": [round(float(v), 2) for v in y_test],
            "preds": [round(float(v), 2) for v in train_preds],
            "residuals": [round(float(v), 2) for v in residuals],
            "split": round(float(split), 2) if isinstance(split, (int, float)) else None,
            "historyTrain": [round(float(v), 3) for v in train_errors],
            "historyVal": [round(float(v), 3) for v in val_errors],
            "overfitting": is_overfitting,
        },
        "focus": [{"role": "split", "value": split}] if split is not None else [],
        "changes": [{"role": "update", "round": round_idx}],
        "metrics": {
            "当前轮数": f"{round_idx} / {n_rounds}",
            "训练 MSE": f"{cur_train_mse:.3f}",
            "验证 MSE": f"{cur_val_mse:.3f}",
        },
        "annotation": annotation,
    }


def finalize(namespace, previous_state):
    train_history = namespace.get("train_history", [])
    val_history = namespace.get("val_history", [])
    final_preds = namespace.get("final_preds", [])
    x_vals = namespace.get("X", [])
    y_train = namespace.get("y_train", [])
    y_val = namespace.get("y_val", [])
    lr = namespace.get("learning_rate", 0.4)
    n_rounds = namespace.get("n_estimators", 12)

    if not train_history:
        return None

    last_train = train_history[-1]
    last_val = val_history[-1]
    best_val = min(val_history)
    best_round = val_history.index(best_val) + 1

    is_overfitting = last_val > best_val * 1.05 and last_train < best_val

    annotation = (
        f"训练完成：共迭代 {len(train_history)} 轮（步长 η={lr}）。"
        f"验证集最优出现在第 {best_round} 轮 (MSE={best_val:.3f})。"
    )
    if is_overfitting:
        annotation += f" 最终轮验证误差上升至 {last_val:.3f}，说明过大轮数过度拟合了局部噪声。"

    return {
        "kind": "boosting_round",
        "state": {
            "round": len(train_history),
            "totalRounds": n_rounds,
            "learningRate": lr,
            "x": [round(float(v), 2) for v in x_vals],
            "yTrain": [round(float(v), 2) for v in y_train],
            "yVal": [round(float(v), 2) for v in y_val],
            "preds": [round(float(v), 2) for v in final_preds],
            "residuals": [round(float(y - p), 2) for y, p in zip(y_train, final_preds)],
            "split": None,
            "historyTrain": [round(float(v), 3) for v in train_history],
            "historyVal": [round(float(v), 3) for v in val_history],
            "overfitting": is_overfitting,
        },
        "focus": [],
        "changes": [],
        "metrics": {
            "最终轮数": f"{len(train_history)} / {n_rounds}",
            "训练 MSE": f"{last_train:.3f}",
            "验证 MSE": f"{last_val:.3f}",
        },
        "annotation": annotation,
    }
