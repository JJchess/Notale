# 三层架构验收

目标保持为：React 管理编辑器界面；独立状态层管理文档和编辑会话；画布控制层管理页面实例、局部更新及缓存。

本表依据当前源码、逐批浏览器结果及最后一次运行结果。历史迁移段落中的待办不代替当前判断。

| 要求 | 源码所有者与接口 | 验证证据 | 当前结论 |
| --- | --- | --- | --- |
| 编辑器界面由 React 管理 | app/page → Editor → EditorChrome；components 中的菜单、侧栏、属性、动画、图表、步骤、右键菜单；通过状态订阅和动作调用连接业务 | 各迁移批次的对应 React 用例；近期 appearance-react、animation-timing-react、chart-dialogs-react、thumbnail-controller；完整 editor-react-lifecycle | 界面所有权已建立。富文本编辑区、第三方表格、iframe 均有专属宿主，未把其内容交给两套渲染器共同修改 |
| 文档和会话独立于界面 | EditorKernel 管理确认文档、投影和历史；geometry-session.ts 中 DocumentSession 管理统一持久化队列；EditorSession 管理当前页、选区、步骤和界面会话；useEditorSelector 按字段订阅 | author-kernel 的连续修改/待确认撤销/远端合并/重开；editor-session/channel、kernel-admission、document-session-close、session-shutdown；workbench-shutdown 真实 IndexedDB 与在途回执 | 文档修改经统一命令链；旧会话保留待完成保存但不回写新 React 会话 |
| 页面实例及局部更新归画布层 | CanvasHost 只拥有空宿主；CanvasController 持有 iframe、来源校验、请求和释放；AuthorCanvasController 持有渲染基准、资源代次和补丁；PreviewController 持有独立预览实例 | author-canvas、canvas-requests、canvas-disposal；author-kernel 保持节点身份；editor-react-lifecycle 验证 StrictMode 重挂载和标签页锁释放 | 控制层已建立；关闭后作者控制器不可重启，旧页面/文档/刷新请求被隔离 |
| 缓存有边界且与会话生命周期一致 | CanvasResources 按 document/version 分区并有界 LRU；CanvasController 默认 3 个实例；PageThumbnail 注册宿主，缩略图控制器持有实例和源缓存 | editor-architecture 真实命中、容量 3、淘汰、版本失效、搜索/概览/排序；thumbnail-controller 页数/删除/卸载；canvas-resources 请求合并、旧失败不清除新缓存 | 缓存行为与关闭释放已验证；CanvasResources.dispose 已绑定编辑器关闭，终止后拒绝新请求；生产构建与浏览器缓存/重挂载验证通过 |
| 保持功能和退出语义 | 保存和撤销不走组件私有文档；SessionShutdown 同步停止生产者，失败草稿由 ClosingSessions 持有；React 卸载不丢弃在途保存 | 上一批三条作者更新/StrictMode 用例 20.1 秒；本轮 editor-architecture + workbench-shutdown 三条 19.0 秒 | 已验证本次架构相关闭环，未宣称产品全部功能无缺陷 |

当前稳定入口：4312，architecture-onehundredthirteen。本轮只读审计后的组合状态检查 29 项通过，结果在 `.local/architecture-final-units.log`；浏览器三项结果在 `.local/architecture-final-browser.log`。资源缓存释放新增检查另行通过。

## 验收结论

原始三层职责已实现并按上表核对。最终生产构建通过，缓存复用/淘汰/版本失效及 StrictMode 完整 React 卸载重挂载两条验证通过（19.5 秒，`.local/architecture-onehundredthirteen-browser.log`）。发布记录 `.local/presentation-release.json` 指向同一构建，4312 返回 HTTP 200。

本次架构目标没有未完成项。下述边界是职责定义和既有产品能力限制，不将架构验收扩张为全部产品功能验收。

## 明确的边界

- 控制器可使用 DOM 几何、焦点 API、iframe 和第三方渲染器宿主；讲义 HTML/SVG 的解析与输出不是编辑器界面构建。
- 字段临时输入和指针预览可由 React 局部状态持有，文档事务和跨组件编辑会话由状态层持有。
- workbench 是应用装配与业务协调器，仍较大；文件大小不作为所有权完成标准。
- 任意自定义讲义脚本的计时循环不保证可暂停。缓存实例的原生媒体及受支持运行时使用显式生命周期通信。
- 有序关闭和失败恢复保留未完成操作；没有承诺任何进程崩溃之前的所有按键意图均已落盘。
