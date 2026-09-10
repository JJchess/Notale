# 光合作用 / 史记：启用真实风格控制后的完整重跑

2026-09-08。两套已完成，旧实验与失败记录均保留；没有手工修改生成页面。

## 结果与预览

| Query | 预览 | 生成 | 搜图调用 | 分配素材 | 浏览器实际显示 |
| --- | --- | ---: | ---: | --- | --- |
| 光合作用 | [打开](http://192.168.0.72:4177/lab/photosynthesis-style-media-0908-0232/index.html) | 16/16 页 | 5 次 | p03、p04、p10 各 1 图 | p03、p04，共 2 页 / 2 图 |
| 史记 | [打开](http://192.168.0.72:4177/lab/shiji-style-media-0908-0232/index.html) | 15/15 页 | 4 次 | p02 画像 1 图 | p02，共 1 页 / 1 图 |

两套 Planner 都只提交一次 FinalizePlan；Builder 没有调用 ImageSearch / ImageGen，Planner 也没有调用 ImageGen。本轮仍是搜索素材能力验证，不是生图能力验证。光合作用 p10 没有显示分配的原图，不能把“分配成功”当作“实际采用”。

## 本次最小修正

`core/director.py:gates` 原先在整份 CSS 中扫描承载面禁词，导致“禁止面板”“黑漆底板材质”等文字被当成承载面 token 许可。

现在只在 `INTERFACE` 内逐行的 `token --名称 …用途…` 描述中扫描这些词；实际 CSS 中 `--surface`、`--panel`、`--card` 等承载面 token 检查不变。其余校验、提示词、重试次数、工具定义没有修改，也没有新增门禁。

`core/test_director.py` 新增 6 项回归测试：正常主题、禁令/材质误判、六类禁词及行前缀、改名 token 的承载面描述、实际 CSS 承载面 token、接口外注释。

- `python3 -B -m unittest discover -s core -p 'test_*.py'`：89 项测试通过。
- 将之前两个 `*-style-media-0908-0226/style.rejected.json` 中的 CSS 原文，连同原始参照和本机字体表送回修正后的完整校验：均无错误。没有改写这些失败样本。
- 实验入口使用此前新增的 `--fresh-theme`，实际调用 Director；不再拷贝冻结主题。原来的冻结模式仍保留以便复现实验。

## 风格链路证据

| 项目 | 光合作用 | 史记 |
| --- | --- | --- |
| style-pick / style-theme 调用 | 1 / 1，首次通过 | 1 / 1，首次通过 |
| 背景 | `#0D140E` 深叶绿 | `#181715` 暖炭黑 |
| 主要视觉方向 | 叶绿、光谱色与能量流 | 朱砂、金赭与宋楷文字 |
| theme SHA256 | `cc5d8f54e7158875848238fc321a99cc702d4e699b3058c2542b0670c5c61e42` | `e508b3801368f874c22d06b1124a5c3146510d5fbc831080787637cc9712f13c` |

主题彼此不同，也不同于旧冻结主题。生成后主题哈希与 Planner 完成时记录一致。两个预览入口均 HTTP 200；在预览内读取首个页面的计算样式，`--bg` 与上表一致，加载的也是各自 run 下的 theme.css。

两套都选择了深底：可以确认模块确实运行并影响了页面，不能据此宣称风格多样性已经充分。光合作用 p15 的代码工作台内部保持独立风格，未引入全套 theme.css。

## 配置与生成开销

模型统一为 `gemini38-google-low`（Gemini 3.8 Flash），每套 90 分钟，读者、mini + aux samples、notes=notes、sample-shots 关闭等均沿用上一轮。两套并行，各 15 个 Builder 名额，总上限 30。未接入待 review 的内容规划文档。

```bash
python3 -B -u experiments/media-a-20260907/run_full.py --label photosynthesis-style-media-0908-0232 --query 光合作用 --minutes 90 --concurrency 15 --fresh-theme
python3 -B -u experiments/media-a-20260907/run_full.py --label shiji-style-media-0908-0232 --query 史记 --minutes 90 --concurrency 15 --fresh-theme
```

| 项目 | 光合作用 | 史记 |
| --- | ---: | ---: |
| Planner 输入 / 输出 token（不含 Director） | 41,762 / 664 | 22,959 / 648 |
| Director 输入 / 输出 token | 23,042 / 1,506 | 23,045 / 1,783 |
| Builder 墙钟 | 约 4.6 分钟 | 约 4.1 分钟 |
| Builder 响应次数 | 189 | 225 |
| Builder 输入 token（含缓存） | 6,559,420 | 9,736,971 |
| 其中缓存输入 token | 5,179,623 | 8,238,690 |
| Builder 输出 token | 218,655 | 253,905 |
| 现有独立审计：致命 / 视觉警告页 | 0 / 0 | 0 / 0 |

上述开销仅统计本轮成功 run，不包含修复前 0226 两次失败尝试。此次页表也是重新生成的（前轮 25/18 页，本轮 16/15 页），不是固定页表 A/B，不能把 token 或配图数量差异全部归因于风格控制。

## 验证边界与发现

- 31 页的初始状态及存在的分步终态均做了浏览器检查，没有 pageerror、console.error 或 requestfailed；未穷举所有交互状态。
- 已查看两套封面、三张实际用图页和光合作用代码页截图。代码工作台现有执行、错误处理、超时恢复、沙箱和布局自检通过。
- **另发现内容问题，未顺带修改：光合作用 p15 标题要求“拟合光响应曲线与光补偿点计算”，实际 starter.py 却是插入排序，没有实现曲线拟合或光补偿点计算。** 运行自检通过不代表教学任务达标。可在[代码页](http://192.168.0.72:4177/lab/photosynthesis-style-media-0908-0232/index.html#/14) review。
- 本轮没有完成历史/生物事实及素材标注的逐项审查，不能将以上运行结果解释为内容全部正确。

证据：

- [光合作用 Builder 结果](../../runs/photosynthesis-style-media-0908-0232/builder-results.json) · [素材审计](../../runs/photosynthesis-style-media-0908-0232/verification/media-audit.json)
- [史记 Builder 结果](../../runs/shiji-style-media-0908-0232/builder-results.json) · [素材审计](../../runs/shiji-style-media-0908-0232/verification/media-audit.json)
- 各 run 的 experiment.json、style-picks.tsv、trace.jsonl 保存配置、选样理由、Director/Planner/Builder 调用记录；verification 目录保存逐页截图。
