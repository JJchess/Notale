# 一部图像索引

状态：pending-user-review；promoted: false。

原作：https://pudding.cool/2022/06/aztec-gods/ 。完整浅克隆：`../../sources/aztec-gods/`，https://github.com/the-pudding/aztec-gods ，commit `7dc6fda520fcfba0a15fe45bdb0a2d4e48dfc1f5`。与 iconography-lens 共享已经完成的原仓库克隆，本项是另一个独立模块。

## 原作视觉研究

亲自查看 `../../evidence/aztec-gods/pantheon.png`：137 个原图缩略块、Ometeotl 完整图像、原简介和长文。起初寻找 input 未成功，因为探索阶段默认选中了 Ometeotl，搜索框在 Hide 后才出现，不能把没有 input 误判为模块失效。

进一步进入最终探索段，等待原 PNG 精灵实际解码，点击图中 Tlaloc 并选择 life，亲自查看 `pantheon-search-life.png` 的原图与主题高亮。早先一次输入检索的截图未成功选择条目，不作为原检索成功证据；最终截图是点击图像选中。该模块是预排布图像索引，不是画有关系连线的网络图。

## 源码与素材

研究 `State.svelte` 的位置尺度、`Gods.svelte` 的精灵顺序、`God.svelte` 的尺寸/偏移公式与主题透明度、`GodInfo.svelte` 的简介、长文及文献，和 `Search.svelte` / `GodMeta.svelte`。

完整复制 137 张原 SVG 图像、原 gods.sprite.png、nodes.json、doc.json、variables.json，共 141 个原文件。SVG 是原作详情实际加载的高质量源图，未重绘，也未用 SVG 替换原 PNG。索引缩略图仍用原 PNG 精灵；403/54800 的偏移、13700% 背景高度、按 source x/y 等比例布置、图块尺度 0.06、透明度 0.1 和原类别色均保留。所有源文件逐字节与 SHA-256 一致，精灵顺序从原组件提取。

独立原生 DOM 实现：四种主题高亮、名称与原拼写检索、137 个可键盘点击图块、原简介与对应主要神祇长文、图像出处和逐项参考文献链接。保留选中对象高亮，即使不匹配当前主题。桌面长文可内部滚动，手机自然纵向展开；手机图像索引保持最小 600px 宽并在局部水平滚动，避免把 137 个图块压成无法辨认的小点。点击图块后可滚到详情，reduced-motion 下不使用平滑滚动。

本项不含原文的逐段介绍与图像学局部遮罩，那部分已有独立候选。原先 Voronoi 空白区域点击选择最近图像改为直接点击/键盘选择图块；对应图像和详情没有省略。原仓库此 commit 未见 LICENSE，SOURCE-NOTICE.md 记录事实和作者归属，不虚构许可。

## 验证与修复

`node ../../tools/check-pantheon.cjs` 在 1600×900、1280×720、390×844 下逐一选中全部 137 项并解码每张原 SVG；姓名与简介对照原 nodes 数据，索引偏移对照原精灵顺序，选中图块仍引用实际 PNG 背景。四主题的全部可见 ID 与原标记（加当前选中项）相同。另检查名称检索、无结果、来源显示、Ometeotl 键盘选择与长文、无页面异常及页面水平溢出。结果在 `../../evidence/pantheon-candidate-checks.json`。

亲自查看桌面成品及手机 Ometeotl 状态，发现并修正通用按钮选中样式清掉精灵背景的问题，补充计算样式检查防止复发。手机局部横向滚动保留原图识别度；独立图中的细线与饰物仍为原 SVG。没有独立考证图像学分类和历史解释。

此次首次批量解码也发现公共预览服务将 SVG 错标为 text/plain。已补齐 SVG、JPEG、GIF、MP3/MP4、字体等 MIME 类型并重启同一 41991 服务；原件未改。图库及全部本地链接检查通过。
