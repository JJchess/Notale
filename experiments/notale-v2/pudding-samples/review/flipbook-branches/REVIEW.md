# 同一个起点，四种后来

状态：pending-user-review；promoted: false。

原作：https://pudding.cool/projects/flipbook/ 。源码：https://github.com/the-pudding/flipbook ，commit `45b0e5a95c0207c9838fd3c079520afaf52a361e`，完整浅克隆位于 `../../sources/flipbook/`。

## 提取范围

原作第二个实验的四路同步逐帧对照：6 个起点 × 360 帧，共 2,160 张 640 × 640 原 PNG（28,359,921 字节）。每张 PNG 本身含四个独立分支，直接复制 `static/assets/animations/`，不重绘、不裁切、不转码、不抽帧。`assets.json` 逐项记录源路径、大小与 SHA-256。保留上游 MIT 文件；原绘画归属不因提取改变。

研究了 `src/components/Scrub.svelte` 的六项映射、五位帧索引、原 PNG 呈现、十字分隔和预载流程，以及 `src/data/copy.json` 的实验说明。原作提供手动 scrub；mini 保留六项与全部帧，重排为独立中文阅读界面，增加播放/暂停、前后逐帧、回到起点、6/12/24 fps。默认 12 fps 按 360 帧 / 原文 30 秒推算，是新增播放器配置，不是声称上游存在播放实现。

默认暂停，包括 reduced-motion 环境；切换起点保留当前帧；最后一帧停住，再次播放从头开始；页面隐藏暂停。加载完成后才同步更新画面与计数，版本号排除过时请求；只保留最多 60 个解码缓存条目，向前预载 8 帧。网络慢时允许播放减速以保留每一帧。原作长视频、投稿后台和其他实验不属于此独立模块。

## 视觉与功能复核

原作截图在 `../../evidence/flipbook/`；原始页面初次检查观察到四路线条与拖动末帧后的形态变化。初版批量截图只等待固定时长，不能把文件名当作画面已更新的证据。补查等待页面 hydration 后选择 Fish，再等待原图 URL 为 `4/00359.png` 且实际加载完成；亲自查看 `fish-verified.png`，确认原作第 360 帧四路鱼形已演变成不同轮廓。

亲自查看本地 1600 宽初始图和 390 宽 Texas 后期图：保留原手绘轮廓、四格比例、完整图像；手机为自然纵向阅读，无水平溢出。截图在 `shots/`。

`node ../../tools/check-flipbook.cjs` 验证 1600×900、1280×720、390×844 三种尺寸：六组末帧、实际播放推进、暂停稳定、复位、End 与 ArrowLeft 键、无页面异常和水平溢出；浏览器实际解码全部 2,160 张 PNG。逐文件比对克隆原件和清单哈希全部一致。结果在 `../../evidence/flipbook-candidate-checks.json`。没有声称肉眼逐张审阅全部帧，也没有保证所有设备恒定播放帧率。
