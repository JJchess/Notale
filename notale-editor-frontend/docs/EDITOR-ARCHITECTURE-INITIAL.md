# 编辑器架构迁移

目标：React 管理编辑器界面；独立状态层管理文档和编辑会话；画布控制层管理页面实例、局部更新及缓存。保留已有功能和保存语义，不以改扩展名或拆文件作为完成标准。

## 所有权

- `EditorKernel`：已确认文档、乐观投影、事务与历史。React 不直接修改文档；所有修改继续走统一命令链。
- `state/editor-session.ts`：可订阅的当前页面、选择、画布就绪状态，以及来自 Kernel 的只读文档引用。采用 `useSyncExternalStore`，不把逐帧几何操作送入 React。workbench 的 `snapshot`、`slideId`、`selected`、`canvasReady` 独立变量已移除，统一通过 Session 的只读访问器读取；选区写入走 `select()`，切页走 `openPage()`，同时清空旧字段和就绪状态。选区 Set 是按数组身份缓存的只读视图，不能独立写入。
- `use-author-draft.ts`：文字、互动初始值和对象名称共享受控草稿生命周期；字段身份变化重置，未应用草稿不会被无关更新覆盖。互动初始值与名称保存均校验目标和作者状态，显隐按钮也通过显式命令接口调用。
- `components/geometry-fields.tsx`：位置、尺寸、旋转、缩放、宽高比和文字框换行选项由 React/Session 管理。几何提交捕获目标身份，串行等待手势屏障后重新采集矩形；不再从输入框 DOM 读取业务参数。外层分组已归 React；字段内部的遗留适配器继续按批迁移。
- `state/inspector.ts`：选区名称、文本叶节点、原子内容、锁定和输入控件能力的纯模型。`SelectionSummary` 负责提示，`ObjectTextEditor` 负责文字草稿与事件；应用文字前核对文档/页面/对象/原值，无关更新不覆盖草稿。`context-inspector.ts` 只发布选区和文字字段模型，不再创建、移动或修改界面节点。
- `state/sidebar.ts` 与 `components/sidebar.tsx`：活动工具、外层面板、内部标签、讲稿、聚焦恢复和本机偏好归 Session/React；`editor-shell.ts` 不再模拟标签点击或修改对应显隐属性。`style-scope.tsx` 管理全局/对象样式分区的显隐和独立滚动位置；shell 不再复制选区状态或修改分区 DOM。
- `components/file-menu.tsx`、`document-switcher.tsx`：文件菜单、重命名和讲义切换的 DOM、输入草稿、焦点和错误展示归 React。目录和忙碌状态归 Session；加载继续经过既有保存屏障，失败不切走原讲义。`workbench.ts` 已不再维护第二份 busy 变量。
- `components/editor-controls.tsx`：保存提示、撤销/重做、新建/复制/删除/排序页面、放映按钮及菜单由 React 渲染和绑定。业务命令通过 `editorActions`，状态通过 Session；这些控件不再接受 workbench/dock-icons 的 DOM 写入。
- `state/use-editor-selector.ts`：按字段订阅稳定快照，保存提示变化不会触发页面列表重新渲染。
- `components/page-list.tsx`：页面卡片、搜索、总览分页、拖动排序和键盘排序归 React。缩略图的空容器是画布渲染器专属边界。
- `canvas/resources.ts`：按文档版本隔离的预览/对象请求，合并重复请求、失败重试和有界 LRU。不会返回其他文档或版本的对象缓存。
- `canvas/controller.ts`：iframe 创建、切换、有界实例缓存、销毁、来源/通道校验、消息订阅与就绪握手；React 只持有 `CanvasHost` 空容器。后台暂停原生媒体和 Web Animations；任意自定义脚本的定时循环还需要生命周期适配。
- `components/step-controls.tsx`：当前步骤、范围和导航禁用状态订阅 Session；步骤栏及讲授分组由 React 渲染，旧步骤编辑器只占用指定空容器。切页重置步骤与组内选择范围，编辑画布始终使用编辑模式；互动预览使用独立的 React 窗口和预览画布控制器。
- `components/property-group.tsx`：文字、互动初始值、几何、排列、名称、组件及高级属性的分组结构与选区显隐归 React。移除启动时组装分组与搬动字段；媒体/组件旧控制器只挂载到指定空容器。复杂属性编辑器自身的 DOM 仍有后续迁移工作。
- `components/preview-overlay.tsx` / `state/preview-session.ts` / `canvas/preview-controller.ts`：预览弹窗、焦点、键盘和控件归 React；冻结的预览文档与页面/步骤/加载状态归 PreviewSession；iframe、来源校验、3 页缓存、签名续期和请求取消归控制器。关闭清除实例与租约，React 卸载断开 observer/listener；准备、重试和关闭用代次校验隔离旧请求。旧 `preview-overlay.ts` 已移除。公共续期工具通过状态事件报告连接变化，不再创建 UI；React 的 ResourceNotice 分别在编辑器、预览、放映界面显示合并后的提示。
- `preview-lease.ts` / `canvas/resource-lease.ts` / `state/resource-notices.ts`：续期只负责网络、计时、恢复事件和取消；适配器把健康/失败/重试/停止映射到通知状态。每个续期任务独立释放，同一界面的多个失败合并显示，停止后的响应不能恢复通知。React 提供重试入口。
- `canvas/request-session.ts`：几何采集、场景读取和原生图表读取共用按页面实例隔离的请求生命周期。请求 ID 与响应类型同时匹配，切页/销毁立即取消，超时移除等待项；workbench 不再维护这三套回调表及就绪等待队列。编辑器和预览通过 CanvasController 订阅经验证的消息，控制器销毁会移除原生消息监听器。
- `canvas/author-controller.ts`：负责作者预览投影、已渲染基准、局部 HTML/状态补丁、资源基址和 prepared 运行时刷新；workbench 仅接收完成通知更新缩略图及面板。异步资源返回同时校验文档、页面与渲染代次，旧文档响应不能覆盖资源地址或添加续期。文档切换和 CanvasController 销毁会释放资源续期任务。
- `state/layers.ts` / `components/layers.tsx`：图层行、搜索和选中显示归 React/Session。列表使用稳定对象 ID，不再写入整段 HTML 或逐行重绑事件；动作核对文档/页面身份后调用既有选择逻辑。父节点索引一次建立，原子对象内部隐藏，异常父子循环终止。动画触发对象选项仍由其旧编辑器适配。
- `components/document-settings.tsx` / `state/document-settings.ts`：页面尺寸、主题和历史恢复的输入、对话框、忙碌与错误状态归 React；文档身份与字段基线验证、命令提交和恢复前保存屏障归独立动作绑定。无关更新保留草稿，同字段冲突阻止覆盖；历史恢复必须明确确认。旧 document-ui 只剩草稿恢复与参考线界面适配。
- `workbench.ts`：迁移期间的应用协调器，仍有大量旧界面和事件逻辑，尚未达到目标状态。

