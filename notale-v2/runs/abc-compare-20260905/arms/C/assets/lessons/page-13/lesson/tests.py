def run_tests(namespace):
    train_and_evaluate = namespace.get("train_and_evaluate")
    experiment = namespace.get("experiment")

    tests = []

    # 测试 1: 函数存在性与基本返回
    is_callable = callable(train_and_evaluate)
    tests.append({
        "name": "随机森林训练函数 train_and_evaluate 已定义",
        "passed": is_callable,
        "message": "应提供 train_and_evaluate(n_estimators, max_features, random_state) 函数以开展参数实验。",
        "expected": True,
        "observed": is_callable,
    })

    # 测试 2: 检查默认实验输出完整性
    exp_valid = (
        isinstance(experiment, dict)
        and "progress" in experiment
        and "final_oob_acc" in experiment
        and "final_test_acc" in experiment
    )
    tests.append({
        "name": "实验输出包含迭代过程与泛化准确率",
        "passed": exp_valid,
        "message": "experiment 字典中需包含 progress 轨迹列表、final_oob_acc 和 final_test_acc 指标。",
        "expected": True,
        "observed": exp_valid,
    })

    # 测试 3: 树数量对集成的正向收敛效益
    if is_callable:
        try:
            exp_single = train_and_evaluate(n_estimators=1, max_features="sqrt", random_state=42)
            exp_multi = train_and_evaluate(n_estimators=10, max_features="sqrt", random_state=42)
            single_acc = exp_single.get("final_test_acc", 0)
            multi_acc = exp_multi.get("final_test_acc", 0)
            passed_ensemble_gain = multi_acc >= single_acc
            tests.append({
                "name": "多树集成显著优于或持平单棵决策树",
                "passed": passed_ensemble_gain,
                "message": f"10 棵决策树集成准度 ({multi_acc*100:.1f}%) 应不低于单棵决策树 ({single_acc*100:.1f}%)，体现方差缩减。",
                "expected": "multi_acc >= single_acc",
                "observed": f"单树: {single_acc}, 多树: {multi_acc}",
            })
        except Exception as err:
            tests.append({
                "name": "多树集成收益检查",
                "passed": False,
                "message": f"调用 train_and_evaluate 时抛出异常: {err}",
                "expected": "无异常",
                "observed": str(err),
            })

    # 测试 4: 特征子采样与全量特征的区别验证
    if is_callable:
        try:
            exp_sub = train_and_evaluate(n_estimators=6, max_features="sqrt", random_state=42)
            exp_all = train_and_evaluate(n_estimators=6, max_features="all", random_state=42)
            m_sub = exp_sub.get("m_per_split", 0)
            m_all = exp_all.get("m_per_split", 0)
            passed_m = m_sub < m_all
            tests.append({
                "name": "特征子采样参数有效控制分裂候选数",
                "passed": passed_m,
                "message": f"max_features='sqrt' 分裂特征数 ({m_sub}) 应小于 max_features='all' ({m_all})。",
                "expected": "m_sub < m_all",
                "observed": f"sqrt: {m_sub}, all: {m_all}",
            })
        except Exception as err:
            tests.append({
                "name": "特征子采样参数验证",
                "passed": False,
                "message": f"运行参数对比时抛出异常: {err}",
                "expected": "无异常",
                "observed": str(err),
            })

    return tests
