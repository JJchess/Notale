# PPTX → HTML · 最小 v1

> 2026-09-10：当前独立实现已落到 [notale-v2/pptx2html-harness](../../../../notale-v2/pptx2html-harness/README.md)。
> 新目录不依赖本目录或采集 kit，并采用已在主项目使用的 Gemini Chat 路线。本目录保留早期提炼版本与证据。

先验证 Gemini 3.8 Flash 在简单 code agent 中能完成什么，再根据真实失败增加机制。
默认入口已收敛到 `run.py` + `minimal.py`，不再经过旧 `loop.py` 的扩展状态机。

- 一个模型：`gemini3.8flash`，CLI 不接受其他模型，没有单独图片模型入口或自动 fallback。
- 一条 history：模型调用 → 直接执行工具 → 结果回传 → 下一轮。
- 三个工具：`exec_command`、`write_stdin`、`view_image`。文件读写和编辑通过 shell 完成。
- **一个交付 gate：`output/` 中存在非空 HTML。** 只有这个条件缺失才提醒模型补交付。
- 输入只读；保存请求、响应、工具事件、产物和退出原因；可显式设置轮数预算。

解析 PPTX、渲染参照、选择素材表示、组织 HTML、看图与修正都由模型决定。
不预置结构 schema、逐布局覆盖、浏览器交互、像素差或评分 gate；质量要求仍在任务书中。
不启用 JS Code-mode cell、RPC worker、文件版本快照、断点恢复或上下文压缩。
`Host` 只复用已有 shell/图像执行能力；扩展方法仍在源码中，但不向最小 v1 暴露、不进入执行链。

## 运行入口

依赖：Python、已有隔离工具 bwrap、openai SDK；处理 PPTX 和浏览器的环境工具由 agent 自行选用。
目前仍复用 Responses 传输适配。**Gemini 供应商协议与真实调用尚未验证**；下面是配置入口，不代表转换已跑通。

```bash
cd ~/ws2/Notale/infra/experiments/template2html/harness

# 仅建立目录和复制输入，不预先解析或渲染 PPTX。
python3 run.py prepare \
  --run-dir ../../../codex-harness-kit/runs/template2html-minimal-01 \
  --pptx '/data1/home/zhuyifan/ws2/Notale/秀钟书院特色课程PPT模板-课程名称在母版视图修改.pptx'

# HARNESS_BASE_URL 必须是已确认支持所需工具和图像输入的 Responses 端点。
# 若供应商用其他协议，需先适配；不猜端点，不读取其他项目凭据。
python3 run.py run \
  --run-dir ../../../codex-harness-kit/runs/template2html-minimal-01 \
  --base-url "${HARNESS_BASE_URL:?set a verified endpoint}" \
  --api-key-env HARNESS_API_KEY

python3 run.py inspect \
  --run-dir ../../../codex-harness-kit/runs/template2html-minimal-01
```

最小 v1 不支持 resume。重复实验使用新目录；中断时保留已有文件与记录供查看。
预算用可选 `--max-turns` 指定，到达时返回 `budget_exhausted`，不算交付。
返回 `delivered_unreviewed` **仅代表存在 HTML 文件**；浏览器能否运行、视觉保真和可编辑性均未被宿主认证。

## 当前边界

| 文件 | 职责 |
|---|---|
| [run.py](run.py) | 最小 prepare/run/inspect 入口，只允许 Gemini 3.8 Flash |
| [minimal.py](minimal.py) | 通用工具循环、原始记录和唯一交付存在性检查 |
| [minimal-policy.md](minimal-policy.md)、[task.md](../task.md) | 短工作约束与用户交付目标；不固定实现路线 |
| [tools.py](tools.py)、[environment.py](environment.py) | 复用 shell/图像与只读隔离；不启动旧 Code-mode |
| [model.py](model.py) | 当前 Responses 适配；真实 Gemini 接入待验证 |
| [test_minimal.py](test_minimal.py) | 直接工具、只读输入、图像回传、最小 gate 与预算的定向验证 |

[架构图](../../../../notale-v2/ARCHITECTURE-template2html.html)沿用 `ARCHITECTURE-v4.html` 的图形规范。
Astra 只提供离线教师证据：[38 个请求边界](../distillation/astra-xiuzhong-01-boundaries.md)。
旧扩展实现及历史验证记录见 [LEGACY.md](LEGACY.md)、[MECHANICS.md](MECHANICS.md)，原始轨迹与产物保持不变。
`legacy_run.py` 是旧控制器存档，不是最小 v1 的运行入口；旧检查仍可人工单独执行，不自动加入基线。

## 如何增加机制

先用这一基线做真实转换并审阅产物。遇到具体失败时，记录输入、工具结果与影响，再选择最小修补。
新增 gate 或 workflow 应能指向观察到的问题，并比较加入前后的结果；不因为“可能会错”预先堆叠。
当前尚无 Gemini 完整转换的质量结论，定向测试使用脚本模型替身，只验证运行机制。
