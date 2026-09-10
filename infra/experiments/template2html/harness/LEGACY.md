# 旧扩展运行时存档（非最小 v1 入口）

> 2026-09-10 起默认入口采用 [README.md](README.md) 的最小方案。
> 下文命令和状态为历史记录；原 `run.py` 已存档为 `legacy_run.py`，不应照下文命令启动新的基线。

状态：已实现上下文、Code-mode 工具、持续进程、图像回传、模型循环、文件版本、检查反馈、恢复和公共 API 接口。
**尚未完成真实模型端到端转换、跨轮验证和弱模型迁移**；不是一个已经验证的通用 PPTX parser。
完整机制说明见 [MECHANICS.md](MECHANICS.md)，逐请求证据见 [38 个模型边界](../distillation/astra-xiuzhong-01-boundaries.md)。
交互机制图见 [ARCHITECTURE-template2html.html](../../../../notale-v2/ARCHITECTURE-template2html.html)：对齐 `ARCHITECTURE-v4.html` 的执行语义与视觉规范，区分模型调用、工具调用、harness 固定流程和循环终止，展示上下文、工具/进程、验收反馈、恢复与文件证据；点击节点查看职责和源码，可放大、展开角色分工或导出 SVG。图中保留本实现的验收失败回喂机制，不沿用参考架构的审计不回喂规则。
依据：[秀钟首轮报告](../distillation/astra-xiuzhong-01.md)、[证据片段索引](episodes.json)。
本目录是实验的领域层；通用采集仍在 `infra/codex-harness-kit/`。

模型分工：**GPT6 Astra / Codex 是教师轨迹来源；`gemini3.8flash` 是后续 harness 的执行模型，也是 CLI 默认值。**
当前模型传输仍是 Responses 适配，尚未验证 Gemini 供应商的协议与模型标识；指定模型名不代表接入已经完成。
运行时必须显式传入端点。接入时需对齐工具 schema、图像输入、推理状态和 usage；图片生成供应商单独配置。

## 运行入口

环境：Python 3.11+、Node、采集 kit 可用的 bwrap、LibreOffice/Poppler、Playwright/Chromium。
Python 依赖见 [requirements.txt](requirements.txt)。运行时不启动 Codex，不读取 ChatGPT 登录凭据。

```bash
cd ~/ws2/Notale/infra/experiments/template2html/harness
python3 -m unittest -v

# 准备独立工作区和本轮 PPTX 参照；不调用模型。
python3 run.py prepare \
  --run-dir ../../../codex-harness-kit/runs/template2html-harness-01 \
  --pptx '/data1/home/zhuyifan/ws2/Notale/秀钟书院特色课程PPT模板-课程名称在母版视图修改.pptx'

# HARNESS_BASE_URL / HARNESS_API_KEY 指向已验证的 Responses 兼容供应商。
# 如果供应商使用其他协议，需先实现适配；下面是配置入口，尚非已验证的 Gemini 调用。
# 设置 IMAGE_MODEL 为供应商支持的图片模型名，才能暴露生成/编辑工具。
python3 run.py run \
  --run-dir ../../../codex-harness-kit/runs/template2html-harness-01 \
  --model gemini3.8flash --base-url "${HARNESS_BASE_URL:?set a verified endpoint}" \
  --api-key-env HARNESS_API_KEY

# 中断后沿用相同模型/端点/能力配置；不会重执行结果未知的旧工具调用。
python3 run.py resume \
  --run-dir ../../../codex-harness-kit/runs/template2html-harness-01 \
  --model gemini3.8flash --base-url "${HARNESS_BASE_URL:?set a verified endpoint}" \
  --api-key-env HARNESS_API_KEY

python3 run.py inspect --run-dir ../../../codex-harness-kit/runs/template2html-harness-01
python3 measure_run.py ../../../codex-harness-kit/runs/template2html-harness-01
```

未指定 `--image-model` 时明确记录 unavailable，不假装保留了原生 Codex 生图能力。
图片端点/凭据可分别用 `--image-base-url/--image-key-env` 配置。
启用生图时另加 `--image-model "$IMAGE_MODEL" --image-base-url "$IMAGE_BASE_URL" --image-key-env IMAGE_API_KEY`，
并在 resume 时沿用同一配置。执行模型改为 Gemini 不自动改变图片生成后端。
恢复旧 Astra 实验时必须显式传回旧 `--model`、端点和凭据环境变量名；默认值只用于新实验。
公共 API 的模型可用性取决于账号/供应商；没有后台默认降级模型或自动读其他项目密钥。
`--max-turns/--max-context-bytes` 是可选操作预算，到达时记为未完成，可增加预算后恢复。

