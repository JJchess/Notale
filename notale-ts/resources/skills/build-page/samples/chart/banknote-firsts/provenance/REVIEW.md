# 纸币上的「第一人」

状态：**pending-user-review / promoted: false**。只在备选库，等待用户统一 review。

原作：[Who’s in Your Wallet?](https://pudding.cool/2022/04/banknotes/)，Alejandra Arevalo、Eric Hausken，代码 Jeff MacInnes。完整浅克隆 [the-pudding/banknotes](https://github.com/the-pudding/banknotes)，提交 `5e742abe8c8fe067ef3afc0ef58a55f6ede573b4`。

## 实际视觉复核

实际打开原站，查看五张票面轮播所在段落及 Notable “Firsts” 图表。悬停第一个矩形后，亲自看到 Manuel Belgrano 的原纸币肖像、Argentina 与 “Designed first Argentine flag” 说明。见 [原图表与票面](../../evidence/banknotes/firsts.png)、[实际悬停](../../evidence/banknotes/first-hover.png)。

原作的每人一格、女性黄色/男性深红、国别行和纸币肖像很适合独立浏览。亲自查看本地桌面首屏、完整图表与手机图表；字体、颜色、人物与原始票面保持可辨认，并保留全文说明。

## 数据与素材保真

- 保留 Firsts 模块全部 **71 条人物记录、32 个国家**。原数据转换先映射 profession/name/gender/country/imgBase/knownForBeingFirst/hoverText，再按完整字段去重，仅取 knownForBeingFirst，按原国别出现顺序、女性在前排列；本地逐项和顺序完全相等。
- **39 张原 300px WebP 肖像**。其余记录在原作 hasPortrait=false，不显示肖像；没有画替代头像，也没有用未知头像去填空。
- 保留相邻原轮播的 **5 张原 JPG 票面和完整原说明**：NZD 5、NGN 1000、CLP 5000、JPY 5000、RSD 10。源文件本身宽 300px，清晰度如实保留，没有生成补细节或假装高分辨率。
- 继续用原 Baloo Bhai 2、Abhaya Libre 字体与 `#FDFEF0` 底色、`#F6D251` 女性色、`#81170E` 男性色。复制 49 项原素材/源数据/字体并保存哈希。
- 原 Firsts 图表是 SVG 矩形与文本；mini 用等宽 DOM button 格子实现相同一人一格、最大五格的结构，以增加键盘操作。原 WebP/JPG 图像始终作为真实图像使用，没有 SVG 图像替代。

## 独立交互与边界

桌面悬停、聚焦或点击读详情，详情栏在滚动时保持可见；手机点击定位详情，并有“回到所选人物的矩形”。窄屏禁用鼠标悬停切人，避免滚动过程中经过其他矩形导致详情被误换；最终实际确认滚动后仍是所点 Manuel Belgrano，返回焦点仍为第 0 条。增加性别筛选、国家/姓名检索、空结果与重置，筛选后仍保持固定五格基准。

纸币轮播保留三秒播放、前后切换和横向指针滑动，增加暂停和查看原图。减弱动态偏好下默认暂停；打开图像或手动切换时暂停，页面隐藏也暂停。原生图片拖拽会截走指针事件，已禁用图片拖拽并捕获指针，使滑动切换不会误开原图。

这是完整 Firsts 模块加它相邻的五图轮播，没有声称移植职业、面值或发行年代的其他图表。人物分类、成就定义和词句沿用 2022 年原研究，页面注明数据范围与历史快照，不外推到当前全部流通纸币。

## 验证

`node experiments/pudding-samples/tools/check-banknote-firsts.cjs`

1600×900、900×900、390×844：71 个条目逐个通过真实 DOM 聚焦检查姓名/国别/全文及肖像缺失状态，39 张原肖像全部解码；五张票面和详情图像逐张解码并核对原说明；15 条 Female 过滤、Australia 三条、空结果、重置、手机回到矩形；没有页面横向溢出或 JS 错误；原素材 SHA-256 与克隆一致。

`node experiments/pudding-samples/tools/check-banknote-carousel.cjs`

真实计时检查三秒自动切换、暂停冻结、鼠标指针横滑换图且不误开 dialog。指针滑动测试覆盖同一 Pointer Events 路径，未把桌面自动化声称为实体手机测试。

证据：[逐项检查](../../evidence/banknote-firsts-candidate-checks.json)、[轮播](../../evidence/banknote-firsts-carousel-check.json)、[原数据变换](../../evidence/banknote-firsts-data-check.json)、[原素材清单](assets.json)。

## 来源记录

仓库没有 LICENSE，具体记录见 [SOURCE-NOTICE.md](SOURCE-NOTICE.md)，未虚构 MIT 授权。完整原数据、文稿和颜色文件在 `upstream/`；图像与字体来源均记录。无需构建或远程接口，使用 HTTP 直接打开 `index.html`。
