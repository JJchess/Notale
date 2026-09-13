# notale-editor 待办（2026-09-10 起，按优先级）

## 当前执行规则（2026-09-13）

本文件下方是 2026-09-10 至 2026-09-11 的历史任务与排查记录，不代表当前代码、线上版本或正在运行的协作者。历史勾选不代替当前验收；旧选择器、端口、失败数量和文件路径必须先核实。

- 验证遵循父目录 `AGENTS.md` 和用户当前 goal：按实际风险选择最小必要检查，复用有效结果；不再要求每项改动克隆整套讲义或运行 `editor.spec.ts` 全量。保存、共享协议和数据安全仍必须有针对性证据。
- 后端改动按实际目标与风险实施，没有“一行级”限制；不因为历史约定为已授权的常规改动额外请求确认。
- 当前页面由 Next.js / React 组件管理，具体边界见 [EDITOR-ARCHITECTURE.md](EDITOR-ARCHITECTURE.md)。HTML/SVG 内容、富文本和画布运行时仍有必要的 DOM 操作；不以扩展名或检索命中数量判断迁移完成度。
- 4312 是稳定预览入口。实际前端构建、后端服务、运行时及回退版本以 `.local/presentation-release.json` 和存活进程为准，不能照抄历史端口或构建路径。前后端可独立发布，无变化的一侧不重复构建。
- 前端本地依赖包的同步方式见架构文档“共享 DOM 合并模块同步”；不要手工解包覆盖 `node_modules`，或把旧 tarball 当成最新源代码。
- 改动前检查当前工作树，保护其他协作者的修改；历史记录中的“等待并行会话”不是当前存在活动会话的证据。

近期工作证据记录于 `.local/editor-ninehour-progress.md`。其中的单项检查只证明对应链路，不代表整个编辑器或本文件全部任务已验收。

## 历史任务记录


## P0 编辑深度

- [x] **1. 通用样式面板**（完成 2026-09-10）
  `src/appearance-inspector.ts`：任意对象的「外观」分组，填充/渐变/描边/圆角/阴影/不透明度/主色，改动即生效（无「应用」按钮，照 Figma）；「无填充/无描边」是开关，直接改颜色会自动把关掉的画笔打开（一次手势，照 Figma 点色板恢复填充）。SVG 映射 fill/stroke/stroke-width/filter，HTML 映射 background-color/background-image/border/border-radius/box-shadow；多选逐对象打补丁，一次撤销。编辑排队提交，不再丢掉一秒内的第二次改动。验收：`tests/insert-gallery.spec.ts` 第五条。
- [x] **2. 插入落点与拖放**（完成 2026-09-10）
  插入落在画布可见区中心（照 PPT），重复插入每次错位 24px；新对象带 `z-index:50`，不再被讲义原有内容盖住。插入面板每个条目都是拖拽源，拖到画布上按指针落点放置（照 Figma）；因为讲义在隔离 iframe 里，拖拽期间在画布上盖一层 `#insert-drop-overlay` 接收 drop，媒体文件拖放那层的做法一致。验收：`tests/insert-gallery.spec.ts` 第六条（居中、命中测试不被遮挡、错位 24px、落点误差 ≤4px）。
- [x] **3. 形状内文字**（完成 2026-09-10）
  形状改成 `div[data-notale-shape]` 包一个 `preserveAspectRatio="none"` 的 SVG 轮廓加一个居中的 `p`：轮廓随框拉伸，文字是普通可编辑段落，fill/stroke 放在根上靠继承传进图形，所以外观面板不用改。验收：`tests/insert-gallery.spec.ts` 第一条改标题后断言。凹形状（五角星）里文字会溢出边界，与 PPT 相同，靠调整尺寸解决。
- [x] **4. 文本框大小模式**（完成 2026-09-10）
  外观面板加「文字框大小」：固定尺寸 / 高度随文字 / 宽高随文字（`width:max-content`），照 PPT「自动调整」三选一。固定尺寸从画布实测矩形写成 px。**未做**：「缩小文字以适应」需要按框反复量文本高度再二分字号，一次改动要多轮回传，等有人真的需要再做。

## P1 讲义作者高频

- [x] **5. 主题面板**（完成 2026-09-10）
  `src/theme-panel.ts`：无选中时的「样式」面板里加「主题配色」，6 套预设色板（照 PPT 设计选项卡的变体）+ 5 个变量取色器（`--model/--text/--muted/--bg/--rule`）+ 字体族，写 `deck.update {theme}`（与现有 theme 合并，不覆盖别的键）。渲染时注入的 `:root` 在讲义自带 theme.css 之后，所以真实讲义页的标题、正文、分隔线和插入对象一起变色。验收：`tests/insert-gallery.spec.ts` 第八条（预设改讲义标题色与形状描边、单变量编辑、重开保留）。
