# 一张地图，51 条不同的路

状态：**pending-user-review / promoted: false**。只放备选库，等用户统一 review。

原作：[The United States of Abortion Mazes](https://pudding.cool/2024/10/abortion-mazes/)，Jan Diehm、Michelle Pera-McGhee，插画 Maria Scherlies。完整浅克隆 [the-pudding/mazes](https://github.com/the-pudding/mazes)，提交 `4bfd954b3532d0eacff03195f3da234e115f3ac9`。

## 原作视觉与操作复核

亲自查看原作六人故事选择卡、California / Billie 的开始状态及开始后的迷宫。原人物 PNG 与州迷宫底图叠合，正文随迷宫路径推进；深浅紫、橙色控制器、Canela 与 National 字体是视觉核心。见 [故事选择](../../evidence/abortion-mazes/selection.png)、[原作实际开始](../../evidence/abortion-mazes/billie-playing.png)。

原站一次重访发生样式/图片未加载，另一次受持续跳动按钮影响而等待超时；最终使用浏览器 reduced-motion 偏好，确认原样式和 PNG 解码后成功点击 start。向下键被起点墙挡住，圆点仍在起点，不能把这张截图说成已经前进。

亲自查看本地桌面迷宫、完整州地图与手机行进状态。迷宫尺寸、墙线、紫色路径、故事卡片和手机四向按钮来自原组件；六张人物插画继续用原 PNG。

## 抽取范围与实现

- 整体保留 **51 个州及特区迷宫、四种地图排序、六个人物故事、政策说明、方法论及原活动册 PDF**，去掉前置长滚动历史导入和站点页尾，换成独立入口。
- 使用原 Svelte 3 组件构建为静态 HTML/CSS/JS。`Walls.svelte`、`Path.svelte`、故事卡片、数据加载与筛选、移动和完成判定继续运行原源码，不用另一个简化迷宫生成器。
- 原迷宫本身是数据 SVG，保留原 SVG 生成方式；原人物及州迷宫缩略图本身是 PNG，完整复制，没有改画成 SVG。
- 保留全部静态资源：58 PNG、3 JPG、51 份迷宫 CSV、原 PDF，加本地化四个原字体文件。数据与复制的原资源共 122 项有哈希清单。
- 原 `Complete maze` 展示预计算答案，不写入用户完成记录；亲自走到终点才计入。存档仍包含完整路径，键名增加当前 mini 前缀，避免和其他样本冲突。
- 补充 Escape 关闭、dialog 语义、手机方向键名称；修复原 Modal 把 `#ca` 错写为 `#ca-state` 导致的焦点恢复失败。
- 新增入口及弹窗内 **2024-10-17 原作政策快照** 标注。保留历史原文与数据，不将其描述为当前法律/医疗信息。
- 原个人故事说明仍保留：由实际报道改编，部分身份细节经过修改。没有将故事改编为现实中的人物档案。

## 验证与边界

`node experiments/pudding-samples/tools/check-state-mazes.cjs`

1600×900、900×900、390×844：51 个州入口、六人原图解码；阻挡非法向下移动；使用真实键盘/手机按钮沿 California 原解答走过 17 个单元格；完成计数、完整路径存档、重新打开恢复；Alaska 自动展示答案不计数；Escape 关闭；无 JS 错误、无页面横向溢出。

`node experiments/pudding-samples/tools/check-all-state-mazes.cjs`

逐个实际打开全部 51 个迷宫，检查墙线 SVG 与所有州缩略图；四种排序仍各含 51 项；122 项原素材/数据哈希一致。另从原 CSV 核对全部 51 条预计算解答，相邻格之间没有穿墙。不是把一个小迷宫的通过推断为全部迷宫都通过。

最终手机日期样式调整后单独复核：伪元素 top=4px，不与原标题相撞；Escape 后焦点实际回到 `ca` 州入口。截图来自真实浏览器，不是生成效果图。

结果：[交互](../../evidence/state-mazes-candidate-checks.json)、[全部州与原素材](../../evidence/state-mazes-all-checks.json)、[资产](assets.json)。人工通关的浏览器覆盖是 California；其他州的验证覆盖加载、数据/解答有效性与原绘制，并未声称人工逐一走完 51 州。

## 运行和构建

直接从备选库 HTTP 预览打开 `index.html`，无远程数据依赖。重新构建：在本目录 `npm ci` 后运行 `npm run build`。源组件、固定依赖锁文件与构建脚本均保留。

原仓库许可全文为 `LICENSE.source`；构建依赖许可收录于 `vendor-licenses/`。字体来源沿用上游 CSS 指向的 Pudding 地址。插画、文本、数据出处与原作署名保留，当前用途为本地研究和用户 review。
