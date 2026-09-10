# 候选 27：波形与空气，怎样一起动？

- 状态：pending-user-review；promoted=false。
- 原作：[Let’s Learn About Waveforms](https://pudding.cool/2018/02/waveforms/)，Josh Comeau，2018 年。
- 仓库：https://github.com/the-pudding/waveforms
- 本地完整 clone：`../../sources/waveforms`，提交 `61349cde4b95583190e76a450122e2a5820b175d`。
- 入口：`index.html`；构建：本目录 `npm ci && npm run build`。React 16.14、React Motion 0.5.2、styled-components 2.4.1，依赖及 lockfile 已保留。

## 提取与保真

以原作第二章 How Sound Works 的完整空气粒子实验为核心，保留 26×26 Canvas 粒子、第一列高亮、原波形与蓝色位移点、振幅和频率联动。复用原四种基础波形，将原长文后续的形状切换能力放到直接按钮中；新增相位偏移、独立动画开关、复位与试听控件。保留完整振幅 0–1、空气实验频率 0.5–2 Hz 范围。手机纵向排列两张完整图，没有降低粒子数量。

实际运行原 Waveform、WaveformAxis、WaveformIntercept、WaveformPlayer、AirGrid、Canvas 和 Oscillator 组件。波形使用原 SVG 路径绘图，粒子本来就是 Canvas；没有把原照片、视频或插画替换成 SVG。Canela、Atlas Regular/Bold、Publico 四个实际原网页字体已下载并记录来源。

原声音由 Web Audio 振荡器生成，不是音频文件。本地继续运行原 Oscillator 的四种类型、振幅淡入淡出与音高滑动，保留原 `visualFrequency × 130.81` 以及 5000 Hz 低通滤波。界面明确解释听到的频率不同于缓慢可视动画。默认静音，点击后才创建/恢复 AudioContext；静音、切换离开页面都会停止可听输出。声音与视觉播放分别可控。

此 mini 没有提取完整长文、谐波柱状图、加法合成和和弦章节；不将它冒充整篇课程。保留的模块已有完整操作和说明，原完整源码同时存于 src/ 以便后续研究。

## 有记录的适配

三个源组件有小范围修复，未修改版本在 upstream/：

1. AirGrid 原本只在 componentDidUpdate 绘制；补上 mount 绘制，让默认暂停时仍有完整网格。原网格只显示 sine，负列相位用于 triangle 会抛 `Unrecognized quadrant!`；非 sine 的列相位改为数学上的正模 0–100，sine 分支逐字保留原值。画布按宽度变化重新挂载，维持原高 DPI 缩放。
2. WaveformPlayer 卸载时移除原 visibility listener；重新播放先取消旧 RAF 并清除待停止状态，避免快速切换重复动画循环。
3. WaveformAxis 删除源文件末尾遗留的字面文本 `)}`，其余坐标和轴线不变。

默认按 reduced-motion 设置停止持续动画；用户可手动播放。原 React Motion 参数过渡仍存在。原 `direction` 参数未实现垂直粒子移动，本地也没有宣称纵向运动；说明曲线纵轴只是表示水平位移。

## 亲眼视觉复核

实际访问原作，亲眼查看入口、空气实验、首列追踪及方波/谐波原画面。完整网格证据是 `../../evidence/waveforms/tracked-grid.png`；早期 air.png/tracked.png 网格位于屏幕外，仅作中间记录，不作为完整视觉证据。方波证据 square.png。

亲眼查看本地桌面和手机完整画面 `shots/1600-initial.png`、`shots/390-initial.png`，确认原字体、蓝色波形、完整网格和手机说明。声音做了实际浏览器输出测量，没有声称人工听辨音色。

## 验证

- `../../tools/check-waveform-air.cjs`：1600、1024、390 三尺寸，手机 DPR=2；每尺寸 4 波形×3 组振幅/频率/相位，共 36 状态。逐点验证绘图与原函数、两图参数一致；每次均 676 粒子；键盘、追踪、播放停止、静态初始画布、无溢出/外部请求/JS 错误通过。
- `../../tools/check-waveform-particles.cjs`：将官网仓库原 AirGrid 直接编译为参考，三个尺寸×三个相位的正弦网格逐像素比较，共 6,100,980 个通道值，0 差异。参考构建脚本 build-waveform-reference.mjs 使用本次 clone 和临时构建依赖。
- `../../tools/check-waveform-audio.cjs`：实际运行的 Web Audio 输出测量，4 波形×3 频率 FFT 主峰匹配 65.405/130.81/261.62 Hz（容许两个 FFT 频率间隔）；振幅为零、恢复和静音通过。频谱观察器关闭时间平滑，避免将之前音高的历史频谱误判为当前输出。
- `../../tools/check-waveform-lifecycle.cjs`：快速播放/暂停、实际响应式 resize、隐藏页面静音和停止动画通过。
- assets.json：142 个原仓库文件（含原 package 元数据）和四个原网页字体；有修改的原组件另存 upstream。原字节核验见 `../../evidence/waveform-air-source-check.json`，其余检查记录均在该 evidence 目录。

源 package 声明 MIT，但仓库没有独立 LICENSE；具体来源说明在 SOURCE-NOTICE.md，依赖许可保留于 THIRD-PARTY-NOTICES.txt。仅登记本地候选，等待用户统一 review。