- [x] **6. PDF 导出**（完成 2026-09-10，改走浏览器打印）
  顶栏「导出 PDF」把每个可见页面按讲义尺寸摆进一张打印表（`@page size:1600px 900px;margin:0`，每页 `break-after:page`），等 iframe 加载完再 `print()`，用户在打印对话框选「另存为 PDF」。**没有**在后端加无头浏览器，也就没有新依赖和新路由。隐藏页自动跳过。验收：`tests/insert-gallery.spec.ts` 第十一条（页数、页面尺寸、页面内容可见、print 被调用）。讲稿附页没做。
- [x] **7. 查找替换**（完成 2026-09-10）
  `src/find-replace.ts`：页面栏「查找和替换…」按钮与 Ctrl/Cmd+H（PPT 的快捷键）。在前端解析每页 html 找叶子文字对象，列出命中（点击跳到该页并选中），「全部替换」一批 `element.patch {text}`，一次撤销。支持区分大小写。未做：逐条替换、正则、只搜当前页。
- [x] **8. 页面背景**（完成 2026-09-10）
  `src/page-background.ts`：无选中时的「样式」面板里加「页面背景」，底色、两段渐变、「应用到全部页面」、「恢复讲义底色」，写 `slide.update {theme}`（页面 theme 覆盖讲义 theme）。底盘用 `background:var(--bg)`，所以渐变直接放进 `--bg`。未做：图片背景（图片仍作为对象插入）。验收：`tests/insert-gallery.spec.ts` 第十条。

## P2 协作与互导

- [x] **9. 批注**（完成 2026-09-10）
  后端加了 `documentSchema.comments`（`commentSchema`：id/slideId/target?/author/text/createdAt/resolved/replies）与两条命令 `comment.set`（新增或整条替换）、`comment.remove`；删除页面时连带删除该页批注；后端 151 条单测全绿。前端 `src/comments-panel.ts` 是画布下方的批注栏（工具条 💬 开关）：按当前页列出、可只看未解决或看全部页、锚定整页或当前选中对象（显示对象名）、回复、标记解决/重新打开、删除、定位到该页并选中对象。批注存在文档模型里而不是页面 HTML，所以放映和导出都不渲染。作者名记在 localStorage。验收：`tests/insert-gallery.spec.ts` 第十二条。改了后端 schema 后必须 `npm pack` 重打 tarball 并重装到前端 vendor，且要**重启 4310**（运行中的进程不会重读 dist）。
- [x] **10. PPTX 导入**（完成 2026-09-10，只读第一刀）
  `src/pptx-import.ts`：用已在依赖里的 fflate 解压，读 `ppt/presentation.xml` 的 `p:sldSz`（EMU/9525 换 px），逐页读 `p:sp` 的位置与段落（字号 `sz`、粗体、斜体、对齐）和 `p:pic` 的图片（经 `slideN.xml.rels` 找 `ppt/media/*`）。生成的页面 HTML 自带 `data-notale-id`（`POST /api/documents` 要求源里已有稳定 id），图片先上传成 asset 再引用。顶栏「导入 PPTX」，导入建**新讲义**，不动当前打开的那份。
  **不读**：母版与版式、主题、表格、图表、SmartArt、动画、EMF/WMF 图片（浏览器不能渲染，按「跳过 N 个元素」提示）。用户那份模板的美术资源全在母版里，只有 slide1 有 3 段文字加一张 EMF，所以导进来会比在 PowerPoint 里看着空——这是当前实现的边界，不是解析失败。验收：`tests/insert-gallery.spec.ts` 两条（真实模板 7 页/尺寸/文字可编辑/跳过提示；最小合成 pptx 的图片落位、字号、对齐、粗体与 asset）。
- [ ] **11. 多人在线状态**（2026-09-10 评估后暂缓，需要后端通道）
  现有 `POST /api/documents/:id/sync` 是请求-响应，放映用的 show-session 只按放映会话广播，两者都承不住「谁在看这份讲义、光标在哪」。要做得先加一条后端通道（SSE 或轮询 presence 路由 + 内存表），属于后端新接口而不是一行级改动。纯前端只能用 BroadcastChannel 覆盖同一浏览器的多个标签页，对真实多人协作没有意义，故不做假实现。并发编辑本身已经是按对象与属性合并的（见 `tests/editor.spec.ts` 的双窗口合并场景）。

## P3 收尾

