# GPT-6 Astra 蒸馏方向：PPTX template2html

输入是一套 `.pptx` 模板；产出是保留其视觉特征、能够更换内容并承载互动讲义的 HTML 模板集合。
先采集 Astra 把这件事做成的完整轨迹，再提炼 harness。暂不预设解析器、规划器或分层流水线。

## 为什么采用 Codex

研究对象包括 **视觉理解、代码实现、素材生成/编辑、浏览器检查之间的配合**。
希望学到的是模型如何选择表示方式，什么时候提取原素材、什么时候写 HTML/SVG、
什么时候生成或编辑位图，以及如何把素材放回页面并修正结果。
单独收集最终 HTML 或一串 shell 命令不足以回答这些问题。

Codex 的内置生图/编辑及其参考图工作流是实验能力的一部分。
不能因清理用户历史而顺便剥掉这种能力，也不能把图片生成全部改成预置素材后仍称为相同基线。
“工具在能力声明中存在”“调用成功”“生成结果被采用”是三个不同观测。
不要求每轮必须调用生图，也不把零调用自动判为失败。

## 成功标准与研究问题

| 维度 | 需要看的证据 |
|---|---|
| 视觉忠实度 | 原页与 HTML 在同尺寸下对照；字体、布局、装饰、图片裁剪与层级的偏差 |
| 可复用性 | 更换标题/正文/图片后仍可使用；文本和主要内容没有被烘焙进背景 |
| 交互接入 | 在内容区域接入一个最小交互，页面的视觉结构仍成立 |
| 版式覆盖 | 展示页对应关系、母版/布局支持情况；不把 XML part 数直接当有效版式数 |
| 素材决策 | 提取、代码重建、生图/编辑的选择；参考图→指令→结果→页面使用的证据 |
| 收敛成本 | 检查后修正了什么、改了几轮、耗时和 token；生图费用单列未知，不混入文本模型估价 |

首轮先人工审阅，记录问题，不先发明一个综合分数。PPTX 结构与截图都是证据，
两者冲突时要记录字体/渲染器差异；图像差分只能辅助定位，不能替代视觉判断。

## 首轮操作

```bash
cd ~/ws2/Notale/infra/codex-harness-kit
./go.sh astra-template-01 --pptx /absolute/template.pptx --dry-run
./go.sh astra-template-01 --pptx /absolute/template.pptx
./go.sh astra-template-02 --pptx /absolute/template.pptx
python3 measure/trace.py runs/astra-template-01 --compare runs/astra-template-02
```

模板输入必须由操作者明确指定；不自动从别的实验挑一份。相同 PPTX 用 SHA256 标识。
原件副本归档到 `inputs/template.pptx`，被试看到只读 `input/template.pptx`。
展示页/母版/布局等初始计数仅留在研究者归档中，不替模型做模板分析。
任务书只写目标与交付判据，见 [task.md](task.md)。

主记录是 Codex rollout 和 API 请求；素材还可能落在 Codex home 的 `generated_images/`，
因此单独归档到 `generated-assets/`。工作目录里的素材随 deliverable 一同归档。
图片内容、生成指令、参考图和采用关系都要保留；无法确认的关系标成未知。
Code mode 的工具声明可能在 `input[type=additional_tools]` 和其工具说明中，不能只查顶层 `tools`。
`capabilities.json` 记录实际声明；`manifest.quality.required_capabilities_advertised`
标记该轮是否观察到实验所需能力。未观察到生图工具时，不把该轮当作“已包含 Codex 生图能力”的基线。

## 能力审计边界

本机 API 登录模拟测试与正式 ChatGPT 登录的能力不必相同；本地 mock 只验证接线，
不证明图片服务真的生成成功。生图可能走独立端点，主 Responses proxy 不自动等于生图抓包。
素材操作以原生工具输入/输出和文件为依据，未采到独立生图请求/usage 时明确保留该缺口。

官方能力说明：[OpenAI Docs — Image generation](https://learn.chatgpt.com/docs/image-generation)。
正式采集必须以本轮实际能力声明和调用结果为准。

本机验证状态（2026-09-07）：21 项自动测试通过；API 身份的本地模拟请求可提取
Code mode 工具声明，但只看到 imagegen 技能提示，没有观察到可调用的原生生图声明。
ChatGPT 身份的独立模拟对接探针超时，未完成生图能力确认；不能推断正式 TUI 生图不可用。
首轮必须确认完整 Codex 环境中的声明与真实素材调用，再把它作为蒸馏基线。

## 从轨迹到 harness

先同模板独立跑两轮，再换不同视觉特征的模板，判断哪些行为是稳定共性、哪些取决于模板。
优先研究“素材如何拆开并变得可复用”和“视觉检查如何驱动修正”。
只有出现重复证据时才固化步骤；素材生成与编辑的决策规则尤其不能靠预先想象。
旧 gallery-deck 保留为独立实验，`--exp gallery-deck` 显式选择。

## 2026-09-08：秀钟首轮已审阅

[首轮提炼报告](distillation/astra-xiuzhong-01.md)与[harness v1 独立运行时](harness/README.md)已落盘。
正式轨迹已确认声明 `image_gen__imagegen`；本轮素材均可提取，实际未调用生图。
交付包含 7 个对应页、15 个布局及两个复用示例；原作者 29 项检查独立复跑通过，
另有 harness 自己的哈希、资源、覆盖和浏览器检查。
目前仍是单轮候选，原始任务书保持不变，尚未证明通用转换能力或弱模型效果。

v1 已补到[执行机制](harness/MECHANICS.md)层：38 个模型边界的上下文还原、Code-mode 工具调度、
持续进程、图像回传、文件版本、检查失败反馈和恢复。隔离环境中的真工具/真浏览器链路测试通过；
该测试使用脚本模型和教师产物夹具，不冒充新的模型质量实验。
