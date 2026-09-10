def capture(frame, event, previous_state):
    locs = frame.f_locals
    filename = frame.f_code.co_filename
    if not filename.endswith("starter.py"):
        return None

    tree_records = locs.get("tree_records")
    if not isinstance(tree_records, list):
        return None

    feature_names = ["x0_信号", "x1_主导", "x2_噪声"]
    tree_count = 5
    trees_data = []
    
    for t in range(tree_count):
        if t < len(tree_records):
            rec = tree_records[t]
            trees_data.append({
                "id": t,
                "status": "trained",
                "in_bag": rec.get("in_bag", []),
                "oob": rec.get("oob", []),
                "split_feat": feature_names[rec.get("split_feat", 0)] if "split_feat" in rec else "—",
                "threshold": rec.get("threshold", "—")
            })
        else:
            trees_data.append({
                "id": t,
                "status": "pending",
                "in_bag": [],
                "oob": [],
                "split_feat": "—",
                "threshold": "—"
            })

    oob_preds = locs.get("oob_predictions", {})
    oob_accuracy = locs.get("oob_accuracy", None)
    importances = locs.get("feature_importances", {})

    current_t = locs.get("t")
    active_tree = current_t if isinstance(current_t, int) else None

    # 计算关注与变化点
    focus = []
    if active_tree is not None and active_tree < tree_count:
        focus.append({"id": f"tree-{active_tree}", "role": "training"})

    changes = []
    if len(tree_records) > 0:
        last_t = len(tree_records) - 1
        changes.append({"id": f"tree-{last_t}", "role": "trained"})

    oob_pct = f"{round((len(oob_preds) / 12) * 100)}%" if oob_preds else "0%"

    return {
        "kind": "forest",
        "state": {
            "step_type": "training",
            "tree_count": tree_count,
            "n_samples": 12,
            "features": feature_names,
            "trees": trees_data,
            "active_tree": active_tree,
            "oob_predictions": oob_preds,
            "oob_accuracy": oob_accuracy,
            "importances": importances
        },
        "focus": focus,
        "changes": changes,
        "metrics": {
            "已训练树": len(tree_records),
            "OOB覆盖样本": len(oob_preds),
            "OOB准确率": f"{round(oob_accuracy * 100, 1)}%" if oob_accuracy is not None else "计算中"
        },
        "annotation": f"正在构建决策树 #{len(tree_records)}；通过 Bootstrap 生成训练子集与袋外 OOB 观测。"
    }

def finalize(namespace, previous_state):
    feature_names = ["x0_信号", "x1_主导", "x2_噪声"]
    tree_records = namespace.get("tree_records", [])
    trees_data = []
    for t in range(5):
        if t < len(tree_records):
            rec = tree_records[t]
            trees_data.append({
                "id": t,
                "status": "trained",
                "in_bag": rec.get("in_bag", []),
                "oob": rec.get("oob", []),
                "split_feat": feature_names[rec.get("split_feat", 0)] if "split_feat" in rec else "—",
                "threshold": rec.get("threshold", "—")
            })
        else:
            trees_data.append({
                "id": t, "status": "pending", "in_bag": [], "oob": [], "split_feat": "—", "threshold": "—"
            })

    oob_preds = namespace.get("oob_predictions", {})
    oob_acc = namespace.get("oob_accuracy", 0.0)
    importances = namespace.get("feature_importances", {})

    return {
        "kind": "forest",
        "state": {
            "step_type": "complete",
            "tree_count": 5,
            "n_samples": 12,
            "features": feature_names,
            "trees": trees_data,
            "active_tree": None,
            "oob_predictions": oob_preds,
            "oob_accuracy": oob_acc,
            "importances": importances
        },
        "focus": [{"id": "oob-panel", "role": "complete"}],
        "changes": [{"id": "importances", "role": "complete"}],
        "metrics": {
            "已训练树": 5,
            "OOB覆盖样本": len(oob_preds),
            "OOB准确率": f"{round(oob_acc * 100, 1)}%"
        },
        "annotation": f"全部 5 棵树构建完毕！OOB 准确率为 {round(oob_acc * 100, 1)}%，置换测试清晰分离了主导特征与噪声。"
    }
