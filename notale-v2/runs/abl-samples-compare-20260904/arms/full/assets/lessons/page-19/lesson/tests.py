def run_tests(namespace):
    n_trees = namespace.get("n_trees")
    history_train = namespace.get("history_train_mse", [])
    history_val = namespace.get("history_val_mse", [])
    best_iter = namespace.get("best_iteration")

    return [
        {
            "name": "完整执行梯度提升迭代",
            "passed": bool(history_train) and len(history_train) == n_trees,
            "message": f"应记录完整 {n_trees} 轮的训练与验证损失。",
            "expected": n_trees,
            "observed": len(history_train) if history_train else 0,
        },
        {
            "name": "训练集误差单调或总体下降",
            "passed": bool(history_train) and history_train[-1] < history_train[0],
            "message": "梯度提升通过累加弱学习器拟合残差，训练误差总体呈下降趋势。",
            "expected": "history_train[-1] < history_train[0]",
            "observed": f"{history_train[-1]} < {history_train[0]}" if len(history_train) > 1 else None,
        },
        {
            "name": "获得合理的早停轮次 (1-based)",
            "passed": isinstance(best_iter, int) and 1 <= best_iter <= n_trees,
            "message": "best_iteration 应为验证集 MSE 最小点对应的轮次。",
            "expected": f"1 ~ {n_trees}",
            "observed": best_iter,
        }
    ]
