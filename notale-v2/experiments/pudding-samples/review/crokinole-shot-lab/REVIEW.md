# Crokinole · 一击训练室

状态：pending-user-review，promoted=false。仅备选，未进入正式集合。

原作：[Welcome to Crokinole](https://pudding.cool/2024/10/crokinole/)，Russell Samora，2024-10。[原模拟器](https://pudding.cool/2024/10/crokinole/play/)。源码 https://github.com/the-pudding/crokinole ，已 clone，固定提交见 assets.json。

## 原作视觉复查

亲自查看官网模拟器首屏、Easy 棋盘和瞄准状态。原作截图在 ../../evidence/crokinole/initial.png、game.png、aim.png。脚本 review-crokinole.cjs 与 review-crokinole-aim.cjs 可重现。

首次请求发生 ERR_NETWORK_CHANGED，重试后正常加载。原作当前浏览器中，画布覆盖 Place Disc 按钮并导致指针点击被拦截；通过键盘 Enter 正常进入瞄准。没有把该次原作操作描述为已完成整局游戏。本 mini 的实际出手与结算另行验证。

## 提取范围与保真

- 保留原 utils/crokinole.js 的 Matter.js 物理实现：棋子摩擦、弹性、质量、八根桩、边缘、中心洞、碰撞有效性、停稳与压线计分。
- 原 specs.js、scenarios.json、variables.json 与 Crokinole.Bg.svelte 均直接复制。三个练习使用原 opentry、opponenttry、ricochettry 局面，包括 opentry 中原有的一枚粉色 10 分棋子。
- 原作棋盘是 CSS 几何背景 + Canvas 物理前景；本 mini 沿用原背景组件，没有用 SVG 替换图片，也不把它称为 3D。此交互段落本来没有棋盘照片或纹理。
- 四段原 MP3：disc、flick、hole、rim，逐字节复制，用原 Howler 调用播放，可手动静音。没有重新合成音效。
- 原物理公式不改。引擎只新增 destroy 释放与只读 snapshot 便于验证；$app/paths 用本地相对路径适配。
- 棋盘保持原坐标与比例；将 Canvas 的 CSS 显示尺寸约束为棋盘容器尺寸，修复前景错位及按钮遮挡。
- 提取三个手动练习，不包含完整人机轮次和文章图表。每次停稳后保留结果，由用户再试或换局面。

## 本地操作层

可选择起手位置、瞄准角度与力度；既能按当前力度发射，也能按住蓄力后松开发射。蓄力沿用原 17ms 增减 0.01 的往返节奏，同时加入 Space/Enter 操作和指针捕获。起手滑块原边界为 162.54–611.46；本地原生 range 用 0.01 步长，使中心 387 及原场景小数坐标都可精确表示。

运动过程中禁止切换场景，避免旧出手结算混入新场景。计分显示“粉色棋子当前共几分”，包含场上原有棋子；例如直取中心成功为新入洞 20 + 原有 10 = 30。

## 浏览器验证

`node experiments/pudding-samples/tools/check-crokinole.cjs`

- 1600×900、1280×720、390×844（手机 DPR=2），均实际射出棋子后等待原引擎停稳。
- 直取中心：原中心起手，角度 0、力度 0.3，出现有效 20 分洞，粉色总分 30。
- 有对手时用 0.05 低力度未触碰，判无效并移除射出棋子，保留对方棋子。
- 原参考附近起点 x=341.54、角度 15、力度 0.38，碰撞后有效。
- 借力局面原对手坐标 (420,460)，键盘按住 Space 使力度增加，松开真实发射并完成结算。
- Canvas 与 CSS 棋盘显示尺寸一致；没有重复创建画布、脚本错误或文档横向溢出。
- 四段音效均经浏览器 AudioContext 解码，时长和声道记录在 evidence/crokinole-candidate-checks.json。
- 个人查看桌面初态、手机借力局面及真实入洞结果；未将通过解码说成逐段听感审核。

该测试验证确定性示例与关键规则，不证明所有可能轨迹。借力局面已验证可操作、摆位正确及出手结算，不声称测试已完成一次借力 20。

## 构建与出处

运行入口是已构建的 index.html，无需本地安装依赖。修改时在本目录 `npm ci`，再从工作区根运行：

`python3 experiments/pudding-samples/tools/build-crokinole.py`

准备上游文件：`python3 experiments/pudding-samples/tools/prepare-crokinole.py`。src/App.svelte 是独立操作层；原物理与背景源码保存在 src/ 中。构建文件哈希见 build-manifest.json，原文件与本地适配后哈希见 assets.json。原许可与 Matter.js、Howler、Svelte 许可均附目录。没有复制 Pudding 品牌标志或专有字体。
