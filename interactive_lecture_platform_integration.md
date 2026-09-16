# 互动讲义平台接入规范

> 状态：接入设计稿，供 AICosmos 后端、互动讲义 harness 和 editor 对齐。
>
> 结论先行：互动讲义可以按“外部 Web 应用平台”接入。harness/editor 由 TS 服务独立部署，AICosmos 平台适配层只负责准备上下文、调用 `execute`、保存结果并返回可访问 URL。这个模型与互动视频的播放器接入方式相近，但需要额外保留 `resource_id` 和版本信息，不能只保存 URL。

## 1. 背景与范围

互动讲义包含两个相互关联但职责不同的组件：

- **harness**：负责生成、运行、恢复或编排一次互动讲义任务；
- **editor**：负责讲义的编辑、版本保存和最终 Web 端展示。

AICosmos 不负责实现 editor 的页面和业务状态机。AICosmos 负责：

1. 把当前会话历史和用户身份交给互动讲义平台；
2. 调用平台统一入口 `execute(...)`；
3. 将平台结果转换成会话中的 `interactive_lecture_result` block；
4. 给前端返回可以打开或嵌入的 URL；
5. 在会话、权限、分享和复用场景中维护资源归属。

本文档只约定 AICosmos 与 TS 服务之间的最小接入契约，不规定 harness/editor 内部使用的框架、数据库或构建流程。

## 2. 与现有平台架构的关系

仓库的通用平台约定是：主系统只依赖平台的 `execute(conversation_history, **kwargs)`，平台内部自行决定具体动作，并返回统一的 `{process, results}` envelope。互动讲义应遵守这个边界。

推荐拓扑：

```text
用户 / 前端
    │
    │ 普通会话、结果 block、iframe / 新窗口
    ▼
AICosmos API
    │
    │ InteractiveLecturePlatform.execute(...)
    ▼
AICosmos 平台适配层
    │
    │ HTTP，内部鉴权，统一 request_id
    ▼
TS Harness API ─────► Editor / Viewer Web App
    │                         ▲
    └── resource/version ─────┘
```

职责边界如下：

| 能力 | AICosmos | TS harness/editor |
|---|---|---|
| 会话、角色、对话历史 | 负责 | 不负责保存 AICosmos 会话语义 |
| 互动讲义生成/修改 | 调用并关联 | 负责内部编排和执行 |
| 讲义源数据、版本 | 保存引用和摘要 | 负责 canonical source/revision |
| 编辑器和播放器页面 | 消费 URL | 负责页面、资源加载和交互运行时 |
| 用户/组织权限 | 负责入口与分享权限 | 负责 URL 使用时的二次鉴权 |
| 产物状态 | 保存 result block | 返回执行状态和资源状态 |

## 3. 推荐方案

### 3.1 最小可行方案

首期可以只实现以下链路：

1. TS 服务预先部署好 harness 和 editor/viewer；
2. AICosmos 通过 `InteractiveLecturePlatform.execute()` 调用 TS harness；
3. TS harness 创建或更新一个 `resource_id`；
4. TS 服务返回该资源的 `browser_url`/`preview_url`；
5. AICosmos 将 URL 和资源标识写入 `interactive_lecture_result`；
6. 前端直接使用返回的 URL 打开或嵌入 editor/viewer。

所以，“editor 自己部署好，后端返回一个 URL”的判断是成立的。需要补充两点：

- URL 是访问入口，不是资源的 canonical identity；canonical identity 必须是 `resource_id`，最好再带 `revision_id` 或 `version`。
- 编辑 URL、只读预览 URL 和分享/学习 URL 的权限与生命周期可能不同，不能默认把同一个 URL 在所有场景复用。

### 3.2 不建议的方案

不建议 AICosmos 只存一个裸 URL，例如：

```json
{ "url": "https://lecture.example.com/editor/abc" }
```

这种做法无法可靠处理：

- URL token 过期后的刷新；
- 用户从 Plaza 启动自己的副本；
- 同一会话里多份讲义的区分；
- 讲义被编辑后版本变化；
- editor 域名、路径或部署节点变化；
- 资源删除、转移和权限回收。

建议至少保存：

