def capture(frame, event, previous_state):
    # 捕获 run_random_forest 内部每棵树的构建过程或全局变量变更
    if frame.f_code.co_name == "run_random_forest":
        values = frame.f_locals
        tree_id = values.get("tree_id")
        if tree_id is None:
            return None
        
        tree_logs = values.get("tree_logs", [])
        n_estimators = values.get("n_estimators", 1)
        max_features = values.get("max_features", 2)
        total_cost = values.get("total_splits_evaluated", 0)

        current_log = tree_logs[-1] if tree_logs else None
        oob_acc = current_log["oob_acc"] if current_log else 0.0

        return {
            "kind": "forest_step",
            "state": {
                "current_tree": tree_id + 1,
                "n_estimators": n_estimators,
                "max_features": max_features,
                "tree_logs": [dict(t) for t in tree_logs],
                "selected_features": values.get("selected_features", []),
                "oob_acc": oob_acc,
                "total_cost": total_cost,
                "complete": False,
            },
            "focus": [{"role": "tree", "id": str(tree_id + 1)}],
            "changes": [{"role": "tree_added", "id": str(tree_id + 1)}],
            "metrics": {
                "当前树": f"{tree_id + 1} / {n_estimators}",
                "特征子集数": f"{max_features} / 4",
                "计算切分总代价": total_cost,
                "当前OOB准确率": f"{oob_acc * 100:.1f}%",
            },
            "annotation": f"第 {tree_id + 1} 棵树训练完成：从 {max_features} 个随机特征中选取 f{current_log['chosen_feature'] if current_log else 0}，累积 OOB 准确率 {oob_acc * 100:.1f}%。",
        }
    return None


def finalize(namespace, previous_state):
    experiment = namespace.get("experiment", {})
    tree_logs = experiment.get("tree_logs", [])
    n_estimators = experiment.get("n_estimators", len(tree_logs))
    max_features = experiment.get("max_features", 2)
    oob_acc = experiment.get("final_oob_acc", 0.0)
    ensemble_acc = experiment.get("ensemble_acc", 0.0)
    total_cost = experiment.get("total_cost", 0)

    return {
        "kind": "forest_step",
        "state": {
            "current_tree": n_estimators,
            "n_estimators": n_estimators,
            "max_features": max_features,
            "tree_logs": [dict(t) for t in tree_logs],
            "selected_features": [],
            "oob_acc": oob_acc,
            "ensemble_acc": ensemble_acc,
            "total_cost": total_cost,
            "complete": True,
        },
        "focus": [],
        "changes": [],
        "metrics": {
            "集成决策树总数": n_estimators,
            "特征采样规模": f"{max_features} / 4",
            "总计算切分代价": total_cost,
            "最终OOB泛化率": f"{oob_acc * 100:.1f}%",
        },
        "annotation": f"森林训练完毕：集成 {n_estimators} 棵弱分类器，全量准确率 {ensemble_acc * 100:.1f}%，OOB 泛化准确率 {oob_acc * 100:.1f}%，评估耗费 {total_cost} 次切分。",
    }
