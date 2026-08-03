# Workflow V2

一条可执行的讲义生成基线：**内容语义是接口，页面呈现由生成器完整撰写，最终质量由真浏览器验收。**

V2 位于独立目录，运行时不 import V1。仅将 reveal.js 运行时复制到 `vendor/reveal/`，便于离线装订和版本冻结。

## 快速运行

要求 Node.js 22+，以及本机 Edge 或 Chrome。

```bash
npm test
npm run build:demo
npm run build:master-premium
npm run build:master-premium-layered
npm run test:e2e:seedream-layered
npm run validate:demo
npm run verify:demo
```

query 流水线统一使用 SiliconFlow `deepseek-ai/DeepSeek-V4-Flash` 进行内容研究与页面规划，参考图阶段调用 OpenRouter `openai/gpt-image-2`。在项目根目录 `.env` 中配置 `SILCONFLOW_API_KEY` 和 `OPENROUTER_API_KEY`；密钥不会写入证据或报告。

## 图转原生 HTML

原生阶段不再使用整页 `<img>`、参考图裁片或 Canvas 截图复刻。VLM 只输出 `native-scene.json`；确定性编译器负责 DOM、SVG 和 CSS3D，所有文字重新绑定 `content-pack.json`。

```bash
# 重放已有“规划 + 参考图”run
node src/cli.mjs reference-html --run runs/reference-run --out runs/native-run

# 只有 query 的端到端入口
node src/cli.mjs query-native-html --query "遗传学定律，20页中文讲义" --out runs/genetics-native

# 不调用远端模型的确定性回归
node src/cli.mjs reference-html --run runs/reference-run --out runs/native-smoke --offline

# 复用已解析 scene 和已生成素材，快速调试渲染器/探针
node src/cli.mjs reference-html --run runs/native-run --out runs/native-run --reuse-scenes
```

`.env` 使用拼写保持不变的 `SILCONFLOW_API_KEY` 调用 SiliconFlow `Qwen/Qwen3-VL-32B-Instruct`，统一承担场景解析和单图评审。图片素材默认使用 OpenRouter `openai/gpt-image-2`；透明素材缺少可靠 Alpha 或调用失败时，使用 `API_KEY` 调用 ParaTera `Doubao-Seedream-4.0` 生成纯色背景素材并执行本地 OpenCV Alpha 抠图。

新增证据包括：

- `native-scenes/*.json`：归一化场景、语义绑定、资产任务与交互声明；
- `asset-manifest.json`：模型、提示词/参考图哈希、alpha、尺寸、文件和耗时；
- `native-audit.json`：整页位图、截图文字、外链、Canvas、语义图形所有权与 WebGL 例外审计；
- `native-probe-summary.json`：2560、1500、980、390 四类视口硬探针；
- `native-interaction-summary.json`：点击、拖动、触摸、键盘和低动态模式；
- `native-review-summary.json`：每页一次最终截图评审；
- `native-timings-summary.json`：VLM、素材、渲染、探针和评审的逐项耗时。

示例产物写入 `runs/tree-basics/`：

- `content-pack.json`：仅含语义、来源哈希和真实 graph 邻接；
- `visual-plan.json`：由语义规划派生的页面职责、阅读路径、视觉论点、质量契约、语义锁与渲染所有权；
- `composition-ledger.json`：已经生成的构图签名，用于跨页判重；
- `pages/*.html`：逐页完整 `<section>`；
- `deck.html`：离线 reveal.js 成片；
- `report.html`：硬闸与单图评审报告；
- `evidence/<page>/`：`ref.<jpg|png|webp> / reference-meta.json / page.html / probe.json / shot.png / verdict.json`；
- `evidence/<page>/attempt-*`：每次生成或定点回炉的原始证据。

## 流水线

1. **L0 内容底座**
   - 读取材料并计算 SHA-256；
   - 本地 provider 使用 `project.pages`，或把 Markdown 标题切成语义页；
   - 校验唯一页 ID、来源引用和 graph 边；
   - 递归拒绝 `layout/style/html/css/svg/position` 等呈现字段。
2. **L2 逐页设计**
   - 先把内容规划编译为 `visual-plan.json`，明确页面角色、单一主视觉、阅读路径、层级、完成度标准和创造自由；
   - 位图提示词只消费视觉导演简报，不直接倾倒控制面字段；文字、指标、节点和连线由 `semanticLocks` 锁定；
   - `generationScope: background-plate` 生成后期合成底板；`full-slide-master` 生成完整 PPT 源母图；
   - 把内容、style-line、三个 hex、反 slop、画布、参考图和构图台账组装为 `page-input.json`；
   - provider 返回完整且唯一的 `<section>`，允许局部 HTML/CSS/SVG；`layered-reference` 可把源母图分解成像素快照、可编辑文字和 SVG 拓扑；
   - 安全闸禁止脚本、事件处理器、外链和未隔离 CSS。
