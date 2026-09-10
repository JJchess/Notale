# Walkachusetts · 路上的 72 个瞬间

状态：pending-user-review，promoted=false。仅进入备选库，等待用户最终决定。

原作：[Walkachusetts](https://pudding.cool/2025/10/walk/)，Russell Samora，2025-10。仓库 https://github.com/the-pudding/walkachusetts ，固定 commit 与素材 SHA-256 见 assets.json。

## 视觉筛选证据

亲自查看官网 TLDR 的出发、途中、后半程照片墙与随滚动推进的路线；切回 TEXT，检查照片旁栏与原手绘边框。原作图片点击未打开单张查看器，本 mini 的独立查看器是新增的阅读能力。

原作截图：../../evidence/walk/images-0.png、images-900.png、images-4500.png、text-1700.png。复现脚本 tools/review-walk.cjs、tools/review-walk-detail.cjs。初次自动点击了“Mostly images”说明文字而没有切换模式，随后改为实际 TLDR 按钮并重新采集；选取依据为切换成功后的黑底照片墙。

## 提取与保真

- media.csv 中 tldr_order > 0 的全部 72 项，按原顺序保留：58 张照片、14 段 MP4，无删减影像。出发准备 + 八天旅程。
- 照片墙使用官网原 640px WebP。查看器使用仓库原 JPG（例如 gear 960×1276），保留完整图片比例，不重绘、转码或添加黑白滤镜。视频原 MP4 与原 WebP poster 均逐字节复制。
- 保留每日原 WebP 插画及五张原 PNG 手绘边框。路线使用原作原生 route.svg，未用 SVG 代替任何照片或插画。
- 沿用 Tldr.svelte 的影像网格、Figure.svelte 的可见时播放/离开时暂停与边框、Sticky.svelte 的路线虚线长度揭示机制。用原生 JS 提取为独立页面。
- 手机回到与原作相同的单列照片墙，避免压小照片。桌面保留多列连续旅程。
- 新增每日跳转、独立单张查看、上一张/下一张、方向键、Escape 和返回时焦点恢复。查看器保留照片墙 DOM 与滚动位置。
- 原作完整长文不复制；每日为简短中文概述，可链接到原作对应一天。没有把此查看器称为原作 TEXT 全文模式。

## 数据与动态范围

每日步数取 copy.json 原 section.steps：42,090、42,090、39,560、35,420、47,150、43,700、40,250、77,740，总和 368,000。准备阶段为 0。

本 mini 按每日卡片在文档中的位置，在对应步数区间内插值。顶部明确标记“阅读位置估算”；不是照片拍摄时刻的 GPS 位置或逐照片的真实累计步数。与原 TLDR 全页面线性插值不同，按天跳转也会进入相应的步数区间。

默认只播放可见的静音视频；离开视口、页面隐藏或打开查看器时暂停照片墙视频。全局可暂停；prefers-reduced-motion 默认暂停。查看器里的视频由用户单独点击原生控件播放。

## 验证与限度

- `node experiments/pudding-samples/tools/check-walk.cjs`：1600×900、1280×720、390×844；72 项/14 视频、原 JPG 查看、键盘前后切换、Escape 焦点恢复、第二天跳转区间、动态播放/暂停、reduced-motion、终点 368,000 与返回 0、图片错误与横向溢出检查。
- `node experiments/pudding-samples/tools/check-walk-media.cjs`：144 个不同图片资源均浏览器解码成功，14 视频均读取到有效时长与尺寸。另有可见视频实际播放时间推进检查；未逐帧比对全部视频。
- 个人查看桌面照片墙、原 JPG 查看器、手机 DAY 2 单列画面及边框加载后的截图。截图等待查看器内全部图片解码，防止未加载的装饰边框被误当作最终状态。
- 159 份原素材逐字节哈希核对；原仓库保持干净。准备脚本 tools/prepare-walk.py。
- 视频、相片按可见范围加载；素材约 50 MB，首屏无需下载全部 MP4。运行完全本地，不依赖原站或 CDN。

截图在 shots/，检查结果在 ../../evidence/walk-candidate-checks.json 与 walk-media-checks.json。新增原生 JS/CSS 属于样例提取；原素材及上游代码许可证见 LICENSE.source。
