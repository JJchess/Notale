# PPTX → HTML · 最小 harness v1

当前纯模板转换入口为相邻的 [确定性转换器](../pptx2html-converter/README.md)，运行期无需模型。
本目录保留为 Gemini code agent 与轨迹实验，不再作为纯 1:1 模板转换的默认入口。

一个 Gemini 3.8 Flash code agent，三个基础工具，一项交付存在性检查。
先观察简单架构的真实能力，再根据实际失败增加机制。

这个目录可以单独复制运行。没有 `infra`、`core`、Codex 采集 kit 或上层配置文件的 Python 依赖。
不会读取上层 `.env.local`、调用其他模型或启动 Codex。

## 启动

Python 3.11+，Linux；安装 Python 依赖和 bubblewrap：

```bash
cd pptx2html-harness
python3 -m pip install -r requirements.txt
# bwrap 位于 PATH，或 export BWRAP=/absolute/path/to/bwrap
```

本机可以直接使用已安装的独立 bwrap 可执行文件；代码会查找它，不依赖 Codex Python/JS 模块。
模型需要的 Python、LibreOffice、Poppler、Chromium 等是环境工具，由模型按需调用。
不会在准备阶段强制检查整套转换工具或渲染 PPTX。

```bash
# 在当前 shell 设置自己的 GEMINI_API_KEY 后执行。
python3 run.py --pptx '/data1/home/zhuyifan/ws2/Notale/秀钟书院特色课程PPT模板-课程名称在母版视图修改.pptx'
```

这一条命令自动准备输入并运行，结果写入本目录 `runs/<UTC时间戳>/`，启动时打印实际路径。
需要命名实验时加 `--run-dir runs/xiuzhong-02`；已有目录不会覆盖。
`prepare --pptx ... --run-dir ...`、`run --run-dir ...` 和 `inspect --run-dir ...` 仍可单独使用。

模型固定为 `gemini-3.8-flash`（用户目标 Gemini 3.8 Flash）。默认采用主项目已使用的 Google Chat 路线：
`https://generativelanguage.googleapis.com/v1beta/openai`，`reasoning_effort=low`。
需要自有兼容端点时显式传 `--base-url` 和 `--api-key-env`；不切换模型，不自动 fallback。
模型返回的 `tool_calls` 连同 `extra_content.google.thought_signature` 原样进入后续请求。

运行记录和交付保存到指定目录；可用 `--max-turns` 设置操作预算，预算耗尽不算交付。
不支持 resume。重复实验使用新目录，防止混入上一轮文件。

## 内核与外部 harness

| 文件 | 职责 |
|---|---|
| [agent.py](agent.py) | 通用单 history 循环；执行工具、回传结果；最终消息交给外部回调判断是否可结束 |
| [model.py](model.py) | 唯一 Gemini 模型的 Chat 传输，无重试、无模型路由 |
| [tools.py](tools.py) | `exec_command`、`write_stdin`、`view_image`；文件读写和编辑通过 shell 完成 |
| [sandbox.py](sandbox.py) | 独立 bwrap 封装；原件只读，工作区可写；不向 shell 传模型凭据 |
| [run.py](run.py) | 准备目录、装配任务、启动 agent、唯一的交付 gate、结果查看 |
| [policy.md](policy.md)、[task.md](task.md) | 短工作约束与 PPTX 转换目标；不规定实现路线或结构 schema |

**唯一交付 gate：`output/` 中有非空 HTML。** 缺失时仅提醒模型保存结果。
通过后状态为 `delivered_unreviewed`，不代表浏览器能运行、视觉保真、可替换性或交互已通过认证。
输入只读、工具参数和 API 错误处理属于运行边界，不是额外质量 gate。

模型自主解析 PPTX、提取或绘制素材、实现 HTML、渲染、看图和修正。没有固定阶段、独立 reviewer、
JS cell、Code-mode RPC、checkpoint、结构校验、逐布局覆盖闸、浏览器质量闸或评分器。
运行期不给其他模型或图片模型入口；使用原素材或代码绘制。

```text
runs/<name>/
  manifest.json             输入路径与固定模型
  workspace/input/          只读原件
  workspace/output/         纯 HTML 模板及实际引用的必要素材
  workspace/scratch/        模型自行保存的参照、截图及中间文件（不随模板交付）
  workspace/.tmp/           模型临时文件
  state/request-*.json      实际 Chat 请求（不含授权 header）
  state/response-*.json     原始模型响应
  state/events.jsonl        工具事件与完整命令输出
  state/delivery.json       最后一次存在性检查
  state/result.json         退出状态与原始 usage
  final.md                  模型交付说明
```

## 验证与来源

```bash
python3 -m unittest -q test_harness
```

定向测试使用本地 HTTP 模型替身及真实 shell 隔离，覆盖 Chat 工具/图片与 thought signature 回放、
只读输入、进程续接、最小 gate、预算/错误退出和目录独立运行。
2026-09-10 已完成首轮真实转换 `runs/xiuzhong-01`：使用与 Astra 完全相同的任务和输入，
仅调用 Gemini 3.8 Flash，耗时 13 分 8 秒、87 次模型响应，交付 7 页及 2 个示例。
模型自主渲染、看图；运行结果仍是 `delivered_unreviewed`，不等于完整质量验收。

[首轮预览](runs/xiuzhong-01/workspace/output/index.html) ·
[抽查记录](runs/xiuzhong-01/review/README.md) ·
[原始轨迹](runs/xiuzhong-01/state/)

抽查中导航、文字编辑和滑块联动有效；主要偏差是往原模板留白处加入课程内容、
标识比例发生变化，以及互动示例的绿电渗透率可超过 100%。产物保留原样作为基线。
当前目标进一步收敛为逐页 1:1 复刻：保留原有文字与留白，不生成课程、复用/互动示例、导航侧栏或编辑器。
`output/` 仅交付 HTML 与必要素材，参照、截图和中间文件放 `scratch/`。这是任务要求，不增加运行期 gate。
首轮原始 query 仍保存在该轮 state/request-001.json 中。

[架构图](../ARCHITECTURE-template2html.html) ·
[原始 Astra 采集](../../infra/codex-harness-kit/runs/astra-xiuzhong-01/) ·
[早期提炼记录](../../infra/experiments/template2html/harness/MECHANICS.md)

这些外部路径仅用于查看历史，不参与本目录运行。Astra 是离线教师，运行期只有 Gemini。