| 文件 | 执行职责 |
|---|---|
| [extract.py](extract.py)、[probe_trace.py](probe_trace.py) | 完整请求/输出/上下文提取；执行原始 JS 的无副作用调度探针 |
| [policy.md](policy.md)、[protocol.py](protocol.py) | 领域工作规则、模型实际收到的工具定义与结果格式 |
| [environment.py](environment.py) | 输入事实、隔离、环境与原稿参照准备 |
| [code_worker.mjs](code_worker.mjs)、[tools.py](tools.py) | JS RPC、exec/wait、shell/续接、看图、生图调用桥 |
| [model.py](model.py) | 公共 Responses 与 Images 适配，图片来源记录 |
| [loop.py](loop.py)、[run.py](run.py) | 单模型持续执行、检查失败反馈、预算、中断恢复、结束 |
| [artifacts.py](artifacts.py)、[measure_run.py](measure_run.py) | 工具边界的内容寻址文件版本、token 与动作测量 |
| [audit.py](audit.py) | 独立静态/浏览器闸，失败报告进入模型上下文 |
| [smoke.py](smoke.py)、[test_runtime.py](test_runtime.py) | 真工具/真浏览器+测试模型的完整链路，以及细粒度回归测试 |

运行目录保留 `workspace/input`、`workspace/output`、只读宿主事实/报告 `workspace/_harness`，
以及模型不可见的 `state`（请求/响应、事件、checkpoint、文件版本、生成来源）。
最终状态 `delivered_needs_manual_review` 表示自动闸通过，视觉保真等仍需人工审阅。

## 本轮执行验证

原始 33 段 JS 全部通过无副作用探针，38 个上下文边界配对无缺口。
完整 smoke 在隔离副本上执行“移走 CSS→实际检查失败→错误回传→恢复 CSS→22 页浏览器通过”，
同时验证图像进入下一模型请求、输入只读和 workdir。
结果在 `../../../codex-harness-kit/runs/harness-v1-xiuzhong-smoke-v3/smoke-result.json`，并保留工具边界的文件版本。
19 项回归测试覆盖上下文、工具/进程、图像帧、生成引用、文件版本、重复调用、中断恢复和闸反馈。
这里复用教师产物作为**测试夹具**，模型由脚本替身提供，没有生成新的转换结果，也不是教师质量复现。
真实模型和图片服务尚未调用；公共 API 的 wire 只通过本地 HTTP 替身验证。

## 首轮提出的行为假说

准备运行环境及参照 → 单模型检查 PPTX 与素材 → 实现可替换 HTML → 浏览器检查 → 按缺陷修正 → 交付审阅。

其中，**实现、素材表示选择和修正保留在模型循环内**。本轮没有子 agent，
不添加 planner/worker 层；没有生图调用，不发明“必经生图”的阶段。
前置准备和独立验收是候选封装点，两轮共同轨迹尚未确认，不能称已验证的稳定流水线。

| 候选封装 | 具体内容 | 证据与边界 |
|---|---|---|
| 环境准备 | 找到可运行的 Python、LibreOffice、Poppler、Chromium；预先检查字体、渲染和监听能力；本地服务器使用系统分配端口 | 原生 L13–86、L117–138；避免路径探测、端口占用和审批等待挤占转换循环。不修改采集基线权限 |
| 输入事实 | ZIP/XML 的页尺寸、展示顺序、关系链、母版/布局/主题/媒体与原始 part/shape ID；文件哈希 | L25、L59、L72。当前 `audit.py` 提取审阅所需子集，不做样式继承求值 |
| 原稿参照 | LibreOffice → PDF → 同尺寸 PNG；素材联系表；未使用布局需单独填充检查 | L33–86、L165–193；记录渲染器/字体，不能把 LibreOffice 截图称为 PowerPoint 真值 |
| 模型循环 | 根据证据选提取/代码绘制/生成；实现 slots、裁剪与继承；检查、修正直到缺陷有验证证据 | L95–290。保留模型自主选择，不固定修正次数 |
| 独立验收 | 真实哈希、静态资源、输入覆盖、浏览器加载与替换；视觉问题人工审阅 | L224–290 及首轮脚本审计；实现见 `audit.py`，不信任产物内写死的 pass |

