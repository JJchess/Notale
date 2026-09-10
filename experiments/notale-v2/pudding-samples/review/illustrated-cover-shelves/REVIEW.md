# 插画，走上书架

状态：pending-user-review，promoted=false。仅备选，等待用户最终决定。

原作：[What does a happily ever after look like?](https://pudding.cool/2023/10/romance-covers/)，Alice Liang、Jan Diehm / The Pudding，2023-10。

## 原作视觉复查

实际查看官网历史封面台座、Illustration 段落、2011–2017 与 2018–2019 的横向书架；实际点击原作加入阅读清单按钮，并打开 Your Reading List 验证加入结果。截图在 ../../evidence/romance-covers/，尤其 illustration-1700.png、illustration-2700.png、reading-list.png。

已克隆实际界面仓库 https://github.com/the-pudding/romance-covers-new ，固定提交见 assets.json。最初 `romance-covers` 地址取得的是用于下载图片的数据工程；因此继续定位并 clone `romance-covers-new`，本 mini 的数据和图片全部来自后者。

## 保留的机制与素材

- Illustration 完整子集：375 本，13 个年份。沿用 Index.svelte 的 `cover_url.includes('http') && Style == 'Illustrated'` 条件；同年书目保持原 CSV 顺序。
- 原 JPG 封面全部逐字节复制，没有重画、转码、裁切导出或 SVG 替代。书目查看保留图片原比例。原素材本身是缩略图，查看器不声称提供原出版文件的高清版本。
- CSS 书架保留 Wall.Shelf.svelte 的斜切顶面、白色前沿、投影，以及 Wall.Book.svelte 的封面浅透视。CSS 层板本来就是原作的原生绘制方式。
- 宽屏五行，手机四行，沿年份连续水平浏览；年份标记、滑块、柱形比例图相互对应。图形不被压缩成手机屏宽，而在局部书架里横向滚动。
- 加入/移除清单、清单查看与 CSV 导出沿用原作可用行为；新增本地持久化和封面书目对话框。LocalStorage 不可用时保留当前会话功能。
- 数据和图像始终本地加载；不依赖 CDN 或 Google Books 实时响应。

## 数据复核

全部 listings.csv 共有 1,435 条，年度分母使用全部记录，与 BarChart.svelte 的 yearTotals 一致。当前记录均有 http cover_url。

| 年份 | 插画 / 全部 | 四舍五入比例 |
|---|---|---|
| 2011 | 4 / 57 | 7% |
| 2018 | 21 / 120 | 18% |
| 2022 | 73 / 119 | 61% |
| 2023 | 84 / 117 | 72% |

原作叙事有“2011+2012 共 169 本”的文字，但此固定 CSV 的分母合计为 176（57+119）。本 mini 不复述该文字，展示可由当前固定数据复算的逐年分母。分类指原作的封面风格标记，不是对小说内容的重新判断。

## 提取范围与验证

这是独立的插画封面时间书架，分类 page/chart。未复制整篇叙事和另外两类封面分析。所有 375 本插画封面都可浏览和收藏。

`node experiments/pudding-samples/tools/check-romance.cjs`

- 1600×900、1280×720、390×844：375 个封面节点、年份定位及比例、加入清单、封面信息、Escape 焦点恢复、CSV 内容包含原 ISBN、重载保留清单、清空、无页面横向溢出和脚本错误。
- 375 个不同原封面全部经过浏览器解码检查，尺寸有记录。
- 复查并修复宽屏末端不能对齐 2023 年的问题：添加末端滚动空间，年份不会被回判为 2022。
- 个人视觉查看桌面书架、手机完整页面与封面查看器。页面允许自然纵向滚动；年份滑块位于书架上方，完整比例图在下方。
- 所有自动尺寸检查采用 reduced-motion；默认浏览使用原生 smooth 水平滚动，减少动态偏好下直接定位。

证据：../../evidence/romance-candidate-checks.json 与 shots/。素材及上游组件哈希见 assets.json，准备脚本 tools/prepare-romance.py，原许可见 LICENSE.source。待用户 review，未入正式集合。
