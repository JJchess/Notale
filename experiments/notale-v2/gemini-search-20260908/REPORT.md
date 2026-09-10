# Gemini 原生搜索验证：不依赖 Serper

2026-09-08。结论：当前账户、当前 `gemini-3.8-flash` 的原生 Google Search 实际可用，能找到三类目标素材的来源。原生搜索和自定义函数的组合、下一轮历史回传也已通过最小实测。**尚未接入生产 Planner，不代表完整课件或自动选图链路已通过。**

## 1. 接入通道与证据

使用已有 `GEMINI_API_KEY`，没有新增供应商或凭据，没有改模型、生产配置、prompt、skill 或 Builder。当前实验 profile `gemini38-google-low` 使用 Google 官方 `/v1beta/openai` 兼容接口；不是中转服务。

本次直接发送隔离 HTTP 请求，没有使用完整 Planner。所有请求与脱敏响应均存放本目录；未记录认证头或密钥。测试 query 是三类素材需求，不是此前完整课程 query，不能拿本次 token 数与完整 Planner 作效率对照。原生请求未设置 thinking effort，因此也不把耗时与此前 low profile 等同比较。

| 探测 | 实际结果 | 证据文件 |
| --- | --- | --- |
| 兼容接口 tools 中直接传 `type: google_search` | HTTP 400，`Invalid tool type: google_search` | `capability-a/ensemble-chat.json` |
| 原生 generateContent，Google Search | HTTP 200，返回 webSearchQueries、groundingChunks 和引用关联 | `capability-a/ensemble-native.json` |
| 原生 Interactions，Google Search | HTTP 200，返回 google_search_call、google_search_result、带 annotations 的正文 | `capability-a/ensemble-interactions.json` |
| 原生搜索＋自定义 ReportSources，不开组合标志 | HTTP 400，明确要求 include_server_side_tool_invocations | `mixed-a/ensemble-native-mixed.json` |
| 同上，按官方文档加 `toolConfig.includeServerSideToolInvocations=true` | HTTP 200，同一响应含真实 GOOGLE_SEARCH_WEB toolCall、toolResponse、ReportSources functionCall 及签名 | `mixed-b/ensemble-native-mixed-circulated.json` |
| 原样回传上述完整 model content，再返回 functionResponse | HTTP 200，正常确认；不是丢弃签名后另开一轮问答 | `mixed-b/ensemble-replay.json` |

兼容接口的否定结论仅针对实际测试的请求形态，不声称穷尽了所有未公开扩展。官方兼容文档没有为当前 Chat 接口给出这套原生组合的完整契约；已经验证成功的是原生接口。

源码对应问题：`core/llm.py:_chat_body` 当前把工具统一封装成 function；现有适配没有原生 toolCall/toolResponse 的完整历史表示。不能只向现有工具列表塞一个 google_search 就完成接入。