## 可复用接口候选

从真实产物保留字段名，不另造一套中间表示：

```text
structure.json: size, slides, layouts, palette
template:      id, name, layout?, usedBy?, items
item:          source, id, name, box, kind, slot?, asset?, crop?,
               text?, style?, paragraphs?, placeholder?, fill?, shape?, ...
PPTTemplate.render(container, id, values)
instance.update(key, string | Node | {src, alt, fit})
instance.slots / destroy() / guides() / editable()
```

这里只是**产物契约候选**，不是 API 请求 schema；请求层减法单列在 [request-fields.md](request-fields.md)。
`source + id` 保持到 OOXML 对象的可追溯关系。输入中没有的交互内容区应明确为新增 region。
几何/颜色/裁剪可由代码执行；“什么是标题、哪块可替换、品牌装饰如何保留”等判断仍由模型完成。

不要把教师 `build.py` 直接升格为通用 parser：它固定 7 页、15 布局、第一份 master/theme、
1280×720、素材名、校名和内容区坐标，且只实现有限 OOXML/EMF 特性。
WQY 字体删除 `vhea/vmtx` 是这个字体的缺陷修复，不是通用字体处理步骤。

## 现在可以运行的独立闸

`audit.py` 读取 PPTX、输出契约及页面，在独立目录写报告和截图。
不调用模型，不执行产物里的 Python；浏览器会正常执行交付 HTML/JS。
默认只需 Python 3.11+ 标准库；`--browser` 需要已安装 Playwright 与 Chromium。

```bash
cd ~/ws2/Notale/infra/experiments/template2html/harness
python3 -m unittest -v

/data1/home/zhuyifan/miniforge3/bin/python audit.py \
  --pptx '/data1/home/zhuyifan/ws2/Notale/秀钟书院特色课程PPT模板-课程名称在母版视图修改.pptx' \
  --output ../../../codex-harness-kit/runs/astra-xiuzhong-01.review/deliverable/output \
  --report-dir ../../../codex-harness-kit/runs/astra-xiuzhong-01.review/harness-audit-repeat \
  --browser
```

报告目录必须不存在，且不能落在交付物内。失败返回 1；自动检查没有失败时返回 0，
整体状态仍为 `needs_manual_review`，不能因此宣称视觉验收通过。
不启用浏览器时对应状态为 `unknown`；未知不当作通过。

已实现范围：原件 SHA256 重算；HTML src/href、CSS url 相对资源检查；
展示顺序与实际 PPTX 计数；声明源对象存在性；逐模板原生画布、图片加载、文本替换、
字面字符串不解释为 HTML、Node 交互插入、实例销毁；新截图保存到报告目录。
浏览器适配器针对本轮 `PPTTemplate` 契约，未泛化到任意网页框架。

仍需人工/后续闸：所有源形状是否遗漏（尤其 master decoration）、所有 slot 图片裁剪语义、
生成素材采用关系、整页位图替代、字号/长文溢出、像素差的局部解释、其他渲染器差异。
不使用全页 RGB MAE 阈值自动裁决视觉质量；大块留白会稀释局部错误。

## 下一步实验顺序

1. 相同 PPTX、同一份目标任务书，再采一轮原始 Astra 基线。不要把这里的结论注入基线。
2. 对齐两轮的语义动作及失败修正片段；明确哪些准备可固化、哪些继续循环。
3. 再用不同尺寸/多母版或含不同素材表示的模板检验泛化。生成/编辑分支需有真实需求和真实调用的样本。
4. 对齐 `gemini3.8flash` 的供应商协议，用它执行候选 harness 干预轮；Astra 保留为教师参照。
5. 比较 Gemini 执行结果的原稿忠实度、替换/互动行为、未覆盖特性和输入/输出 token；当前没有质量或成本结论。

不设置无依据的循环次数或总分阈值。部署时的预算终止应明确记录为未完成，不能伪装为合格交付。
