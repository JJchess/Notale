# 29 项正式入库 · 2026-09-07

用户明确批准全部 29 项，按生产链路的现有边界登记：

- `workflows/build-page/samples/general/`：8 项图像、空间索引和叙事展示。
- `workflows/build-page/samples/chart/`：12 项数据比较、分布和时间序列。
- `workflows/build-interaction/samples/general/`：9 项会改变模型、约束或任务进度的交互。

[正式画廊](../../workflows/index.html) · [运行入口](http://localhost:41991/formal/) · [逐项分类及文件审计](evidence/promotion.json)。生产 catalogs 原有条目保留；新增条目均已接入 SKILL 菜单与模型可读源码包。历史实验镜像保留，以链接指向当前正式入口。

## 运行与读取

每个正式目录包含 `pages/index.html`、完整本地素材、可编辑源码、必要的浏览器构建产物、`provenance/` 来源记录，以及两状态 `shots.png`。七个构建型样本的 `npm run build` 已在正式目录执行成功；部署静态文件即可运行，构建时使用各自锁定依赖。

入库时本批按完整主样本登记 `full`；2026-09-08 已为其中 15 个短样本同源登记 `mini`，见下文。其余样本在 `mini` 模式下继续沿用 full 回退并记录，`none` 模式正确移除样本菜单，原有 auxiliary 模式继续按其独立 mini 注册表运行。源码包使用实际作者组件、CSS、模型常量及数据引用；浏览器编译包和大媒体不进入模型上下文，仍完整随运行目录保存。

截图工具使用临时本地 HTTP 源，支持模块和 fetch 数据；已验证三个新增构建样本及两个既有样本。预览使用 iframe 保留页面内部必要滚动，关闭预览卸载页面并返回焦点。旧 `/review/<id>/` 入口重定向到 `/formal/`，保留查询参数。

## 兼容修正

统一正式导航与批准状态；弹棋补全构建后的入口更新；泡菜放大图的关闭按钮改为深色文字。没有重绘或替换原图片、视频、音频、字体和图表素材。4,263 份随目录迁移的媒体、数据及字体文件保持字节一致，逐项数量与其余源码差异列于 promotion.json。

## 验证

- `check-promoted.cjs`：29 项 × 3 屏宽，加载、图像、页面溢出、外部请求及链接检查通过；七个重新构建的条目另做三屏宽复查。
- `run-promoted-regressions.cjs`：28 组原有机制测试改用正式路径全部通过，涵盖游戏、筛选、输入、状态、媒体和声音。
- `check-promoted-first-three.cjs`：酒瓶、群体尺码和品牌图三项原有完整测试在正式路径通过。
- `check-formal-gallery.cjs`：桌面/手机分类画廊、29 个入口、嵌入预览、内层图像关闭、iframe 卸载与焦点返回通过；实际对外 `/formal/` 挂载也已检查。
- `python -m unittest core.test_skills`：27 项通过，包含分类、菜单、读取边界、full/mini/none/aux 路由和源码包一致性。
- `python -m core.sample_bundles --check`：当前全部 71 个源码包一致。

记录见 [promotion-checks](evidence/promotion-checks/)。正式画廊与手机嵌入画面已经人工视觉复核；截图未代替行为检查。历史候选研究内容继续保留，其当时的“待 review”表述不再代表当前状态。

## 2026-09-08：15 个短 full 同源登记为 mini

按用户本次批准，以新增 29 个 full bundle 的 UTF-8 文件体积小于 15,000 字节选择以下 15 个。这是一次归档选择，不是新增运行时预算门禁。

| 样本 | full 字节数 | 沿用的机制描述摘要 |
| --- | ---: | --- |
| wine-bottle-choice | 8,374 | 稳定瓶体阵列，通过旋转、聚焦与揭示呈现类别证据 |
| waistline-cohorts | 11,934 | 群体排列与筛选展示尺寸分布 |
| brand-size-atlas | 10,269 | 共用尺度比较品牌尺码差异 |
| menu-reading-room | 12,467 | 菜单扫描件从空间集合进入缩放、平移阅读 |
| wine-animal-rankings | 8,220 | 排序与比较呈现动物标签和酒类数据的关系 |
| flipbook-branches | 7,928 | 共用帧索引同步呈现不同图像分支 |
| jersey-edition-board | 10,873 | 球衣图像与可排序的球队数据对应 |
| iconography-lens | 10,525 | 对齐遮罩揭示图像中的重叠母题 |
| dog-flow-atlas | 9,754 | 流向与筛选展示地域间迁移关系 |
| pantheon-index | 10,202 | 精灵图索引连接详细插画及相关记录 |
| music-sample-pair | 9,710 | 原录音、波形片段与顺序播放展示采样对应 |
| population-clock | 9,726 | 时间驱动人口数量及相应地点比较 |
| banknote-firsts | 13,432 | 纸币图像与人物、年代记录关联 |
| onion-cut-lab | 13,304 | 切割几何重算块面积与离散程度 |
| photo-history-quiz | 14,063 | 年代判断与真实年份、读者分布比较 |

兼容方式：

- catalog 的 `mini` 与 `full` 使用相同 `root/files/chars/omitted`，不复制运行目录，也不删改源码、样式或素材。
- `.mini.md` 由现有 `core.sample_bundles` 生成；与 `.full.md` 仅首行 variant 标签不同，保留全部依赖说明。
- SKILL 的机制描述与 full 路径保持原样，现有 mini 路由自动切换到对应 `.mini.md`；full、none 行为不变。
- `main: true`、`aux: false` 不变，不因提供 mini 而扩大辅助样本选择池。
- `finalize-promoted.py` 刷新 full 登记时同步已同源的 mini。源码更新后仍按原流程重新生成 bundle；没有引入大小筛选器或新配置。
- 这些 mini 是完整短样本，不是压缩版；不能将它们计作 full → mini 的输入节省。其余 14 个本批新增样本仍没有 mini。

验证：86 个 bundle 一致；`core/test_skills.py` 与 `core/test_builder.py` 合计 49 tests、188 subtests 通过。新增测试核对 15 个同源 mini 的全文与依赖说明、full/mini 路由、无回退记录及 aux 不变。

上述 mini 归档未夹带检查问题修正；后续经用户单独批准，已完成以下修正。

## 2026-09-08：5 项检查问题修正

| 样本 | 已完成 |
| --- | --- |
| crossword-representation | 将锁定版本 `svelte-crossword@0.3.4` 的原始组件源码与 MIT 许可证归档到正式 pages/vendor 并收入 full bundle；包含输入、焦点、历史撤销、校验及完成逻辑。没有重写引擎，也没有修改现有浏览器构建、题目数据或运行依赖。 |
| crokinole-shot-lab | 将“拖拽决定速度”改为位置、角度、力度控制及按住蓄力；同步 CONFIG、SKILL、catalog、SAMPLE。 |
| pocket-fit-desk | 明确为选择已知尺寸物品，与开口和预计算可容纳矩形比较；同步 CONFIG、SKILL、catalog、SAMPLE。 |
| photo-history-quiz | 截图操作通过滑块键盘事件完成五次有效提交，再滚动到比较证据；没有强行启用按钮或直接改答案状态。已重拍双状态截图与联系表。 |
| masked-wrestler-index | 打开当前人物并展开身份信息，滚动使身份内容进入截图；兼容手机弹层。已重拍双状态截图与联系表。 |

填字源码包由 60,680 字节增至 104,430 字节：增加的是原先缺失的机制实现，不是新提示词。它仍是 full，不在此前 15 个同源 mini 中。下载包 SHA-512 与 package-lock.json 完全一致；来源、版本和依赖边界记在 [组件说明](../../workflows/build-interaction/samples/general/crossword-representation/pages/vendor/svelte-crossword/README.md)。`spec_for` 已登记该源码图，重新生成会继续包含它。

截图状态同时更新 `tools/promoted-shot-states.json` 与正式 catalog；未改截图工具或增加生产门禁。原截图备份在 `/tmp/notale-sample-fixes-0BDRWo/workflows/`（临时目录），当前正式路径为重拍结果。

验证：

- `check-fixed-shot-states.cjs`：两项 × 1600 / 1280 / 390 三宽，6 项均到达预期状态；身份信息实际落在截图视口内。
- 正式页面重跑 `check-crossword-representation`、`check-photo-history`、`check-wrestler-index`，各自三宽全部通过。填字覆盖 13 套题、错误校验、真实键盘完成和两类高亮；照片覆盖五题及十张图比较；面具覆盖 226 个人物、257 个链接与 81 种筛选状态。
- 50 tests、188 subtests 通过；86 个 bundle 一致；29 个正式 catalog 的源码清单和机制描述与生成来源一致。
- 人工查看重拍的两份联系表，确认照片的判断／比较和面具的展开身份确实出现在画面中。

此次未跑新的完整 PPT 生成实验。
