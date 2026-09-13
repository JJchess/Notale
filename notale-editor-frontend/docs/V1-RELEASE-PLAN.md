# Notale v1 发布工作

状态：进行中。发布条件包括真实编辑/授课闭环、精修 UI、可靠保存、可复现部署、开源文件审查与 GitHub v1.0.0 Release。不能以阶段预览代替最终发布。

## 视觉方向与验收

面向教师备课，主任务是编辑讲义并顺畅讲授。维持 header / activity bar / sidebar / canvas 的熟悉布局；画布为视觉中心。保留 Notale 紫色作为选中与关键动作的统一识别，不引入装饰性渐变或新的交互概念。

初始令牌方向：墨色 #29272e、辅助文字 #77747e、分隔 #e3e1e7、强调 #6c18f5、面板 #ffffff、画布 #f0eff2。以当前已认可配色为基础，结合截图验证对比度。界面正文使用系统无衬线字体，数字采用等宽数字；品牌字重与字号单独管理，不为工具界面加载装饰字体。

4/8px 间距节奏；按钮、输入框、菜单行和图标各自统一规格；常用属性紧凑成组，减少重复边框和说明。选中、悬停、禁用、加载、错误与键盘焦点必须可区分；不得通过删除有用标签来追求空白。

完整批次：全局令牌与顶部/底部导航 → 左侧属性/插入/页面/图层 → 图表/媒体/动画及弹窗 → 放映/演讲者视图。每批先读对应 CSS 优先级，再修改，采用一次必要视觉核对；操作逻辑改动另做相关验证。

## 当前证据与发布风险

- Git 根目录为 Notale，remote 为 JJchess/Notale；不仅包含 editor。多个子项目有协作者未提交改动，禁止整体 stage/push 或清理。
- 编辑器样式存在多轮 :root 与控件覆盖规则，需要收敛实际生效的规则，不能继续无边界叠加主题。
- 4312 当前使用 frontend129 与 chart-cleanup-runtime；之前构建保留。实时指针见 .local/presentation-release.json。
- 当前体验入口及历史验证见 NINE-HOUR-DELIVERY.md。备注连续自动保存、跨窗口声音意图和复杂内容能力边界需要继续处理。
- 已发现后端 compose.yaml，但完整干净环境部署尚未验收。仓库公开状态、发布权限、根许可证、依赖及样本素材授权尚未核实。

## 发布门槛

1. 精修后的代表性界面完成实际截图检查，关键路径保留键盘可操作性和清晰状态反馈。
2. 独立讲义完成编辑、保存、撤销、重开、恢复、放映和互动链路的风险匹配验证；用户原件不作为写入测试对象。
3. 干净检出按文档完成安装/构建/启动，消除仅本机存在的运行时与私有依赖前提。
4. 明确发布文件清单，检查许可证、第三方素材归属及敏感信息；审查拟发布提交和必要历史，避免曝光私有资料。
5. 在已授权范围内发布 GitHub 公开仓库及 v1.0.0 Release，记录实际地址与可下载产物。遇到缺少必要权限再询问，不因假设风险提前停止实施。

各门槛目前均未宣称完成；后续将记录对应的实际证据和剩余问题。

## 批次 1：视觉基础令牌

已将最初蓝色根令牌与后续紫色覆盖合并到单一基础定义，统一通用悬停/焦点、控件圆角与浮动底栏阴影。保留现有布局与操作，不把这一步称为完整 UI 精修。候选生产构建通过，六页体验册只读检查无页面错误；文字面板截图确认布局保持。已发布 `.next-editor-v1-foundation` 至4312，回退为 frontend129。没有重复业务测试。

截图仍显示属性面板纵向占用偏大、字段视觉层次接近；下一批应整组精修常用属性的密度与对齐，而非继续微调孤立颜色。GitHub CLI 当前未在 PATH 中找到，后续核查其他可用发布方式；尚未构成权限阻塞。

## 批次 2：文字与几何属性密度

