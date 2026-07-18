# viewer — LectureDoc 查看器（reveal.js 运行时）

消费 `lecture-agent` 产出的 **LectureDoc JSON**，在浏览器里渲染成可交互 deck（公式 / 仿真 / 可编辑代码 / 测验 / AI 助教）。离线零构建。

## 运行

```bash
python viewer/serve.py      # 起本地静态服务，浏览器打开
```

默认渲染 `course.lecture.json`（自带 demo deck，改这个文件即换内容）。其它示例见 `../samples/decks/`。

## 组成

- `index.html` · `doc-to-deck.js` — 把 LectureDoc JSON 渲染成 reveal.js slides
- `live.html` — 实时预览页
- `vendor/` — reveal.js / KaTeX 等离线资源
- `schema/` — 查看器侧的 LectureDoc 契约（Node `.mjs`：validate/enums/assemble/render-verify）

> 注：schema 有**双实现**——canonical 概念在 `lecture-agent` 的 pydantic（`lecture_agent/schema/`），此处是查看器运行时用的 Node 副本，二者需保持语义一致。
