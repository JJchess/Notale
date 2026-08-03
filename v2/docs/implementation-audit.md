# Workflow V2 落地审计

本文件把架构图中的承诺映射到当前代码与可重复验证命令。`runs/` 是本地产物并被 gitignore；任何人都可以通过 `npm run build:demo` 重建证据。

| 架构要求 | 当前实现 | 证据 |
|---|---|---|
| 材料摄入与来源保真 | 材料逐份计算 SHA-256，claims 引用 `sourceIds` | `src/pipeline.mjs`、`content-pack.json` |
| 语义/呈现分离 | content-pack 递归拒绝 layout/style/html/css/svg 等字段 | `src/contracts.mjs`、契约测试 |
| graph 真实邻接 | 校验节点唯一、每条边端点存在；页面 SVG 从 graph 生成 | `src/contracts.mjs`、`src/providers.mjs` |
| 三件静态设计基调 | style-line、3 个 hex、参考气质锚、反 slop、画布固定 | `config/design-baseline.json` |
| 十槽构图输入 | 每页保存自包含 `reference-input.json` | `src/pipeline.mjs` |
| 参考图只用于生成 | ref 仅出现在 evidence 与 page provider 输入，不进入 deck/review | `src/pipeline.mjs`、`src/bind.mjs` |
| 构图台账 | 保存跨页 composition signature | `composition-ledger.json` |
| AI/生成器完整撰写 section | page provider 返回唯一完整 section，可替换为命令型 AI provider | `src/providers.mjs`、README provider 协议 |
| 页面 CSS 隔离 | 每条选择器必须绑定当前 `data-page-id` 或合法 `@scope` | `src/contracts.mjs` |
| 离线与安全红线 | 禁脚本、事件处理器、危险元素、外链；reveal 资产 vendored | `src/contracts.mjs`、`vendor/reveal/` |
| 真机硬闸 | 系统 Edge/Chrome + 原生 CDP；固定画布与 DPR | `src/browser.mjs`、`src/probe.mjs` |
| 硬闸检查项 | console、字体、溢出、越界、字号、对比度、源码泄漏、外链 | `src/probe.mjs`、`probe-summary.json` |
| 每页证据 | ref/page/probe/shot/verdict，按 attempt 保存 | `evidence/<page>/` |
| 定点回炉 | 仅失败页携带 issues 重写步骤③，受 maxRevisions 限制 | `src/pipeline.mjs`、负向 E2E 测试 |
| 最终截图单图评审 | review provider 只接收 screenshot、page、probe，不接收 ref | `src/pipeline.mjs` |
| vision 未就位不伪装 | local review 明确返回非阻断 `pending`；生产可接 command provider | `src/providers.mjs`、README |
| reveal 装订与报告 | 离线 `deck.html` + 人读 `report.html` + 机读 run/probe JSON | `src/bind.mjs` |
| V2 独立目录 | 运行代码不 import V1；reveal 文件复制并冻结在 V2 | `vendor/reveal/` |

## 验证命令

```bash
npm test
npm run build:demo
npm run validate:demo
npm run verify:demo
```

负向 E2E 会先生成一个越界页面，证明硬闸能捕获失败，并在第二次仅重写对应页面后通过。