文字对齐/方向并排；位置、尺寸、旋转/缩放依次分组。限定到 typography-fields/geometry-fields 的32px浅底字段减少边框噪音与纵向留白，保留标签、原输入实例、事件和焦点反馈。生产构建通过；体验册一次只读截图与入口检查无页面错误，几何区由约 y680 提前至 y560，外观区进入首屏。发布 `.next-editor-v1-inspector`，回退 foundation。

仍需精修：字段值目前继承标签灰色，下一批连同外观属性统一提高值与标签的层次，不把浅底当作禁用态。后端 compose 仅包含 PostgreSQL，尚非整套一键部署，已记录为发布缺口。

## 批次 3：外观字段与状态层次

外观 paint-row 使用两列紧凑排列，与文字/几何共享32px浅底控件。可编辑值使用墨色，禁用值保留弱化；复选框/滑杆统一强调色，保留混合值、取消预览、提交事件和原生输入。一次滚动至外观区的截图核对通过，浏览器无页面错误，生产构建通过；发布 `.next-editor-v1-appearance`，回退 inspector。没有新增业务测试或修改用户讲义。

部署审查继续确认：Next 自定义 server 负责隔离内容域名与 API 代理，不可直接替换为纯静态托管；README 的 vendor 包名已过时，现实际依赖 mixed-text 包，需在发布部署批次统一修正文档与可复现打包链路。

## 批次 4：恢复标准后端构建

实际运行 npm run typecheck 找到图表可选 on 方法类型收窄、测试快照缺元数据、NodeNext 测试导入缺 .js 三类问题。已修复，未改变图表运行时行为；后端标准 npm run build 完整通过，包含全项目类型检查、声明生成和浏览器 bundle。对应六项结构比较/媒体生命周期/图表订阅检查通过（约0.3s），无需重跑前端 UI。当前稳定服务使用独立 runtime/server 路径，未被 dist 构建替换。

前端 README 已修正旧 tarball 名称，强调依赖锁定文件为准。后续仍需以当前后端源码重新打包并验证前端消费，不能用标准构建通过代替干净部署证明。

## 批次 5：真正隔离的发布包消费

当前源码打包后在 /tmp 独立 npm 项目安装，严格 TypeScript 消费编译通过。旧夹具对内联 NotaleBridge 的断言失败；核对现实现后改为提取独立 bridge 引用并请求实际内容，验证 HTTP200 和运行时标志。

同时修正 verify-package.sh 的工作目录依赖：消费者从临时目录运行，EDITOR_RUNTIME_DIR 指向安装包自身 dist，而非原仓库 dist。复用同一已安装包，仅重编译修正的夹具后，隔离运行通过；包含数据库独立 scope 下的文档/图表/SVG/场景/步骤/预览和 bridge 合约，清理限于夹具文档。无重打包、无重新安装、无稳定服务变更。

这证明后端包的该消费链路，不是完整前端干净部署或所有浏览器能力验收。下一步还需标准化源码到前端依赖包的更新以及整套应用启动。

## 批次 6：源码到前端依赖包的标准更新

新增 TypeScript 工具 `npm run contract:update`：确认同级后端包身份，按已有源码/产物哈希缓存构建，npm pack 到专属临时目录，按 SHA256 内容片段命名 tarball，npm install 同步 package.json/lockfile，finally 仅清理本次临时目录。旧档案保留，不自动发布或重启。README 记录源码更新流程。

实际执行生成 `vendor/notale-editor-0.1.0-83f75ada9b7ac57a.tgz`，前端生产构建通过；独立文档延迟保存、局部连续改色、撤销、远端合并和重开检查通过（浏览器3.3s），原 iframe/互动节点保持。发布 `.next-editor-v1-contract` 到4312，回退 appearance，后端运行路径未变。打包差异检查确认新包纳入当前服务器/资源/运行时修复，不把单个用例扩大为全功能验证。

## 批次 7：本机完整启动与生命周期

新增 TS start-local 启动器与 npm run start:local：校验三端口、构建产物及已有监听，启动标准后端后等待健康，再启动 Next；服务退出或启动失败会关闭本次拥有的进程，SIGINT/SIGTERM 正常清理并设置强制退出期限。未创建账号或扩大监听地址。

