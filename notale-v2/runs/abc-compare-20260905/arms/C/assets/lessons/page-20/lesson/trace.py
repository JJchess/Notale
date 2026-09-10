train_x = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]
train_y = [1.2, 1.9, 3.2, 3.8, 5.1, 5.8, 4.5, 3.1]
test_x  = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]
test_y  = [1.5, 2.6, 3.6, 4.6, 5.6, 5.3, 3.7]

f0_init = round(sum(train_y) / len(train_y), 3)
initial_mse = round(sum((y - f0_init) ** 2 for y in train_y) / len(train_y), 3)
initial_test_mse = round(sum((y - f0_init) ** 2 for y in test_y) / len(test_y), 3)


def _step(round_num, max_rounds, lr, split, c_left, c_right, train_preds, test_preds, residuals, train_mse, test_mse, complete=False):
    t_preds = [round(v, 3) for v in (train_preds or [f0_init] * len(train_x))]
    te_preds = [round(v, 3) for v in (test_preds or [f0_init] * len(test_x))]
    res_list = [round(v, 3) for v in (residuals or [y - f0_init for y in train_y])]

    if complete:
        op = "拟合完成"
        annot = f"共 {max_rounds} 轮集成：训练 MSE={train_mse:.3f}，测试 MSE={test_mse:.3f}。"
    elif round_num == 0:
        op = "初始常数预测"
        annot = f"F_0(x) = ȳ = {f0_init}。初始训练 MSE={initial_mse:.3f}，测试 MSE={initial_test_mse:.3f}。"
    else:
        op = f"第 {round_num}/{max_rounds} 轮弱桩更新"
        annot = f"切分点 x*={split:.1f}，左={c_left:.2f}，右={c_right:.2f}。按 lr={lr} 步长累加，训练 MSE={train_mse:.3f}。"

    return {
        "kind": "boosting",
        "state": {
            "round": round_num,
            "maxRounds": max_rounds,
            "learningRate": lr,
            "split": round(split, 2) if split is not None else None,
            "cLeft": round(c_left, 3) if c_left is not None else None,
            "cRight": round(c_right, 3) if c_right is not None else None,
            "trainX": train_x,
            "trainY": train_y,
            "trainPred": t_preds,
            "residuals": res_list,
            "testX": test_x,
            "testY": test_y,
            "testPred": te_preds,
            "trainMse": round(train_mse, 4),
            "testMse": round(test_mse, 4),
            "operation": op,
            "complete": complete,
        },
        "focus": [{"role": "split", "value": split}] if split is not None else [],
        "changes": [{"role": "update", "round": round_num}],
        "metrics": {
            "轮数": f"{round_num}/{max_rounds}",
            "学习率 η": f"{lr}",
            "训练 MSE": f"{train_mse:.3f}",
            "测试 MSE": f"{test_mse:.3f}",
        },
        "annotation": annot,
    }


def capture(frame, event, previous_state):
    code_name = frame.f_code.co_name
    filename = frame.f_code.co_filename
    if code_name != "boost_regression" or not filename.endswith("starter.py"):
        return None

    # 只在每轮循环末尾的 round_history.append 语句捕获，确保每轮恰好捕获一次
    line_no = frame.f_lineno
    values = frame.f_locals
    m = values.get("m")
    if m is None:
        return None

    train_pred = values.get("train_pred")
    test_pred = values.get("test_pred")
    residuals = values.get("residuals")
    split = values.get("split")
    c_left = values.get("c_left")
    c_right = values.get("c_right")
    lr = values.get("lr", 0.3)
    n_rounds = values.get("n_rounds", 6)

    # 只有当本轮模型与预测都计算好时才捕获
    if not train_pred or split is None:
        return None

    # 计算或获取本轮 MSE
    train_mse = sum((y - p) ** 2 for y, p in zip(train_y, train_pred)) / len(train_y)
    test_mse = sum((y - p) ** 2 for y, p in zip(test_y, test_pred)) / len(test_y)

    # 避免在同一轮循环内反复产出大量重复帧，只在每个 m 的最后产生一帧
    prev_round = (previous_state or {}).get("round")
    if prev_round == m + 1:
        return None

    return _step(
        round_num=m + 1,
        max_rounds=n_rounds,
        lr=lr,
        split=split,
        c_left=c_left,
        c_right=c_right,
        train_preds=train_pred,
        test_preds=test_pred,
        residuals=residuals,
        train_mse=train_mse,
        test_mse=test_mse,
        complete=False,
    )


def finalize(namespace, previous_state):
    history = namespace.get("history", [])
    lr = namespace.get("learning_rate", 0.3)
    n_rounds = namespace.get("n_estimators", 6)
    final_train = namespace.get("final_train", [])
    final_test = namespace.get("final_test", [])

    if history:
        last_m, train_mse, test_mse = history[-1]
    else:
        train_mse = initial_mse
        test_mse = initial_test_mse

    residuals = [y - p for y, p in zip(train_y, final_train)] if final_train else None

    return _step(
        round_num=n_rounds,
        max_rounds=n_rounds,
        lr=lr,
        split=None,
        c_left=None,
        c_right=None,
        train_preds=final_train,
        test_preds=final_test,
        residuals=residuals,
        train_mse=train_mse,
        test_mse=test_mse,
        complete=True,
    )
