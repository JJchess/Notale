# 一位歌手，多少种重复？

状态：pending-user-review；promoted: false。

原作：[Are Pop Lyrics Getting More Repetitive?](https://pudding.cool/2017/05/song-repetition/)，Colin Morris / The Pudding，2017。源码：[the-pudding/song-repetition](https://github.com/the-pudding/song-repetition)，commit `3e2682daf581f82741691257d0fe896b50298c8b`。完整 clone：`../../sources/song-repetition/`。源 MIT 文件保留为 LICENSE；D3 依赖许可见 THIRD-PARTY-NOTICES.txt。

## 范围与价值

抽取原作 Artist Discography 探索模块：461 位原索引歌手、6,919 条歌曲记录。每首歌一个带标题的圆点，与全数据集的镜像直方图、固定中位数比较；支持原歌手选择、随机选择与五个示例入口。显示标题、年份和压缩率，没有复制完整歌词。

背景 137 个原区间合计 14,760 首歌，原文概括为约 15,000 首。仓库有 569 个 discog JSON，全部原字节归档；可选列表严格沿用原 starmap 的 461 个名称，并未擅自扩大到未索引记录。资料为 2017 年原研究数据，不是当前完整作品目录。

## 保真与实现

沿用原 DiscogWidget / BeeswarmChart 的 D3 v4 力模拟、碰撞半径、标签换行、Viridis 色域、百分比转换、坐标范围扩展、>=40 首时高度扩展和原直方图。`common.js`、`starmap.js`、`histogram-data.js` 字节未改。横轴在原 rscore 上线性，标签为 `1 - 2 ** (-rscore)`；没有把非均匀百分比坐标改成均匀线性百分比轴。

此模块原生就是 SVG 数据图，没有使用照片或插画。这里继续运行原图表代码，未用 SVG 替换任何原栅格素材。原 Atlas、Canela、Publico 四个字体文件本地保留。

模块从旧文章构建环境拆出，保留可读源码、固定版本 package/lock、build.mjs 与已构建 app.js。独立运行无网络依赖。可用 `npm ci && npm run build` 重建。

修改：移除长文 ScrollMagic 联动；Select2 换成可搜索的本地歌手选择栏；悬停提示改为持续可见的详情栏，同时保留 hover 并添加点击/键盘；提供完整歌单列表。停止旧模拟、为异步数据请求加顺序保护，避免快速切换回写旧歌手。增加减少动态效果和窗口尺寸变化重建。

手机保留原移动圆半径 22px，将图表独立横滑，最小宽度 1000px；外围页面无横溢出。这样密集歌曲标签仍可阅读。桌面使用原 27px 半径。视觉沿用原白底、淡分布、深色标签描边与字体。

## 亲眼复核

- 原作实际正常渲染：`../../evidence/song-repetition/discography.png` 的 Gwen Stefani 全图；`rihanna.png` 的 Rihanna 切换与 Man Down tooltip（原作 29 点）。不是仅凭源码或搜索摘要判断。
- 已亲眼检查本地 `shots/1600x900-initial.png` 的整体图形与字体，以及 `shots/390x844-rihanna.png` 的手机图表和详情。初版搜索占位符误用了归档文件数 569，已改为实际索引 461。

## 验证

- `tools/check-artist-discogs.cjs`：1600×900、1024×768、390×844，分别真正加载绘制全部 461 位歌手 / 6,919 条歌曲，校验点数、有限坐标、原配色、137 个背景区间，无点超出纵向图幅。最大 Glee Cast 64 首。
- `tools/check-discog-interactions.cjs`：三尺寸下搜索、空结果、随机、示例、键盘详情、完整歌曲列表、请求竞态、手机横滑、页面宽度；普通动画收敛和桌面→手机重建通过。无 JS 错误。
- `../../evidence/discog-source-check.json`：576 个素材/数据文件与原来源逐字节和 SHA-256 一致；路径和摘要见 assets.json。
- 证据：`../../evidence/artist-discog-data-checks.json`、`../../evidence/discog-interaction-checks.json`。

## 用户 review 重点

“个体作品蜂群 + 总体镜像分布”是否适合作为独立比较样例；手机横滑与可展开的完整歌单是否便于使用。力模拟纵向抖动随机，位置并非每次截图完全一致；横向度量、原始数值、色域保持原逻辑。仅备选，等待用户决定。