脚本编译通过；备用4402/4403/4404实际启动，前后端HTTP200，SIGTERM后全部监听释放且父进程exit0。复用数据库和已构建前端，不声称干净安装通过。LOCAL-DEPLOYMENT.md 包含安装、构建、启动、端口、内容域名、数据保留、主系统身份接入边界。4312未重启。

## 批次 8：页面与图层导航视觉

页面卡片稳定使用1px边框与固定内边距，选中不挤压缩略图；隐藏无意义的“未分章节/0动画”占位。图层以类型线条图标和独立锁图标替代DOM标签/emoji，统一行高、缩进与省略名称，保留原点击/键盘/重命名逻辑。

生产构建及一次双面板只读截图检查通过，无页面错误；发布 `.next-editor-v1-navigation`，回退 contract。页面截图捕获在缩略图异步加载前，仅证明列表布局，不能据此宣称缩略图加载通过。

实际截图新发现：文字换行节点仍作为名为 text 的独立图层出现，增加认知负担；下一批需核对对象模型，避免直接隐藏真实可编辑文本节点。缩略图应在后续检查实际完成态及加载反馈。

## 批次 9：排版节点与缩略图完成态

只读体验检查等待 active thumbnail-ready 后截图，确认可见页缩略图正常渲染；上一轮白块是截图早于异步加载。HTML 审查确认三个带ID的 br。layerRows 仅新增排除 br/wbr 排版节点，正文、内联span和SVG text保留，原讲义HTML不变。两项模型检查通过，生产构建通过；发布 `.next-editor-v1-layers`，回退 navigation。没有为单一筛选规则重复整套浏览器用例。

发布审查另确认根目录无 LICENSE/COPYING，根 README 仍指向早期生成器地图，不能直接将当前仓库视为已准备好开源 v1；需要明确当前编辑器发布入口及第三方许可边界。

## 批次 10：依赖与素材分发证据

新增 TS licenses:inventory，从两个锁文件生成可重建的379条依赖元数据清单及许可证分组；脚本编译/执行通过。仅本地 editor 包缺声明；LGPL/混合表达式仍需阅读许可和实际打包边界，未宣称合规完成。

素材审查发现现有8模板均有外部来源及 watermarkMasks 信息，字体转换自参考目录而输出无附带许可。ASSET-PROVENANCE.md 记录证据与替代要求：原创可编辑完整模板及图示，系统字体或有明确授权的字体，保留用户文档。不能仅隐藏模板来缩减发布目标，也不能把参考素材直接随仓库公开。

## 批次 11：原创素材候选生成

新增 TS prepare-original：8个整页模板及8个独立图示，使用自定义文字/几何，不引用参考图片、外部URL或字体资产；输出原生HTML、稳定对象ID、插入JSON和PNG到独立 templates/original，旧目录与用户数据不变。生成器脚本类型命名冲突已修正，脚本编译通过；实际生成完成，抽查三证据页与反馈环图的截图。

目前为候选而非发布完成：循环图应补方向表达，矩阵应补坐标含义，整页需增加版式变化；插入/重开及界面切换仍待验证。图示不能仅因原创而降低表达质量。生成器使用标准Playwright浏览器或显式CHROMIUM_PATH，不再硬编码本机路径。

## 批次 12：原创图示语义与版式精修

反馈环增加方向明确的原生SVG箭头；矩阵补价值/实施难易轴及标签。比较、反馈和结构页采用左文右图，其他页保留上文下图，统一颜色/字体/页边距。抽查图示和整页后修正侧栏标题单字落行，按语义换行；脚本编译并重新生成16份素材成功。

original/README 记录无外部资源、系统字体差异、稳定ID和同源缩略图生成。尚未切换线上catalog；下一批接入并验证插入、图示尺寸、重复实例及保存重开。4312与既有讲义未变。

## 批次 13：原创模板正式接入

新增共享 TEMPLATE_CATALOG_BASE，预览/载入统一指向 original；服务允许原创建材路径，保留旧路由供现有回退版本使用。已发布 frontend v1-original 到4312，回退 layers；原refined文件暂保留本地，发布文件审查时排除，用户文档与上传资源未改写。

