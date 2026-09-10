# 填字里，你先想到谁？

状态：pending-user-review；promoted: false。

原作：[Play These Puzzles to Reveal the Racial and Gender Breakdown of Crosswords](https://pudding.cool/2020/11/crossword-puzzles/)。作者 Russell Samora、Michelle Pera-McGhee、Amelia Wattenberger。源码：[the-pudding/crossword-puzzles](https://github.com/the-pudding/crossword-puzzles)，commit `552aa705a9a08ee48e06724921dba83ec8b6f968`。完整 clone：`../../sources/crossword-puzzles/`。

## 完整模块

保留全部 13 套原 mini（五家出版物的 2020 年数据、NYT 八个年代），130 条原线索、答案、坐标及人物分类。原 Play.svelte 与原版本 `svelte-crossword@0.3.4` / `svelte-keyboard@0.2.0` 继续运行；保留线索跳转、横竖方向、自动移格、删除、撤销/重做、Clear、Reveal、Check、完成反馈、统计揭示及两类高亮。

棋盘本来就是原生 SVG，格子交叉分类使用原作的对角纹理图案。未替换任何原栅格图像。原 National 字体、global.css、reset.css 与全部题目 JSON 按原字节保留；来源和 SHA-256 见 assets.json。字体文件保留源版权说明，公开使用须另行确认相应权利；当前仅本地候选。

去掉长文入口与追踪、页尾推荐；两个集合改为一次显示一组，所有原题仍可选。新增选择器及格子可访问名称、线索前后按钮标签、Escape 返回选题、完成提示的焦点处理。窄屏显式启用原屏幕键盘。减少动态效果时缩短逐格揭示延迟；原组件仍有短暂淡入淡出。

可独立离线运行，已有构建产物。`npm ci && npm run build` 重建；entry.html 是源码入口，index.html 是生成后的静态入口。Svelte 3.59.2、Vite 4.5.14、组件版本与 lockfile 固定。MIT 文件与两个组件许可证保留。

## 已核实的数据修正

配套源码 `nyt1970s.urm` 写成 91%，同时 `white` 也为 91%。本地将该字段修正为 9%，并在选择此题时标明原因。依据是原主文的实际图表：选择 1970，显示 91% non-Hispanic white / 9% minoritized racial groups；已亲眼复核并保存 `../../evidence/crossword-puzzles/main-study-1970s.png`。未凭猜测补数；原 loadData.js 另存 upstream/loadData.js，全部题目文件未改。

统计属于 2020 年研究快照。每题十条线索，原作者把总体比例四舍五入到 10% 来构造题目，所以题内实际人数不等于总体精确比例。页面明确说明该方法。

## 视觉 review 与验证

亲眼查看正常原作棋盘、揭示答案和蓝色人物分类高亮，证据为 `../../evidence/crossword-puzzles/publications.png`、`revealed.png`。最终本地桌面高亮全图、手机初始棋盘与原屏幕键盘也已亲眼复核。

- `tools/check-crossword-representation.cjs`：1600×900、1024×768、390×844，分别逐套检查全部 13 题；从原答案坐标独立构造格子映射，校验每个揭示字母和交叉答案一致性；两类高亮、错误检查、Clear、实际键盘填完 LA Times、完成反馈、Escape、无横溢出与无 JS 错误通过。
- `tools/check-crossword-touch.cjs`：真正启用 touch/mobile 环境，用原屏幕键盘逐字触摸输入 ESAI，通过。
- `../../evidence/crossword-source-check.json`：19 个原素材/数据文件逐字节及哈希一致，13 题、130 条线索。
- `tools/check-crossword-normal.cjs`：普通动画模式下撤销/重做、完整揭示动画及 Escape 关闭完成提示通过，见 `../../evidence/crossword-normal-check.json`。
- 检查记录：`../../evidence/crossword-candidate-checks.json`、`../../evidence/crossword-touch-check.json`。

## 用户 review 重点

这套“先玩题，再看人物构成”的揭示方式是否值得入库；手机线索栏、屏幕键盘和两类交叉高亮是否满足使用需求。所有题目与统计均是原作的历史样本，未更新成当代出版物结论。仅备选，不自动入库。
