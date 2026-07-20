# 主题族 → 动效/signature register

> lecture 要**一致性**：颜色一律来自 deck 主题 token（见 interactive.md），**不选调色板**。
> 这里只按主题的气质，给一个「动效节奏 + signature 细节」的 register 提示，让 widget 观感融进 deck。
> 找不到当前主题时，回落到「安静编辑」族。

| 主题（token 名） | 族 | 动效节奏 | signature 细节 |
|---|---|---|---|
| `lab` | 仪表台 | 状态 120ms 线性、布局 350ms `cubic-bezier(.22,1,.36,1)` | 一条 hairline tick 刻度尺、角落 mono 读数条、十字准星/扫描线；**唯一**那条活迹在暗底上可发微光（`shadowBlur`），chrome 全哑光扁平 |
| `cobalt-grid` · `slate` · `signal` | 技术/蓝图 | 200ms 线性，部件沿轴滑动（只动 transform） | 虚线构造线（`stroke-dasharray:6 4`）、带端点刻度的量测箭头、角落裁切标记、mono 尺寸数字；活动部件用 accent 填充 |
| `broadside` · `bold-poster` · `coral` · `studio` · `emerald-editorial` | 海报 | snappy 160ms ease-out，hover 抬升元素 | 2-3px 粗边、硬偏移阴影（`box-shadow:4px 4px 0 var(--ink)`）、圆形徽标、超大字重数字 |
| `cartesian` · `soft-editorial` · `vellum` · `grove` · `monochrome` · `editorial-forest` | 安静编辑（默认回落） | 只做 450ms opacity/transform 淡入，什么都不弹跳、不发光 | hairline 分隔线、衬线（`var(--serif)`）标注、大留白、克制的强调 |

用法：build 阶段按 deck 的 `theme` 选中对应一行，把它的**动效节奏**和**signature**落进片段——但颜色始终 `var(--token)`，别从这张表里读出任何色值（表里没有）。一个 widget 只挑**一个** signature 细节，别全上。
