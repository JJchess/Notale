# tests.py: 检验梯度提升训练结果的合理性与学习表现

def run_tests(namespace):
    history = namespace.get("history")
    n_est = namespace.get("n_estimators")
    lr = namespace.get("learning_rate")
    
    results = []
    
    # 1. 结构与执行完整性检查
    results.append({
        "name": "梯度提升迭代历史完整生成",
        "passed": isinstance(history, list) and len(history) == n_est and len(history) > 0,
        "message": f"应完成指定的全部 {n_est} 轮迭代并记录历史数据。",
        "expected": f"{n_est} 轮记录",
        "observed": f"{len(history) if isinstance(history, list) else 0} 轮记录",
    })
    
    # 2. 训练误差递减规律检查
    if isinstance(history, list) and len(history) >= 2:
        train_drop = history[0]["train_mse"] > history[-1]["train_mse"]
        results.append({
            "name": "弱学习器累加有效压低训练误差",
            "passed": train_drop,
            "message": f"梯度提升按负梯度方向优化，最终训练误差 ({history[-1]['train_mse']:.4f}) 应低于初始阶段 ({history[0]['train_mse']:.4f})。",
            "expected": "训练集 MSE 呈现下降趋势",
            "observed": "训练集 MSE 成功下降" if train_drop else "训练集 MSE 未下降",
        })
    
    # 3. 学习率与参数合法性检查
    valid_params = (
        isinstance(lr, (int, float)) and 0.001 <= lr <= 2.0 and
        isinstance(n_est, int) and 1 <= n_est <= 200
    )
    results.append({
        "name": "超参数设置在合理探索区间",
        "passed": valid_params,
        "message": "学习率建议设置在 0.01~1.0 之间，树的棵数在 1~100 之间便于快速观察。",
        "expected": "0.001 <= learning_rate <= 2.0 且 1 <= n_estimators <= 200",
        "observed": f"learning_rate={lr}, n_estimators={n_est}",
    })

    return results
