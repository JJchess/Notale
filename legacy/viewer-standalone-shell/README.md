# viewer-standalone-shell —— 归档的纯查看器分支 + 旧进度原型 + 零引用 vendor

> **冻结存档，不再被主线加载**。`viewer/` 现在只有一条活跃入口：`lecture-agent/scripts/serve_app.py`
> 驱动的 `app.html`（query 输入 → SSE 实时进度 → 成片预览）。本目录收纳的是与这条主线并行/被取代、
> 2026-07-30 仓库清理时一并归档的文件。

## 1. 这是什么

四类不同来源的过时材料，按原样搬迁（未改内容）：

- **`index.html` + `serve.py`** —— 纯静态查看器分支。曾是 `README.md` 文档化的两条路径之一
  （`python viewer/serve.py` 起服务、浏览器直接看 `course.lecture.json` 或 `?doc=xxx`），
  与 `serve_app.py` 端到端流程并行存在。归档后 `viewer/` 只保留 `app.html` 一条入口，
  两份 README 的"快速上手"已同步改为只讲 `serve_app.py`。
- **`live.html`** —— `app.html` 的蓝本（`2a8942a` 提交"进度视图接入新版渲染器"之前的无输入框实时预览页）。
  该提交把 `app.html` 迁到共享的 `progress-view.js` 模块，`live.html` 自身的内联进度条代码从此未再跟进，
  是纯历史遗留。
- **`progress.html` + `progress-mock.js`** —— 进度条动画的独立开发沙盒。`progress-mock.js`
  文件头注释原话："仅开发用……接回真实管线时丢弃本文件即可"。`serve_app.py` 的真实 SSE 管线
  现已存在且是唯一进度来源，归档条件已满足。
- **`mediabunny/`** —— 一个媒体处理 vendor 包（648K）。全仓库 grep 零引用（`app.html`、
  `doc-to-deck.js`、任何 `.html`/`.js`/`.py` 均未 `<script>` 或动态加载它），来源不明，疑似
  为视频/媒体特性预先拉取但从未接线。
- **`generated/`** —— 3 份 2026-07-22 的手动模型对比测试产物（`glm_5_2` / `kimi_k2_7_code` ×2，
  主题：树-数据结构、遗传学定律），是当时人工跑 `?doc=generated/xxx.lecture.json` 预览通道时
  留下的一次性产物，非受管测试夹具。

## 2. 复活/参考配方

- 想恢复"纯静态查看器"通路：把 `index.html`/`serve.py` 放回 `viewer/`，`serve.py` 内的相对路径
  假设不变（同目录下的 `doc-to-deck.js`/`schema/`/`vendor/`），应可直接跑；再把两份 README 的
  "快速上手"改回同时列出两条路径。
- `live.html`/`progress.html`/`progress-mock.js` 只有历史参考价值（旧的进度动画实现思路），
  真要复用建议直接从 `progress-view.js`（现行实现）出发，而非复活这几个文件。
- `mediabunny/` 若未来要接媒体处理特性，先确认是否仍是所需版本，再在 `doc-to-deck.js` 里显式
  `<script>`/动态 `import` 接线，并在 README 里记一笔"已接入"。
