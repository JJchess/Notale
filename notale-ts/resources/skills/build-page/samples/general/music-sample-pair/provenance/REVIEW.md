# 听见同一条低音线

状态：**pending-user-review；promoted: false**。只进入备选库，等待统一 review。

原作：[How Sonic DNA Connects Generations of Music](https://pudding.cool/2025/04/music-dna/)，Stephen Lurie / Jared Whalen。源码：[the-pudding/sample-trees](https://github.com/the-pudding/sample-trees)，完整浅克隆固定在 `6a75bcb013e215739f3955878bcd0b87232bd6f7`。

## 实际视觉复核

实际打开在线原作，等待水合后点击 Begin，推进正文。亲自查看首屏及 [两首歌对照的浏览器截图](../../evidence/music-dna/slide-2.png)：上下排列的原封面、黄色与绿色真实波形、两者间的渐变连接条及金属样式指示器。这一段完整表达声音继承关系，值得独立抽取。原作播放器 currentTime 实际推进过；没有把自动播放测试描述成人耳听音质。

亲自查看本地 1600 宽 B 暂停状态与 390 宽完整页面截图。保留唱片纹理、完整封面、原噪点 PNG、奶油色底色和上下对照结构；移动端纵向阅读，没有压缩成装饰缩略图。控制区由独立样本补充。

## 源码研究与抽取边界

- `src/components/Flow/Node/Node.CoverArt.svelte` 使用 `cover_art_jpegs/{id}.jpeg`。逐字节复制原作实际使用的两张 JPEG；没有用 SVG 或生成图替代。
- `src/components/Flow/Edge/Edge.Waveform.svelte` 使用 WaveSurfer，归一化真实解码波形，原颜色与 28px 绘制高度。沿用锁文件中的 **wavesurfer.js 7.8.8**，本地 vendored ESM，不依赖 CDN。
- `Edge.svelte` 在滚动进度 0.5–0.75 播上端、0.75–1 播下端。`Edge.Crossfade.svelte` 是视觉指示器，源码并不同时混合两段音频。mini 保留单一发声播放器，将滚动触发改为 A→B 顺序试听及单段按钮；不提供虚构混音。
- 源 `samples.csv` 的 link `88888888057`：parent `252744`（Under Pressure，1981），child `243164`（Ice Ice Baby，1990）。两段沿用 edge-specific MP3；不是另一个同 ID 长音频。
- 两段文件实际解码时长 **7 / 8.5 秒**；B 的 CSV 人工时间标签与文件长度不同，保留原音频，不按不一致标签再裁剪。
- 完整 mini 范围是这一对歌曲的比较。没有把整个音乐谱系、其他歌曲、滚动叙事宣称为已迁移。
- 新增：暂停/继续、顺序试听、回到开头、波形点选、键盘滑块定位、页面隐藏时暂停。默认暂停，由用户点击开始。顺序播放最后一段结束后停止。
- 复用 WaveSurfer 已载入的 Blob 供单一 Audio 播放，避免简单静态服务器不支持 HTTP Range 时 seek 回到 0。两条 WaveSurfer 自身始终不播放。

## 验证

`node experiments/pudding-samples/tools/check-music-pair.cjs`

1600×900、900×900、390×844：原图完整解码、真实波形解码长度与时长、初始暂停、播放时间推进、暂停冻结、定位、A→B 自动切换、B 自然到达终点停止、单段切换、仅一个发声播放器、重置、波形点击及键盘定位、无横向溢出、无 pageerror。见 [检查结果](../../evidence/music-pair-candidate-checks.json)。原作素材逐项 SHA-256 与克隆文件一致，字体来源与哈希也记录在 [assets.json](assets.json)。这些验证不替代人工音质试听。

## 来源与许可记录

上游仓库附 MIT LICENSE，原文保留为 `LICENSE.source`；WaveSurfer 的原许可保留在 `vendor/LICENSE.wavesurfer`。封面和歌曲摘录来自原作仓库，原字体来自其 CSS 指定的 Pudding 字体地址；仓库代码许可不在此被表述为音乐或唱片封面的独立授权。当前仅供本地研究及用户 review。
