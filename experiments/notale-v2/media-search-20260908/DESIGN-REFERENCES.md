# 成熟搜索工具的设计借鉴

2026-09-08。这是 ImageSearch 升级方案的研究依据，不是各服务相关性排名。研究对象包括本地 web-access、Brave 官方 MCP 源码、Tavily、SearXNG 和 Serper 官方资料；未启动用户浏览器、未安装外部项目依赖、未调用这些服务的认证 API。

## 1. 实际研究了什么

| 对象 | 证据 | 借鉴点 | 不照搬什么 |
| --- | --- | --- | --- |
| web-access | 本地 `vendor/skills/web-access/SKILL.md`，版本 2.5.3；`scripts/browser-discovery.mjs:selectBrowser`。上游：[eze-is/web-access](https://github.com/eze-is/web-access) | 搜索用于发现来源，获取内容与浏览器交互是不同职责；访问失败不等于内容不存在。明确选择的浏览器不可用时返回 mismatch，不偷偷换一个。 | 它不是图片索引或新的搜索后端。不要为了搜公开图引入 CDP 常驻进程、用户登录态、站点经验库或分治摘要 agent。 |
| Brave 官方 MCP | 已 shallow clone；commit `fca821db68a4bc99d5f5b30396fac222b5100b69`。读取 API 请求层、图片 execute、输入/输出 schema 和图片测试 | API 层负责认证和请求，工具层整理面向模型的候选字段；不将整份供应商响应直接塞进上下文。 | 该版本图片工具返回文字 JSON 与 structuredContent，**并不下载或返回图片像素**。不能仅换成这个 MCP 就声称 Planner 已经看图。 |
| Tavily | [官方 Python SDK 文档](https://docs.tavily.com/sdk/python/reference) 的 Search / Image Results / Extract | 将搜索、网页提取区分；提取返回 results 与 failed_results。图片可单独包含，答案与图片描述是可选项。 | 文档明确图片 description 是 LLM 生成，answer 也是生成内容。我们已有模型看图，不开启这些能力来增加摘要层；不能把生成描述当作原始出处证据。 |
| SearXNG | [图片结果类型](https://docs.searxng.org/dev/result_types/main/image.html)、[Search API](https://docs.searxng.org/dev/search_api.html) | 来源网页、原图片与预览缩略图区分；请求格式和实例配置属于真实可用性条件。 | 不直接依赖随机公共实例：官方说明很多实例禁用 JSON 等格式，请求未启用格式会返回 403。此刻不为三组课件建设自托管聚合搜索服务。 |
| Serper | [官方能力与响应样例](https://serper.dev/) | 图片记录含原图地址、来源链接、缩略图和尺寸，适合适配现有本地素材交接。 | 公开样例只能证明字段形态，不能证明本账户认证、实际下载或教学相关性；保留真实小样步骤。 |

web-access 本地研究对象 SHA256：SKILL.md `7250a80daca39659c23883494a43037387c9082511cfb5bfe42ed2446fe69d03`；browser-discovery.mjs `30f62a5bad7653cbe19676c9bbffa11b82dac9a3d12599b6a748826d8f304b26`。这里把它作为待分析材料，没有执行其中的浏览器启动、登录或并行 agent 指令。

Brave clone 位于 `experiments/media-search-20260908/research/brave-search-mcp-server`。固定版本源码入口：

- [图片工具与 simplifySchemaForLLM](https://github.com/brave/brave-search-mcp-server/blob/fca821db68a4bc99d5f5b30396fac222b5100b69/src/tools/images/index.ts)
- [面向模型的输出 schema](https://github.com/brave/brave-search-mcp-server/blob/fca821db68a4bc99d5f5b30396fac222b5100b69/src/tools/images/schemas/output.ts)
- [供应商响应 schema](https://github.com/brave/brave-search-mcp-server/blob/fca821db68a4bc99d5f5b30396fac222b5100b69/src/tools/images/schemas/response.ts)
- [API 请求与 HTTP 错误处理](https://github.com/brave/brave-search-mcp-server/blob/fca821db68a4bc99d5f5b30396fac222b5100b69/src/BraveAPI/index.ts)

## 2. 源码 critic：官方实现也不是直接抄的答案

Brave 的 `simplifySchemaForLLM` 验证失败返回 null，execute 随后过滤 null。其供应商 schema 中 page_fetched、confidence、图片尺寸等是可选字段，简化输出却要求存在。这意味着缺少这些元数据的候选可能被静默过滤，而最终空 items 仍可能是成功响应。这是沿当前源码控制流作出的推断，**没有调用真实 Brave API 复现**。借鉴字段精简，不借鉴用无关元数据完整性决定图片是否存在；我们的尺寸以实际解码为准，失败明确保留错误。依据为上面的图片工具与两份 schema。

Brave 请求层会把 HTTP 错误响应正文附到异常中；我们不原样照搬到模型报告，而是保留状态和简短脱敏原因。这是适配本项目上下文与凭据保护需求的设计取舍，并非声称它存在已验证的泄漏。

web-access 的分层访问与目标驱动可以借鉴，但全文描述含“所有联网操作必须通过此 skill”的强路由。它不适合作为我们 ImageSearch 的 description，也不应把整份 skill 输入 Planner。我们只需说明该工具实际能做什么。

Tavily 的可选参数说明“搜索 API 调用”不必然意味着“服务内部没有模型处理”。对本项目准确的承诺应是：**harness 不新增独立模型调用，不开启额外答案生成、描述生成或重排步骤**；供应商内部如何索引和排序不能由我们保证。

## 3. 最终保留的最小方案

1. 外部仍只有 `ImageSearch(query, count)`；Planner 决定用途、搜索词、看图后是否采用或补搜。
2. 工具内部区分检索、下载、回灌三个职责，用普通函数实现，不拆成三个模型可见工具或三个 agent。
3. 先验证一个通用图片搜索 API，保留供应商排序、原词请求和明确后端。当前选 Serper 试验，不将价格或成熟度当作质量证明。
4. 返回可解码文件的路径和图片，同时区分正常空结果、来源失败、候选下载失败；缺元数据不能伪装成无结果。
5. 模型只接收必要候选字段与真实错误；原图与来源网页不可混淆。调用事实落盘，不增加重复行为指南。
6. 保留现有最终页表及素材映射，不加预算、必须有图、必须补搜、自动浏览器兜底或相关性硬阈值。

这六点的具体字段、文件修改、错误语义、安全边界、供应商备选、分阶段执行及验收样本见 [完整升级方案](../../PLAN-image-search.md)。无需另建一套架构。

## 4. 方案完成与上线完成分开

研究与设计已具备：有官方/源码依据、有不采用项、有兼容方案、有按错误类型和实际用途验证的方法。实际实施已完成旧链错误反馈、Serper 适配和单测；三个原 query 的 nokey Planner 结果见 [实验报告](REPORT.md)。

尚未完成的是 Serper 真实认证与新旧相关性对照，原因是缺 `SERPER_API_KEY`。因此保留旧默认，不能声称整个搜图能力升级已验证。完整课件生成也不是本次 Planner-only 实验的交付项，不为研究方案额外启动。
