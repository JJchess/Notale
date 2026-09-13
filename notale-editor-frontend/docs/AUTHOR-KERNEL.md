# 增量编辑与保存

画布保留当前 iframe。普通属性、文字和几何修改通过本地作者文档投影，再按 data-notale-id 更新 DOM；保存响应只推进已确认基准。互动脚本、媒体和图表的运行状态独立于作者数据。

## 新功能接入

- 通过 workbench.commands 或 EditorKernel 提交领域命令，不直接发保存请求或调用 render。
- 连续属性使用 bindPropertyInput 的 preview / commit / cancel。一轮输入是一个事务；逐帧预览，100ms 合并草稿，结束后提交。
- 领域命令必须登记共享 operationPolicies。可纯计算的命令在 author-projection 投影；结构与资源命令调用 /prepare，复用服务端规则及 mutationId 派生的稳定 ID。
- 运行时元数据由 author-state 更新。新运行时实现 update 适配器，只更新发生变化的实例；不要全量重建。
- 完整 iframe 挂载只用于导航、当前页面删除、源脚本改变或运行时恢复。window.__notaleMounts 记录原因。
- 导出调用 flushAuthor，等待草稿和服务端同步。getSnapshot 是本地投影，getConfirmedSnapshot 是已确认基准；whenSynchronized 提供同步屏障。

## 协议与恢复

POST /api/documents/:id/sync/v2 返回 mutationId、committedVersion、AuthorChangeSet。HTML 使用带基准校验的字符串差量；元数据按路径变化。GET /changes?after 按版本有序补齐，最多100个版本一批。完整不可变版本与旧 sync 接口继续保留。

未确认事务叠加在已确认基准上，旧响应不覆盖新操作。未发送撤销原子取消本机记录；已发送撤销使用 inverseMutationId，由服务端定位原提交。重试沿用原 mutationId 和请求内容。

IndexedDB 使用独立 notale-sync-v2 身份命名空间，复制旧草稿并保留原记录；不改写已发送的旧请求。网络失败保留本机队列，依赖对象被删除等永久错误保留为恢复草稿。复杂结构的准备需要联网；常用属性与几何修改可先在本机编辑。

## 本轮验证

定向浏览器用例：慢网连续改色与待确认撤销、运行节点身份与互动状态保留、远端独立属性合并、保存后重开、丢失响应的幂等重试，结构插入确认后撤销/重做，以及 Escape 取消连续属性预览。不是全量编辑器回归。预览发布信息保存在 .local/author-kernel-release.json，前一版构建和后端进程保留。