```json
{
  "resource_id": "lecture_01H...",
  "revision_id": "rev_01H...",
  "status": "completed",
  "preview_url": "https://lecture.example.com/view/....",
  "editor_url": "https://lecture.example.com/edit/...."
}
```

## 4. 平台适配层契约

### 4.1 Python 平台接口

AICosmos 侧新增平台可以采用如下形状：

```python
class InteractiveLecturePlatform:
    NAME = "interactive_lecture"

    async def start_platform(self, **kwargs) -> None:
        """检查 TS 服务可用性；外部服务常驻时可以是 no-op。"""

    async def execute(
        self,
        conversation_history: list[dict],
        *,
        session_id: str,
        user_id: str,
        resource_id: str | None = None,
        revision_id: str | None = None,
        auth_token: str | None = None,
        request_id: str | None = None,
        **kwargs,
    ) -> dict:
        """创建、恢复或更新一份互动讲义并返回标准 envelope。"""

    async def stop_platform(self) -> None:
        """释放适配层资源；不默认关闭外部 TS 服务。"""
```

`resource_id`/`revision_id` 可以从显式参数传入，也可以由平台从历史中的上一次 `interactive_lecture_result` 恢复。平台不应依赖进程内的上一次调用状态。

### 4.2 TS Harness HTTP 接口

AICosmos 与 TS 服务之间建议先定义一个内部 HTTP 接口。路径可以按部署调整，下面的路径只是推荐命名：

```http
POST /internal/interactive-lectures/execute
Authorization: Bearer <service-token>
Content-Type: application/json
Idempotency-Key: <request_id>
```

请求：

```jsonc
{
  "session_id": "aicosmos-session-123",
  "user_id": "alice",
  "resource_id": "lecture_01H...",        // 首次创建时可省略
  "revision_id": "rev_01H...",            // 可选
  "conversation_history": [
    { "role": "user", "content": "讲解牛顿第三定律，并加入一个可操作的受力实验" }
  ],
  "context": {
    "title": "牛顿第三定律",
    "language": "zh-CN",
    "source_files": [],
    "environment": {}
  },
  "callback": {
    "session_id": "aicosmos-session-123"
  }
}
```

请求字段说明：

| 字段 | 必填 | 说明 |
|---|---:|---|
| `session_id` | 是 | AICosmos 会话 ID，用于关联结果和恢复上下文 |
| `user_id` | 是 | 当前用户的稳定标识；TS 服务不可只依赖前端传来的显示名 |
| `resource_id` | 否 | 已存在讲义资源；省略表示由 harness 创建新资源 |
| `revision_id` | 否 | 指定继续编辑的版本；省略时使用资源当前版本 |
| `conversation_history` | 是 | 当前统一会话历史；TS 服务自行提取本轮意图 |
| `context` | 否 | AICosmos 的轻量补充上下文，不放大文件正文 |
| `callback` | 否 | 只有异步任务需要；同步完成时可以省略 |

`operation` 不要求暴露给前端。平台可以根据是否存在 `resource_id`、历史结果和当前请求内容，在内部判断是新建、恢复、编辑还是查询。若 harness 侧确实需要显式动作，可以把 `operation` 作为 AICosmos 与 TS 服务之间的内部字段，但不要让前端直接依赖 editor 的动作枚举。

### 4.3 同步响应

如果 editor 资源已经存在，或者 harness 能在一次请求中完成生成，返回：

```jsonc
{
  "process": [
    {
      "iteration": 1,
      "kind": "interactive_lecture",
      "monitor": { "status": "completed" }
    }
  ],
  "results": [
    {
      "op": "execute",
      "ok": true,
      "session_id": "aicosmos-session-123",
      "data": {
        "resource_id": "lecture_01H...",
        "revision_id": "rev_01H...",
        "title": "牛顿第三定律",
        "status": "completed",
        "browser_url": "https://lecture.example.com/view/....",
        "preview_url": "https://lecture.example.com/view/....",
        "editor_url": "https://lecture.example.com/edit/....",
        "version": 3,
        "summary": "互动讲义已生成"
      },
      "error": null
    }
  ]
}
```

统一字段含义：

