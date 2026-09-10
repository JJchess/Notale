# 一队，几种颜色？

状态：pending-user-review；promoted: false。

原作：https://pudding.cool/2024/10/nba-uniforms/ 。完整源码浅克隆：`../../sources/nba-uniforms/`，https://github.com/the-pudding/nba-uniforms ，commit `98216c30a7b4078aaadbc6bd27df2b207d15ec7f`。

## 视觉研究与提取范围

亲自查看原作 `../../evidence/nba-uniforms/original-5500.png` 的四种球衣、木地板与球场排版，以及 `original-8000.png` 的赛季对照。进一步定位全联盟版本穿着表、点击 City，并查看 `compare-city.png` 和后续稳定截图；初次截图拍到重排中的重叠行，不以此宣称最终排序正确。

提取 `TeamCompare.svelte` 对应的五版球衣及全联盟比例表。研究 `Graphic.svelte` 的场次聚合、`getTeamCode.js` 与球队数据映射、选定球队置顶和其余队按所选版本降序。没有把整篇比赛图、2013 年对照或地理自动选队加入这一独立样例。

本地保留 30 队、完整 1,231 条比赛记录、全部 126 张原 PNG 球衣及 blank 占位原图（包含在此数量内），以及原木地板 JPG。总计 127 张图片和 2 个原 JSON，共 129 个逐文件哈希项目。图像直接复制、不转码、不重绘；柱图沿用原作 CSS 条形视觉，不用 SVG 替代球衣。插画署名 The Basketball Jersey Database / Abram Baclagon，保留上游 LICENSE；署名不表示取得额外商业授权。

独立中文页面用原始比赛逐队计算比例，仍取整到整数百分比；增加每队场次数、原图详情、表格按钮键盘操作，移动端保留完整五列并允许表内水平滚动。球队切换后置顶，五列降序重排有位置过渡，reduced-motion 下关闭过渡。浏览器默认字体取代原文的展示字体；图片、数据和图表尺度机制没有简化。

## 明确修正的一处上游聚合问题

`Graphic.svelte` 把 `City Edition 2` 查询放在 `data1314`（旧赛季），但当前 `all-games.json` 的真实标签是 `City 2 Edition`。2024-02-08 湖人主场对掘金这一条因而未进入原版 TeamCompare 分母。mini 将此条归入 City，并在详情展示仓库中的 `LAL_kobe.png`，保留通常 City 原图与这一场的区别。

原在线湖人值是 `[26,48,16,11,0]`；mini 场次数 `[21,39,13,10,0]`，总数 83，百分比 `[25,47,16,12,0]`。源数据包含季中锦标赛决赛，所以湖人和步行者各 83 条、其余各 82 条，总球队出场记录 2,462。没有擅自把赛季总数硬编码为 82。

## 复核与证据

`node ../../tools/check-jerseys.cjs` 读取在线原作 30 队实际显示百分比，存入 `../../evidence/nba-uniforms/source-percentages.json`。在 1600×900、1280×720、390×844 三种视口验证：29 队五项百分比全部相同；湖人修正计数与原记录一致；30 队逐项切换并解码五个预览；五列全部降序、选定球队固定置顶、点击行切队、键盘详情/Escape、湖人两图详情、无页面异常和页面水平溢出。手机比较表本身有横向滚动。

全部 129 个文件逐字节和 SHA-256 对照克隆原件通过；浏览器完整解码全部 127 张图片。结果：`../../evidence/jerseys-candidate-checks.json`。

亲自查看本地桌面完整初始图和 390 宽湖人 City 双图详情：球衣保留号码、纹理、标记，木地板保持原照片。`shots/` 保存三种尺寸详情和排序后的页面。自动检查在 reduced-motion 环境执行，不声称逐帧验证所有浏览器的重排动画。
