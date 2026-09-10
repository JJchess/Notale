def run_tests(namespace):
    result = namespace.get("result", {})
    evaluate_forest = namespace.get("evaluate_forest")
    
    history = result.get("history", [])
    n_trees = result.get("n_trees", 0)
    max_features = result.get("max_features", 0)
    final_oob = result.get("final_oob_error", 1.0)
    total_cost = result.get("total_cost", 0)
    
    has_trees = n_trees >= 1 and len(history) == n_trees
    feature_valid = 1 <= max_features <= 8
    
    # 测试函数对不同参数的响应性
    dynamic_check = False
    if callable(evaluate_forest):
        res1 = evaluate_forest(n_trees=5, max_features=2)
        res2 = evaluate_forest(n_trees=15, max_features=2)
        res3 = evaluate_forest(n_trees=5, max_features=6)
        # 树越多，成本越高且 OOB 误差趋于收敛变低
        # 特征数越多，单步分裂成本越高
        dynamic_check = (
            res2["total_cost"] > res1["total_cost"]
            and res2["final_oob_error"] <= res1["final_oob_error"] + 0.05
            and res3["total_cost"] > res1["total_cost"]
        )

    return [
        {
            "name": "随机森林训练完成且生成有效历史",
            "passed": has_trees and feature_valid,
            "message": "程序应运行指定数量的基学习器并记录每棵树的特征子集与 OOB 误差。",
            "expected": f"树数量 >= 1，每次特征数在 [1, 8] 之间",
            "observed": f"树数量 = {n_trees}, 特征数 = {max_features}",
        },
        {
            "name": "OOB 泛化误差合理收敛",
            "passed": 0.10 <= final_oob <= 0.45,
            "message": "集成学习通过投票降低方差，OOB 误差应进入合理稳定范围。",
            "expected": "0.10 <= OOB <= 0.45",
            "observed": f"最终 OOB 误差 = {final_oob}",
        },
        {
            "name": "树数量与特征数如实影响成本与表现",
            "passed": dynamic_check,
            "message": "增加树数量提升成本并促进收敛；增加特征子采样增加单树分裂开销。",
            "expected": "总开销随树数与特征数单调递增，且多树具有收敛优势",
            "observed": "动态评估验证通过" if dynamic_check else "未体现超参数的实际制约关系",
        },
    ]