| 字段 | 说明 |
|---|---|
| `ok` | 本次平台调用是否成功，不代表学生答题是否正确 |
| `session_id` | AICosmos 会话 ID，不是 TS runtime session 的替代品 |
| `resource_id` | 互动讲义的稳定资源 ID，后续恢复、分享和编辑依赖它 |
| `revision_id` / `version` | 当前内容版本；至少保留其中一种 |
| `browser_url` | 前端当前可以直接打开的 URL；用于统一平台结果消费 |
| `preview_url` | 只读或学习态预览 URL；没有区别时可与 `browser_url` 相同 |
| `editor_url` | 作者/有编辑权限用户使用的 URL；无权限时应为空 |
| `error` | 失败时给出可诊断信息，不返回 stack trace 或密钥 |

### 4.4 异步响应

互动讲义生成如果是分钟级任务，不应让 HTTP 请求一直挂起。此时返回同样的 envelope，但 `ok=false` 不适合表达“任务还在运行”，建议使用结果状态：

```jsonc
{
  "process": [],
  "results": [
    {
      "op": "execute",
      "ok": true,
      "session_id": "aicosmos-session-123",
      "data": {
        "resource_id": "lecture_01H...",
        "job_id": "job_01H...",
        "status": "in_progress",
        "progress_percent": 15,
        "current_stage": "building"
      },
      "error": null
    }
  ]
}
```

后续可以沿用现有平台进度模式，增加：

```http
GET /sessions/{session_id}/platforms/interactive_lecture/progress
POST /sessions/{session_id}/platforms/interactive_lecture/terminate
```

如果首期 editor/harness 总能同步返回 URL，则可以先不做独立进度接口；但 `status` 和 `job_id` 字段建议从第一版保留，避免以后破坏 block schema。

## 5. 会话结果 block

AICosmos 应将平台结果包装成独立的 `interactive_lecture_result`，不要复用当前 PPT 的 `ppt_result`。当前仓库的 `lecture` Plaza 类型绑定的是 PPT 产物，直接复用会导致前端按 PDF、`ppt_file_url` 和 `course_scripts` 解释互动讲义。

推荐 block：

```jsonc
{
  "type": "interactive_lecture_result",
  "tool_call_id": "interactive-lecture-01H...",
  "tool_name": "interactive_lecture",
  "title": "牛顿第三定律",
  "query": "讲解牛顿第三定律，并加入一个可操作的受力实验",
  "resource_id": "lecture_01H...",
  "revision_id": "rev_01H...",
  "preview_url": "https://lecture.example.com/view/....",
  "editor_url": "https://lecture.example.com/edit/....",
  "status": "completed",
  "success": true,
  "message": "互动讲义已生成",
  "data": {
    "resource_id": "lecture_01H...",
    "revision_id": "rev_01H...",
    "version": 3,
    "browser_url": "https://lecture.example.com/view/....",
    "preview_url": "https://lecture.example.com/view/....",
    "editor_url": "https://lecture.example.com/edit/....",
    "summary": "互动讲义已生成"
  }
}
```

状态建议：

| `status` | 语义 | 前端处理 |
|---|---|---|
| `in_progress` | harness 仍在生成或部署 | 显示进度；有 URL 时可提前打开 |
| `completed` | URL 和资源版本均可用 | 显示预览/编辑入口 |
| `failed` | 没有可用结果 | 显示错误，不显示发布按钮 |
| `interrupted` | 用户主动终止 | 显示已终止，不当作平台崩溃 |
| `partial` | 可用但部分节点/互动生成失败 | 允许查看，同时展示降级提示 |

`tool_call_id` 用于在会话历史中定位一次调用；`resource_id` 用于定位 editor 资源。两者不能混用。

## 6. URL、鉴权与部署要求

### 6.1 URL 类型

至少区分下面三类 URL：

| URL | 用途 | 是否可跨用户复用 |
|---|---|---|
| `editor_url` | 作者编辑讲义 | 通常不可复用 |
| `preview_url` | 只读预览/学习态 | 取决于分享权限 |
| `browser_url` | 当前前端直接打开的入口 | 由后端按当前用户场景签发 |

所有 URL 都应是 HTTPS 的公开可达地址，或是 AICosmos 网关可以代理的相对地址。不能把 Docker 内部服务名、内网端口或仅 TS 服务所在机器可访问的地址写入结果。

