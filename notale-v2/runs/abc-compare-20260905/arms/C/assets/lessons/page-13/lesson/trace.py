def capture(frame, event, previous_state):
    # 仅在顶层函数循环或外层结束时捕获，避免内部递归分裂每一行都触发 trace frame
    if frame.f_code.co_name != "train_and_evaluate":
        return None

    progress = frame.f_locals.get("forest_progress")
    if not isinstance(progress, list) or len(progress) == 0:
        return None

    # 如果进度长度没有更新，则跳过微观帧
    prev_len = len(previous_state.get("trees", [])) if isinstance(previous_state, dict) else 0
    if len(progress) == prev_len:
        return None

    trees_count = len(progress)
    latest = progress[-1]
    items = [
        {
            "id": f"tree_{item['tree_index']}",
            "tree": item["tree_index"],
            "acc": item["test_accuracy"],
            "oob": item["oob_count"],
        }
        for item in progress
    ]

    return {
        "kind": "forest_trace",
        "state": {
            "trees": items,
            "total_trees": trees_count,
            "latest_acc": latest.get("test_accuracy", 0),
        },
        "focus": [{"role": "latest", "tree": latest.get("tree_index")}],
        "changes": [{"role": "tree_trained", "tree": latest.get("tree_index")}],
        "metrics": {
            "集成规模 (T)": trees_count,
            "测试准确率": f"{latest.get('test_accuracy', 0)*100:.1f}%",
            "本轮袋外样本": latest.get("oob_count", 0),
        },
        "annotation": f"第 {latest.get('tree_index')} 棵树通过 Bootstrap 抽样与特征子采样完成训练；测试准确率达到 {latest.get('test_accuracy', 0)*100:.1f}%。",
    }


def finalize(namespace, previous_state):
    exp = namespace.get("experiment")
    if not isinstance(exp, dict):
        return None

    progress = exp.get("progress", [])
    items = [
        {
            "id": f"tree_{item['tree_index']}",
            "tree": item["tree_index"],
            "acc": item["test_accuracy"],
            "oob": item["oob_count"],
        }
        for item in progress
    ]
    oob_acc = exp.get("final_oob_acc", 0)
    test_acc = exp.get("final_test_acc", 0)

    return {
        "kind": "forest_trace",
        "state": {
            "trees": items,
            "total_trees": len(items),
            "final_oob_acc": oob_acc,
            "final_test_acc": test_acc,
            "m_per_split": exp.get("m_per_split", 2),
        },
        "focus": [],
        "changes": [],
        "metrics": {
            "森林树数": len(items),
            "OOB 验证准度": f"{oob_acc*100:.1f}%",
            "测试准确率": f"{test_acc*100:.1f}%",
        },
        "annotation": f"训练结束：{len(items)} 棵基树集成完成。特征子采样(m={exp.get('m_per_split')})降低了树间相关性，OOB 验证准度稳定。",
    }
