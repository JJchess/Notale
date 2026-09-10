def capture(frame, event, previous_state):
    rf = frame.f_globals.get("rf")
    if rf is None:
        rf = frame.f_locals.get("self") if "self" in frame.f_locals and hasattr(frame.f_locals["self"], "trees") else None

    # 如果无法提取 rf 状态，返回一个保留前态的默认步
    if not rf or not hasattr(rf, "trees"):
        if isinstance(previous_state, dict) and "trees" in previous_state:
            return {
                "kind": "forest",
                "state": previous_state,
                "focus": [],
                "changes": [],
                "metrics": {"决策树": 0, "OOB准确率": "0.0%", "特征0重要性": "0.0%"},
                "annotation": "正在初始化随机森林与样本数据……",
            }
        return None

    trees_info = []
    for idx, t in enumerate(rf.trees):
        trees_info.append({
            "id": idx + 1,
            "feature": f"X[{t.feature_idx}]",
            "feature_idx": t.feature_idx,
            "threshold": round(t.threshold, 2),
            "gain": round(t.gain, 3),
            "oob_count": len(rf.oob_indices_per_tree[idx]) if idx < len(rf.oob_indices_per_tree) else 0,
            "oob_indices": rf.oob_indices_per_tree[idx] if idx < len(rf.oob_indices_per_tree) else [],
        })

    oob_score = getattr(rf, "oob_score_", 0.0)
    feat_imps = getattr(rf, "feature_importances_", [0.0, 0.0])

    state = {
        "trees": trees_info,
        "n_estimators": rf.n_estimators,
        "oob_score": oob_score,
        "feature_importances": feat_imps,
        "n_samples": 8,
    }

    metrics = {
        "已构建树": f"{len(trees_info)} / {rf.n_estimators}",
        "OOB 准确率": f"{round(oob_score * 100, 1)}%",
        "特征0重要性": f"{round(feat_imps[0] * 100, 1)}%",
    }

    annotation = (
        f"已构建 {len(trees_info)} 棵树桩。每棵树基于独立 Bootstrap 子样本并限制候选特征，"
        f"袋外评估与特征增益同步累积。"
    )

    return {
        "kind": "forest",
        "state": state,
        "focus": [{"role": "tree", "index": len(trees_info) - 1}] if trees_info else [],
        "changes": [{"role": "tree_added", "index": len(trees_info) - 1}] if trees_info else [],
        "metrics": metrics,
        "annotation": annotation,
    }


def finalize(namespace, previous_state):
    rf = namespace.get("rf")
    if not rf or not hasattr(rf, "trees"):
        return {
            "kind": "forest",
            "state": previous_state or {},
            "focus": [],
            "changes": [],
            "metrics": {"完成": "未执行"},
            "annotation": "请运行代码完成随机森林训练与诊断。",
        }

    trees_info = []
    for idx, t in enumerate(rf.trees):
        trees_info.append({
            "id": idx + 1,
            "feature": f"X[{t.feature_idx}]",
            "feature_idx": t.feature_idx,
            "threshold": round(t.threshold, 2),
            "gain": round(t.gain, 3),
            "oob_count": len(rf.oob_indices_per_tree[idx]) if idx < len(rf.oob_indices_per_tree) else 0,
            "oob_indices": rf.oob_indices_per_tree[idx] if idx < len(rf.oob_indices_per_tree) else [],
        })

    state = {
        "trees": trees_info,
        "n_estimators": rf.n_estimators,
        "oob_score": rf.oob_score_,
        "feature_importances": rf.feature_importances_,
        "n_samples": 8,
    }

    return {
        "kind": "forest",
        "state": state,
        "focus": [],
        "changes": [],
        "metrics": {
            "集成规模": f"{len(trees_info)} 棵树",
            "OOB 准确率": f"{round(rf.oob_score_ * 100, 1)}%",
            "特征0重要性": f"{round(rf.feature_importances_[0] * 100, 1)}%",
        },
        "annotation": f"训练完成：OOB准确率达 {round(rf.oob_score_ * 100, 1)}%，强特征 X[0] 贡献占比 {round(rf.feature_importances_[0] * 100, 1)}%。",
    }