类型预检及生产构建通过。独立讲义完成8项目录显示、整页插入、文字编辑、两次矩阵图示插入、ID唯一、图示宽度限制、撤销重做、服务端内容保存与重开第二页，最终5.2s通过。首次失败因刷新回到第一页而夹具仍检查第二页内容；用错误现场当前页证据确认，增加服务器持久化断言并明确通过页面列表返回第二页，只修测试、不重建产品。未把启动位置恢复视为已实现。

## 批次 14：干净源码安装/构建/启动

私有候选 /tmp/notale-v1-clean-_x480qax 从当前两目录复制，排除 node_modules、dist、.next*、.local、环境文件、旧vendor包及refined目录。两项目独立npm ci成功（后端144包/前端174包），标准build均成功。备用端口用新dist/.next启动，检查API/前端HTTP200、8项original目录、无资产依赖图示JSON、PNG MIME，SIGTERM后三监听释放。

没有复用原仓库构建或node_modules；数据库仍复用本机已有PostgreSQL，未做新数据库/容器部署证明。此候选仅用于私有验证，尚未经过完整敏感信息/第三方分发审查，不是可直接发布的清洁归档。原仓库和4312未改变。

## 批次 15：空数据库首次部署与重启持久化

使用独立项目 notale-v1-58a9ebd799、新PostgreSQL16容器/空卷、备用55449数据库端口及4402/4403/4404应用端口，运行上一批干净构建。首次迁移、HTTP创建、sync/v2文字提交、应用停止/重启、完整保存快照相等和预览均通过；清理仅指定项目容器/卷，down -v成功。

初次默认网络创建失败：宿主机Docker地址池耗尽。仅临时Compose改用已存在默认bridge网络后通过；没有更改产品配置、清理其他网络或弱化保存断言。记录此环境限制，不将其说成标准容器网络路径已经验证。

## 批次 16：远端状态与自有代码许可

GitHub公开API确认JJchess/Notale为public，默认main且仓库级license为null；SSH ls-remote成功，HEAD 796cf239，未返回v1.0.0标签。当前本地nv2-dev分支和大量协作改动未推送，读权限不等于Release API权限已验证。

根据已授权常规开源决策，为两个编辑器目录增加标准MIT LICENSE，范围明确为自有代码与原创模板；第三方、历史参考素材、用户讲义和其他项目不因此重许可。OSI文本与Sharp官方安装文档已核对，LICENSE-SCOPE.md列出随bundle/可选native包分发的不同边界。package元数据与归档同步、实际第三方notices收集仍待完成；不宣称合规审查结束。

## 批次 17：可重复收集实际许可文本

新增 TS licenses:collect：先生成锁文件清单，再验证已安装版本，收集包根及license/legal目录的LICENSE/COPYING/NOTICE等原文，保留路径与SHA256，不把项目MIT覆盖依赖。脚本编译/执行通过，180个已安装包版本中收集167份原文（约363KB），输出THIRD-PARTY-NOTICES.txt与notice-review.json。

82条待审含跨平台未安装包；21个已安装包未在已检查位置找到文本（如fontkit、pg-types、Next/SWC、sharp-libvips），后续需核对README/源码banner/上游版本，不能当作无需许可。项目package及锁文件根项已声明MIT；已安装/归档的内部包仍旧，下一批统一重新打包后再校验，未重启4312。

### UI foundation follow-up — 2026-09-13

User prioritized visual refinement. Removed two obsolete root theme overrides; canonical palette and Chinese sans fallback now come from the initial tokens. Refined page thumbnail selection, sidebar search surfaces, insertion disclosures, rail actions and floating controls without changing document operations. Production build `.next-editor-v1-finish` passed and was promoted to 4312 with rollback recorded. Read-only six-page sample rendered with no browser page errors. Initial screenshot preceded iframe paint; a cross-origin DOM readiness probe was invalid and timed out, then frame-aware inspection confirmed content and final screenshots. No business suites repeated. Broader UI refinement and GitHub release remain outstanding.

