# ImageSearch：Gemini 替换与独立对照

2026-09-08。已实现，未 commit。只调用 ImageSearch，没有运行 Planner、Builder、Director 或 ImageGen。

结论：这组小样本中，批量取得的有效素材需求数与单条并行相同，搜索计费额度用完后估算便宜 **41.4%**；额度内模型费用便宜 **13.5%**。人物照片稳定，叶绿体电镜照片两组都未成功，不能称为三类素材全部通过。

## 1. 实现及使用

- `core/image_search.py`：Gemini 3.8 Flash 原生 Google Search，固定 low，一次工具调用一个 Gemini HTTP 请求。普通代码解析源页、下载并解码；没有第二次选图模型调用。
- `core/media.py`、`core/tools.py`：保留共享素材路径、图片回传、来源记录与 `{results, errors}` 契约；批量增加零起始 `query_index`。
- 旧 nokey／Serper 代码、配套 vendor 脚本和原测试已放到 [legacy](../../legacy/image-search/README.md)。默认配置为 `gemini`，不自动回退。启动检查不再要求旧搜图脚本存在。
- Planner 规划循环、页表、素材采用策略及 ImageGen 不变，没有修改课件 prompt 或 skill。Planner CLI 只清理退役依赖检查及相应说明。

调用示例：

```json
{"query": "Leo Breiman portrait photograph Berkeley random forests", "count": 3}
```

```json
{"query": ["Leo Breiman portrait photograph Berkeley random forests", "Frank Rosenblatt perceptron portrait photograph Cornell", "chloroplast transmission electron micrograph thylakoid stroma"], "count": 3}
```

`count` 是每个需求的候选数，默认 3，不承诺一定取得该数量。每个来源优先尝试模型返回的直链；缺失／下载失败时读取同一源页，按 og:image、普通 img 地址尝试，返回首张可解码图片。它是候选提取，不是语义选图；网站封面、示意图可能混入，不自动加模型纠正。

每次调用的私有目录保留 `provider.json`（脱敏请求、响应、usage、实际搜索调用）、`attribution.json`（下载尝试及来源）、`search.json`（对模型返回的精简结果）。完整搜索记录、签名和用量不回灌到 Planner。

## 2. 正式对照方法与结果

[全部候选预览](comparison-d/index.html) · [原始汇总](comparison-d/summary.json) · [逐图人工核对](review.json) · [实验代码](benchmark.py)

使用此前三个原始素材 query，没有人工追加 Wikimedia 等域名限制，也没有指定最终页面／图片 URL。每组每轮处理同样的三项需求，count=3；单条组并发 3，批量组一个请求。各跑三轮，轮间交替组别顺序，不使用 Google 异步 Batch API。下载完全自动，人工核对仅发生在结束后。

| 三轮合计 | 单条并行 | 三条合批 |
| --- | ---: | ---: |
| Gemini API 请求 | 9 | 3 |
| 实际 Google 搜索 query | 21 | 12 |
| 输入 token | 846 | 414 |
| 输出 token | 3,812 | 3,359 |
| 可解码图片（含重复／不合格） | 18 | 12 |
| 符合需求的图片（含重复） | 14 | 11 |
| 成功素材需求／总需求 | 6/9 | 6/9 |
| 每轮整组三项需求平均耗时 | 11.265 秒 | 10.395 秒 |
| 搜索免费额度内估算费用 | $0.014930 | $0.012907 |
| 搜索免费额度用完后估算费用 | $0.308930 | $0.180907 |
| 每个成功需求费用（额度用完后，含失败需求成本） | $0.051488 | $0.030151 |

这些响应没有单独报告 thinking token，且 totalTokenCount 等于 promptTokenCount 加 candidatesTokenCount。按原始 usage 计算，没有声称服务内部完全不思考，也没有把一个 HTTP 请求解释成一次服务内部推理。

每次处理三项需求的平均费用：额度内单条 $0.004977、批量 $0.004302；额度用完后单条 $0.102976、批量 $0.060302。批量不是“一次请求只付一次搜索钱”，实际执行的查询仍分别计费。本次平均耗时接近，不能外推为批量必然更快。

