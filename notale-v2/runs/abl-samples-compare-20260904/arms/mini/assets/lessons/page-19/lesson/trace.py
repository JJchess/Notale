def _history_copy(history):
    if not isinstance(history, list):
        return []
    res = []
    for item in history:
        if isinstance(item, dict):
            res.append({
                "round": int(item.get("round", 0)),
                "train_loss": float(item.get("train_loss", 0.0)),
                "val_loss": float(item.get("val_loss", 0.0)),
                "gap": float(item.get("gap", 0.0)),
            })
    return res


def capture(frame, event, previous_state):
    func = frame.f_code.co_name
    filename = frame.f_code.co_filename
    if func != "fit_gradient_boosting" or not filename.endswith("starter.py"):
        return None

    values = frame.f_locals
    round_idx = values.get("round_idx")
    if round_idx is None:
        return None

    history = _history_copy(values.get("history"))
    if not history:
        return None

    latest = history[-1]
    r = latest["round"]
    t_loss = latest["train_loss"]
    v_loss = latest["val_loss"]
    gap = latest["gap"]

    if r <= 3:
        stage = "underfitting"
        note = f"第 {r} 轮：训练与验证误差均较高，模型处于迭代不足（欠拟合）阶段。"
    elif r <= 6:
        stage = "optimal"
        note = f"第 {r} 轮：验证误差降至谷底附近 ({v_loss})，泛化能力达到最优区间。"
    else:
        stage = "overfitting"
        note = f"第 {r} 轮：训练误差持续下降 ({t_loss})，但验证误差反弹回升 ({v_loss})，出现迭代过度（过拟合）。"

    return {
        "kind": "boosting_curve",
        "state": {
            "current_round": r,
            "total_rounds": values.get("n_rounds", 12),
            "learning_rate": values.get("lr", 0.25),
            "train_loss": t_loss,
            "val_loss": v_loss,
            "history": history,
            "stage": stage,
        },
        "focus": [{"role": "round", "index": r}],
        "changes": [{"role": "loss_update", "round": r}],
        "metrics": {
            "当前轮数": f"{r} / {values.get('n_rounds', 12)}",
            "训练 MSE": f"{t_loss:.4f}",
            "验证 MSE": f"{v_loss:.4f}",
            "泛化差距": f"{gap:.4f}",
        },
        "annotation": note,
    }


def finalize(namespace, previous_state):
    records = _history_copy(namespace.get("records"))
    if not records:
        return None

    latest = records[-1]
    r = latest["round"]
    t_loss = latest["train_loss"]
    v_loss = latest["val_loss"]
    gap = latest["gap"]

    # 找出验证集最小 loss 所在轮次
    best_round = min(records, key=lambda x: x["val_loss"])

    return {
        "kind": "boosting_curve",
        "state": {
            "current_round": r,
            "total_rounds": r,
            "learning_rate": namespace.get("learning_rate", 0.25),
            "train_loss": t_loss,
            "val_loss": v_loss,
            "history": records,
            "best_round": best_round["round"],
            "best_val_loss": best_round["val_loss"],
            "stage": "complete",
        },
        "focus": [{"role": "best_round", "index": best_round["round"]}],
        "changes": [],
        "metrics": {
            "当前轮数": f"{r} / {r}",
            "最佳轮次": f"第 {best_round['round']} 轮",
            "最佳验证 MSE": f"{best_round['val_loss']:.4f}",
            "最终训练 MSE": f"{t_loss:.4f}",
        },
        "annotation": f"训练完成：最佳验证损失在第 {best_round['round']} 轮 ({best_round['val_loss']:.4f})，随后验证损失抬头证实早停 (Early Stopping) 的必要性。",
    }
