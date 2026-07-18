---
name: create-video
description: Author a short explainer video for a LectureDoc lecture by writing a frame-locked HTML canvas composition, capturing it in-browser to a local MP4 (tools/render-video.mjs, WebCodecs — no server FFmpeg), then embedding it via a first-class video block. Use for narrated-style, continuously-evolving explanations that a live sim or static figure can't convey. Meta-skill: video is deliberately NOT in the fan-out menu (an LLM-filled src would fabricate a file that doesn't exist).
version: 1.0.0
license: MIT
platforms: [windows, macos, linux]
metadata:
  role: authoring workflow (meta-skill; no contracts.json — see "为什么不进 fan-out")
  hermes:
    tags: [Courseware, LectureDoc, Video, Canvas, WebCodecs, Explainer]
    related_skills: [lecture-doc-schema, create-sim, generate-lecture]
---

# create-video — 科普讲解视频（composition → 捕获 → 嵌入）

三步工作流（全离线、零服务端 FFmpeg）：
1. **写 composition**（本技能的核心产出）：一个自包含 HTML，暴露帧锁定契约。
2. **捕获**：`npm run render-video <composition 相对 viewer/ 路径>` → 浏览器内 WebCodecs 编码 → `viewer/generated/assets/<名>.mp4`。
3. **嵌入**：deck 里加一等 video 块 `{ "type":"video", "src":"generated/assets/<名>.mp4", "caption":"…" }`（src 相对 viewer/index.html 解析；本地路径，禁远程）。

范例（先读再写）：`viewer/examples/gradient-descent.composition.html`。

## composition 契约（帧锁定=确定性，硬性）
```html
<canvas id="stage" width="960" height="540"></canvas>
<script>
  window.COMPOSITION = { width, height, fps, durationMs, renderAt(tMs) };
</script>
```
- **`renderAt(tMs)` 必须是 t 的纯函数**：同一 t 绘出同一帧。禁 `Date.now`/`Math.random`/自跑 `requestAnimationFrame`（预览用 rAF 调它、捕获用帧循环调它——同一函数两种驱动；随机形状需要时用固定种子 PRNG 预计算）。
- 自包含零依赖：系统字体、内联绘制；不引外部脚本/图片。
- 默认预算：960×540 @ 30fps，**时长 20–90s**（一个概念一支短片；低运动内容 ~142KB/6s 量级，别做长片）。

## 内容纪律（红线 + 教学法，来自 DESIGN_RESEARCH/视频调研）
- **内容有据**：动画数据必须来自真实计算/真实序列（如真实迭代 x_{k+1}=x_k−η·f'(x_k)），不是"看起来像"的装饰假动画——这是 sim 反伪仿真纪律的视频版。
- **叙事骨架**（scene/beat 思维，即使单镜也按此组织时间轴）：`hook`（具体谜题/张力开场）→ `intuition`（先直觉）→ `formalize`（后形式）→ `recap`（回指收束）。第一段必须是 hook/intuition，别拿定义开场。
- **一次一个概念**：一屏一个视觉焦点；HUD 给真实数值（步数/当前值），公式放角落小字。
- **渐进构建 + 元素持久化**（Manim 心法）：对象带状态增量演化（出现/移动/强调/淡出），别整帧换画；尾迹/旧对象留作视觉锚点。
- **canvas 技法**（零依赖手写）：缓动 easeInOutQuad；交错入场 stagger 0.06–0.1s；镜头 = 世界坐标 camera{x,y,scale} 变换插值；高亮 = 非焦点降 alpha + 焦点放大。
- 视觉克制：一个主色 + 一个强调色（参考 slate：纸底 #E7E9EB / 墨 #1C2126 / 琥珀 #A6692A），无渐变无投影（去 AI 味红旗同样适用）。

## 为什么 video 不进 fan-out 菜单（刻意设计，勿"修复"）
`video` 块的 `src` 指向**捕获管线产出的文件**。若把 video 加进 contracts.json，规划器/fan-out 会让 LLM 直接编一个 src——指向不存在的文件 = 编造（mock 红线）。正确路径永远是：先有 composition → 捕获出文件 → 才写 video 块。未来编排器若把"捕获"接进生成流水线（阶段3+），再评估进菜单。

## 自检清单
- [ ] `renderAt` 纯函数（跑两次捕获，产物字节应一致）
- [ ] `npm run render-video` 成功且 0 页内异常
- [ ] 嵌入 deck 后 `npm run render-check -- --doc <deck>` 全绿；video 元数据可加载（duration/尺寸正确）
- [ ] 内容有据、hook 开场、单焦点、时长 ≤90s
