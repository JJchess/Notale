# 年鉴里的发型年代

状态：pending-user-review；promoted: false。

原作：[The Big Data of Big Hair](https://pudding.cool/2019/11/big-hair/)，2019，分析与写作 Elle O’Brien，设计与开发 Jan Diehm。源码：[the-pudding/hairbook-viz](https://github.com/the-pudding/hairbook-viz)，commit `9e1f9bfc3014aae9ca5e39e7a55b8591d7b4a6e4`。完整 clone 保留在 `../../sources/hairbook-viz/`。

## 提取范围

原作趋势图与年代照片完整提取：1930–2013 全部 84 年、两组 168 条原趋势记录、九年代 × 两组 × 十张，共 180 张 256×256 原 PNG。保留原图像顺序、男女两条 Loess-smoothed median hair-density 曲线与填充区域。原视频和长篇方法展示未包含，页面提供原作链接及必要方法说明。

`vendor/line.js`、D3 5.11.0、两个 CSV、180 PNG 与上下箭头均原字节保留。图表本身原生是 SVG，没有用新 SVG 替换照片。原 National 字体及原网页 Typekit `hbu4hhn` 的 Cooper Black 也已本地保留，来源和 SHA-256 见 assets.json；保留字体来源 CSS 中的版权说明。源代码 LICENSE 不代表照片或字体另获开放许可，本地候选 review 与公开使用是不同范围。

独立原生 HTML/JS，无安装或构建步骤。继续运行原 D3 绘图，附加控制层取代仅鼠标 hover 的年份输入：年份滑块、九年代快捷键、可持续阅读的数值、触摸/鼠标定位、窗口尺寸重绘。年份限制到真实 1930–2013 范围，避免原 hover 越界查不到数据。

照片保持完整，点击打开原图、前后翻阅全部 180 张；支持左右键、Escape 和关闭后焦点恢复。手机仍按原作五列照片排布，未把照片缩成图标或重绘。查看器仅以浏览器缩放展示原 PNG，没有生成所谓“高清修复”。

## 方法范围

年份决定曲线上数值，照片按年代更新。照片由作者从接近该年代特征中心的候选中人工筛选，不是该年中位数所对应的个体。页面明确说明该区别。原研究的 male/female 标签只近似表达其数据集中的性别呈现，并非这些人物的自述身份；本地未对照片作新的个人属性推断。

## 亲眼复核

第一次原页只有一张照片且没有曲线，未当作合格渲染。重新等待 D3 图表完成后，亲眼查看了完整 1930s 两排照片（`../../evidence/big-hair/gallery.png`），以及 1985 年 hover 的曲线、读数和 1980s 照片（`1985.png`）。原作该点显示 Women 0.302 / Men 0.197，本地一致。

亲眼查看最终本地桌面 1985 全图、390px 手机 1985 全图及手机原图查看器。保留了原纸色、Cooper 标题、绿/蓝曲线与照片的影调。

## 验证

- `tools/check-hair-timeline.cjs`：1600×900、1024×768、390×844，每种尺寸遍历全部 84 年，对照原数值和年代照片路径；从原数据和坐标范围独立生成两条路径，与实际 SVG path 一致。
- 三种尺寸分别加载解码全部 180 张 PNG，均 256×256；年份键盘 Home/End、年代按钮、查看器前后/关闭/焦点、最右年份边界通过。页面无横向溢出，无 JS 错误。
- `../../evidence/hair-timeline-source-check.json`：188 个仓库原文件逐字节一致，另有一个原作 Typekit 字体；189 项哈希通过。
- 详细运行证据：`../../evidence/hair-timeline-candidate-checks.json`。

## 用户 review 重点

“年度曲线 + 年代照片”的组合是否值得作为时间索引样例；手机滑块、照片排布与原图查看是否符合使用需求。所有数据与照片均为原作历史研究内容。仅备选，不自动入库。