官方依据：[原生搜索](https://ai.google.dev/gemini-api/docs/generate-content/google-search)、[Interactions 搜索](https://ai.google.dev/gemini-api/docs/google-search)、[兼容接口](https://ai.google.dev/gemini-api/docs/openai)、[内置与自定义工具组合](https://ai.google.dev/gemini-api/docs/generate-content/tool-combination)。组合能力在官方文档仍标注 Preview，支持不等于已完成本项目回归测试。

## 2. 找到来源不等于拿到图片：三类素材实测

| 素材需求 | 搜索与下载结果 | 实际文件 |
| --- | --- | --- |
| 集成学习：Leo Breiman 人物照片 | 原生搜索返回 Berkeley 与 Wikipedia 引用。从实际 Wikipedia HTML 的 og:image 提取 URL 后下载、解码、人工查看成功 | [照片](downloads/breiman/00.jpg)，200×267，23,858 B |
| 神经网络：Frank Rosenblatt 人物照片 | 返回 Wikipedia 与 Visionary Marketing 引用。从实际 Wikipedia HTML 提取原图 URL 后下载、解码、人工查看成功 | [照片](downloads/rosenblatt/00.jpg)，350×455，79,057 B |
| 光合作用：叶绿体 TEM 显微照片 | 第一轮 OpenLearn、ResearchGate 来源与图片 URL 均返回 403；不绕过限制。另一次公开图库补搜取得 Wikimedia 文件页，从实际 HTML 提取 URL 后下载、解码、人工查看成功 | [电镜图](downloads/chloroplast/00.png)，680×516，244,190 B |

原始素材 query：

- `Leo Breiman portrait photograph Berkeley random forests`
- `Frank Rosenblatt perceptron portrait photograph Cornell`
- `chloroplast transmission electron micrograph thylakoid stroma`
- 光合作用补搜：`chloroplast electron micrograph Wikimedia Commons`

补搜由本次验证者明确发起，不是已经实现的 Planner 自动恢复。下载样本也由验证者从实际来源页中明确选择，不冒充模型已自主选图。每张图的 `downloads/<label>/evidence.json` 保存来源页、HTML 中观察到的图片地址、真实尺寸与文件字节数。

实际打开的来源页：

- [Leo Breiman](https://en.wikipedia.org/wiki/Leo_Breiman)
- [Frank Rosenblatt](https://en.wikipedia.org/wiki/Frank_Rosenblatt)
- [Chloroplast in leaf of Anemone sp TEM 85000x](https://commons.wikimedia.org/wiki/File:Chloroplast_in_leaf_of_Anemone_sp_TEM_85000x.png)

人工查看确认分别为人物照片和带 200 nm 标尺的电镜图；人物归属以对应来源页为依据，不仅凭视觉认人。下载成功不等于已获得任意再发布许可；尤其 Breiman 文件来自 Wikipedia 的 en 文件库，不能据域名默认当作自由授权。此轮不进行公开课件发布。

另一个实际发现：ensemble-native 正文给出的 Berkeley 页面 `/news/in-memory-leo-breiman` 返回 404。搜索确实执行了，也不能把模型正文里的每一个 URL 都当成已验证地址。保留 grounding 引用、读取实际来源、核对文件仍有必要。源页审计记录于各 `*-sources.json`。

## 3. 不新增独立模型调用，意味着怎样接

可行方向是 **Planner 本身使用 Gemini 原生搜索；本地工具只做来源读取、下载和图片回灌**。原生 API 已在同一模型响应内完成搜索并请求自定义函数，不需要另设“搜图 agent”。模型读取下载图片后继续规划，属于既有工具循环。

必须精确区分调用层级：这表示 harness 不再另起一个搜图模型请求，**不表示供应商内部只推理一次或没有搜索相关 token 开销**。本次 Interactions 响应的 usage 中 `model_invocation_token_counts` 实际有两条记录，且搜索统计为两条 query；一次 HTTP 请求可以包含服务内部的搜索与再次推理。不能把“内置工具”解释为零模型开销。

这与此前“ImageSearch 内部调用无模型的 Serper API”不是同一实现方式。若直接在 ImageSearch 内再次调用 Gemini，就会增加一次独立模型请求，不能声称仍是纯 HTTP 搜索替换。

最小待实施范围：

1. 为使用该能力的 Planner 增加原生协议适配，保留内置搜索记录、函数调用、签名及下一轮结果回传；其他模型和 Builder 不必一并迁移。
2. 让本地取图能力接收真实来源/图片 URL，沿用安全下载、实际解码、图片回灌与素材路径登记；不让工具再次请求模型。
3. 保留 FinalizePlan 的页表与最终素材映射。用实际 Planner 做“搜索→取图→看图→定稿”回归，尤其确认混合工具响应没有破坏原有路径校验。

这是后续建议，不在本轮验证中擅自实施。无需新增搜索次数门禁、配图要求、预算、浏览器登录态或自动多供应商兜底。

## 4. 限制、费用与复现

Google Search grounding 是网页搜索，不等于当前模型具备通用原图搜索端点。官方另一个名为 Image Search 的生图 grounding 功能，在所查文档中仅列 Gemini 3.1 Flash Image，并明确不能搜人物；本次没有换成生图模型，也没有用生成图替代证据。[官方图片 grounding 说明](https://ai.google.dev/gemini-api/docs/generate-content/image-generation#grounding_with_google_search_for_images_31_flash)

不需要 Serper 不等于免费。Google 文档说明 Gemini 3 的搜索按实际查询计费，另有模型使用量；本轮未读取账单，不能把响应 token 数当作实际扣费。[官方搜索计费说明](https://ai.google.dev/gemini-api/docs/google-search#pricing)

本次共 9 次模型服务 HTTP 请求：2 次参数拒绝，7 次成功（包括一次工具结果回传）。来源页抓取和三张样本下载没有模型调用。各成功响应的 usage 原样保留；没有作不同协议的成本推算。

复现脚本：`probe.py` 测端点与工具组合，`audit_sources.py` 检查实际引用/正文 URL 与来源页图片，`download_sample.py` 下载明确选中的源页图片，`replay_probe.py` 验证混合工具历史回传。重新运行 probe 请用新的 label，避免覆盖现有证据；replay 的证据文件采用独占创建。

结论：**已证明不用 Serper 的原生搜索＋取图路径可行；尚未证明生产 Planner 的全自动采用率或完整课件渲染效果。**
