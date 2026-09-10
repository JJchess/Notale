# Menu reading room · 待用户 review

来源：[A History of Menus is a Menu of History](https://pudding.cool/2026/06/menu-story/)，Stephen Lurie / The Pudding。源码提交 `c652bc855acdeba393f9fe1962070daf74645098`，已完整 clone 到 `sources/menu-story`。

## 原作视觉检查

实际打开官网，通过方向键沿横向阅读流程检查第 0–8 页，另等待第 7 页的慢速聚焦结束后再截图。看过[原作桌面拼贴](../../evidence/menu-story/page-1.png)、[多张档案对照](../../evidence/menu-story/page-3.png)、[完整菜单](../../evidence/menu-story/page-8.png)、[汤品聚焦](../../evidence/menu-story/soup-focused.png)。加载失败的是另一个 `menu-collection` 页面，不能混为这个故事也不可用。

纸张边缘、丝织纹理、污迹和古典印刷直接承载史料感；原作以纸面相机移动揭示字词，配以原手指 PNG。这个机制值得独立保留，不应把扫描件 OCR 后排成普通卡片。

## Mini 范围与保真

取原数据 slides 7–9：Astor House 1854（丝织菜单）、Manhattan Club 1866、Delmonico’s 1881。保留原 PNG/WebP 完整扫描与原 `pointer.png`，共 4 个未修改位图，SHA-256 见 [assets.json](assets.json)。原注释焦点来自 `copy.json`，位图变换参考 `SwiperStory.svelte` 的 `soupSlideXform`。

三张总览 → 单张阅读 → 汤品聚焦，始终使用同一批图片 DOM。原长故事的十道菜压缩为一个主题的三张档案；非重做原整篇文章。检视器能以原图放大、拖动、键盘平移、恢复适配和 Escape 关闭，关闭后恢复触发按钮焦点。减少动态效果时立即落在目标视图。初版矮屏注释按钮与底部导航重叠，已实机发现并修复。

上游没有启用外部字体，其样式以系统 serif/monospace 为主；mini 同样本地运行。没有生成图片、SVG 替代扫描件或截图式伪交互。

## 验证

浏览器覆盖 1600×900、1280×720、390×844 的三张菜单、聚焦、放大、拖动、复位、关闭、键盘翻页、reduced motion，禁止非本地运行时网络。结果见 [menu-candidate-checks.json](../../evidence/menu-candidate-checks.json)。已人工查看三尺寸的总览与核心阅读/聚焦画面、原图检视器。

[打开 mini](index.html) · [总览](shots/1600x900-overview.png) · [聚焦](shots/1280x720-focal.png) · [手机](shots/390x844-overview.png)

归类建议：page/general，档案原图与局部证据叙事。待用户统一 review，未正式入库。
