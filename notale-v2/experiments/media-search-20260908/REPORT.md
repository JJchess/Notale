# ImageSearch 实施与 Planner 验证

2026-09-08。工具改动已完成；新搜索源的真实效果验证尚未完成。

## 1. 实施范围

| 位置 | 改动 |
| --- | --- |
| `core/media.py` | 增加 Serper Images 普通函数适配；保留显式 nokey 分支，不自动回退。返回检索错误、下载错误、可用路径和来源。每次调用记录 `search.json`；`attribution.json` 仍为旧数组格式。 |
| `core/tools.py:media_call` | 校验图片可解码并回传图片；ImageSearch 文本改为 `{results, errors}`，上下文仅保留必要候选字段，不回灌重复下载地址和缩略图元数据。完整来源元数据仍存盘。 |
| `core/planner.py:deck_call` | 对应解析 ImageSearch 对象；ImageGen 继续解析原数组，定稿接口不变。 |
| `vendor/skills/web-media-getter/webmedia.py` | 下载模式支持机器可读 JSON，传回原先丢失的来源错误；记录 IA 原图地址解析失败。 |
| `config.yaml` | 增加 `media.image_search_backend`，默认仍为 `nokey`。认证检索验证前不切默认。 |

不改 Planner 提示词、页表格式、skill、ImageGen、Builder 风格；不增加模型角色、独立模型调用、搜索次数要求或素材预算。模型仍可补搜，也可无图定稿。工具内部只有 HTTP 检索、下载和本地校验；Planner 查看工具结果后的下一轮仍是原有工具循环。

Serper 下载只接受公开 HTTP(S) 地址：检查 DNS 解析结果并固定连接 IP，重定向逐跳检查，原站 TLS/Host 验证保持不变；图片站不会收到搜索 API Key。不抓网页、不用缩略图冒充原图、不自动换源。这里的网络与解码保护不是内容规划门禁。

旧 nokey 的多源排序、每源 count 语义没有改造；它仍可能返回超过 count 的总数。Serper 按供应商顺序去重并取最多 count 个候选，不额外补满失败下载。

## 2. 验证层级

| 验证 | 结果与边界 |
| --- | --- |
| 全部 core 单元测试 | `python -m unittest discover -s core -p 'test_*.py'`：103 项通过。包含本次新增测试及既有回归，不是 103 项全为新增。 |
| Serper 协议与失败处理 | Mock 覆盖查询不改写、顺序/数量/去重、部分下载失败、缺 Key、401/403/429/500、畸形成功响应和正常空结果；不等同认证 API 验证。 |
| 下载与回灌 | 测试私网目标、重定向、连接 IP 固定、密钥隔离、假图片、实际编码与扩展名不一致、解码安全尺寸、失败路径不进入可选映射。 |
| Planner 兼容 | 测试搜索失败后补搜、无图定稿、路径与页号验证、ImageGen 原协议、代码页权限边界。没有新增“必须补搜”规则。 |
| 新下载器真实网络 | Wikimedia PNG（1577×940，81,668 B）和 Met JPEG（3167×4000，5,219,625 B）均下载解码成功。仅验证公开原图下载，不证明 Serper 检索成功。 |
| 三个真实 Planner | 使用最终代码运行下述 B 轮，全部成功。后端明确为 nokey。 |

当前环境及 `.env.local` 未配置 `SERPER_API_KEY`。Serper Images 适配的真实认证、账户参数支持与相关性尚待验证，不能据此宣称新源已上线或效果改善。

## 3. 三组原 query：最终 B 轮

都使用 `gemini38-google-low`（Gemini 3.8 Flash），只运行 Planner，没有运行 Builder。实验保持 Style Director 分离模式，但复制同题历史主题以跳过 Director 模型调用；主题不进入 Planner 上下文。

| 主题 | 原 query 来源 | 时长 |
| --- | --- | ---: |
| 神经网络 | `runs/neural-networks-style-media-0908-0241-r2/experiment.json`，完整复用此前含 MLP、CNN、RNN/LSTM、注意力及读者基础的长 query | 120 分钟 |
| 集成学习 | `runs/ens-plan-first-0907-2234/experiment.json`，`集成学习--机器学习概论第八讲` | 90 分钟 |
| 光合作用 | `runs/photosynthesis-style-media-0908-0232/experiment.json`，`光合作用` | 90 分钟 |

