# 文生图前置规划层：行业扫描与技术选型

状态：Research snapshot  
调研日期：2026-08-01  
范围：联网研究、异构材料解析、长上下文证据组织、60–70 页长讲义规划、文生 PPT 开源项目与评测。

## 1. 结论先行

当前 V2 的 L0 只能读取本地文件路径、计算 SHA-256，并由一次 content provider 直接产出 `content-pack.json`。本地 provider 实际上只会按 Markdown 标题切页，每段最多取 8 条文本；它不具备 PDF/DOCX/PPTX/PNG 解析、联网研究、证据定位、跨材料冲突处理、长讲义分段规划或断点恢复。

行业中可靠的方向不是“换一个超长上下文模型，然后一次生成 70 页”，而是：

1. 先把网页、PDF、Office、图片解析成统一、可追踪的文档中间表示。
2. 把搜索拆成研究计划、并行取证、来源审计和证据压缩，而不是把搜索摘要直接交给写作模型。
3. 用章节树和多层摘要管理长上下文；每页只消费自己的证据包。
4. 用 `deck charter → story map → section plan → page contract` 四级编译产生长输出，按章节写入 JSONL/独立文件并设置检查点。
5. 视觉风格由规划阶段按主题、受众和语气动态生成一套 deck-level design DNA；七个风格只能作为评测锚点，不能成为候选枚举。
6. 评测必须同时覆盖 content、design、coherence、aesthetics、editability、audience fit 和 source grounding，不能只看截图是否溢出。

建议采用“轻路由 + 深解析后备”的本地优先方案：

- 文件类型探测：文件签名/MIME，必要时接 Apache Tika。
- 干净 Office/文本快速通道：MarkItDown。
- 布局敏感的 PDF、PPTX、图片主通道：Docling。
- 扫描件、复杂表格、图表与阅读顺序后备：PaddleOCR PP-StructureV3。
- 检索：BM25 + dense + rerank + 层级摘要，不把纯向量搜索当作唯一检索器。
- 联网研究：STORM 式多视角问题发现 + planner/executor 式并行搜索 + 原子证据账本。
- 工作流：先在现有 Node 流水线内实现显式状态机和内容寻址检查点；规模扩大后再评估 LangGraph/Temporal，不应第一天引入重型平台。

## 2. 现有实现审计

| 能力 | 当前实现 | 缺口 |
|---|---|---|
| 材料接入 | `project.materials[]` 路径 + SHA-256 | 无 MIME 路由、远程 URL、目录、ZIP、附件关系、权限与来源元数据 |
| 文档解析 | 本地 provider 只读 UTF-8 Markdown | 无 PDF/DOCX/PPTX/XLSX/图片/OCR/版面/表格/公式/图表/演讲者备注 |
| 内容规划 | 一次 provider 直接生成完整 `content-pack` | 无研究计划、章节计划、证据包、长输出分页、断点续跑 |
| 来源引用 | claim 只保存 `sourceIds` | 无 URL、页码、段落、bbox、引用片段、抓取时间、内容哈希、来源质量 |
| 联网研究 | 无 | 无搜索、抓取、去重、权威性/新鲜度评分、引用核验 |
| 长上下文 | 无显式索引或压缩 | 页数多时只能靠 provider 自己承担全部上下文 |
| 长输出 | 页面数组可以很长 | “数组能容纳 70 页”不等于能稳定规划 70 页；无章节隔离和全局一致性审计 |
| 可观测性 | `experiment-log.jsonl` 和阶段计时 | 无 trace/span、token、缓存命中、查询/来源/证据/page lineage |
| 视觉规划 | `buildVisualPlan()` 在 content-pack 后一次生成 | 规划较薄；设计 DNA 未与研究/叙事共同推导 |

现有可保留的资产：

