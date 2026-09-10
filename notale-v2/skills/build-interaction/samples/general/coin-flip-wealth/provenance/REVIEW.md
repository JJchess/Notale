# 候选 28：同样的胜率，不同的余额

- 状态：pending-user-review；promoted=false。
- 原作：[Why the super rich are inevitable](https://pudding.cool/2022/12/yard-sale/)，Alvin Chang，原页署名日期 January 2023（URL 路径为 2022/12）。
- 仓库：https://github.com/the-pudding/yard-sale
- 完整本地 clone：`../../sources/yard-sale`，提交 `74127adc3445d686923257d67b76c497bc411df7`。
- 入口：`index.html`。本目录 `npm ci && npm run build`；Svelte 3.59.2、LayerCake 7.0.0、D3 7.4.4、Vite 4.5.14，源码、构建文件和 lockfile 均保留。

## 提取范围

提取原双人掷币模块 `Yardsale.mathsimulation.svelte`，继续使用其完整模拟、人物表情与对话气泡、两张各自调整坐标范围的折线图，以及原 LayerCake / D3 Line / Axis 组件。四张原 PNG（player1 和 player4 的 happy/sad）和原 National Regular/Bold 字体保留，没有重画或替换成 SVG。原折线图本来就是 SVG。

开场为 $100 对 $1,000，每轮下注额为当时较少余额的 20%。赢家获得、输家失去同一个数值。保留原浮点运算及整数显示，新增可展开的逐轮余额表（显示到分）和总额读数。

原作前 12 轮使用预设顺序，之后随机；原 Reset 会改成从第一轮随机。本地保留这些逻辑，并在界面明确写明 Guided example / Random coin flips，将原 Reset 改为 “Restart with random flips”，另提供 “Replay guided example”。没有把原开场序列包装成真正的随机抽样。

标题和正文只解释这个模型；没有提取原作完整手表叙事、百人模拟或再分配实验。页面说明虚拟余额、固定总额、每张图独立纵轴及随机结果差异。

## 适配

`upstream/Simulation.svelte` 留存未修改源文件。工作版本增加模式和轮数提示、轮后事件与读取状态方法，支持余额表和验证；保留核心获胜顺序、下注计算、财富更新、胜率/表情逻辑和图表数据。原第一轮无限弹跳按钮改为稳定按钮，原气泡淡入淡出仍保留。

当原本较穷的一方反超时，人物标签会显示 “now richer” / “now poorer”；原下注函数已经支持更换较少余额的一方。手机仍按原响应式布局将两图纵向排列，保留完整曲线和图片。

## 亲眼视觉复核

实际访问官网，亲眼查看原手表开场、双人实验初始状态和第十轮画面。完整证据：`../../evidence/yard-sale/coin-initial.png`、`coin-round-10.png`。原第十轮双方各 5 胜：左侧显示 $82，右侧 $1,018；实际浮点余额为 81.53726975999999 / 1018.46273024。官网前 12 轮显示记录留存于 coin-states.json。

已亲眼查看本地 `shots/1600-round10.png` 和 `shots/390-round10.png`，确认原人物、气泡、紫色折线、双图与手机说明均完整可读。

## 验证

`../../tools/check-coin-wealth.cjs` 在 1600、1024、390 三种屏宽下检查：

- 前 12 轮逐轮独立重算余额、获胜次数、下一轮下注额，并与官网显示记录核对。
- 精确历史表展开后随交易更新，随机重新开始与重播示例均正确清空。
- 20 轮可控连续获胜使财富排序反转，标签与下注基数正确；随后 1,000 轮种子随机交易，逐轮余额有限且非负、总额 $1,100 在 1e-8 内守恒。
- 四张 PNG 解码、完整折线路径、键盘掷币、无横向溢出、JS 错误或外部请求。

检查记录：`../../evidence/coin-wealth-checks.json`。assets.json 中 15 个仓库原文件与两个原网页字体的哈希均通过；记录在 coin-wealth-source-check.json。

源 MIT LICENSE 保留在 upstream/LICENSE，依赖许可在 THIRD-PARTY-NOTICES.txt。字体与图片记录原出处，不扩大原许可范围。只登记本地候选，待用户统一决定是否入库。
