def run_tests(namespace):
    train_errors = namespace.get("train_errors", [])
    val_errors = namespace.get("val_errors", [])
    best_round = namespace.get("best_round")
    min_val_error = namespace.get("min_val_error")
    final_val_error = namespace.get("final_val_error")

    has_data = len(train_errors) > 1 and len(val_errors) > 1
    train_decreases = (
        train_errors[-1] < train_errors[0] and
        train_errors[-1] < train_errors[len(train_errors)//2]
    ) if has_data else False

    # 验证集误差是否呈现非单调先降后升或出现拐点
    best_is_interior = (
        isinstance(best_round, int) and
        0 < best_round < len(val_errors) - 1
    ) if has_data else False

    overfitting_occurs = (
        final_val_error is not None and
        min_val_error is not None and
        final_val_error > min_val_error
    ) if has_data else False

    return [
        {
            "name": "梯度提升模型成功生成迭代训练与验证误差",
            "passed": has_data and len(train_errors) == len(val_errors),
            "message": "train_errors 和 val_errors 需记录每轮迭代的均方误差数值序列。",
            "expected": "> 10 轮迭代记录",
            "observed": f"{len(train_errors)} 轮" if has_data else "空",
        },
        {
            "name": "训练集误差随迭代轮数显著降低",
            "passed": train_decreases,
            "message": "提升树每轮针对当前残差拟合，训练集误差应持续下降。",
            "expected": f"< {train_errors[0] if has_data else 0}",
            "observed": train_errors[-1] if has_data else "无",
        },
        {
            "name": "验证集存在局部最优拐点且最终发生过拟合回弹",
            "passed": best_is_interior and overfitting_occurs,
            "message": "随着轮数增加，模型对训练噪声过度记忆，验证集 MSE 表现出先降后升的 U 形特征（早停介入点）。",
            "expected": f"最优轮次 0 < {best_round} < 尾轮且 最终验证误差({final_val_error}) > 最低误差({min_val_error})",
            "observed": f"最优轮={best_round}, 最低={min_val_error}, 最终={final_val_error}",
        },
    ]