## 尚需完成（验收范围不随进展缩小）

1. 页面搜索、总览分页、拖动/键盘排序已迁入 React，旧 `page-navigation.ts` 和 shell 卡片写入已移除。新建/复制/删除/排序按钮已迁入 React；页面设置对话框仍待迁移。
2. Header、Activity bar、Sidebar、属性面板及编辑对话框逐组迁入 React，保留复杂表格/图表渲染器的明确挂载边界。
3. workbench 的文档、当前页、选区和就绪副本已移除，文档引用在 Kernel 通知和加载时发布到 Session。页内步骤和组内选择范围也已迁入 Session；独立预览启用后不再可达的编辑画布播放模式已移除。仍须迁移各复杂工具的会话状态，继续用命令接口替代 DOM 查询驱动业务。
4. 画布控制器已持有 iframe 实例、通信验证、就绪握手、请求取消、暂停/恢复、版本失效和有界实例缓存。局部 author patch 协调已迁入 AuthorCanvasController，部分专用图表请求仍在工具中，需要继续整理；编辑器和放映使用适合各自职责的接口。
5. React mount/unmount、文档切换和异常恢复清理完整；移除过时的全局挂载假设、重复事件监听与旧实现。
6. 以最少真实样本验证编辑/保存/恢复、撤销、页面管理、互动放映和无资源泄漏。性能对比排除首次启动时间；不以窄范围用例推断全部完成。


此文件保存最初阶段的架构说明，不作为当前待办清单。当前状态见 EDITOR-ARCHITECTURE.md。
