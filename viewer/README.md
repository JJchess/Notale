# viewer — LectureDoc 查看器（reveal.js 运行时）

消费 `lecture-agent` 产出的 **LectureDoc JSON**，在浏览器里渲染成可交互 deck（公式 / 仿真 / 可编辑代码 / 测验 / AI 助教）。离线零构建。

## 运行

```bash
# 端到端 App（输入 query → 实时进度 → 成片）——由 lecture-agent 侧服务
cd ../lecture-agent && uv sync --extra app
uv run python scripts/serve_app.py             # 真 live 生成，需 SILICONFLOW_API_KEY，每次数分钟
#   → 浏览器打开 http://127.0.0.1:8778/app.html：居中输入框输入课题，看它规划/逐块生成/组装成片
```

默认渲染 `course.lecture.json`（自带 demo deck，改这个文件即换内容）。其它示例见 `../samples/decks/`。

> 曾经的"纯静态查看器"分支（`index.html`/`serve.py`）与旧进度动画原型（`live.html`/`progress.html`）
> 已归档到 `../legacy/viewer-standalone-shell/`，见其 README。

## 组成

- `app.html` — **端到端 App**：query 输入 → 生成中进度视图 → 成片预览（订阅 `scripts/serve_app.py` 的 SSE）
- `doc-to-deck.js` — 把 LectureDoc JSON 渲染成 reveal.js slides 的核心渲染器
- `progress-view.js` — 进度渲染器（消费结构化进度事件，`app.html` 使用）
- `vendor/` — reveal.js / KaTeX 等离线资源
- `schema/` — 查看器侧的 LectureDoc 契约（Node `.mjs`：validate/enums/assemble/render-verify）

> 注：schema 有**双实现**——canonical 概念在 `lecture-agent` 的 pydantic（`lecture_agent/schema/`），此处是查看器运行时用的 Node 副本，二者需保持语义一致。