### Property and form-dialog refinement — 2026-09-13

Unified global size/theme/background fields with object-property density, theme preset states and disclosure indicators. Moved advanced theme settings into the theme group instead of a separate section. Page settings, find/replace and document settings share form-dialog chrome and a reusable SVG close glyph. Corrected a visual-review finding where legacy ID specificity overrode footer alignment; final production build `.next-editor-v1-forms` published on 4312, previous `.next-editor-v1-finish` retained. Read-only browser review confirmed global panel and page dialog, initial name focus, close glyph and no page errors; no document mutation or business suite. Validation required a second build for the visual correction.

Internal archive `eb13e94d2cb68bfb` independently checked: packaged JS is byte-identical to `83f75ada9b7ac57a`; MIT metadata and LICENSE are present. This proves internal packaging, not completion of third-party notice review. README introduction/gallery and targeted validation examples refreshed.

### Source-release inventory and portability — 2026-09-13

Added read-only TS `release:inventory`, recording proposed editor-only file hashes, exclusions and value-redacted findings in .local. Initial run: 746 files / ~8.4 MB, 347 exclusions, 12 findings; source browser-path fixes reduced findings to 7 historical documentation/reference entries. No Git mutation/publication occurred and the report is not clearance. Added SOURCE-SCOPE.md documenting required final staged-tree/history/archive review. Public template/diagram commands now regenerate the original catalog; lecture audit requires explicit document ID. Both tooling compile/inventory runs passed; no frontend rebuild, browser suite or service restart was necessary for these tool/document changes. Final inventory must be rerun after this documentation change.

### Notes idle autosave — 2026-09-13

Added 650 ms document-wide draft autosave, composition pause/resume, disposal cancellation, recovered-draft scheduling, newer-input follow-up and explicit failure/conflict retention. Re-entering a conflicted page reconstructs its conflict controls. Host defers background autosave while a canvas text session is active, because the existing command boundary ends text editing. Shared flush still protects presentation/export/manual operations. Notes status no longer equates local queue acceptance with remote confirmation; header remains authoritative.

Eight focused state tests passed (including deterministic timer coverage for cross-page batching, composition, canvas-edit deferral, disposal, newer input and failure backoff); initial selected typecheck passed. Independent browser document 2fd6c06b-a0ac-472c-8d15-3511f586ef71 proved automatic server persistence, composition pause and reopening. Initial fixture lacked a stable object ID and was rejected with 422; corrected fixture passed. A final build includes the subsequent status wording and host deferral; publication pending until that build completes. Validation exceeded the initial estimate due these two concrete follow-up corrections, without unrelated suites.

Final production build `.next-editor-v1-notes-auto` passed and was promoted to 4312; HTTP readiness passed and rollback to `.next-editor-v1-forms` recorded. Backend unchanged. Earlier browser evidence is reused for unchanged idle persistence/composition flow; canvas-session deferral is covered by the focused state test and host wiring, not claimed as a full real-canvas regression.

### Concrete private source-release copy — 2026-09-13

Added TS `release:stage` to generate a fresh inventory and copy its exact files into a new private temporary directory with path/symlink checks, original executable flags and source/destination SHA-256 verification. Tooling compile and actual run passed: `/tmp/notale-source-review-m5cvZM`, 748 verified files, ~8.36 MB, 7 unresolved historical/reference findings. Inspected directory has exactly both sibling editors, no refined catalog or local runtime directory, and one selected internal tarball. No Git operations/publication. This is an inspectable candidate, not license/history/sensitive-data clearance; subsequent documentation edits require a fresh copy before final publication.

### Resolve legacy paths in the source proposal — 2026-09-13

Normalized five personal path references in historical worklogs/reference notes without removing their historical content. Excluded the old template README and six legacy reconstruction tools from release inventory; active product code/tests do not import them, and both public generation aliases target prepare-original. Local legacy files remain available. Fresh private stage `/tmp/notale-source-review-ASXNQc`: 741 hash-verified files / ~8.34 MB, zero configured scan findings. Inspected stage contains prepare-original.ts and none of the old generators. This clears the prior seven portability/reference findings, not the outstanding dependency notices or Git publication audit. Tool compile plus actual stage run passed; no product rebuild/restart was needed.

