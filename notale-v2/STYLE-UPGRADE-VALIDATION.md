# Style Director 实施与验证 · 2026-09-08

基线：`c0e8bd11`。只提交了本轮相关代码、测试和方案；上级仓库的无关删除、实验和 run 未纳入。没有 push。

## 已实施

- `--template <图片或目录>`、`--style <明确要求>`；与关闭 Director 冲突时在模型调用前报错。
- 自动选样、看图、媒体工具、失败原稿与错误回传保留同一 history；Planner 仍独立并行。
- 取消配色统计和全局形状审美闸，ban list 在创作输入中加载；公共 surface 与局部实现分开。
- 主题仍是 CSS＋本地资源，无 schema/编译器/继承层。`html[data-variant]`、多层 stage 背景、品牌伪元素直接由浏览器工作。
- Builder 默认仅注入 INTERFACE，用户样张进入视觉消息；代码外壳不加载共享主题。
- 本地资源重定位、缺失/越界检查、CSS 解析与离线 Chromium 探针、原子发布。依赖见 `requirements-style.txt`。
- 40 张裁图、8 张概览均已核对并接入。原始图片未改色、补画或覆盖。

## 确定性与浏览器检查

126 项回归通过：

```sh
python3 -B -m unittest core.test_director core.test_style_upgrade core.test_prompts core.test_media core.test_builder core.test_skills core.test_artifacts core.test_check_report core.test_llm_adapters
```

独立离线浏览器测试 2 项通过（每项包含多场景断言）：

```sh
python3 -B -m unittest core.test_style_browser
```

覆盖三种背景机制、深浅/无图状态、品牌指针层、隐藏元素、缩放点击、键盘、reduced-motion、SVG/Canvas 根取色与代码外壳隔离；另外验证损坏图片/字体、合法颜色函数及通用字体。`git diff --check` 通过。

## 真实效果：3 个方向 × 3 个页型

[九宫格](runs/style-upgrade-0908b-audit/contact.png) · [逐页操作结果](runs/style-upgrade-0908b-audit/audit.json)

冻结内容：本金 100、年增长率 20%，`A(n)=100*(1+r)^n`，`n=0..5`。封面、正文图表、交互各一页。真实模型生成，不是九张手写主题演示。

| Director 路线 | 运行 | 实际调用 | 观察 |
| --- | --- | --- | --- |
| 自动选参考＋Swiss 要求 | `style-upgrade-0908b-auto` | 2 | 高对比字阶、网格/硬边与平涂强调；不只是换底色 |
| 用户玻璃参考图 | `style-upgrade-0908b-glass` | 3 | 蓝紫层次、局部透明面与控件；追加了两次 Read 响应，其中一次路径错误 |
| 明确修改已有主题 | `style-upgrade-0908b-photo` | 2 | 衬线标题、摄影 opening 和无摄影正文；修正一次 CSS 相对资源路径 |

Director 共 7 次响应，输入 91,413 token、输出 19,225 token，来自 trace；含重复上下文，不能当作独立信息量或图片 token。路由未提供结算价，未猜测金额。

九页审计没有 JS 异常。三页交互均实际操作：默认 248.83、最大增长率时 759.38、重置 248.83；缩小到 800×450 后键盘调整至最小值为 100.00。结果是功能断言，不是视觉评分。

## 必须保留的失败与人工修正

1. 首轮默认 Builder 有两个封面在读参考后提前结束，没有文件。原记录保留在 `0908b`；补测封面来自 `style-upgrade-0908c-auto/glass`，使用项目已配置的 GPT-5.6-Sol 和既有 Builder 工作流。补测当时工作区 Builder 默认已被另一组改动切为 mini＋aux，故不把两轮耗时或效果当作单变量模型对比；本轮未撤销这些并行改动。
2. 摄影封面的 SVG 漏挂 `.nt-growth-chart` 宿主，私有子类未生效而出现黑色填充。人工补了该宿主类，未改共享主题。同步提示词要求交代样式最小父子用法，保留该失败，不声称九页全部一次生成成功。
3. 生成页出现过标题换行挤压、图注重叠与面板过重，说明仅有 CSS 技术通过不能证明页面好看。现有 Builder 在实际 Check 中修订；未为此增加审美阈值或自动 critic。
4. 新校验器的首轮复查误判了逗号选择器列表和有标准属性配对的兼容前缀，已修正；不能把校验器自己的误报算成模型失败。
5. 九页已经可供截图和操作后，按本轮效率反馈停止仍在反复读图的首轮 Builder 测试会话。部分页未自然结束，不能将缺失的终止审计/汇总视为通过；最终证据是独立 `audit.json` 与截图，而非全部 Builder 自报完成。
6. 人工将自动主题正文页标题改用既有 `--fs-h2`，避免双行标题挤压图表说明；并改正“新增额始终高于20”的措辞（第1年应相等）。这属于页面交付修正，不是 Director 自动通过的证据。
7. 最终人工收尾还缩小了摄影正文页导语到既有正文 token，并移除玻璃交互页最后一次模型修订加入的 `#stage{position:relative}`；不改主题实现，不把这些人工修正隐藏在模型成功率中。

## 边界

- 三个方向已验证实际应用，不能据此宣称全部 40 项风格的生成质量通过。
- 对比度的自动结果只覆盖纯色舞台；图片/渐变明确标记需看图，字体缺字及跨机器字形一致性没有穷尽验证。
- 九页是工程样本，不是统计显著性、美学打分或完整课程验收；不声称所有主题都可不重建页面直接换肤。
- 本轮仅给代码工作台做外壳隔离，未优化代码页外观。

复现脚本：`scripts/style_smoke.py`（会调用付费模型）、`scripts/style_audit.py`（仅本地截图/交互）。旧 run 不覆盖；每轮用新 prefix。
