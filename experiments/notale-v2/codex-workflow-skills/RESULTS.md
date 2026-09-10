# sol-low-20260829 结果

这轮结果来自原生 Codex CLI，而不是 `core.builder`。固定配置为
`gpt-5.6-sol`、`low` reasoning、`fast` service tier、4 并发。历史 run 实际执行了
9 个 skill、18 对、36 个 arm；当前结论排除已经迁为 Builder 工具的
`get-photo-ref` 和 `get-illustration`，只统计 7 个 active workflow、14 对。
四个媒体 case 的产物与反馈保留用于历史复核，但不再参与 workflow 有效性结论。

## 有效性

- 36/36 个 Codex 进程正常退出，36/36 都是首次成功，没有基础设施重试。
- 18/18 个 treatment 只安装一个目标 skill，18/18 个 baseline 没有项目 skill。
- 18/18 个 treatment trace 都记录了目标 skill 要求的 reference routing。
- 运行前后的 skill source hash 一致；三个 `scrub-*-slop.md` 文档未安装、未注入。
- 36 张最终截图、36 份 v1/v2 grader 审计和 v3 结果均保存在忽略提交的 run 目录。
- 实施期间 `get-illustration` 与 `get-photo-ref` 被外部流程移至 `attic/`；本实验只跟随并记录实际只读来源，没有撤销该变更。

## 机器门禁（active workflow）

排除媒体 case 后，treatment 为 11/14、baseline 为 9/14，相差 14.3 个百分点。
配对结果是 treatment-only 3、baseline-only 1、双方通过 8、双方失败 2。四个不一致
配对的双侧 exact McNemar `p = 0.625`，不能据此声称总体机器通过率有可靠提升。

| Skill | Baseline | Treatment | 观察 |
|---|---:|---:|---|
| `build-page` | 2/2 | 2/2 | 门禁到顶；盲评 2/2 选择 treatment |
| `build-chart` | 1/2 | 2/2 | treatment 补齐关系图的 figure/caption 语义 |
| `build-interaction` | 1/2 | 1/2 | 无机器增益；stability 两边各有一处 clipping |
| `build-learning-game` | 0/2 | 2/2 | 明显补齐形式/功能门禁，但盲评没有形成偏好 |
| `build-2d-sim` | 1/2 | 0/2 | 明确风险项；见下文 |
| `build-3d-scene` | 2/2 | 2/2 | 门禁到顶，但 treatment 更慢 |
| `check-page` | 2/2 | 2/2 | 门禁到顶；盲评均为平局 |

`build-2d-sim` 不应按总分直接通过。叉车 treatment 只有一处 clipping，baseline 则没有
要求的 render surface；粒子 treatment 同时显示三种材料，视觉上比一次只显示一种材料的
baseline 更贴任务，但它的 `reset()` 未恢复严格相等的初始状态。因此，当前更像是
“教学模型更完整、交付确定性回退”，建议先修 reset recipe 和末端 selfcheck 约束，再复测。

## 运行开销

- treatment agent-seconds：3,333.4；baseline：2,472.5，增加 34.8%。
- treatment 总 input tokens：7,756,164；baseline：3,907,683，增加 98.5%。
- treatment 非缓存 input tokens：653,188；baseline：456,035，增加 43.2%。
- treatment output tokens：185,264；baseline：148,886，增加 24.4%。

这里的 agent-seconds 是各 arm 用时之和，不是 4 并发后的真实墙钟；token 数也不等同于账单金额。

## Grader 审计

首次评分暴露了三个格式型误判，均只对冻结产物重评分，没有重跑 agent：

1. v1 把完整生成 manifest 错误限定为 `illustrations.json`；v2 接受 skill 文档允许的
   `.prompt.json` / `.prompt.md`，同时仍要求 prompt、模型或后端、尺寸和文件名。
2. v2 不接受 `object_page` / `rights` 这组等价来源字段。
3. v2 把 `90 %` 与 `90%` 当成不同事实。

v3 已归一化这些等价表达。每个 arm 的 `result.grader-v1.json`、
`result.grader-v2.json` 和当前 `result.json` 可用于复核评分变化。

## 盲评（active workflow）

14 个 active case 已全部完成盲评并揭盲：

- treatment 胜 2，且两次都来自 `build-page`。
- baseline 胜 1，来自 `build-2d-sim` 的叉车 case。
- 平局 11；其中 6 个明确备注为“两边都不好”，分别覆盖两个 chart、两个 interaction、
  spacesuit 和 `check-states`。
- 所有维度评分均为空，因此这些反馈能回答整体 A/B 偏好，不能进一步归因到教学清晰度、
  视觉层级或交互质量中的某一项。

机器门禁和人工偏好明显脱钩：`build-chart` 与 `build-learning-game` 合计增加 3 个
treatment-only 机器通过，但人工结果仍全部为平局。这说明当前 gate 主要识别结构语义、
可访问性、reset、clipping 等交付条件，不能替代人对页面是否“好”的判断。

## 可支持的结论

先区分绝对质量与相对 A/B 偏好：**本轮没有任何一个 workflow 的产出达到可接受的绝对
质量。** 盲评只记录了配对偏好，所有质量维度评分均为空；因此 treatment 胜出只能说明
“在这一对里相对更好”，不能推出“产出已经好”。结合产物复核，`build-page` 也应被视为
差生中相对较高的一个，只适合作为下一轮的弱基线，不是已经验证可用的基座。

1. **`build-page` 是本轮相对最好的弱基线。** 两个 case 都被盲选为 treatment；机器
   通过率没有退步，同时耗时下降 17%、总 input 下降 27%、output 下降 11%。这些是相对
   证据和成本信号，不是绝对质量验收；可以保留作对照，但后续方案应允许重构并超过它。
2. **`build-learning-game` 有功能约束价值，但没有质量偏好证据。** 它把机器通过率从 0/2
   提到 2/2，却没有赢得任何盲选，并付出约 4 倍总 input 和 84% 额外耗时。应先压缩文档，
   再用更能衡量游戏体验的人工维度复测。
3. **`build-chart` 只证明了合规增益。** treatment 补齐了 figure/caption 语义，但两个
   case 都被明确评为“两边都不好”，且总 input 增加 125%。当前版本不应按机器通过直接验收。
4. **`build-interaction`、`build-3d-scene`、`check-page` 没有测出边际价值。** 它们没有增加
   机器通过或人工胜场，却分别增加约 200%、179%、30% 总 input。结论是“当前版本未证实”，
   不是证明永远无效。
5. **`build-2d-sim` 是负向风险项。** 机器通过从 1/2 降到 0/2，唯一非平局也由 baseline
   获胜。应先修 reset、末端自检和视觉施工约束，再决定是否复测。

由于每个 Skill 只有两个定向 case、且只有一名评审者，本轮足以做筛选和诊断，不足以给出
总体统计显著性或跨任务泛化结论。