### Version-pinned upstream license supplements — 2026-09-13

Resolved npm metadata/gitHead for six installed packages lacking full local license text. Retrieved css-styled 1.0.8's complete upstream MIT text at its published commit; added manifest with immutable URL, registry source and SHA-256. Collector now accepts exact-version supplements and verifies their hashes. Regeneration passed: 379 lock entries, zero missing declarations, 171 license/notice texts, 78 remaining records including optional platforms, 17 installed text gaps. Other inspected repositories lacked an applicable standalone license at the published commit or the commit was unavailable; unrelated font/other-package licenses were not substituted. No runtime changes or frontend rebuild. Remaining gaps still need distribution-scope review before release.

### Actual backend runtime dependency graphs — 2026-09-13

Added in-memory esbuild metafile audit for six backend browser entries plus copied ECharts/Reveal/PathKit runtime assets. Tooling compile and audit passed without modifying emitted runtime output: 44 participating package names; five have no full collected text (brotli, croact, croact-css-styled, dfa, fontkit). RUNTIME-DISTRIBUTION.md distinguishes conservative graph membership from emitted-byte attribution and source-only archives from installed/prebuilt servers. This prioritizes the actual bundled gaps rather than treating all 17 installed-text gaps alike; it does not yet close those gaps or verify final archive/history scope.

### Preserve embedded Brotli decoder notices — 2026-09-13

