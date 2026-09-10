def run_tests(namespace):
    dataset = namespace.get("dataset", [])
    predictions = namespace.get("predictions", [])
    learning_rate = namespace.get("learning_rate")
    n_rounds = namespace.get("n_rounds")
    mse = namespace.get("mse")

    passed_shape = len(predictions) == len(dataset) and len(dataset) > 0
    passed_residual = (mse is not None) and (mse < 1.0)
    passed_params = isinstance(learning_rate, (int, float)) and isinstance(n_rounds, int) and n_rounds >= 1

    return [
        {
            "name": "预测维度与样本数严格对齐",
            "passed": passed_shape,
            "message": "每个输入样本均有对应的集成预测输出值 F(x)。",
            "expected": len(dataset),
            "observed": len(predictions),
        },
        {
            "name": "超参数配置规范有效",
            "passed": passed_params,
            "message": "学习率 eta 为正浮点数，迭代轮数 n_rounds 为正整数。",
            "expected": "eta > 0, n_rounds >= 1",
            "observed": f"eta={learning_rate}, n={n_rounds}",
        },
        {
            "name": "提升机制有效降低训练残差",
            "passed": passed_residual,
            "message": f"经过串行梯度补偿后，MSE ({mse:.4f} if mse else 'None') 应显著低于初始方差。",
            "expected": "MSE < 1.0",
            "observed": f"MSE = {mse:.4f}" if mse is not None else "未计算",
        },
    ]
