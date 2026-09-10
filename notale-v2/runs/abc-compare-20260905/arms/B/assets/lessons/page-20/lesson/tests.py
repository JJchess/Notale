def run_tests(namespace):
    boost_fn = namespace.get("boost")
    fit_stump_fn = namespace.get("fit_stump")
    lr = namespace.get("learning_rate")
    n_est = namespace.get("n_estimators")
    final_preds = namespace.get("final_preds", [])
    train_history = namespace.get("train_history", [])
    val_history = namespace.get("val_history", [])

    has_functions = callable(boost_fn) and callable(fit_stump_fn)
    has_params = isinstance(lr, (int, float)) and isinstance(n_est, int)
    has_valid_outputs = (
        isinstance(train_history, list)
        and len(train_history) == n_est
        and isinstance(val_history, list)
        and len(val_history) == n_est
    )

    # 验证训练损失随着轮数增加是单调下降或收敛的
    train_improves = (
        bool(train_history)
        and train_history[-1] < train_history[0]
    )

    # 验证树桩寻找负梯度时正确选择使得残差平方和最小的划分
    test_res = [-2.0, -1.0, 1.0, 2.0]
    test_x = [1.0, 2.0, 3.0, 4.0]
    stump_ok = False
    if callable(fit_stump_fn):
        split, cl, cr = fit_stump_fn(test_res, test_x)
        stump_ok = (split == 2.5 and cl < 0 and cr > 0)

    return [
        {
            "name": "提升迭代训练损失稳步递减",
            "passed": train_improves,
            "message": f"经过 {n_est} 轮迭代，训练 MSE 应显著低于首轮基准预测 (首轮={train_history[0]:.3f} -> 末轮={train_history[-1]:.3f})。",
            "expected": "train_mse_end < train_mse_start",
            "observed": f"{train_history[-1]:.3f} < {train_history[0]:.3f}" if train_history else "无记录",
        },
        {
            "name": "弱学习器树桩拟合逻辑正确",
            "passed": stump_ok,
            "message": "fit_stump 应找到使两侧残差方差之和最小的最优切分点。",
        },
        {
            "name": "完整捕获学习率与轮数历史记录",
            "passed": has_functions and has_params and has_valid_outputs,
            "message": "算法输出的 train_history 与 val_history 长度必须严格等于 n_estimators。",
            "expected": n_est,
            "observed": len(train_history) if train_history else 0,
        },
    ]
