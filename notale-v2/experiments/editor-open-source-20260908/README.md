# 开源编辑器与 TS 后端：源码研究

研究日期：2026-09-08。范围：Payload、Lumi H5P Node.js Library、PPTist、GrapesJS 四个仓库，另检出 Payload 稳定版用于对照。目标是判断哪些能力能直接用于 Notale，哪些仍需要适配。

**建议优先验证 GrapesJS 核心＋Notale 互动组件＋Payload 稳定版/PostgreSQL 的组合。** GrapesJS 承担网页对象编辑和工程模型，Payload 承担通用业务管理；讲义版本提交和 Python/AI 执行保持专用模块。PPTist 保留为 PPT 操作体验优先时的候选，H5P 作为标准互动题型的可选接入。这个判断来自源码及有限浏览器实验，尚不是完整集成验收。

## 1. 本地仓库与版本

仓库均已实际 clone，位于本目录 `repos/`；上游工作区没有修改。完整 SHA、来源和版本见 [repositories.json](repositories.json)。`repos/` 被本目录 `.gitignore` 排除，避免把第三方源码提交进 Notale；研究记录和探针脚本可以单独纳入版本控制。

| 项目 | 本地目录 | 本次固定版本 | 主要研究入口 |
|---|---|---|---|
| Payload 开发版 | [repos/payload](repos/payload) | main，`0a3dabf0`，4.0.0-canary.14 | collections、versions、queues、Drizzle adapter |
| Payload 稳定版 | [repos/payload-stable](repos/payload-stable) | v3.88.0，`fea6f8a4` | Local API、事务、更新 SQL、任务领取 |
| Lumi H5P Node.js Library | [repos/h5p-nodejs-library](repos/h5p-nodejs-library) | master，`7317e681`，h5p-server 10.0.4 | h5p-server、REST 示例、HTML exporter |
| PPTist | [repos/pptist](repos/pptist) | master，`e4912589`，2.0.0 | slides 类型、三种渲染入口、快照、导出 |
| GrapesJS | [repos/grapesjs](repos/grapesjs) | dev，`2bdeda85`，core 0.23.6 | HTML parser、组件脚本、工程存储、撤销 |

本轮查询 npm 的 `payload` latest 标签得到 3.88.0，因此额外 fetch `v3.88.0` 并建立独立 worktree。默认分支的功能不能当作稳定版已有功能。上述版本是本次快照，不表示以后安装时仍是最新版本。

## 2. Payload：复用业务基础，专门实现讲义提交

可复用 collections、用户认证、访问控制框架、上传、管理界面、PostgreSQL 适配和普通内容的草稿/版本。Notale 自己的画布不由 Payload 管理界面替代。

**Local API 必须显式传权限上下文。** 稳定版 [local/update.ts](repos/payload-stable/packages/payload/src/collections/operations/local/update.ts) 默认 `overrideAccess = true`。自定义端点调用 Local API 时应传 `user`、`overrideAccess:false` 和同一事务 `req`；已有登录态不代表所有内部调用自动执行项目成员检查。[initTransaction.ts](repos/payload-stable/packages/payload/src/utilities/initTransaction.ts) 通过 `req.transactionID` 复用事务，因此跨多次调用的提交必须正确传递上下文。

**内置版本不是整套讲义的不可变快照。** [saveVersion.ts](repos/payload-stable/packages/payload/src/versions/saveVersion.ts) 在 autosave/unpublish 路径尝试更新最近版本，autosave 还会判断最近版本是否为 autosave。它不承诺每次自动保存都新增永久版本，也不会自动把关联页面、源码及资源递归冻结。Notale 仍需明确的 revision manifest、资源保留引用和发布清单。

**不能把一般查询条件当作原子版本锁。** 稳定版 [updateOne.ts](repos/payload-stable/packages/drizzle/src/updateOne.ts) 可先按 `where` 找到 ID，再调用 `upsertRow`；[upsertRow/index.ts](repos/payload-stable/packages/drizzle/src/upsertRow/index.ts) 的实际 UPDATE 路径按 ID 更新。因此不能仅凭 `payload.update({where:{…version…}})` 的外观就认定实现了 compare-and-swap。提交服务需要同一事务内的显式行锁，或带版本条件的 SQL UPDATE，并以真实 PostgreSQL 并发测试验证。这是对源码路径的判断，本轮没有复现数据库竞争。

**任务队列要区分稳定版与 canary。**

| 路径 | 稳定版 3.88.0 | 本次 main 4.0 canary |
|---|---|---|
| 任务领取 | `processing` 标志；适配器先查候选再按 ID 更新 | 增加 `processingUntil`、`processingToken`，领取 SQL 重查租约条件 |
| 活跃执行续期 | 没有 canary 的 heartbeat 实现 | 有租约心跳与 token 条件续期 |
| 本项目采用条件 | 单 worker 原型可评估；多 worker 与崩溃恢复需要单独证明 | 可研究设计，不能作为稳定版能力承诺 |

