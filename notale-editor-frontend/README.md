# Notale interactive presentation editor — frontend

An independent frontend for “面向讲授的互动演示编辑器，具备设计工具的编辑深度”, using the supplied video as its overall interaction/layout reference.

Sibling directories:

```
Notale/
  notale-editor/           TypeScript backend, document model, native slide runtime, reference workbench
  notale-editor-frontend/  Formal editor frontend, its own dependencies, build, server and browser acceptance
```

The frontend imports the packed public `@notale/editor/browser` contract. It does not import backend source paths or share `node_modules`. `vendor/notale-editor-0.1.0.tgz` makes the current contract installation reproducible. The browser build rejects Node-only dependencies. Backend persistence, rendering, assets, concurrency and history remain accessed through HTTP. The embedded slide bridge stays with the backend because it is part of rendered HTML and portable output.

## Run

Start the backend using its README (API defaults to 4310, isolated slide content to 4311). Then, in this directory:

```sh
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:4312/`. A specific lecture opens via `?document=<id>`. The local development server proxies `/api/`, presentation assets and health to `EDITOR_BACKEND_URL` (default `http://127.0.0.1:4310`). `PORT` defaults to 4312. `npm run dev` builds and starts; rebuild after source changes. This server is a local integration host. For main-system integration, serve `dist/index.html`, `dist/editor.js`, `dist/editor.css` and `dist/katex.min.css` from the host and route the same API and presentation paths to its backend, preserving host credentials. Keep rendered slide content on its separate origin.

For local port forwarding, only forward **4312**. Preview URLs use `http://notale-content.localhost:4312`, a separate loopback hostname on the same port. The server routes only signed `/content/` requests on that hostname to `EDITOR_CONTENT_BACKEND_URL` (default `http://127.0.0.1:4311`); it never exposes the host API there or content on the editor hostname. Preview API responses are rewritten at the proxy boundary, preserving signed paths and lease renewal. `EDITOR_PUBLIC_CONTENT_URL` configures the distinct public content origin for a deployed host; that hostname must resolve to the content proxy and use the appropriate HTTPS endpoint. Restart `npm start` after server/environment changes. Local browser acceptance deliberately blocks ports 4310/4311 and verifies native interaction, presentation and origin isolation.

## Current working flow

- Narrow creation rail; contextual text/media/shape/interaction/component drawers; on-demand pages, properties and speaker notes.
- 面板视觉规则：工具面板里的条目是「选择器」而不是卡片——静止无边框无底色，悬停出浅底，选中出主色浅底；形状与图标库不显示文字标签（名字在 tooltip 里），缩略图用按钮的颜色（中性灰），颜色只属于画布。只有装着渲染缩略图的格子（图示预览、主题色板）和没有图形的文字按钮保留底片或边框。改动集中在 `src/editor.css` 末尾的 Panel chrome 区块。
- Insert gallery: a generated drawer (`src/insert-panel.ts`) with twelve shapes, 48 Lucide icons, KaTeX equations (display or inline, edited through a LaTeX dialog, selected as one object), symbols, word-art presets, date and code blocks, and three layouts whose items can be duplicated or deleted. Generated objects carry their colours as CSS variables so they follow the lecture theme and recolour from one accent field; `tests/insert-gallery.spec.ts` covers them including nested-page paste, export and the slide show.
- Reusable document media catalog with filename search, lazy image thumbnails, insertion and same-type replacement; uploads retain readable filenames and reuse does not upload again.
- Fit-to-window and 25–200% zoom presets, fine zoom buttons, hand panning, focus view and panel preference persistence. These operations never modify the document.
- Native HTML/Canvas page thumbnails, eight-page overview groups, whole-lecture search, drag sorting, keyboard navigation, Alt+arrow sorting and versioned undo. Thumbnail runtimes are virtualized and capped at six in the sidebar/eight in overview.
- Computed typography with inherited/mixed values, font family, line height, letter spacing, paragraph alignment, bold/italic toggles and reset to the page cascade.
- Contextual text/media/interaction property sections; independent typography and geometry updates; multi-selection preserves each object’s untouched transform; locked-object controls and collapsible advanced integrations.
- Page-jump and external-link authoring, with relative paths for nested pages and updates/removal that preserve nested link content.
- Click-to-reveal explanation preset with atomic insertion/undo, editable button labels/content/initial state, and standalone exported interaction.
- Visible teaching-step cards with names, animation/state counts, click-to-seek, drag ordering, duplication with animations/notes, and contextual animation fields.
- Existing rich object editing, native scene defaults, animation/teaching steps, revisions, exact pending-save replay and export/import through the backend.
- In-place interactive preview with visibly dimmed editing tools, plus the existing separate slide show/speaker views.