估算口径：2026-09-08 Standard 输入 $0.75/M、输出（含 thinking）$3.75/M；Gemini 3.x 搜索月共享免费额度之后 $14/1,000 查询。每次请求按可观测非空查询去重统计，不跨请求去重；没有读取账户余额或实际账单，不声称真实扣费等于估算。[官方价格](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash)、[查询计费规则](https://ai.google.dev/gemini-api/docs/generate-content/google-search#pricing)。

## 3. 图片质量：仍存在的问题

| 需求 | 单条三轮 | 批量三轮 | 说明 |
| --- | --- | --- | --- |
| Leo Breiman 人物照片 | 3/3 成功 | 3/3 成功 | Wikipedia、Berkeley 等人物照片；另混入双色点阵加工肖像，不计合格照片 |
| Frank Rosenblatt 人物照片 | 3/3 成功 | 3/3 成功 | 人物工作照或正面肖像；单条第三轮额外抽到神经元插图，不计合格 |
| 叶绿体透射电镜照片 | 0/3 成功 | 0/3 成功 | OpenLearn／ResearchGate 大量 403；单条第一轮下载的是类囊体结构示意图，不是电镜图 |

人物工作照的来源说明可以核查 [Cornell 图注](https://news.cornell.edu/stories/2019/09/professors-perceptron-paved-way-ai-60-years-too-soon)、[Commons 档案](https://commons.wikimedia.org/wiki/File:330-PSA-80-60_(USN_710739)_(20897323365).jpg)；不是仅凭人脸判断身份。其他代表性来源见 [Breiman](https://en.wikipedia.org/wiki/Leo_Breiman)、[Rosenblatt](https://en.wikipedia.org/wiki/Frank_Rosenblatt)。

两个具体失配：

1. 单条第一轮光合作用：来源页标题为 `Lettuce Thylakoid`，模型给出的直链却是 `Thylakoid_Structure.jpg`，HTTP 200 但内容错误。当前直链成功时不会再读源页核对其归属。
2. 单条第三轮 Rosenblatt：来源是讲感知机的文章，普通代码从 HTML 抽取到文章的神经元配图。解码成功不等于满足人物照片需求。

源码不加自动相关性打分、自动补搜、固定来源限制或其他供应商兜底；本次也未偷偷手工替换这些结果。因此两组都只能证明两个人物需求稳定，不能证明全类型自动搜图质量已达标。图库许可没有逐项审定；可下载不代表任意再发布授权。

## 4. 排障记录与测试边界

本轮累计 **28 次 Gemini API 请求**，其中正式对照 12 次；不是只有 12 次：

| 记录 | 请求数 | 结果／用途 |
| --- | ---: | --- |
| `comparison-a` | 3 | JSON responseFormat 文档示例的 MIME 值被接口以 400 拒绝，保留错误原文，不当成零结果 |
| `comparison-b` | 12 | 改用 responseMimeType / responseJsonSchema 后 HTTP 200，但未返回搜索执行记录，搜索费用未知；不能作为有效的搜索成本对照 |
| `transport-c` | 1 | 加 includeServerSideToolInvocations 后，真实返回两个 GOOGLE_SEARCH_WEB 查询及候选；接口验证成功 |
| `comparison-d` | 12 | 正式三轮对照，全部 HTTP 200，全部有实际搜索查询记录 |

没有从“缺少搜索记录”推断确定没搜，也没有把其搜索次数按零计算。当前实现显式要求返回服务端搜索记录；若响应没有执行证据，则如实返回错误，不把未核实来源的地址冒充成功搜索结果。没有自动模型重试。

正式对照共估算 $0.027836（搜索额度内）或 $0.489836（额度用完后）；排障调用另计，`comparison-b` 的搜索费用无法从响应确定，故不能给整个开发过程编造精确总价。

本地回归：`python -m unittest discover -s core -p 'test_*.py'`，114 项通过（总数，不是新增 114 项）。覆盖单条、批量、零结果与漏交区分、部分失败、无密钥不发请求、异常 JSON／HTTP、搜索证据、源页提取、私网重定向拒绝、并发隔离及原 Planner 契约。

`comparison-d/source-hashes.json` 保存实验时源码指纹。实验完成后仅补强异常响应的类型检查；请求内容及正常响应下载路径未变，并重新跑了全部本地回归。没有借此发起完整课件实验。

复现（会发生新的付费调用，label 必须新建）：

```bash
python experiments/image-search-20260908/benchmark.py --label your-new-label
```

建议：已有多个明确搜图需求时可以一次合批，本组数据更省；单条按需补搜仍保留。暂不改 Planner 调度、不建立自动合批器，不由三轮小样本推导新的预算或门禁。
