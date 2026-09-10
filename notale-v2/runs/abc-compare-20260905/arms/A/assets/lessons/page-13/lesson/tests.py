def run_tests(namespace):
    run_rf = namespace.get("run_random_forest")
    experiment = namespace.get("experiment")
    n_estimators = namespace.get("n_estimators")
    max_features = namespace.get("max_features")

    passed_fn = callable(run_rf)
    
    # 检验训练耗时与特征子采样正相关：子特征越多或树越多，评估切分点越多
    cost_test = False
    diversity_test = False
    if passed_fn:
        exp_small = run_rf(n_estimators=3, max_features=1, seed=42)
        exp_large = run_rf(n_estimators=3, max_features=4, seed=42)
        cost_test = exp_large["total_cost"] > exp_small["total_cost"]
        
        # 检验不同树是否生成了多棵基分类器
        diversity_test = len(exp_large["forest"]) == 3 and all("feature" in t for t in exp_large["forest"])

    return [
        {
            "name": "随机森林训练函数正常运行",
            "passed": passed_fn and isinstance(experiment, dict) and "forest" in experiment,
            "message": "需提供 run_random_forest 函数并输出包含森林模型与评估指标的字典。",
            "expected": True,
            "observed": passed_fn,
        },
        {
            "name": "特征采样与基学习器数量决定训练成本",
            "passed": cost_test,
            "message": "max_features 越大，寻找最佳切分点评估的特征候选越多，训练成本成倍上升。",
            "expected": True,
            "observed": cost_test,
        },
        {
            "name": "成功集成多棵决策桩且输出 OOB 泛化指标",
            "passed": diversity_test and ("final_oob_acc" in (experiment or {})),
            "message": "多棵树通过 Bootstrap 与特征随机性协同工作，并利用袋外样本跟踪泛化表现。",
            "expected": True,
            "observed": bool(diversity_test),
        },
    ]