## Validation

```sh
npm run typecheck
npm run test:browser
```

The focused browser acceptance creates a separate real-lecture sample, exercises view controls, actual edits, a dropped successful save response and reload/retry, page ordering/undo, native Canvas interaction and presentation. A second scenario checks narrow-screen drawers and overflow. A third verifies contextual properties, nested interaction preservation, independent style/geometry updates and distinct multi-selection transforms. A fourth covers named teaching steps, animation duplication/remapping, drag order and reopen/preview. A fifth covers inherited/mixed typography, isolated edits and style reset. A sixth covers actual uploads, media search/reuse and nested-page replacement/undo/reopen. A seventh checks native Canvas thumbnails, overview grouping/search, revision refresh and hidden-runtime teardown. An eighth verifies atomic click-reveal authoring, undo/redo, reopening and standalone exported interaction. A ninth covers page-link authoring, nested content preservation and portable viewer navigation. The original lecture is compared before and after. Browser configuration accepts `CHROMIUM_PATH`; the default reflects this workspace. Screenshots/results and the retained sample URL are written to `.local/`.

See [reference analysis](docs/REFERENCE.md) for observed video behavior and remaining frontend work. Advanced inspectors are inherited functional integration controls; a full product-level redesign of every inspector is not yet complete.

See [backend/frontend integration coverage](docs/INTEGRATION-COVERAGE.md) for verified entry points and remaining product-level gaps.

### 默认界面的功能开放规则

按用户要求，只开放已接通的功能。已验证的页脚共享布局流程现已开放；其他布局预设、占位内容高级配置、高级实例覆盖、组件容器布局和高级源码编辑入口仍隐藏；基础状态、可视化状态样式、点击事件及共享组件发布/插入、源编辑与更新、状态恢复共享值和解除关联已开放；后端能力与开发代码仍保留，完成联调后逐项开放。普通段落的富文本窗口禁用列表和缩进，换行保持合法结构；可容纳块内容的文字容器仍支持已验证的列表操作。功能开放规则位于 `src/feature-availability.ts`，不是权限控制。

图表数据窗口支持粘贴 Excel / Sheets 表格或 CSV：第一行填写系列名称，第一列填写分类，先应用到预览，再保存。支持 100 个分类、8 个系列；公式、百分号和千位分隔符需先转换为普通数值。适用于编辑器创建的数据图表，原生 Canvas/ECharts 仍走各自的编辑适配器。

画布加载超过 8 秒会显示重试入口。重新加载画布会获取新的预览地址，保留当前文档；正常就绪后提示自动隐藏。

顶部不再显示复制、剪切、粘贴、复制对象和删除对象按钮；选中对象后使用 Ctrl/Cmd+C、X、V、D 和 Delete。文字输入框仍使用原生文字编辑快捷键。

运行 `node scripts/audit-lecture-preview.mjs` 可对完整参考讲义做只读加载与步骤切换检查，报告和截图写入 `.local/lecture-preview-audit/`。可用 `EDITOR_AUDIT_DOCUMENT` 指定其他文档，`EDITOR_PREVIEW_URL` 指定前端地址；此检查不等同于全部编辑功能回归。

页面列表支持右键或 F2 打开页面设置，可修改名称、章节和“放映时跳过”；也可点击页面栏标题旁的菜单按钮。隐藏页保留在编辑器中，放映时跳过。

讲稿面板可进入演讲者模式，再打开观众窗口；步骤、黑屏和计时同步。放映中从第 0 步返回上一页，会停在上一页最后一步，继续后退再逐步收回内容。

对象手势使用 Moveable 驱动，沿用后端的仿射、吸附与文字重排规则。移动/缩放/旋转按动画帧更新本地 DOM，所有编辑统一进入 IndexedDB 持久化队列；几何保存只确认版本，不覆盖后续手势。队列按主系统身份与工作空间隔离，通过 Web Locks 保证同一浏览器每份文档只有一个发送者，关闭标签页后重新打开会继续同步。服务端按对象及属性合并并发修改，同一属性按服务端最后到达的修改生效；撤销使用本人的事务逆操作，保留其他人的无关修改。

