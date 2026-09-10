def run_tests(namespace):
    records = namespace.get("records")
    final_train_loss = namespace.get("final_train_loss")
    final_val_loss = namespace.get("final_val_loss")
    n_estimators = namespace.get("n_estimators")

    has_records = isinstance(records, list) and len(records) > 0
    monotonic_train = True
    if has_records:
        for i in range(1, len(records)):
            # 允许浮点轻微波动，整体必须递减
            if records[i]["train_loss"] > records[i - 1]["train_loss"] + 0.08:
                monotonic_train = False
                break

    min_val = min(records, key=lambda x: x["val_loss"]) if has_records else None
    has_overfitting_inflection = (
        has_records
        and min_val is not None
        and min_val["round"] < len(records)
        and records[-1]["val_loss"] > min_val["val_loss"]
    )

    train_loss_decreased = (
        has_records
        and records[0]["train_loss"] > records[-1]["train_loss"]
        and (final_train_loss is not None and final_train_loss < 0.2)
    )

    return [
        {
            "name": "成功产出每轮损失记录序列",
            "passed": has_records and len(records) == n_estimators,
            "message": f"返回记录数应与 n_estimators ({n_estimators}) 严格一致。",
            "expected": n_estimators,
            "observed": len(records) if has_records else 0,
        },
        {
            "name": "训练损失整体随迭代递减",
            "passed": monotonic_train and train_loss_decreased,
            "message": "梯度提升通过每轮拟合残差，使训练集 MSE 持续被压缩下降。",
            "expected": "< 0.2",
            "observed": final_train_loss,
        },
        {
            "name": "验证集出现‘U型’转折（迭代过度反弹）",
            "passed": has_overfitting_inflection,
            "message": "验证集误差应在达到局部极小后反弹，反映出过度迭代导致的过拟合。",
            "expected": "谷底轮数 < 总轮数且最终验证误差回升",
            "observed": f"最佳在第 {min_val['round']} 轮 ({min_val['val_loss']})，最终第 {len(records)} 轮 ({final_val_loss})" if min_val else "无数据",
        },
    ]
