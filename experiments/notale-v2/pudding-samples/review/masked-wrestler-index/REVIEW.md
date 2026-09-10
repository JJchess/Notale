# 蒙面摔角手图鉴

状态：pending-user-review；promoted: false。

原作：[An Illustrated Guide to Masked Wrestlers](https://pudding.cool/2020/05/wrestling/)。源码：[the-pudding/wrestling](https://github.com/the-pudding/wrestling)，commit `36666b42395537a4c2adc87df871b06afe0434af`。完整 clone 在 `../../sources/wrestling/`（不纳入样例目录）。

## 提取范围

独立探索索引：226 项原记录（222 个摔角人物与 4 位创作者彩蛋），完整英法简介、真名/别名、国籍、活动年份、三类筛选、关联人物跳转。保留不匹配项淡出并排到末尾、原排序与编号。原作三段引导故事未包含；可由原作链接阅读。

原 `spritesheet.png`（2560×2400）与双语 `title.png` 原字节保留，标题按语言显示精灵图对应半幅；没有重画面具。缩略图使用原坐标和 80/72px 尺寸。详情沿用原 160→80 取样、RGB 像素与 fax 动画，`vendor/prepare-transition.js`、`vendor/move.js` 未改字节；import map 的 range shim 仅实现该文件唯一使用的 d3-array.range(n)。原 National 字体本地保留。

Svelte 的探索状态改为独立原生 DOM，不需要安装依赖或联网。网格改用可键盘操作的 button，手机详情使用可关闭、可滚动的面板，Escape 返回并恢复选中按钮焦点；新增减少动态效果支持。没有把缺失的素材替换为示意图。

原资料按 2020-05-11 快照阅读，未将“active/present”等历史描述更新成当前事实。原 decade 算法对未结束年份使用运行年份；此处固定为 2020（2026 同属 2020s，不影响现有年代选项）。

## 原作与本地亲眼复核

原作页面有过网络加载停在 0 masks 的情况；等待实际数据完成后重新获得正常渲染。已亲眼看过 `../../evidence/wrestling/initial.png` 的正常入口、`detail.png` 的 Anibal、`japanese.png` 的日本筛选与 Asuka；日本筛选原作实际得到 17 项。

已亲眼看过本地桌面完整标题/网格与 Abyss 详情、390px 手机网格和 Abyss 详情。首次标题将双语精灵图全部展示，经视觉复核已修正为按语言裁切；原图文件未改。

## 验证

- `tools/check-wrestler-index.cjs`：1600×900、1024×768、390×844，每种尺寸遍历 226 项详情与英法共 81 个单筛选状态，校验原字段规则；手机关闭与焦点返回、More info、页面无横溢出、无 JS 错误；非 reduced-motion 下原 fax 动画完成。
- `tools/check-wrestler-pixels.cjs`：226 项 × 80×80 × RGBA，共 5,785,600 个通道，与原 Offscreen/Modal 的 RGB 像素语义逐项比较，0 差异。
- 英文原简介有 263 处关联标记，其中一批原 ID 拼写无法命中。通过显式别名修复 12 处跳转，保留 257 处有效跳转；其余 6 处缺失/损坏目标保持原文、移除不可用的交互外观，未虚构人物。完整原文 CSV 与 JSON 仍保留。Anibal→Mil Mascaras 实际点击通过。
- 原 PNG、CSV、字体和两个动画文件的路径与 SHA-256 见 `assets.json`。
- 检查证据：`../../evidence/wrestler-index-candidate-checks.json`、`../../evidence/wrestler-index-pixels.json`。

## 用户 review 重点

是否值得收为“像素插画索引 + 渐隐筛选 + 像素扫描详情”的独立样例；手机面板和桌面长简介阅读是否符合样例需求。源仓库未找到 LICENSE，详见 SOURCE-NOTICE.md。仅候选，不自动入库。
