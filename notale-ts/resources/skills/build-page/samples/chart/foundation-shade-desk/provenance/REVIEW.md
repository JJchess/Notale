# 不只是色号的数量 · Foundation Shade Desk

状态：**pending-user-review / promoted: false**。只进入备选库，等待用户统一 review。

原作：[Beauty Brawl / The Diversity of Makeup Shades](https://pudding.cool/2018/06/makeup-shades/)，Jason Li（故事与插画）、Amber Thomas（代码），Divya Manian 协助。完整浅克隆 [the-pudding/makeup-shades](https://github.com/the-pudding/makeup-shades)，提交 `e672acb1a18752b6c855394bb29598ed5d08962d`。

## 原作视觉及实际操作

第一次在线访问的图表没有正确加载，只能看到重叠文本，未据此通过视觉审核。重访等待网络请求完成后看到正常 US Bestsellers 色块图；随后点击 Count 与实际可见的 Fenty 开关，确认计数和对照列。亲自查看 [原色块图](../../evidence/makeup-shades/us-retry.png) 和 [原数量＋Fenty](../../evidence/makeup-shades/us-count-fenty.png)。原 checkbox 是隐藏控件，最终通过点击可见 slider 完成操作。

值得抽取的是“真实色号 → 明度区间 → 数量”的转换，以及品牌列与 Fenty 的共同基准。实物粉底瓶加手绘拳击肢体的原拼贴，是视觉组成部分，不能以重画图标代替。

亲自查看本地桌面完整数量图和手机 Japanese Bestsellers 横向浏览状态，保留原物品拼贴、斜排品牌标题、原色块、计数格与蓝色 Fenty 标记。

## 保留的完整模块

- 直接运行原 **`src/js/pudding-chart/brawl.js`**，文件字节不变。继续使用其原 D3 4.12.0 + Jetpack 文件，未改写明度图绘制或用虚构数据替代。
- 提供原 brawl 模块的六个组：美国畅销、BIPOC 推荐的白人创始人品牌、BIPOC 创始人品牌、尼日利亚、日本、印度。两类创始人组仍分开选择。
- 原 CSV 共 **625 行**完整保留；本模块用到其中 **585 行**（包含反复参与比较的 40 条 Fenty）。另 40 条 Make Up For Ever 属于未抽取的前置 head-to-head 动画，不冒充已经迁移。
- 字典解析、原 HEX、原 L 值和十个分箱保持。原 JS 将空 H/S/V 字符串用一元 `+` 转为 0；本地预处理也按相同规则，不擅自填入推测值。原 L 与 HEX 均没有空值。
- 原绘图按产品色号总数降序；色块数量与 count 数值来自相同 bin，计数背景仍是原 `rgba(252,203,49,count/18)`。
- **5 张完整原 JPG**：round12、round13、round21、round22、round23；对应各原章节，两类 BIPOC 组共用原 round13。未裁剪、重绘、生成或替换成 SVG。
- Nunito 300/400/700 来自原 Google Fonts 请求的同一字体家族与字重，已本地化；原 brawl Stylus 规则编译保留，xx-small=11px、small=14px 与原变量一致。

## 独立交互

原色块/计数切换和 Fenty 开关继续生效；去掉长滚动叙事触发，让用户直接控制六组切换。增加区间的鼠标和键盘详情，可查每条原 HEX/L 值；空区间明确显示无原色号。原实物拼贴可打开查看。

手机品牌列单独横向滚动，左侧明度标签保持位置。隐藏 Fenty 时其宽度为 0、内部区间不进入 Tab 序列；展示后恢复。保留原采样时点 **2018 年 5 月**，并保留“网站色卡明度只是粗略比较，未测上脸变化”的方法边界。

## 验证

`node experiments/pudding-samples/tools/check-foundation-desk.cjs`

在 1600×900、900×900、390×844 下遍历 **6 组 × 2 种显示方式 × 2 个 Fenty 状态**，逐产品、逐明度区间核对原色块 HEX、数量和可见显示方式；全部原拼贴图解码。验证区间点击与键盘 Enter、Fenty 80–90 的 8 个色号、90–100 的 4 个色号、原图查看、无横向页面溢出与 JS 错误。原素材/源码哈希逐项一致。

另逐一核对原 625 行 HEX、L、分箱，与预处理数据完全相同。最终手机布局修正后单独检查：Fenty 隐藏列实际宽度 0；Japanese 品牌列滚动 180px 后，明度标签 x 坐标不变，页面无横向溢出。

证据：[全部组合](../../evidence/foundation-desk-candidate-checks.json)、[原数据](../../evidence/foundation-desk-source-data-check.json)、[素材清单](assets.json)。在线原 US 计数中的 Fenty 分箱为 `[0,0,1,4,4,5,7,7,8,4]`，本地相同。

## 运行与来源

直接通过 HTTP 打开 `index.html`，不需要构建或远程数据接口。原 brawl JS、D3 文件、Stylus 和数据加载源码在 `vendor/`、`upstream/` 中；原 CSV 在 `assets/data/`。上游许可保留为 `LICENSE.source`，素材来源和哈希在 `assets.json`。原图及作者署名保留，当前用于本地研究及用户 review。
