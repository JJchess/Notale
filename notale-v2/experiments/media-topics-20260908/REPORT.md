# 光合作用 / 史记：完整生成与 media 观察

2026-09-08。两套均完成，未手工修改生成页面。

## 预览与结论

| Query | 完整预览 | 生成页数 | Planner 搜图 | 下载候选 | 最终分配 | 浏览器实际显示 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 光合作用 | [25 页预览](http://192.168.0.72:4177/lab/photosynthesis-media-0908-0212/index.html) | 25/25 | 6 次 | 17 份 | 3 页各 1 图 | 2 页 / 2 图 |
| 史记 | [18 页预览](http://192.168.0.72:4177/lab/shiji-media-0908-0212/index.html) | 18/18 | 8 次 | 21 份 | 3 页各 1 图 | 3 页 / 3 图 |

这次不是“搜到了但页面一张没用”：五份外部素材确实下载、分配并在页面显示。科学主题能引入电镜实物图，历史主题能引入人物画像、古籍影印和建筑照片。但仅凭两次生成不能声称稳定解决了素材使用问题。

两套 Builder 都没有调用 ImageSearch 或 ImageGen，Planner 也没有调用 ImageGen；因此本轮验证的是搜索素材链，不是生图能力。

## 固定配置与边界

- 原始 query 分别为 `光合作用`、`史记`，没有附加“必须配图”“必须人物照片”等指令。
- 每套 90 分钟；读者沿用“学过一点相关基础、但没系统学过这个题目的读者”，场合为空。
- Planner / 全部 Builder 均为 `gemini38-google-low`，Gemini 3.8 Flash，low，uniform。
- 两套并行，各 15 个 Builder 并发名额，总上限 30。
- 沿用最近实验：mini + aux samples，notes=notes，sample-shots 关闭。
- 使用当前已修正样本及 15 个同源 mini；未接入待 review 的内容规划短文。
- 与最近实验一致，冻结使用 `ens-trim-full-0907` 的主题，不调用 Style Director。本轮不评价两主题各自的视觉风格选择。
- 生产 harness、提示词、样本没有为本轮临时调整；仅增加实验配置快照、事后观察脚本和报告。

[配置与 workflow 哈希快照](config-snapshot.json)。各 run 的 experiment.json 另保存 core/prompts 哈希及主题哈希。

运行命令（同时启动）：

```bash
python3 -B -u experiments/media-a-20260907/run_full.py --label photosynthesis-media-0908-0212 --query 光合作用 --minutes 90 --concurrency 15
python3 -B -u experiments/media-a-20260907/run_full.py --label shiji-media-0908-0212 --query 史记 --minutes 90 --concurrency 15
```

## 逐图使用情况

下列名称来自下载记录；历史版本年代、古人画像的考据与科学图中标注的事实准确性未做独立来源审查。

| Query / 页 | 分配素材 | 最终页面表现 |
| --- | --- | --- |
| 光合作用 p05 | `Lettuce Chloroplast STEM.jpg` | 使用原图，与自绘叶绿体分区图并置，作为微观结构的实物参照。[打开](http://192.168.0.72:4177/lab/photosynthesis-media-0908-0212/index.html#/4) |
| 光合作用 p06 | `Chlorophylls-fin.svg` 的 PNG 缩略图 | 没有加载分配的图片；Builder 自绘吸收曲线。只能确认未采用原素材，不能由此推断自绘曲线准确或经过原图核对。[打开](http://192.168.0.72:4177/lab/photosynthesis-media-0908-0212/index.html#/5) |
| 光合作用 p20 | `Leaf epidermis.jpg` | 使用叶表皮显微图，并配自绘气孔示意及状态控件。[打开](http://192.168.0.72:4177/lab/photosynthesis-media-0908-0212/index.html#/19) |
| 史记 p02 | `Sima Qian (painted portrait).jpg` | 人物画像与修史动机的分步讲述并置。[打开](http://192.168.0.72:4177/lab/shiji-media-0908-0212/index.html#/1) |
| 史记 p03 | `Memorias históricas.png` | 古籍页面影印配合五体结构说明。页面自行写了具体版本图注，本轮不把该图注当成已验证的版本鉴定。[打开](http://192.168.0.72:4177/lab/shiji-media-0908-0212/index.html#/2) |
| 史记 p18 | `Temple of Sima Qian, Hancheng (20250113111702).jpg` | 使用司马迁祠建筑照片，搭配结尾评价。[打开](http://192.168.0.72:4177/lab/shiji-media-0908-0212/index.html#/17) |

五张实际使用的图片均从本地 assets/img 加载，不依赖演示时访问原站。来源记录见各 run 的 `pages/assets/img/CREDITS.md`；该文件包含未使用的候选，不能当作使用清单。

## 搜索、查看与交接观察

- 光合作用搜索了叶绿体电镜、类囊体、吸收光谱、恩格尔曼实验、卡尔文实验和气孔；其中 2 次结果为空。
- 史记先搜中文人物、简牍、版本，再用英文补搜；8 次中 3 次为空。这轮观察说明会补搜，但不能据此概括中英文搜索的稳定优劣。
- 两套都在第一次 FinalizePlan 提交成功，未出现页表或素材映射被退回。
- 候选图由现有 media_call / Planner 路径随工具结果回灌，不需要独立 Look 才进入上下文。这是执行路径事实，不代表逐张视觉理解质量已被测量。
- Builder 的 Read 记录中没有这些素材文件名；它们仍然通过 HTML 引用显示，并在 Check 中可见。不能把“最终显示了”写成“Builder 在写页面前单独查看过每张素材”。
- 素材偏向实物与身份参照；结构、流程和吸收曲线仍主要由 Builder 自绘。分配 6 图、实际使用 5 图是本轮观察，不是应满足的配图比例。

## 生成开销

| 项目 | 光合作用 | 史记 |
| --- | ---: | ---: |
| Planner 用时 | 约 76 秒 | 约 132 秒 |
| Planner 输入 / 输出 token | 93,435 / 1,023 | 69,792 / 945 |
| Builder 用时 | 347.9 秒 | 125.4 秒 |
| Builder 响应次数 | 271 | 151 |
| Builder 输入 token（含缓存） | 11,547,764 | 4,312,023 |
| 其中缓存输入 token | 9,496,461 | 3,191,601 |
| Builder 输出 token | 367,001 | 220,300 |
| Check 次数 | 104 | 66 |
| 现有独立审计：致命 / 视觉警告页 | 0 / 0 | 0 / 0 |

光合作用 p12 用了 51 次响应，累计输入 4,083,248 token，约占该套 Builder 输入的 35.4%；p11 也用了 26 次响应。这解释了部分长尾开销，但没有进一步受控诊断这些修整为何发生。不要把整套输入或耗时都归因于搜图，也不能据此断定某个 sample 导致回合变多。

## 验证与证据

- 两套初始状态及存在的分步终态共 43 页浏览器检查，无 pageerror、console.error 或 requestfailed。
- 观察 img、SVG image、CSS background 和素材资源请求；只有资源请求不能证明素材在画面中。最终确认可见页：光合作用 p05/p20，史记 p02/p03/p18。
- 已人工查看五张用图页及光合作用 p06 的截图；未逐一测试全部交互或完成全课事实审查。
- 两个完整预览入口 HTTP 200，沿用已有 reveal 预览器。
- 事后观察脚本：[audit.py](audit.py)。没有新增生产门禁。

原始证据：

- [光合作用素材审计](../../runs/photosynthesis-media-0908-0212/verification/media-audit.json) · [Builder 结果](../../runs/photosynthesis-media-0908-0212/builder-results.json) · [manifest](../../runs/photosynthesis-media-0908-0212/builder-manifest.json)
- [史记素材审计](../../runs/shiji-media-0908-0212/verification/media-audit.json) · [Builder 结果](../../runs/shiji-media-0908-0212/builder-results.json) · [manifest](../../runs/shiji-media-0908-0212/builder-manifest.json)
- 每套 `trace.jsonl` 保存 Planner 搜索词、最终映射和 Builder 工具调用；`verification/page-*.png` 保存检查截图。

没有为了提高用图数量手工补图、强制替换图表或重跑挑选更好的一轮。
