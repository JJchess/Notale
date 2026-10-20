# Notale brand assets · 品牌资源

定稿 Logo 与动画原件。静态 Logo 已用于 Viewer；本次归档新增的动画尚未接入产品界面。

Approved logo and motion assets. The Viewer uses the static logo; the archived animations are not yet integrated into the product UI.

| 文件 / File | 用途 / Purpose |
| --- | --- |
| `notale-mark.svg` | 独立图标 / Standalone mark |
| `notale-mark-dark.svg` | 深色背景图标 / Mark for dark backgrounds |
| `notale-lockup.svg` | 图标与 Notale 字标 / Mark and wordmark |
| `notale-lockup-dark.svg` | 深色背景组合标识 / Lockup for dark backgrounds |
| `notale-app-icon.svg` | 方形应用图标 / Square app icon |
| `notale-write.svg` | 书写出场动画 / Writing entrance animation |
| `notale-loading.svg` | 循环加载动画 / Looping loading animation |
| `notale-done.svg` | 完成动画 / Completion animation |
| `notale-hover.svg` | 悬停动画 / Hover animation |
| `notale-motion.js` | 重播与加载到完成的衔接 / Replay and loading-to-done transition |
| `notale-motion.css` | `.notale-press` 按压反馈 / Press feedback |

## 引用 / Usage

Viewer 将本目录发布为 `/brand/`。静态资源可直接引用：

The Viewer serves this directory at `/brand/`. Reference static assets directly:

```html
<img src="/brand/notale-lockup.svg" alt="Notale" width="180">
```

- `write`、`loading`、`done` 的 SVG 自带 SMIL 动画，无需 JS。`hover` 的悬停事件以及 `replay()`、`finish()` 需要内联 SVG；传入实际 `SVGSVGElement`，不能传入 `<img>`。
- `write`, `loading`, and `done` contain their own SMIL animations. Hover events and `replay()` / `finish()` require inline SVG; pass the actual `SVGSVGElement`, not an `<img>`.

```js
// In a browser ES module / 在浏览器 ES module 中
import { replay, finish } from '/brand/notale-motion.js';
```

- JS 是原生 ES module；通过 `type="module"` 或项目的模块系统导入。按压反馈需加载 CSS，并给包裹内联 SVG 的可点击元素添加 `notale-press` 类。
- The JavaScript is a native ES module. Load it with `type="module"` or your module system. For press feedback, load the CSS and add `notale-press` to the clickable element wrapping the inline SVG.
- 多个 SVG 同时内联时，为每个实例分配唯一 ID，并同步更新内部引用及 SMIL 事件引用，避免重复 ID 冲突。通过 `<img>` 加载的 SVG 文档彼此隔离。
- When inlining multiple SVGs, make each instance's IDs unique and update internal references and SMIL event references. SVG documents loaded through `<img>` are isolated from one another.
- 动画 SVG 和按压 CSS 已支持 `prefers-reduced-motion`。这些资源无需外部字体、图片或 JS 依赖。
- Animated SVGs and the press stylesheet support `prefers-reduced-motion`. No external fonts, images, or JavaScript dependencies are required.
