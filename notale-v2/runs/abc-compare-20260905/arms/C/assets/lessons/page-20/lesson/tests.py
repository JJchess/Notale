def run_tests(namespace):
    final_train = namespace.get("final_train")
    final_test = namespace.get("final_test")
    history = namespace.get("history")

    # 1. 验证梯度提升迭代有效降低训练误差
    train_y = [1.2, 1.9, 3.2, 3.8, 5.1, 5.8, 4.5, 3.1]
    f0_mse = sum((y - sum(train_y)/len(train_y))**2 for y in train_y) / len(train_y)
    final_mse = history[-1][1] if history else 999.0
    converged = final_mse < f0_mse * 0.45

    # 2. 检查多轮历史单调递减或显著优化
    history_ok = bool(history and len(history) >= 3 and history[-1][1] < history[0][1])

    # 3. 验证预测结果维度与合理数值范围
    has_results = bool(final_train and len(final_train) == 8 and final_test and len(final_test) == 7)

    return [
        {
            "name": "梯度提升迭代有效降低训练误差",
            "passed": converged,
            "message": f"多轮残差拟合后，训练 MSE ({final_mse:.3f}) 需显著低于单均值基线 ({f0_mse:.3f})。",
            "expected": f"< {f0_mse * 0.45:.3f}",
            "observed": round(final_mse, 3) if has_results else "未完成",
        },
        {
            "name": "多轮迭代残差持续得到补偿修正",
            "passed": history_ok,
            "message": "随着弱学习器轮次递增，集成模型的拟合误差相比初始前几轮持续下降。",
        },
        {
            "name": "训练集与测试集预测输出完整有效",
            "passed": has_results,
            "message": "函数应分别输出与训练集、测试集对应样本规模一致的预测向量与历史。",
        },
    ]