证据：稳定版 [runJobs](repos/payload-stable/packages/payload/src/queues/operations/runJobs/index.ts)、[updateJobs](repos/payload-stable/packages/drizzle/src/updateJobs.ts)；开发版 [updateJobs](repos/payload/packages/drizzle/src/updateJobs.ts)、[heartbeat](repos/payload/packages/payload/src/queues/operations/runJobs/heartbeat.ts)。取消队列记录也不等于终止正在运行的 Python 进程，执行器仍需实现取消传播和拒绝过期产物提交。

**落地方式：** 先固定稳定版，使用 Payload 自定义端点及专用提交服务；不再并列维护另一套 Fastify CRUD。独立 TS worker 调用 Python；BullMQ/Redis 仍作为生产任务调度候选，不能因为看到 canary 租约实现就删除该备选。无论选哪种队列，幂等、候选应用条件和 attempt 隔离都属于 Notale。

## 3. H5P：内容协议值得参考，现有 HTML 不能直接套入

[H5PEditor.ts](repos/h5p-nodejs-library/packages/h5p-server/src/H5PEditor.ts) 的 `saveOrUpdateContentReturnMetaData` 处理 library 标识、元数据和参数，再交给 [ContentStorer.ts](repos/h5p-nodejs-library/packages/h5p-server/src/ContentStorer.ts)。后者按 library semantics 校验、扫描资源引用、写内容、复制文件并删除不再使用的旧文件。

这个过程说明 H5P 的编辑核心是“内容类型＋字段语义＋参数＋资源”。现有任意 HTML/Canvas/闭包脚本必须包装为内容类型，建立字段和运行时接口；只把网页放进去不能得到内部对象编辑。

可直接借鉴的边界在 [types.ts](repos/h5p-nodejs-library/packages/h5p-server/src/types.ts)：

- `IContentStorage`：内容参数、元数据和内容文件。
- `ILibraryStorage`：内容类型及其代码依赖。
- `IContentUserDataStorage`：学习者运行状态，与作者内容分开。

两个与 Notale 接入直接相关的细节：

- 默认权限为 [LaissezFairePermissionSystem](repos/h5p-nodejs-library/packages/h5p-server/src/implementation/LaissezFairePermissionSystem.ts)，检查返回允许；REST 示例的用户与教师规则也不是 Notale 的项目成员模型，接入时必须替换。
- `ContentStorer.deleteUnusedOldFiles` 会清理当前内容不再引用的文件。若要恢复任意历史版本，需要版本化内容 ID/存储适配与资源保留策略，不能只在外层保存一份旧参数 JSON。

[REST routes](repos/h5p-nodejs-library/packages/h5p-rest-example-server/src/routes.ts) 展示编辑/播放/保存的接口组织，可供 TS 服务参考，但不含我们的 `baseVersion` 提交协议。[HtmlExporter.ts](repos/h5p-nodejs-library/packages/h5p-html-exporter/src/HtmlExporter.ts) 能打包播放所需核心与库资源，其说明明确外部链接的内容资源不会全部内嵌；播放 HTML 也不等于包含完整编辑能力的工程包。

**定位：** 后续接标准 H5P 题型时作为插件采用，首期不把全部现有讲义迁成 H5P。内容参数、库版本、学生状态分离的设计直接用于 Notale 组件协议。

## 4. PPTist：PPT 编辑体验现成，网页迁移成本仍在

[slides.ts](repos/pptist/src/types/slides.ts) 定义了文本、图片、形状、线、图表、表格、公式、视频、音频九类元素，以 left/top/width/height/rotate 等描述布局。这与当前网页的 flex/grid、DOM 层级和运行时绘图不完全对应。

新增互动元素不只是添加一个类型。至少要接入以下路径：

- [编辑画布](repos/pptist/src/views/Editor/Canvas/EditableElement.vue)。
- [演示画面](repos/pptist/src/views/Screen/ScreenElement.vue)。
- [缩略图](repos/pptist/src/views/components/ThumbnailSlide/ThumbnailElement.vue)。
- [导出分支](repos/pptist/src/hooks/useExport.ts)，为互动内容明确选择原生对象、定格图或外链等表示。

移动端另有渲染入口，工具栏与编辑行为也按元素类型分派。引入互动节点需要覆盖这些实际入口，并让复制/撤销操作只保存作者配置。

[snapshot.ts](repos/pptist/src/store/snapshot.ts) 把 slides JSON 克隆到 IndexedDB 快照，保留上限为 20；[database.ts](repos/pptist/src/utils/database.ts) 使用包含会话标识和时间的数据库名。这是本地撤销历史，不能替代服务端版本和跨设备保存。

**定位：** 如果首要目标是成熟 PPT 操作界面，PPTist 值得二次开发；如果首要目标是保留已有讲义网页的布局与互动，先做 GrapesJS 原型更合适。此处没有对 PPTist 做实际页面迁移或视觉保真对比，不据此认定它不能实现。

## 5. GrapesJS：实际探针验证了哪些能力

[parser config](repos/grapesjs/packages/core/src/parser/config/config.ts) 默认 `allowScripts:false`，[ParserHtml.ts](repos/grapesjs/packages/core/src/parser/model/ParserHtml.ts) 确实删除 script 标签。即使打开脚本选项，也只是改变导入行为，不会把任意 JS 闭包、Canvas 对象自动转成可编辑字段。

