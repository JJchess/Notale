# 代码页风格隔离修复 · 2026-09-07

范围：修复代码 builder 的输入边界；工作台外壳和旧实验产物不变。

## 实现

- `shared_preload(build-code)` 只交付章节提纲和代码技术契约，不读取或注入讲义 theme / CHASSIS。
- 代码页不再收到讲义视觉反套路清单；保留通用文案、真实性、单位、适用条件和错误提示要求。
- `references/code.md` 明确代码 workflow 独立控制风格，使用自己的原生视图基础与语义色，不读取或复制讲义 theme；题目构图与有意义的动效仍由作者决定。
- 不改 Monaco、iframe 隔离、基础 CSS 或作者 CSS 的正常覆盖机制。

## 验证

- `python3 -B -m pytest core -q --disable-warnings --maxfail=3`：69 passed，103 subtests passed。
- 新回归先在旧实现失败，再于修复后通过：更换讲义配色/字体/材质及 CHASSIS，代码页系统输入逐字不变，视觉页仍接收更新。
- 即使没有讲义 theme / CHASSIS 文件，代码 preload 也可独立组装；这不代表完整工作台运行不需要宿主资产。
- 覆盖代码页拒绝读取讲义主题/邻页、排除讲义参照截图，以及保留事实护栏。
- 原 32 页规划与主题不变，单独重生成第 25 页，原目录 `ens-trim-full-0907` 未覆盖。
- 新生成页运行自检通过，12 次响应、154.2 秒、321,297 输入 token；期间有一次 API 服务错误自动重试。本次不是成本基准测试。
- 人工检查最终截图：图表区域采用独立深色与 cyan/amber 语义配色，不再复制浅色讲义的背景/文字/蓝橙主题组合。
- 对比旧运行，新工作台的 `styles.css`、`core/native-view.css`、`core/native-view-host.js` 文件逐字相同。

产物：[页面](pages/page-25.html)、[最终截图](.shots/code/page-25/final.png)、[运行结果](builder-results.json)。

HTTP 单页预览：http://192.168.0.72:4177/notale-v2/runs/ens-code-stylefix-0907/pages/page-25.html

本次验证针对风格隔离，不代表原全量报告中列出的数值、算法和图表问题已全部修复。原 32 页预览仍保留修复前状态，新页单独提供以便对照。