- [ ] **12. 等待并行会话**（2026-09-10 21:40 复查）：`tests/editor.spec.ts` 28 条里 20 绿 8 红，8 条全部落在并行会话正在改的区域，与本轮改动无关：
  - 媒体（`#asset-empty`、`img[alt="插入图片"]`，3 条）：前端已经发 `svg.import`，后端 `commandSchema` 里还没有这条命令。
  - 互动（`#reveal-editor`、`#link-page`、`#library-preview`，3 条）：新的插入面板目录把 `interactive` 分类的 groups 置空了，点击揭示预设、页面链接编辑器、「体验本页互动」都不在面板里了。
  - 图表（2 条）：`insertObject` 里 `chart` 改成打开 ECharts 图库，不再直接插入，旧断言等版本号 +1。
  这三处各自的新入口定下来后再改断言。另外预览浮层里讲义脚本仍缺 `Deck` 全局，spec 暂时过滤该错误。
- [x] **13. 图标库扩展**（完成 2026-09-10）：策划图标从 48 增到 100，含箭头、结构、度量、状态、存储等；搜索同时匹配中文名与英文名。**没做全量动态导入**：`import(\`./icons/${'{'}name{'}'}.mjs\`)` 会让 esbuild 为 1800 个图标各生成一个 chunk；整包导入实测源码 1.17MB。现在 100 个图标在包里只占 22KB。
- [x] **14. 代码块高亮**（完成 2026-09-10）：`src/code-highlight.ts` 用 highlight.js core + Python/JS/TS/Shell/JSON/SQL（打包 113KB），把 `hljs-*` 类名换成内联颜色，所以幻灯片不需要额外样式表。`src/code-editor.ts` 提供「编辑代码」对话框：语言选择、源码、实时预览，保存写 `element.content` + `data-notale-code`/`-lang`。旧的无高亮代码块打开时用 `pre` 的文字当源码。
- [x] **15. 循环图示项数**（完成 2026-09-10）：循环图示带 `data-notale-cycle`，样式面板出现「循环项数」（3-6）；改数值时按项数重算弧线角度与箭头并保留已写文字（`cycleContent`/`cycleLabels`），走 `element.content` + 属性补丁。
- [x] **16. 旧 `editor.spec.ts` 并发场景**（完成 2026-09-10）：原来的 409 断言换成当前真实契约——两个窗口改不同对象时按对象与属性合并，双方都保留、无 409、重开后两处修改都在。不可合并的情形（对象已被删除后再改）本来就由 `tests/sync-session.spec.ts` 的「deleted target retains an exportable draft」覆盖，不再重复。fixme 已移除。

## 2026-09-11 前端迁到 Next.js 之后

- `index.html` 没了，外壳是 `src/components/editor-chrome.tsx`（静态 JSX，id 全保留，命令式模块照旧挂载）。构建 `NEXT_DIST_DIR=<自己的目录> npm run build`，起服务 `NEXT_DIST_DIR=... PORT=4319 npm start`；并行会话用 `.next-*` 各自隔离。
- 前端现在会轮询 `GET /api/documents/:id/changes`，后端进程不重启就全是 404，插入之类的提交会静默失败。改完后端要 `npm run build` + `npm pack` + 手工解包到前端 `node_modules/@notale/editor`（同版本号 npm 不会刷新），并重启 4310。
- 选中对象后属性面板会自动展开，脚本里不能再裸点 `[data-tool="style"]`（那是开关），要先判断 `#property-panel` 是否可见。
- 撤销改由新的 author kernel 接管（`kernel.undo()`），旧的「色板聚焦时 Ctrl+Z 撤销文档」断言在新内核下不成立，需要和内核作者对齐语义。

## 已知坑（做以上任务时会撞到）

- 插入对象内部节点都拿 `data-notale-id`；公式/图表已在 bridge 与图层列表里原子化，其它容器类模板（版式）故意保留可选叶子。
- `styleSchema` 允许 `--` 变量，但 inspector 返回的 `style` 映射不含自定义属性，判定要用 `data-*` 属性。
- 两个 worker 并行时提交可能超过 5s，`change()` 已放宽到 15s。
- 导出 32 页讲义约 11s、43MB，请求超时要显式给 60s。
- 后端 `dist/bridge.js` 每次渲染重读，改 bridge 只需 `npm run build`，不必重启 4310。
- 4312 会被并行会话指向别的构建（`EDITOR_DIST_DIR=.local/...`）。`tests/insert-gallery.spec.ts` 支持 `INSERT_TEST_URL`，自己起一个服务：`PORT=4319 npm start`，然后 `INSERT_TEST_URL=http://127.0.0.1:4319 npx playwright test tests/insert-gallery.spec.ts --workers=1`。
- 格式面板由多个模块拼装（`document-ui.ts` 会把子节点搬进 `#object-style`），新分组必须在 render 时检查 `isConnected` 并重新挂载。
- Playwright 的 `fill()` 对 number/range 输入不触发 `change`，要跟一次 `press('Tab')`。选中 SVG 时并行会话的矢量运行时会自己提交，别用版本号增量断言外观改动。
