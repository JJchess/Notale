# 历史实验启动脚本

2026-09-10 从 notale-v2 根目录归档 18 个 `.sh`，脚本内容原样保留，不作为当前运行入口。

- `run2.sh` 至 `run12.sh`（原目录没有 run8）：早期固定题目、模型与 label 的实验批次。
- `run-gemini38.sh`、`run-gemini38-full.sh`、`run-gemini-google.sh`：AdaBoost 模型/端点对照。
- `run-ensemble.sh`、`run-philos.sh`：集成学习与提示词调整实验。
- `run-abl.sh`、`run-focus.sh`、`run-shots.sh`：冻结规划上的样本、视觉焦点和截图消融。

这些不是可直接复用的默认配置。它们保留了当时的模型、端点、固定 label 与路径，部分假设已过时；历史脚本按原 notale-v2 工作目录解释，不从此归档目录直接运行。

**尤其注意：三个消融脚本会删除目标 run 后重建；其他脚本也可能覆盖日志或发起付费模型调用。归档时未执行任何脚本。**

当前入口仍为 `python3 -m core.planner` 和 `python3 -m core.builder`；显式实验脚本位于 `scripts/`，默认模型以 [config.yaml](../../../notale-v2/config.yaml) 为准。需要新实验时使用新 label 和明确输入，不机械重跑历史脚本。