### 6.2 鉴权推荐

推荐由 TS 服务签发短期 URL，或由 AICosmos 请求 TS 服务生成短期访问票据：

- URL 不直接暴露长期 service token；
- URL 至少绑定 `resource_id`、用户或 share、权限和过期时间；
- editor/viewer 服务在每次加载资源时再次校验签名；
- token 过期后，前端调用 AICosmos 的 open/refresh 接口获取新 URL；
- 日志中不得打印完整 token。

iframe 场景不能假设前端会自动给 editor 请求附带 `Authorization` header，因此仅依赖 header 鉴权通常不够。可采用短期签名 URL、同源反向代理，或“前端先换取 HttpOnly cookie，再加载 iframe”的方案。

### 6.3 TS 服务最低部署能力

TS harness/editor 作为独立服务部署时，至少需要：

- `/healthz` 或等价健康检查；
- 固定的 `PUBLIC_BASE_URL` 或由网关注入的外部地址；
- HTTPS、正确的 `Content-Security-Policy: frame-ancestors` 和 CORS 配置；
- 资源/版本的持久化存储；
- 服务重启后仍可通过 `resource_id` 恢复；
- 生成任务的幂等键和可查询状态；
- 资源删除、权限回收和 URL 失效机制。

如果 editor 是常驻服务，AICosmos 的 `start_platform()` 可以只做健康检查，`stop_platform()` 不应默认停止整套 editor 服务。平台实例的生命周期和外部 editor 服务生命周期是两件事。

## 7. 续聊、编辑与幂等

平台每一轮都应该能从历史恢复资源：

```text
conversation_history
  └─ interactive_lecture_result.resource_id
       └─ InteractiveLecturePlatform.execute(...)
            └─ TS harness 根据 resource_id 加载当前 revision
```

必须支持以下行为：

1. **首次创建**：没有 `resource_id`，创建资源并返回第一个版本；
2. **继续编辑**：带已有 `resource_id`，harness 生成新版本并返回新的 `revision_id`；
3. **重新打开**：只需要资源 ID 时可以重新签发 `browser_url`，不重复生成内容；
4. **重复请求**：相同 `request_id`/`Idempotency-Key` 不创建重复资源或重复版本；
5. **并发编辑**：使用版本号或 revision conflict 检测，不能静默覆盖别人的新版本；
6. **服务重启**：不能依赖 TS 进程内存恢复资源；
7. **AICosmos worker 重启**：不能依赖 Python 平台实例内存恢复资源。

## 8. 分享与跨用户启动

### 8.1 首期推荐独立 Plaza 类型

当前仓库已有 `interactive_lecture` 这个组织权限资源类型，但 Plaza 的 `lecture` 目前表示 PPT 讲义，并绑定 `ppt_result`。因此推荐新增：

```text
Plaza type: interactive_lecture
Result block: interactive_lecture_result
Platform directory/artifact namespace: interactive_lecture
Permission resource type: interactive_lecture
```

不要把新的互动讲义直接塞进 `lecture`，除非产品明确决定放弃现有 PPT 讲义语义并同步迁移所有前端和后端字段。

发布：

```http
POST /api/sessions/{session_id}/plaza-share
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "type": "interactive_lecture",
  "result_block_id": "interactive-lecture-01H...",
  "title": "牛顿第三定律",
  "visibility": "published"
}
```

后端应校验：

- block 类型是 `interactive_lecture_result`；
- block 状态为 `completed` 或允许发布的 `partial`；
- `resource_id` 存在且属于当前用户或当前 session；
- 发布者具备 `interactive_lecture` 的发布权限。

### 8.2 启动分享

分享启动后，不能无条件复用作者的 `editor_url`。推荐由 TS 服务根据 share/session 重新签发当前访问 URL：

```http
POST /api/contents/interactive_lecture/{share_id}/launch
```

有两种合法语义，接入前要选定一种：

| 模式 | 适用场景 | 处理方式 |
|---|---|---|
| 只读共享版本 | 所有人看同一份讲义，交互状态不需要保存 | 复用发布版本，重新签发当前用户的 `preview_url` |
| 学习者副本 | 学生答题、进度、实验状态需要独立保存 | TS 服务基于 source `resource_id`/`revision_id` 创建 learner runtime/resource，再返回新 URL |