历史元数据未填写 audience/scenario 的两组采用原默认读者和空场合，不另扩写 query。运行输入与代码 SHA256 均保存在各 run 的 `experiment.json`。

| 主题 / B 轮目录 | 页数 | Planner 模型响应数 | 搜索调用 | 可解码候选 | 最终配图页 | 耗时 | 累计输入 / 输出 token |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 神经网络 / `neural-search-nokey-0908-b` | 30 | 3 | 2 | 0 | 0 | 9.85 s | 11,265 / 1,003 |
| 集成学习 / `ens-search-nokey-0908-b` | 20 | 2 | 2 | 2 | 0 | 11.69 s | 5,915 / 664 |
| 光合作用 / `photo-search-nokey-0908-b` | 20 | 2 | 4 | 0 | 0 | 9.80 s | 3,293 / 770 |

累计输入为各响应的 input_tokens 之和，不是首请求大小；三组 cached_tokens 均为 0。最终配图页由 trace 中 FinalizePlan 的 media_by_page 统计，三组均为 `{}`。这不是实际页面渲染验证，本次没有生成可预览课件。

### 实际检索与观察

- 神经网络：`LeNet 1998 Yann LeCun paper architecture diagram`、`MNIST handwritten digit recognition examples`，均无候选；两次发生在不同模型响应，第二次是 Planner 自行补搜。
- 集成学习：`Leo Breiman Random Forests machine learning`、`AdaBoost Yoav Freund Robert Schapire`，各返回一张 Wikimedia 图片。人工查看：前者是文献关系可视化，后者是标题为 AdaBoost 的主题摄影，不是算法作者照片。Planner 最终均未选用；日志没有给出放弃理由，不替模型推断理由。
- 光合作用：搜索叶绿体 TEM、恩格尔曼实验、Calvin cycle 与光反应 Z-scheme，四个较长 query 均无候选。
- B 轮所有 8 次搜索均有 Openverse、LoC 的 HTTP 403，现已进入返回模型的结构化错误以及每次调用的 `search.json`。这不代表其余四个来源也失败；空候选与部分来源失败可以同时出现。
- 无候选的错误报告为 199 B；集成学习两份报告分别为 1,390 B、599 B。仅统计 JSON 文本 UTF-8 字节，不包含图片。没有为了省字删掉来源、许可或错误事实。

结论：错误反馈、图片回灌和定稿协议跑通了，但旧源的覆盖与相关性不足仍在。三组无图不能证明新 Serper 后端无效，因为它尚未执行。

### A 轮留档与波动

同日还保留最终报告字段精简前的 A 轮，不与 B 轮冒充同版本新旧源 A/B：

| run | 页数 | 搜索调用 | 可解码候选 | 最终配图页 |
| --- | ---: | ---: | ---: | ---: |
| `neural-search-nokey-0908-a` | 26 | 2 | 0 | 0 |
| `ens-search-nokey-0908-a` | 19 | 2 | 3 | 1 |
| `photo-search-nokey-0908-a` | 20 | 6 | 12 | 2 |

这些全部也是 nokey。A 轮光合作用自行补搜了更短的 `Calvin cycle diagram` 和 `chloroplast electron micrograph`，取得候选；B 轮没有继续补搜。说明单次页数和配图数有波动，不能把差异归因为本次字段精简，更不能将 A/B 的 token 差异当作节省效果估计。

## 4. 下一步尚缺什么

由用户在现有 `.env.local` 配置 `SERPER_API_KEY`，无需在对话中发送密钥。先做一次真实认证检索与原图下载确认，再分别运行：

```bash
python experiments/media-search-20260908/run_planner.py --case neural --backend serper --label neural-search-serper-0908-a
python experiments/media-search-20260908/run_planner.py --case ensemble --backend serper --label ens-search-serper-0908-a
python experiments/media-search-20260908/run_planner.py --case photosynthesis --backend serper --label photo-search-serper-0908-a
```

实验脚本按进程指定后端，不改全局配置。缺 Key 会在实验启动前明确报错，不浪费模型调用；运行时工具本身仍返回配置错误，允许 Planner 无图完成。真实新源验证通过后才考虑显式切默认，没有自动切换。
