# A 阶段：最小图片交付链路

2026-09-07。A 功能链路已实现并验证；B/C 未实施。未提交 git。

## 实现范围

- 页表保持原来的标签＋一句主题；不增加用途、重要性、布局或证据字段。
- ImageSearch / ImageGen 共用 `core/media.py` 的已有供应商脚本封装；图片通过 `core/tools.py` 的现有 Out 回灌。
- 工具不接收页号或输出目录；harness 按调用分配私有目录。模型不填写额外 ID 或来源元数据。
- Planner 自由取图、查看与补搜；FinalizePlan 一次提交页表和可选的页号→图片路径列表。没有取图预算或固定回合。
- 编排完成写入后再启动 Builder；briefs.json 保持 description/prompt 两字段，本页素材附到 prompt。
- 删除旧图池表、IMG.md 正则解析及其相关取图规则；Builder 可以自行补图，代码页独立风格契约保留。
- 来源复用供应商每次调用的记录，批次结束单点汇总。CREDITS 明确是含候选的取图来源记录，不冒充实际使用证明。

## 基线与实验

实施前的 core/prompts 快照：`/tmp/notale-media-a-baseline.mGYZ4A/`。基线提交 ba515e4；历史全量产物 `runs/ens-trim-full-0907`。

两次实验都使用 gemini38-google-low，Builder uniform / concurrency=6 / mini / aux / notes。主题从历史全量复制，SHA-256 前后相同；不重新设计主题。Planner 与全部 Builder 重新运行，没有手工修生成页面。

| 运行 | Planner 响应 | Builder 产物 | Builder 响应 | Builder 输入 / 输出 token | Builder 墙钟 |
|---|---:|---:|---:|---:|---:|
| ens-media-a-0907：同一《集成学习》query，90 分钟 | 2 | 25/25 | 233 | 7,113,924 / 279,340 | 570.2 秒 |
| handaxe-media-a-0907：真实馆藏照片小样，10 分钟 | 3 | 5/5 | 53 | 1,347,138 / 41,448 | 83.9 秒 |

Planner 输入／输出分别为 6,921 / 715 和 19,583 / 422 token。以上不含供应商图片服务费用，未估算该费用。

旧《集成学习》是冻结页表的 32 页 Builder 实验；本次重新规划成 25 页，不能据总 token 数声称效率或质量提升。

每个 run 的 experiment.json 保存启动时源码哈希、基线源码哈希、模型与主题信息。全量启动后补了来源记录容错、连续多次定稿取最后一次、共享素材 Write/Edit/Patch 保护，随后删除未使用的 write_targets；这些最终差异经过单测，不宣称又按最终源码重跑了整套。馆藏小样启动时已含前两项，后补共享素材保护与死代码清理。

## 交付证据

- 《集成学习》：Planner 下载 3 张候选，将 1 张交给 page-07。Builder 最终自己绘图，浏览器实际素材图片页数为 0；这是内容选择，不当作取图到显示成功的证据。
- 馆藏小样：Planner 连续两次检索后定稿，Builder page-02 也实际调用了 ImageSearch。总计 9 个成功下载来源记录。
- 馆藏小样 5/5 页在 HTTP 浏览器中显示了本地真实素材：图片 complete=true、naturalWidth>0，且布局宽高均大于零。
- page-05 实测“标本一→标本二→标本一”，路径在 `00_met.jpg` 与 `02_met.jpg` 间切换，均成功加载，切回恢复原图。
- 两组 HTTP 浏览器检查均无 pageerror、console.error 或 requestfailed；现有页内独立审计均无致命错误或视觉警告。全量 4 个代码页还执行了工作台自检。
- 代码页宿主在 file:// 下有意不加载 iframe，因此最终验证与截图均使用 HTTP，不将本地文件下的空白视为成功。

原始证据：各 run 下 `builder-results.json`、`builder-manifest.json`、`trace.jsonl`、`verification/browser.json` 和逐页截图。

## 回归

`python -m unittest discover -s core -p 'test_*.py'`：81 项通过；历史产物无损 round-trip 也通过。`python -m compileall -q core` 和 `git diff --check` 通过。

新增 16 项媒体测试覆盖：真实图片格式校验、失败无可用路径、无图一次定稿、补搜与替换、同轮新图不可选用、非法页号、缺失文件、越界路径、单页分发、brief 字段不变、并发目录不冲突、来源损坏不阻断、写入中断不发布 brief、共享素材只读、代码页不获主题权限及非视觉模型工具面。

ImageGen 的共享执行、返回图片与来源路径通过模拟供应商回归；本轮未发起真实付费 ImageGen 请求。真实联网闭环覆盖的是 ImageSearch，不能将其扩大为所有供应商均已实测。

## 未解决的问题与结论

1. 全量 page-21 用了 52 次响应，trace 显示反复围绕分步回退检查读取 base.js/base.css/selfcheck.py 并修页。该页没有取图调用；本轮只定位到这条检查修订链，未认定检查器有错，也未加预算截断。
2. 全量 page-09 主题要求 scikit-learn 随机森林，但生成的 starter.py 使用固定 raw_scores、自定义 RandomForestSummary 和固定 oob_score；不能视为真正实现了所要求的随机森林训练。工作台自检通过不代表内容实现正确。未在本次媒体改动中修复。
3. 馆藏 page-02 的部分深色注释落在黑底照片上，人工截图可见对比不足，现有审计未报出。未增加新的审美门禁，也未修改生成页掩盖问题。
4. 没有做全部页面的完整语义审阅或盲评；这些实验支持图片链路可用，不支持整套内容已达到最终交付质量。

结论：A 的取图、查看、选择、分发与真实加载链路已验证。页表和 brief 没有增加字段，生产代码净减少约 270 行。B/C 仍需单独授权与验证。

## 预览

- [集成学习全量](http://192.168.0.72:4177/lab/ens-media-a-0907/index.html)
- [真实馆藏照片小样](http://192.168.0.72:4177/lab/handaxe-media-a-0907/index.html)