AICosmos 可以复制结果 block 和 session 引用，但 editor 的资源副本必须由 editor/harness 自己创建或确认。AICosmos 不应通过拷贝 URL 字符串来“复制”互动讲义。

## 9. 前端消费约定

对话里的结果 block：

```ts
function canOpenInteractiveLecture(block: any) {
  return block?.type === "interactive_lecture_result"
    && ["completed", "partial"].includes(block.status)
    && Boolean(block.preview_url || block.data?.browser_url);
}
```

打开逻辑建议：

```ts
async function resolveLectureUrl(sessionId: string, block: any) {
  const direct = block.preview_url || block.data?.browser_url;
  if (direct) return direct;

  const response = await fetch(
    `/sessions/${sessionId}/platforms/interactive_lecture/open`,
    {
      method: "POST",
      headers: authJson(),
      body: JSON.stringify({
        tool_call_id: block.tool_call_id,
        resource_id: block.resource_id,
      }),
    },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()).browser_url;
}
```

`open` 是可选的。如果首期 `execute` 总能返回未过期的 URL，前端可以直接使用 block 中的 `preview_url`。但只要 URL 有过期时间，就建议预留这个懒打开/刷新接口。

## 10. AICosmos 侧落地清单

### P0：能跑通一次互动讲义

- 新增 `InteractiveLecturePlatform`，实现 `execute` 和标准 envelope；
- 新增 TS harness 的内部 `execute` HTTP 接口；
- 新增 `interactive_lecture_result` block；
- 结果中持久化 `resource_id`、`revision_id`、`preview_url`；
- 平台配置增加 TS service base URL、service token、请求超时；
- 前端识别新 block 并打开 `preview_url`；
- 接入组织权限 `interactive_lecture` 的 create/view 检查。

### P1：可持续使用

- 支持已有资源的续聊和编辑；
- 支持 `open`/URL refresh；
- 支持 `status`、进度和用户终止；
- 增加会话结果聚合接口，例如 `GET /sessions/{session_id}/interactive-lectures`；
- 增加幂等键和版本冲突处理；
- 记录失败原因，但避免把 TS 内部 stack trace 写入用户 block。

### P2：可分享和运营

- Plaza 增加 `interactive_lecture` content type；
- 增加发布、详情、收藏、启动和删除的 result-block 映射；
- 确定“只读共享版本”还是“学习者副本”；
- 接入封面生成和资源统计；
- 增加 editor 资源删除/回收与 AICosmos share/session 删除的联动策略。

## 11. 接入前需要 TS 侧确认的问题

下面这些问题决定最终接口字段，建议 editor/harness 开发者补充后再冻结协议：

1. 生成是同步返回 URL，还是先返回 `job_id` 再异步完成？
2. `resource_id` 和 `revision_id` 的格式、生命周期及是否全局唯一是什么？
3. editor 是否区分编辑态和只读/学习态 URL？
4. URL 是长期稳定地址，还是带 TTL 的签名地址？TTL 多长？如何刷新？
5. 互动状态保存在哪里：共享资源、用户副本，还是 AICosmos session？
6. 用户从 Plaza 启动时，是复用同一版本还是创建学习者副本？
7. harness 是否支持幂等键、版本冲突和取消？
8. editor 是否允许 iframe？需要哪些 `frame-ancestors`、CORS、cookie 属性？
9. TS 服务是否能按 `user_id`/`org_id` 做二次授权？
10. 资源删除、版本保留和 URL 失效由哪一方负责？

## 12. 最终建议

互动讲义不需要把 editor 逻辑搬进 AICosmos，也不需要为 editor 设计一套复杂的前端 API。第一版可以按以下最小模型交付：

```text
TS 服务自部署
  → AICosmos InteractiveLecturePlatform.execute(history)
  → TS 返回 resource_id + revision_id + preview_url
  → AICosmos 写 interactive_lecture_result
  → 前端直接打开 preview_url
```

但从第一版开始就应把 `resource_id`、版本、用户身份、URL 鉴权和幂等纳入协议。否则首次展示虽然能跑通，后续续聊、编辑、分享和跨用户启动仍需要重新改接口，成本会高于现在多约定几个字段。