可用的接入点是自定义 component type、traits 和 `script-props`。[CanvasView.updateScript](repos/grapesjs/packages/core/src/canvas/view/CanvasView.ts) 把组件脚本及参数放到 iframe 中运行；[ComponentView](repos/grapesjs/packages/core/src/dom_components/view/ComponentView.ts) 管理脚本更新和卸载事件。互动适配器需要相应清理计时器与外部监听，避免参数变化或撤销后重复运行。

[Editor.storeData/loadData](repos/grapesjs/packages/core/src/editor/model/Editor.ts) 提供工程 JSON 存取；[RemoteStorage](repos/grapesjs/packages/core/src/storage_manager/model/RemoteStorage.ts) 可配置远端请求，但不会自动实现 Notale 的版本条件、幂等和资产引用。因此工程 JSON 应通过 Notale 提交协议保存。

本轮从克隆的 core 源码构建最小浏览器 bundle，在 Chromium 中执行 [probe-grapesjs.py](probes/probe-grapesjs.py)。完整结果见 [grapesjs-results.json](probes/grapesjs-results.json)。

| 实验 | 观察结果 | 能说明什么 |
|---|---|---|
| 导入真实 `page-07.html` | 原有 2 个 script 均被删除，2 个 canvas 标签保留，导出 JS 长度为 0 | 直接导入无法保留原有实验逻辑 |
| 真实页解析后的工程 JSON 保存/重载 | 两次导出的 HTML/CSS 一致，stage 节点保留 | 证明导入结果能往返；不证明与原页视觉/行为一致 |
| 自定义互动组件运行 | 默认值 15，点击后显示 16 | 组件脚本能在画布运行 |
| 编辑作者参数 | count 改为 25，运行输出变为 25 | 参数修改能重新初始化互动 |
| 撤销参数修改 | count 与显示恢复为 15 | 作者参数进入撤销历史 |
| 保存并在另一个实例加载 | 参数及输出为 25，点击后为 26 | 注册同一插件后可以恢复运行 |
| 检查保存内容 | 运行时生成的 button 标记没有写入组件模型 | 本探针区分了作者配置和临时运行 DOM |
| 不注册插件就加载 | 报 unknown type；type 字符串仍在，traits 退回 id/title | 工程必须绑定组件插件和版本，JSON 本身不保证编辑能力 |

这里的互动组件是用于验证机制的合成计数器，**不是把 page-07 的 Canvas 实验迁移成功**。真实页仅做了解析与模型往返，没有验证布局、字体、步骤播放或 Canvas 计算。没有把整页 iframe 当作可编辑化成功。

## 6. 复现与验证边界

在当前工作区中：

```bash
cd experiments/editor-open-source-20260908/probes
npm ci --ignore-scripts
node build-grapesjs.mjs
timeout 35s python3 probe-grapesjs.py
```

需 Python Playwright 和 Chromium；本环境已有。真实样本读取自 Notale 的 `runs/ens-trim-full-0907/pages/page-07.html`，换机器需同时提供该文件。Node 依赖已锁定；[构建脚本](probes/build-grapesjs.mjs) 使用 TypeScript ES5 转换与 esbuild 打包克隆源码，以适配上游的旧式 Backbone 继承方式。这是研究用最小构建，不是上游完整发布构建或类型检查。

本轮完成：四个项目的关键源码链路研究、Payload 稳定/开发版对照、GrapesJS 浏览器探针。没有启动四套完整产品，没有执行上游完整测试，没有运行 PostgreSQL 并发/恢复测试，也没有给出经过实测的工期或性能结论。当前主机 Node 20 不满足部分仓库的完整开发环境要求；最小探针能运行不代表这些应用都能直接在该环境部署。

仓库许可核对：Payload 核心 MIT、GrapesJS 核心 BSD-3-Clause、PPTist AGPL-3.0、Lumi 仓库 GPL-3.0（h5p-server 包为 GPL-3.0-or-later）。这里记录的是对应源码/包的声明，插件、SDK 和 H5P 内容类型另看各自声明。

## 7. 下一步应实现的验证切片

1. **前端：** 将真实 page-07 的标题、默认参数与 Canvas 实验接成 GrapesJS 组件，实际完成修改→保存→关闭重开→运行→撤销；同时测一个文字/SVG 页的布局保持。组件 schema、插件版本与作者配置随工程保存。
2. **后端：** 固定 Payload 3.88.0＋PostgreSQL，实现受控 revision 提交；验证两个同版本保存只有一个成功、响应丢失重试不新增版本、旧版资产可恢复。通用 collections 写入口不能绕过该协议。
3. **任务：** 独立 worker 调用现有 Python；每次 attempt 使用新目录，AI 结果保存为 candidate，应用时检查 head。队列以崩溃恢复和重复领取测试决定，不依赖 canary 特性。

通过上述切片后再锁定底座和排期。我们应复用成熟编辑器与业务基础，把自研工作集中在 Notale 的互动绑定、讲义版本语义和 AI 编辑链路。