3. **L3 真机验收**
   - 零依赖 CDP 驱动系统 Edge/Chrome；
   - 固定 1440×900、DPR 1；
   - 检查 console、字体、两轴溢出、元素越界、字号、对比度、源码泄漏和外链资源；
   - 每页保存实际截图；
   - 失败仅重写对应页面，携带像素证据，最多重试 `maxRevisions` 次；
   - 单图 review provider 只接收最终截图、页面意图和 probe，不接收参考图。
4. **L4 装订交付**
   - 把最终 section 装订为离线 `deck.html`；
   - 输出人读 `report.html` 与机读 `run.json/probe-summary.json`。

## 源母图 1:1 与编辑态

`examples/tree-master/project-premium-b.json` 展示“规划 → Seedream 完整母图”，`project-premium-layered.json` 展示“母图 → 可编辑 HTML”。

- 默认展示由源母图自动裁出的独立文字/图形快照，因此浏览器截图可与源图做像素级比较；
- 快照清单拒绝整页位图，并受 `maxSnapshotCoverage` 限制；当前示例覆盖率为 49.18%；
- 用户聚焦或修改某个区域时，只隐藏该区域快照并启用对应 HTML/SVG 层；未编辑区域仍保持源图外观；
- 标题修改、节点文字修改和持久化由 `interactionGate` 自动验证；节点还支持 Alt+拖动并同步 SVG 连线；
- `fidelityGate` 分别统计全图、可编辑区和不可编辑区的 MAE 与显著变化像素比例。

`npm run test:e2e:seedream-layered` 会创建新的时间戳测试目录，真实调用 Paratera Seedream，随后自动执行分解、分层构建、像素比较、标题/节点编辑、Alt+节点拖动、SVG 端点同步和最终浏览器复验。自动技术闸通过但视觉评审未配置时，状态为 `technical-pass-visual-pending`，不能当作完整质量通过。

## Project 配置

```json
{
  "title": "讲义标题",
  "design": "../../config/design-baseline.json",
  "materials": ["materials/source.md"],
  "maxRevisions": 2,
  "minFontPx": 16,
  "providers": {
    "content": { "mode": "local" },
    "reference": {
      "mode": "paratera",
      "envFile": "../../.env",
      "apiKeyEnv": "API_KEY",
      "baseUrl": "https://llmapi.paratera.com/v1",
      "model": "Doubao-Seedream-4.0",
      "size": "2560x1600",
      "watermark": false
    },
    "page": { "mode": "local" },
    "review": { "mode": "local" }
  },
  "pages": []
}
```

本地 provider 是可复现的离线基线，供测试和开发使用。`review: local` 会保存最终截图并返回非阻断的 `pending`，因为它不伪装成视觉模型。

`reference: paratera` 使用平台的 OpenAI 兼容图像接口 `/v1/images/generations`，立即下载临时 URL 对应的原始位图，并把不含密钥的请求元数据和完整提示词保存到 `reference-meta.json`。可用配置包括 `envFile`、`apiKeyEnv`、`baseUrl`、`model`、`size`、`watermark` 和 `timeoutMs`。

生产环境可把任一阶段替换成命令型 provider：

```json
{
  "mode": "command",
  "argv": ["python", "providers/my_provider.py"]
}
```

命令从 stdin 接收一行 JSON，并向 stdout 返回一行 JSON。输入包含 `stage`：

| stage | 必需输出 |
|---|---|
| `content` | `{ "contentPack": { ... } }` |
| `reference` | `{ "extension": "svg", "content": "...", "composition": { ... } }`，或进程内二进制 `{ "extension": "png", "binary": Buffer, ... }` |
| `page` | `{ "html": "<section data-page-id=\"...\">...</section>" }` |
| `review` | `{ "pass": true, "status": "pass", "blocking": true, "issues": [], "reason": "..." }` |

`review` 输入只有单张真机截图路径、页面语义与硬探针结果，没有参考图。

## CLI

```bash
node src/cli.mjs build --project examples/tree-basics/project.json --out runs/tree-basics
node src/cli.mjs validate --content-pack runs/tree-basics/content-pack.json
node src/cli.mjs verify --run runs/tree-basics
```

`build` 或 `verify` 在硬闸、阻断式单图评审或重试预算耗尽时返回非零退出码。

架构说明见 [docs/workflow2-architecture.html](docs/workflow2-architecture.html)。
