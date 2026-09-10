# 图片候选来源独立验证与封面门禁清理

2026-09-08。仅执行用户选定的两项；未切换搜索后端或模型，未修改其他门禁。

## 1. 首张标题页硬校验：已删除

- 删除 `core/planner.py::_valid_pages` 对 page-01 必须为标题页的拒绝分支。
- `prompts/deck.md` 将“固定为”改为“默认作为”，保留默认封面安排。
- 保留页号、页型、主题、素材路径等校验。
- 测试覆盖四种页型均可作为首张；非封面首张一次 FinalizePlan 交付、路由到 build-page、生成章节上下文。
- 全量本地回归 `python -m unittest discover -s core -p 'test_*.py'`：127 项通过；未做 git commit。

## 2. 现有搜索返回是否有可直接用的图片地址

检查最近三题的四份 `provider.json`。服务端 `toolResponse.response` 均只有 `search_suggestions`：内容是搜索建议的 HTML，其中链接指向 Google 搜索，未发现候选图片地址或 img 元素。`groundingMetadata` 未提供图片分块。生产代码使用的图片地址仍来自模型最终文本中的 JSON，不是我们遗漏解析了现成的图片结果数组。

检查范围：`runs/{neural,ens,photo}-planner-align-0908-a/pages/assets/img/*/provider.json`。此结论针对这些已记录响应，不外推为所有 Gemini 模型与请求都不能返回图片来源。

### 官方原生图片搜索能力

[Google API 类型定义](https://ai.google.dev/api/generate-content#SearchTypes) 区分默认的 webSearch 与 imageSearch；[图片分块](https://ai.google.dev/api/generate-content#Image) 定义 sourceUri 和 imageUri。[官方使用说明](https://ai.google.dev/gemini-api/docs/generate-content/image-generation#grounding_with_google_search_for_images_31_flash) 将该图片搜索能力限定到 Gemini 3.1 Flash Image，且说明不能用于搜索人物。没有因此切换到图片生成模型。

### 当前模型实测

独立运行 [probe.py](probe.py)，复用上次神经网络的原始 LeNet 搜索词，保持 `gemini-3.8-flash`、请求正文与结构化输出设置，仅把搜索类型显式设为 imageSearch。

一次 HTTP 请求，0.45 秒，返回 **400 INVALID_ARGUMENT**：

> Image search as tool is not enabled for models/gemini-3.8-flash

原始请求及错误：[native-image.json](native-image.json)。服务未返回模型候选或 usage；不据此推断具体账单金额。没有自动重试、调用其他模型或运行 Planner。

## 结论与边界

当前模型不能靠启用原生 imageSearch 来提供真实图片结果；现有日志也没有可直接替换模型 JSON 的原生图片列表。因此此次完成的是可用性验证，**不是已修复图片检索准确率**。生产 ImageSearch 未改。

若继续走“直接取得检索返回的图片地址”，需要单独评估其他图片检索来源，并确认实际可用性与成本后再接入现有工具。这里不新增搜图后端、图片审核模型、网页任意抓图或自动补搜链。
