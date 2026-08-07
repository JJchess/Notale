# Frame-Constrained Block Generation 回归

主题：大学物理·简谐振动；目标/最终页数：15/15。

- 有效 live 生成耗时：2402.12 秒（40 分 02 秒）。
- 当前代码对同一批模型响应的离线重放：59.66 秒。
- 主模型：`deepseek_v4_flash`；Widget/结构视觉/runtime：当前 Gemini 路由；fanout：8。
- 未人工修改 skeleton、frame、block 或最终 deck。

## 链路结论

- 15 页均由规划器直接输出 frames，最终 `plannedFrameSignature == finalFrameSignature`。
- 计划 frame 与真实 DOM 外框最大误差：0 px。
- 顶层越界、隐藏和重叠均为 0；旧 Layout Director、自动拆页和 Viewer fit 未改变 frame。
- 每个 fan-out 调用已收到自己的 `currentBlockId + viewport + frameRole + siblingFrames + constraints`。
- 浏览器按精确 viewport 批量测量，并最多进行两轮 block-local 修复；最终仍失败时保留原 frame 和当前 block。

因此实现链路有效：生成器已经真正接收并服从外部尺寸合同，且失败可观测。

## 真实结果

- 初次浏览器测量有 10 个 block 需要局部修复；最终仍有 6 个 viewport/runtime 失败。
- `b2_1`、`b3_1` 的 Widget 主证据利用率仅 0.8% / 1.4%，两轮修复均未收敛。
- `b7_2` 存在 SVG 标签重叠，且首帧状态实体不足。
- `b11_2`、`b12_2`、`b14_2` 分别存在 26 / 137 / 14 px 的 block 内纵向溢出。
- `b9_1`、`b13_1` 两个 sim 在初次和有界重试后仍生成失败，最终以显式失败 callout 保留；dropped 为 2。
- 最终报告为 8 个硬错误；这份 deck 不满足发布线。

## 逐页观察

| 页 | 页面 | 结论 |
|---:|---|---|
| 1 | 封面 | 几何稳定，视觉可用。 |
| 2 | 什么是简谐振动 | Widget 可见但主体过小，frame 下半区利用不足。 |
| 3 | 位移－时间图像 | 曲线可见但舞台仍小，局部修复未收敛。 |
| 4 | 单摆的奥秘 | diagram + formula 可读，整体仍偏稀疏。 |
| 5 | 动力学方程 | 公式与结论完成尺寸适配，层级基本成立。 |
| 6 | 求解微分方程 | 内容完整但公式密度较高。 |
| 7 | 初始条件 | Widget 区域过小，标签重叠且状态证据不足。 |
| 8 | 随堂检验 | 完整可读，无 block overflow。 |
| 9 | 简谐振动的能量 | 主 sim 生成失败，只剩失败提示，页面接近空白。 |
| 10 | 平均能量与周期 | 可读，公式和结论分区稳定。 |
| 11 | 单摆周期 | 右侧 diagram 内部纵向溢出 26 px。 |
| 12 | 阻尼振动 | chart 可见；graph 内部纵向溢出 137 px。 |
| 13 | 受迫振动与共振 | 主 sim 生成失败，只剩 callout，页面接近空白。 |
| 14 | LC 振荡类比 | 内容较满；table 内部纵向溢出 14 px。 |
| 15 | 收尾 | 几何稳定，视觉可用。 |

## 判断

Frame-Constrained Generation 修复了“规划尺寸没有进入 block 生成”和“失败后旧布局接管”的所有权问题，但没有单独解决模型的组件构图能力与 sim 生成可靠性。当前主要瓶颈已经从外部几何漂移收敛为三类：Widget 内部舞台设计过小、复杂静态 block 的内容预算失控、sim 生成/修复不收敛。