保存响应丢失会以相同事务 ID 和内容重试，服务端去重；确认版本与本机检查点一起落盘。无法安全应用到已删除对象或变化结构的草稿保留在恢复入口，可导出完整队列或打开恢复副本。旧 localStorage 日志自动迁移且不删除原记录。本机写入失败会明确提示并提供草稿导出。预览、放映和导出先等待最后一笔编辑同步。

画布保持文档原始内部尺寸，外层 CSS 缩放；Ctrl/Cmd + 滚轮（含画布 iframe 内）以指针位置缩放，不触发讲义运行时 resize。保存专项验证：`SYNC_TEST_URL=http://127.0.0.1:4312 npx playwright test tests/sync-session.spec.ts`，使用真实讲义单页副本，覆盖慢网混合编辑、关闭标签页恢复、响应丢失重试、多窗口合并与撤销、删除对象后的恢复副本、本机持久化失败。该检查不代表完整编辑功能回归；离线重开整个应用的静态资源缓存不在本轮范围内。

### 侧栏动画编辑

动画保留在左侧：进入、强调、退出、路径四类效果库，点击效果应用到选中对象；已有动画选中后点击效果会替换它，使用「＋ 添加动画」叠加新动画。「无动画」清除所选对象的全部动画，可撤销。多选对象可一次添加。动画列表支持选择、复制、删除、拖动/按钮排序和时间条计时；参数改动自动保存，时长和延迟以秒显示。单条预览可停止，播放整页使用真实讲授步骤。

常用效果包括出现/消失、淡入淡出、飞入飞出、缩放、浮入、弹跳、擦除、劈裂、强调和旋转。计时支持单击、同时、之后、对象点击触发，以及重复、自动反向和缓动。路径可选直线、弧线采样、折线，并通过控制点拖动或坐标修改。重复与反向参与共享播放时间计算。动画变更直接更新隔离画布的运行时数据，避免重新加载 HTML/Canvas；预览不产生保存事务。

定向验收 `tests/animation-authoring.spec.ts` 使用真实单页副本；后端计时/帧协议检查在 `../notale-editor/tests/animation-authoring.test.ts`。这不是对所有 PowerPoint 特效或任意原始脚本动画的兼容声明。已有原生讲授步骤通过折叠的「讲授步骤与讲稿」管理；脚本内部动画仍需要对应适配器。

### 右键格式与画布文字编辑

右键对象显示紧凑格式工具条与对象菜单；双击文字后，右键操作作用于画布内保留的文字选区。支持字体、字号、粗体、斜体、下划线、颜色、段落对齐、链接与清除格式。图片复用替换/裁剪控制器；简单 SVG 图元显示填充与描边，复杂互动对象仅展示适用动作。菜单使用 Floating UI 定位，格式图标附带 tooltip。

文字编辑采用独立加载的 ProseMirror 模块，不维护第二套历史。每次内容事务先写 IndexedDB，普通输入按 500 ms 静默期 / 2 s 上限提交，组合输入结束后提交；明确格式操作即时封批。未提交输入可本地撤销，已确认修改走原有版本逆操作。关闭标签页留下的 staged 草稿在重新打开后接管提交。保存响应携带会话和序号，旧响应不能覆盖新输入；正常文字确认不重载互动 iframe。

定向验证：`npx playwright test tests/context-format.spec.ts --workers=1`。覆盖局部格式与原有链接/节点保留、保存重开、锁定菜单、慢响应、撤销重做和中文组合输入期间关闭标签页后的草稿恢复。测试写入独立单页副本。此检查不等同于全部富文本结构或真实系统输入法组合的验收。

### 设置入口（2026-09-10）

左侧保留插入、页面、图层、样式、动画。「样式」打开时，有选区显示对象属性，无选区显示全局尺寸、主题与母版；选区变化不抢占其他侧栏。标题菜单提供重命名、切换、历史与草稿恢复；页面设置统一承接转场、计时和本页母版内容；底栏视图菜单承接标尺、吸附及参考线。视图偏好不创建讲义版本，参考线编辑继续保存并可撤销。

设置迁移定向检查：`npx playwright test tests/settings-navigation.spec.ts --workers=1`（候选入口默认 4318，可用 SETTINGS_TEST_URL 覆盖）。覆盖独立双页副本、母版、保存范围、历史恢复及重开，不运行整套讲义回归。
