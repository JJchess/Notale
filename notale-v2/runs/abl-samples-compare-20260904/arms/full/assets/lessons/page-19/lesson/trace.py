def capture(frame, event, previous_state):
    if not frame.f_code.co_filename.endswith("starter.py") or frame.f_code.co_name != "<module>":
        return None

    v = frame.f_locals
    res = v.get("result")
    if not isinstance(res, list) or not res:
        return None

    step_idx = len(res)
    prev_step = (previous_state or {}).get("step", 0)
    if step_idx == prev_step:
        return None

    h_train = [p[0] for p in res]
    h_val = [p[1] for p in res]
    train_mse = h_train[-1]
    val_mse = h_val[-1]
    best_v = min(h_val)
    best_step = h_val.index(best_v) + 1

    if step_idx <= 4:
        status = "迭代不足（欠拟合）：训练与验证误差均在快速下降"
    elif val_mse > best_v + 0.02 and step_idx > best_step + 2:
        status = "迭代过度（过拟合）：训练误差继续走低，但验证误差反弹回升"
    else:
        status = "泛化良好区间：验证集误差处于平稳低谷附近"

    return {
        "kind": "boosting_curve",
        "state": {
            "n_trees": 12,
            "learning_rate": 0.35,
            "step": step_idx,
            "history_train": h_train,
            "history_val": h_val,
            "best_step": best_step,
            "best_val": best_v,
            "current_train": train_mse,
            "current_val": val_mse,
            "status": status,
            "complete": False
        },
        "focus": [{"id": f"step-{step_idx}", "role": "current"}],
        "changes": [{"id": f"step-{step_idx}", "role": "append"}],
        "metrics": {
            "当前轮数": step_idx,
            "训练MSE": train_mse,
            "验证MSE": val_mse,
            "最优早停轮": best_step
        },
        "annotation": f"第 {step_idx} 轮：训练 MSE={train_mse}，验证 MSE={val_mse}。"
    }


def finalize(namespace, previous_state):
    h_train = namespace.get("history_train_mse", [])
    h_val = namespace.get("history_val_mse", [])
    n_trees = namespace.get("n_trees", len(h_train))

    if not h_train or not h_val:
        return None

    best_v = min(h_val)
    best_step = h_val.index(best_v) + 1
    final_train = h_train[-1]
    final_val = h_val[-1]

    return {
        "kind": "boosting_curve",
        "state": {
            "n_trees": n_trees,
            "learning_rate": 0.35,
            "step": len(h_train),
            "history_train": list(h_train),
            "history_val": list(h_val),
            "best_step": best_step,
            "best_val": best_v,
            "current_train": final_train,
            "current_val": final_val,
            "status": f"迭代完成。最优验证轮次为第 {best_step} 轮 (MSE={best_v})。",
            "complete": True
        },
        "focus": [{"id": f"step-{len(h_train)}", "role": "final"}],
        "changes": [],
        "metrics": {
            "总迭代轮数": len(h_train),
            "最终训练MSE": final_train,
            "最终验证MSE": final_val,
            "最优早停轮": best_step
        },
        "annotation": f"迭代完成。最优早停轮为第 {best_step} 轮。"
    }