- `content-pack.json` 的语义/呈现边界思想是正确的，可作为后向兼容输出。
- JSON Schema Draft 2020-12 已在使用，可继续作为所有中间合同的验证基础。
- reference/page/review provider 的可替换接口、逐页证据目录和 JSONL 日志可以扩展。
- 逐页构图台账、真浏览器探针和定点回炉适合继续留在下游。

## 3. 开源项目热度快照

星标取自 GitHub API，时间为 2026-08-01。星标只表示社区关注度，不等同于质量、许可证适配度或生产可用性。

### 3.1 文档解析与 OCR

| 项目 | Stars | 许可证 | 强项 | 对本项目的判断 |
|---|---:|---|---|---|
| [Microsoft MarkItDown](https://github.com/microsoft/markitdown) | 170,583 | MIT | 多格式到 Markdown，接口轻，适合 Office/文本快速接入 | 采用为 fast path；不承担高保真版面解析 |
| [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | 86,702 | Apache-2.0 | OCR、布局、表格、公式、图表、阅读顺序、Markdown/JSON | 采用为扫描件和复杂视觉文档后备 |
| [MinerU](https://github.com/opendatalab/MinerU) | 76,410 | 自定义/历史许可变化 | 复杂 PDF/Office、VLM+OCR、Markdown/JSON | 进入基准，不直接嵌入；上线前必须法务复核 |
| [Docling](https://github.com/docling-project/docling) | 64,084 | MIT | 统一 `DoclingDocument`、PDF 布局/表格/公式/阅读顺序，多格式 | 推荐为 canonical parser 主通道 |
| [Marker](https://github.com/datalab-to/marker) | 38,088 | Apache-2.0 | PDF 到 Markdown/树状 JSON，速度与准确率取向 | 作为 PDF A/B 候选，不先成为唯一主通道 |
| [Unstructured](https://github.com/Unstructured-IO/unstructured) | 15,239 | Apache-2.0 | 多格式 partition 元素生态成熟 | 适合连接器参考；与 Docling 功能重叠，暂不双重引入 |
| [Apache Tika](https://github.com/apache/tika) | 约 3,800 | Apache-2.0 | 千余格式检测、元数据与文本抽取 | 可作为极宽格式探测器；Java 运行时需权衡 |

文档解析不应凭 star 选冠军。建议用 OmniDocBench 的类型覆盖方式构建自己的 PPT 规划语料基准，尤其要单独测试：中文课件、扫描 PDF、双栏论文、公式、复杂表格、PPT 演讲者备注、图中文字和截图中的流程图。

### 3.2 RAG、索引与长上下文

| 项目 | Stars | 许可证 | 可借鉴部分 |
|---|---:|---|---|
| [RAGFlow](https://github.com/infiniflow/ragflow) | 86,547 | Apache-2.0 | 深文档理解、可追踪引用、完整产品形态；适合作为竞品基准，不建议整套嵌入 V2 |
| [LlamaIndex](https://github.com/run-llama/llama_index) | 51,267 | MIT | 连接器、索引、检索器抽象；可参考接口设计 |
| [Microsoft GraphRAG](https://github.com/microsoft/graphrag) | 35,138 | MIT | 实体/关系/claim 抽取、层级 community report；适合跨材料主题综合 |
| [Haystack](https://github.com/deepset-ai/haystack) | 26,073 | Apache-2.0 | 显式可观测的生产 RAG pipeline；适合作为组件边界参考 |
| [RAPTOR](https://github.com/parthsarthi03/raptor) | 研究实现 | 见仓库 | 递归聚类与摘要树；直接支持“整章/整份材料”层级检索 |

`Lost in the Middle` 发现重要信息在长上下文中部时性能会显著下降；RULER 区分“宣称上下文长度”和“有效上下文长度”；LongBench 还覆盖中文和多任务。这三项共同否定了“把所有材料一次塞入模型”作为可靠架构。

### 3.3 联网研究与长报告

| 项目 | Stars | 许可证 | 核心模式 | 可借鉴部分 |
|---|---:|---|---|---|
| [STORM](https://github.com/stanford-oval/storm) | 30,540 | MIT | 多视角提问 → 可信来源对话 → 层级大纲 | 研究前发现“未知的未知”，非常适合课程/汇报的覆盖面设计 |
| [GPT Researcher](https://github.com/assafelovic/gpt-researcher) | 28,756 | Apache-2.0 | planner → 多执行器 → publisher | 研究问题并行、来源跟踪、长报告聚合 |
| [Open Deep Research](https://github.com/langchain-ai/open_deep_research) | 12,477 | MIT | supervisor/researcher + summarization/compression/final models | 把搜索摘要、研究、压缩、最终写作分模型/分合同 |
| [OpenResearcher](https://github.com/TIGER-AI-Lab/OpenResearcher) | 新项目 | 见仓库 | 长时程研究轨迹、100+ turns | 作为未来模型/轨迹研究，不作为首版依赖 |

商业系统也在收敛到相似交互：先显示研究计划，允许用户限定来源或中途调整，最后输出可核验引用。联网检索的关键不是某一家搜索 API，而是查询分解、并行取证、来源选择、证据去重、引用核验和停止条件。

### 3.4 文生 PPT 与渲染

| 项目 | Stars | 许可证 | 核心贡献 | 对规划层的启发 |
|---|---:|---|---|---|
| [Presenton](https://github.com/presenton/presenton) | 9,269 | Apache-2.0 | 本地/自托管、上传文档、HTML/Tailwind 模板、可编辑 PPTX、API/MCP | 产品能力基准；验证“结构/故事线/模板继承”要统一考虑 |
| [PPTAgent / DeepPresenter](https://github.com/icip-cas/PPTAgent) | 4,873 | MIT | 参考 PPT 结构归纳、outline、代码编辑、渲染观察驱动反思 | 强烈建议吸收“规划—渲染—观察—定点修订”闭环 |
| [Paper2Slides](https://github.com/HKUDS/Paper2Slides) | 3,803 | MIT | RAG → Analysis → Planning → Creation，阶段检查点 | 与本项目目标最接近；检查点和多格式输入值得直接参考 |
| [AutoPresent](https://github.com/para-lost/AutoPresent) | 175 | MIT | 程序化结构视觉、SlidesBench、迭代自修订 | 学术影响高于 star；程序化输出在交互/编辑性上优于纯图片 |
| [PptxGenJS](https://github.com/gitbrent/PptxGenJS) | 5,921 | MIT | OOXML 可编辑 PPTX 生成 | 下游导出候选，不负责研究和叙事规划 |
| [Slidev](https://github.com/slidevjs/slidev) | 47,931 | MIT | Markdown/Vue 演示生态 | 开发者演示基准，不解决证据研究 |
| [Marp](https://github.com/marp-team/marp) | 12,275 | MIT | Markdown 到演示 | 稳定文本演示基准，设计自由度有限 |
| [reveal.js](https://github.com/hakimel/reveal.js) | 72,067 | MIT | Web 演示运行时 | V2 已采用，继续保留为离线 HTML runtime |

本地 `GordenSuperPPTSkills` 的可取之处是：先生成完整 outline、为每页明确核心逻辑/视觉框架/详细内容，再生成 self-contained page prompt，并保留中间产物。需要修正之处是：

- “每页框架必须不重复”会牺牲 deck 级一致性，应改成“构图签名控制重复，但允许同一信息架构家族复用”。
- “默认高密度豪华”不是普适标准，密度必须由受众、场景、时长和内容类型决定。
- 把大量文字烧进图像对中文准确性和编辑性风险很高；文本、数字、拓扑真值仍应进入可编辑语义层。
- outline 不能只存长段落，还必须携带原子 claim 与精确证据定位。

## 4. 研究与评测共识

### 4.1 长讲义必须分层规划

- STORM 证明“多视角研究 → 层级大纲”比简单 outline-driven RAG 更有组织性和覆盖面。
- RAPTOR、GraphRAG 都使用多层摘要，让检索既能回答局部细节，也能回答全局主题。
- 2024 年 INLG 的多阶段文档转幻灯片研究显示，多阶段 LLM/VLM 流程优于直接提示。
- PPTAgent 先归纳参考演示的结构模式与内容 schema，再生成大纲和页面。
- Paper2Slides 把 RAG、分析、规划、创建分开，并为阶段设置 checkpoint。

因此 60–70 页不是一次输出任务，而是“编译一个章节图，然后按章节增量物化页面合同”的任务。

### 4.2 评测从“好不好看”走向可验证细项

- PPTEval：Content、Design、Coherence。
- SlidesGen-Bench：Content、Aesthetics、Editability，并把最终渲染作为方法无关的比较层。
- PresentBench：每个实例平均 54.1 个二元检查项，强调由权威材料支撑。
- X+Slides：Audience Coverage、Domain-wise Coverage、Efficiency、Correctness，说明视觉质量不能替代受众适配和来源支撑。
- UniPPTBench：vague prompt、long document、multimodal document、multi-source 四种输入场景要分开评测。

V2 现有的硬探针只覆盖技术正确性。规划层还需要可机器检查的 groundedness、coverage、contradiction、redundancy、audience fit 和 narrative coherence。

### 4.3 搜索准确性需要协议，不只是搜索引擎

推荐的搜索协议：

1. 根据 audience、task、time horizon、geography、required evidence 生成研究任务合同。
2. 先发现 4–8 个互补视角，再为每个视角生成查询。
3. 查询并行执行，区分 discovery、verification、counterevidence 三类。
4. 优先原始/官方/论文来源；二手来源可用于发现，不直接承担关键 claim。
5. 对 URL 做 canonicalization、内容哈希和近重复合并。
6. 每条 claim 保存精确证据跨度；引用必须经过 entailment/支持性检查。
7. 当 coverage 达标、边际新信息下降、时间/成本预算耗尽或无未验证关键 claim 时停止。

搜索 provider 可以换成 Exa、Tavily、Brave、Google 或自有搜索；研究协议必须保持不变。Exa 和 Tavily 都已把 search、content extraction、crawl/research 暴露为独立能力，适合放在 provider adapter 后面，不应把业务合同绑死在某家响应格式上。

## 5. 标准与治理

| 标准/规范 | 用途 |
|---|---|
| JSON Schema Draft 2020-12 | 所有中间合同的语法验证；V2 已使用，可直接延续 |
| W3C PROV-O | 表达 source、activity、derived artifact 之间的来源关系 |
| OpenLineage | 记录 job/run/dataset 生命周期；适合借鉴事件结构，不必完整部署生态 |
| OpenTelemetry | 统一 trace、log、metric；贯通搜索、解析、规划和生成阶段 |
| MCP | 将搜索、文档存储、企业数据源作为可替换工具；必须配合权限和输入隔离 |
| OWASP LLM Top 10 2025 | 网页/上传文档一律视为不可信数据；重点防 prompt injection、信息泄漏、过度代理和无界消耗 |
| NIST AI RMF / GenAI Profile | 风险、测量、治理与审计框架 |
| WCAG 2.2 | 下游 HTML 演示的对比度、可感知性和操作性基线 |
| C2PA | 对生成/引用图片的媒体来源与变更历史提供可选的可验证 provenance |

## 6. 选型决策

### 直接采用的模式

- Docling-style canonical document tree。
- STORM-style perspective discovery。
- GPT Researcher-style planner/executor separation。
- Open Deep Research-style research/compress/write model separation。
- Paper2Slides-style stage checkpoints。
- PPTAgent/DeepPresenter-style rendered-artifact reflection。
- RAPTOR/GraphRAG-style hierarchical summaries。
- PresentBench-style atomic checklist。

### 先做 A/B 基准再决定

- Docling vs Marker vs PaddleOCR vs MinerU 的复杂 PDF 解析。
- Exa vs Tavily vs普通搜索 API 的召回、延迟、正文获取率和成本。
- 纯层级树检索 vs graph-enhanced retrieval 的长材料综合收益。
- 现有 Node 显式状态机 vs LangGraph 的开发/运行复杂度。

### 暂不采用

- 一次 prompt 直接从全部材料生成 70 页。
- 纯向量检索作为唯一取证方式。
- 整套引入 RAGFlow/Presenton，只为了获得其中少量能力。
- 把七风格做成模型只能选择的枚举。
- 让图片模型承担所有文字、数字和连线真值。
- 没有原子证据定位的“来源 ID 即引用”。

## 7. 需要建立的本地基准集

最低 24 个输入任务，按以下维度均衡：

- 6 个长 PDF：双栏论文、教材、财报、扫描件、图表密集、中文混排。
- 4 个 DOCX：标题样式良好/混乱、表格、批注或脚注、嵌图。
- 4 个 PPTX：复杂母版、演讲者备注、图表、整页截图。
- 4 组 PNG/JPG：流程图、表格截图、讲义扫描页、照片+文字。
- 3 个多来源网页研究题：需要时效性、反方证据和官方来源。
- 3 个混合输入：本地材料 + 网页 + 多种文件。

每个任务至少评测：解析完整率、阅读顺序、表格/公式/图像保留、来源定位、搜索 precision/coverage、引用支持率、矛盾发现、70 页规划成功率、重复页率、章节连贯性、恢复能力、总时延和 token/费用。

## 8. 一手资料索引

- [Docling](https://github.com/docling-project/docling) 与 [supported formats](https://docling-project.github.io/docling/usage/supported_formats/)
- [MarkItDown](https://github.com/microsoft/markitdown)
- [PaddleOCR / PP-StructureV3](https://www.paddleocr.ai/main/en/version3.x/algorithm/PP-StructureV3/PP-StructureV3.html)
- [MinerU](https://github.com/opendatalab/MinerU)
- [Marker](https://github.com/datalab-to/marker)
- [OmniDocBench](https://github.com/opendatalab/OmniDocBench)
- [STORM paper](https://arxiv.org/abs/2402.14207)
- [GPT Researcher](https://github.com/assafelovic/gpt-researcher)
- [Open Deep Research](https://github.com/langchain-ai/open_deep_research)
- [Lost in the Middle](https://arxiv.org/abs/2307.03172)
- [RULER](https://github.com/NVIDIA/RULER)
- [LongBench](https://arxiv.org/abs/2308.14508)
- [RAPTOR](https://arxiv.org/abs/2401.18059)
- [GraphRAG](https://microsoft.github.io/graphrag/index/overview/)
- [PPTAgent / PPTEval](https://arxiv.org/abs/2501.03936)
- [DeepPresenter](https://arxiv.org/abs/2602.22839)
- [AutoPresent / SlidesBench](https://arxiv.org/abs/2501.00912)
- [Paper2Slides](https://github.com/HKUDS/Paper2Slides)
- [PresentBench](https://arxiv.org/abs/2603.07244)
- [SlidesGen-Bench](https://arxiv.org/abs/2601.09487)
- [X+Slides](https://arxiv.org/abs/2606.19256)
- [UniPPTBench](https://arxiv.org/abs/2605.17356)
- [BrowseComp](https://openai.com/index/browsecomp/)
- [JSON Schema 2020-12](https://json-schema.org/draft/2020-12)
- [W3C PROV-O](https://www.w3.org/TR/prov-o/)
- [OpenLineage specification](https://github.com/OpenLineage/OpenLineage/blob/main/spec/OpenLineage.md)
- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/)
- [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

