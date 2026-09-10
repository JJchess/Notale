def _step(iteration, total_iterations, train_hist, val_hist, split, complete=False):
    t_mse = train_hist[-1] if train_hist else 0.0
    v_mse = val_hist[-1] if val_hist else 0.0
    best_v = min(val_hist) if val_hist else 0.0
    best_round = val_hist.index(best_v) if val_hist else 0

    if complete:
        phase = "complete"
        annotation = f"迭代完成：训练 MSE 降至 {t_mse:.4f}，但验证 MSE 拐点在第 {best_round} 轮 ({best_v:.4f})，后续已过拟合。"
    elif iteration == 0:
        phase = "initial"
        annotation = f"第 0 轮（常数基线）：训练 MSE={t_mse:.4f}，验证 MSE={v_mse:.4f}。"
    elif iteration < best_round or iteration <= 5:
        phase = "underfitting"
        annotation = f"第 {iteration} 轮：弱分类器切分 x={split:.2f}，训练与验证误差同步快速下降。"
    elif iteration == best_round:
        phase = "optimal"
        annotation = f"第 {iteration} 轮（拐点）：验证 MSE 达到最低值 {v_mse:.4f}，泛化能力最佳。"
    else:
        phase = "overfitting"
        annotation = f"第 {iteration} 轮：训练 MSE 继续降至 {t_mse:.4f}，但验证 MSE 抬升至 {v_mse:.4f}（过度拟合噪声）。"

    return {
        "kind": "gbdt_curve",
        "state": {
            "iteration": iteration,
            "total_iterations": total_iterations,
            "train_history": list(train_hist),
            "val_history": list(val_hist),
            "current_train_mse": round(t_mse, 4),
            "current_val_mse": round(v_mse, 4),
            "min_val_round": best_round,
            "min_val_mse": round(best_v, 4),
            "split": round(split, 2) if split is not None else 0.0,
            "phase": phase,
        },
        "focus": [{"role": "round", "index": iteration}],
        "changes": [{"role": "metric_update", "round": iteration}],
        "metrics": {
            "当前轮数": f"{iteration} / {total_iterations}",
            "训练 MSE": round(t_mse, 4),
            "验证 MSE": round(v_mse, 4),
            "最优验证轮": f"第 {best_round} 轮" if iteration >= best_round and best_round > 0 else "未出现",
        },
        "annotation": annotation,
    }


def capture(frame, event, previous_state):
    code_name = frame.f_code.co_name
    # 跟踪 run_gradient_boosting 内每轮迭代结束
    if code_name == "run_gradient_boosting":
        loc = frame.f_locals
        if "train_mse" in loc and "val_mse" in loc:
            t = loc.get("t", 0)
            n_estimators = loc.get("n_estimators", 25)
            train_errors = loc.get("train_errors", [])
            val_errors = loc.get("val_errors", [])
            stump = loc.get("stump")
            split = stump.split if stump else 0.0
            # 保证每轮只在循环末尾捕获一次
            prev_t = (previous_state or {}).get("iteration", -1)
            if t > prev_t:
                return _step(t, n_estimators, train_errors, val_errors, split)
    return None


def finalize(namespace, previous_state):
    train_errors = namespace.get("train_errors", [])
    val_errors = namespace.get("val_errors", [])
    n_estimators = len(train_errors) - 1 if train_errors else 25
    trees = namespace.get("trees", [])
    last_split = trees[-1].split if trees else 0.0
    return _step(n_estimators, n_estimators, train_errors, val_errors, last_split, complete=True)