Source inspection found seven Apache-2.0 Google copyright headers in brotli 1.3.3 dec/*.js, while npm metadata declares MIT. Added their verbatim headers, file hashes and official canonical Apache-2.0 text as a version-specific supplemental notice. Collector now distinguishes supplements from full package texts; runtime audit uses explicit completeTextFound rather than merely counting files. Tool compile, regeneration and targeted artifact assertions passed: 172 collected texts; Brotli's decoder notices are present while its unresolved package-level status remains visible. No product build/restart. This fixes an actual redistribution-notice omission without claiming all runtime license review complete.

### Explicit MIT declarations with standard terms — 2026-09-13

Confirmed all five outstanding bundled packages explicitly declare MIT in their exact installed package metadata. Added version-specific declared-standard notices containing metadata hashes, authors, available original copyright banners and standard MIT grant identified by SPDX. No invented years or false claims of recovering original license files. Collector distinguishes declaredTermsIncluded from completeTextFound; regeneration and assertions passed for all five. Total collected texts now 177. This supplies declared terms for distribution while preserving the source-evidence distinction and Brotli's separate Apache notice; embedded-source review and final archive checks remain separate requirements.

### Public-facing root documentation and remote check — 2026-09-13

Added editor-focused root README source with actual UI screenshot, supported editing/teaching flows, two-sibling structure, local quickstart, integration boundary, links and license scope. Stage tool now copies README/LICENSE from verified inputs and records separate root hashes. Fresh stage `/tmp/notale-source-review-KgJtm6`: 755 source files plus two root artifacts, zero configured scan findings; all root README local links/image resolve. Shared monorepo root remains unchanged. Git SSH read rechecked: HEAD 796cf2396806a14070312c75ce3a73267ff962f2, no v1.0.0 tag. No gh executable, GH_TOKEN/GITHUB_TOKEN or ~/.config/gh/hosts.yml found; no Release API credential verified yet. This is an eventual publication dependency, not an excuse to stop remaining candidate work; no Git writes/push or user authorization request made.

### Animation panel visual refinement — 2026-09-13

Replaced platform-dependent Unicode effect glyphs with consistent original SVG geometry for all effect families. Three-column effect gallery, selected states, timing fields, sequence surfaces and icon actions now use the shared inspector rhythm; removed decorative hover bounce. Effect categories retain their familiar semantic colors and labels. Production `.next-editor-v1-animation-finish` build passed, read-only experience page inspection showed 3 animation rows and 9 entrance SVGs with no browser errors. Actual screenshot reviewed; existing list scroll bounds remain. Published to 4312 with rollback to notes-auto; no animation command/state behavior modified and no business suite repeated.

### Runtime notices in portable project exports — 2026-09-13

Backend build now emits runtime-notices.txt combining scoped Notale MIT and collected third-party notices; build cache fingerprints both source notice files. Collector mirrors notices into backend docs so standalone backend builds do not depend on the frontend directory. Export includes a collision-free notice filename, preserving same-named user assets; import remains manifest-driven. Standard backend build passed and the focused HTTP authorization/preview/export/import round-trip passed, including user filename preservation and notice content. Updated stale preview assertion to request external bridge; initial tag regex failed due serialized attribute form, corrected driver passed. Initial edit command used wrong cwd and made no changes; an unnecessary unchanged build completed before the corrected edit/build. No broad tests.

Not yet deployed to stable 4312: current stable runtime and standard dist have bundler-output differences (including input-path naming), so deployment will use an explicit isolated server/runtime release rather than blindly replacing files. Contract archive still needs refresh. User documents were not mutated; test used scoped fixture cleanup.

### Deploy export notices and refreshed contract — 2026-09-13

Normalized/minified previous versus current bridge.js and vector-editor.js after removing build-input path prefixes: equal; prior byte differences were path spelling. contract:update reused valid backend build and produced vendor/notale-editor-0.1.0-74decb0bfb7b184f.tgz; selected archive inspected for dist/runtime-notices.txt. Frontend production `.next-editor-v1-export-notices` passed. Copied standard backend dist into immutable .local/export-notices-v1 and ran on isolated 4486/4487 with inherited configuration. Read-only six-page experience passed health, signed preview/bridge and ZIP export (487 files including runtime notices). Candidate Next 4399 rendered animation sample with 3 rows, 9 SVG effects and no browser errors.

Promoted frontend and backend together: 4312 FE, 4396/4397 BE; manifest now frontendBuild .next-editor-v1-export-notices and backendServer/backendRuntime .local/export-notices-v1. Previous animation-finish frontend and query-reference-server/chart-cleanup runtime retained. Owned candidate processes stopped. No user document writes; earlier scoped export round-trip evidence reused. GitHub Release remains outstanding.

### Versioned 1.0.0 source candidate and release notes — 2026-09-13

Both package roots and lock metadata now 1.0.0 without creating any Git tag. Standard backend build/contract update generated notale-editor-1.0.0-203c7d64aaff4a6f.tgz; archive metadata and runtime notice entry verified. Frontend .next-editor-v1-release production build passed and was promoted to 4312 with rollback to export-notices. Backend live export-notices build remains behaviorally unchanged; source version metadata is 1.0.0. Deployment documentation now consolidates clean install/database evidence and the specific Docker network limitation; backend quickstart uses generic paths and points users to the full React editor. Added V1-RELEASE-NOTES.md as a concrete publication draft. No Git commit/tag/push/Release yet; version labeling alone is not release completion.

### Isolated Git candidate and CI preparation — 2026-09-13

Added a read-only GitHub Actions candidate workflow with pinned official checkout/setup-node/upload-artifact commits, version/lock/tag checks, PostgreSQL-backed export/import check, backend/frontend builds, notes-state check and committed-source archive/checksum artifact. YAML parsed and staged copy verified; workflow has not run remotely. Stage tool now includes the workflow as a hash-recorded root artifact. Official GitHub Release API documentation notes extra workflow-write permission when target workflows differ from default branch, so no assumption that GITHUB_TOKEN alone resolves publication auth.

Private stage /tmp/notale-source-review-ua2ErW contains exactly 762 tracked candidate files. Initialized an independent editor-v1 Git repository and committed c69948609d7697f87b7e46498a5f02682af8f494 after matching its full tree to the verified inventory/root artifacts; clean status. git push --dry-run origin HEAD:refs/heads/editor-v1 succeeded and reported a new branch. No actual push/tag/Release occurred, and shared monorepo Git state is untouched. Current generated license inventory must be refreshed for the 1.0.0 contract before final candidate publication.
