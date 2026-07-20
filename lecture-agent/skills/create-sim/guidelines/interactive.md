# 交互/canvas/SVG 实现规范（lecture-agent widget 专用）

> 移植裁剪自 GenUI 的 ui-a/ui-physics/technical，**主题/宿主部分已完全改写**成 lecture-agent 的
> null-origin sandbox iframe + 注入主题 token 模型（无 CDN、无 host 变量、无 sendPrompt/openLink）。

## 运行环境（硬事实，务必吃透）
- 片段被包进 `<iframe sandbox="allow-scripts">`（null origin）：脚本能跑，但**取不到任何本地/远程资源**——`vendor/`、CDN、图表库、webfont **全部禁用**。只能纯 vanilla（canvas/SVG + 原生 JS）。
- 运行时给 iframe 的 `<html>` 设了 `data-theme`，并把当前主题这些 token 注入 `:root`：
  `--bg --bg2 --card --ink --text2 --accent --line --serif --sans --mono --radius --sel`。
- srcdoc 已预置：`html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--ink);font-family:var(--sans)}`，以及 button / range slider / `.mono` 的基础样式。**故 body 高度 = iframe 高度、且 `overflow:hidden`**——片段要**填满并适配**给定尺寸，不能靠内容把页面撑高，也不能出现内部滚动条。

## 主题颜色（唯一正确姿势）
- **CSS 里直接用 `var(--token)`**：`fill:var(--accent)`、`stroke:var(--line)`、`color:var(--ink)`、背景 `var(--bg2)`/`var(--card)`、字体 `var(--sans|--serif|--mono)`、圆角 `var(--radius)`。
- **canvas 里 `getComputedStyle` 读 token**（canvas 不认 `var()`）：
  ```js
  const css = getComputedStyle(document.documentElement);
  const C = { ink: css.getPropertyValue('--ink').trim(),
              accent: css.getPropertyValue('--accent').trim(),
              line: css.getPropertyValue('--line').trim(),
              bg: css.getPropertyValue('--bg').trim(),
              muted: css.getPropertyValue('--text2').trim() };
  ctx.strokeStyle = C.accent;
  ```
  `requestAnimationFrame` 每帧重读即自动跟随主题；静态 canvas 用 `new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']})` 重绘。
- **禁止**：写死色值（`#4fc3f7` 之类）、`@media (prefers-color-scheme)`（跟 OS 不跟主题，会脱同步——校验器会拦）、host 的 `--color-*` 变量（那是 GenUI 宿主的，这里没有）。`accent` 用于活元素/强调，`line` 用于 hairline/网格，`text2` 用于次要读数。

## 渲染介质——按内容选，写进契约
- **几何/结构**（边界、直线、向量、区域、图、层级、流程）→ **声明式 SVG**，命名元素（`<line>`/`<path>`/`<circle>`），坐标**解析式算出来**再赋给元素。**绝不**靠采样像素网格点格子来画边界——那样又糊又噪。
- **canvas** 只用于真正像素/粒子密集的内容：大量运动粒子、连续场、流体/热、单摆/波形等连续运动。
- 小 viewBox（如 `0 0 100 100`）会把 stroke 和文字随容器放大——hairline 变粗变糊。给 hairline 加 `vector-effect="non-scaling-stroke"`，或用像素级 viewBox（`0 0 680 H`）把数据坐标映射上去。

## 单一 update() 入口
每次状态变化都调**同一个** `update()`：它从当前 state 重推整幅画面（SVG 就重设命名元素的属性；canvas 就重绘）。禁止把更新逻辑散落到各 handler 里各改一处。state 变量名就用契约 `state_model` 里定的名字。

## 控件与布局
- 控件（button / `input[type=range]` / toggle）**长在片段内部**，srcdoc 已给基础样式，只在需要贴主题时加内联样式覆盖。滑块设 `step` 让它本身就吐整值。
- 版式默认 **stage + readout row**：上方一行控件、中间全宽舞台（canvas/SVG 声明宽高比）、下方 2-4 个读数。舞台是主导元素、吃满宽度。只有侧栏至多 2 张矮卡时才用 balanced-split。
- 标题（若有内容性图注）单独占一行，别和一排控件挤在同一非换行 flex 行里。
- canvas 设逻辑尺寸（`width`/`height` 属性，如 680×360）+ `style="width:100%;max-width:680px;height:auto;display:block"` 随宿主缩放。
- **禁 `position:fixed`**（iframe 按内容高度自量，fixed 会塌陷）；**禁内部滚动**（列表最多显示 top 6-8 项，超了就截断并在灰色脚注注明）；多列容器设 `align-items:start`；`grid-template-columns:1fr` 的子项要 `minmax(0,1fr)` 夹住溢出。

## 让 widget 活起来的微交互（点到即止，别堆砌）
- **count-up**：数字用 rAF 在 ~400ms 内缓动到新值（`v = end-(end-start)*(1-t)**3`），每帧四舍五入，`tabular-nums` 定宽。
- **flash-on-update**：读数变化时 toggle 一个 class 把 color/background 推到 accent 再 300ms 缓回，把视线拉到「你这一下的后果」。
- **trace-in（SVG 路径）**：`stroke-dashoffset` 从路径长缓动到 0，600ms 一次，用于揭示结构；**别循环**。
