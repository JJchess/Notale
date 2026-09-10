# 历史看起来有多远？

状态：pending-user-review；promoted: false。

原作：[This is an experiment about how we view history](https://pudding.cool/2020/10/photo-history/)，Matt Daniels、Jan Diehm，2020。源码：[the-pudding/photo-quiz](https://github.com/the-pudding/photo-quiz)，commit `6d012be7853337b199d3a7ec9d7a8557204343f5`；完整 clone 保留在 `../../sources/photo-quiz/`。

## 模块与范围

保留五题照片年代判断、随机照片和色彩版本、随机起点年份滑块、五格回答记录；完成后可查看全部十张照片的彩色/黑白对照、真实年份、自己的猜测、两组读者平均值、每组最后 100 个原答题点，以及黑白版本被估计更老/更新/相同的结论。可重新开始、查看大图、通过键盘操作。

10 张照片、20 个原 JPEG 文件按原字节保留。黑白图是作者提供的 Photoshop 去饱和与暖色滤镜版本，没有使用 CSS grayscale 重做，也没有替换或生成新图。照片说明、年份、alt 和来源链接来自完整 photos.csv。真实年份使用 CSV，符合原作 init() 对初始硬编码 actualDates 的覆盖逻辑。

原 noUiSlider 14.2.0、橙色年份手柄、白色相框、深蓝/橙/灰统计色、National 字体保留。独立页面将原 Swiper/GSAP 长文流程改成五题状态与可切换结果；去掉研究用出生年份采集和服务器提交。答题仅存在本页内存中，刷新或重新开始会清空；没有声称保存到研究数据库。原长文引言动画和实时后台不属于此 mini 的提取范围。

## 读者数据

公开原数据 `https://pudding.cool/2020/10/photo-quiz-data/output.csv` 于 2026-09-07 留存完整快照：126,900 行，字段仅 color/id/selected。原字节保留为 assets/reader-snapshot.csv，来源和 SHA-256 见 assets.json。

使用原作年份映射（selected < 20 加 2000，否则加 1900）、平均值向下取整、原文件顺序最后 100 个点、1920–2020 结果坐标。data.json 是这份快照的无损元数据与派生统计，不是模拟人群。原作说明该公开结果来自其筛选的研究参与者；本地不重新推断参与者身份。页面明确标注快照日期，不冒充实时统计。

结果布局保持每个版本一张照片、一条完整刻度和 100 个点；数值移到图下避免标签叠压。手机按行展开，保留所有点和图片。原图查看器只让浏览器显示原文件，没有所谓高清修复。

## 视觉复核

已实际打开原作并亲眼查看入口、第一题完整照片/滑块（evidence/photo-history/question.png），以及完成五题后的原结果行（results.png）。复核时阻断 Firebase 写入通道，测试回答没有提交给原研究。

原结果中 Rosa Parks 照片为 1976 年，彩色平均 1967、黑白平均 1966；本地快照复现相同结果。已亲眼查看本地桌面结果、最终手机问题页及完整手机结果页，两版照片、分布和说明均可正常阅读。图片原貌与两套独立文件保留。

## 验证与来源

- `tools/check-photo-history.cjs`：1600×900、1024×768、390×844，真正用键盘改变滑块并完成五题；无重复照片，答案均为真实年份；全部十张结果、二十个版本解码、每组 100 个点、平均值/实际年位置、查看器与焦点、重新开始通过。没有外部请求、JS 错误或横向页面溢出。
- `../../evidence/photo-history-source-check.json`：23 个仓库原文件逐字节一致；独立重算全部 20 组的样本数、平均值和 last100，与显示数据一致。
- `../../evidence/photo-history-candidate-checks.json` 为运行记录，assets.json 为图片、字体、原 CSV 和读者快照来源。
- 源 LICENSE 和 noUiSlider LICENSE 文件保留。照片分别来自 Library of Congress、NASA、Lincoln University、Getty 等；源代码许可不替代照片与字体的许可范围，仅本地候选，未公开发布。

## 用户 review 重点

随机色彩条件下的年代判断，加上同图双版本与真实人群分布，是否值得收为一个完整的实验样例；手机结果逐行阅读是否方便。全部保留原素材，只待用户入库决定。
