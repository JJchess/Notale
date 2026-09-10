**Notale 编辑器 TypeScript 后端方案**

日期：2026-09-08。承接 [互动讲义可编辑化方案](PLAN-editable-interactive-lectures.md)。用户已确定使用 TS 建设后端；本文把该方向细化到模块、数据、接口、任务与验收。以下均为拟实现设计，当前尚未搭建服务或进行性能测试。

**1．推荐决策**

补充决策：用户进一步提出开源复用诉求后，调整为 **先验证 Payload 稳定版作为 TS 业务后端底座，前端优先验证 GrapesJS 与 Notale 互动组件**。四个候选仓库已 clone 并研究，GrapesJS 的有限浏览器探针已通过；真实互动页迁移和数据库提交仍待验证。下述 Fastify 架构保留为自建备选，领域约束继续有效。具体复用边界见第 11–12 节及 [源码研究报告](experiments/editor-open-source-20260908/README.md)。

自建备选采用 **Node.js 24 LTS＋TypeScript＋Fastify＋PostgreSQL/Drizzle＋S3 兼容对象存储**。后台任务使用 **TS Worker＋BullMQ/Redis**。API 与 Worker 共用代码包、分别启动，采用模块化单体。

TS 负责编辑器所有业务接口、版本、权限、资源、发布和任务编排；Python 暂时保留为生成执行器，通过结构化输入输出连接。编辑、保存、重开已有讲义无需调用 Python 或模型。后续可以按模块将生成能力迁往 TS，但这不是编辑器首版的前置条件。

| 选择 | 理由与边界 |
|---|---|
| Fastify | 路由 schema、类型推导、插件封装适合明确的领域模块；此处选择基于项目结构，不用框架基准测试推断实际性能 |
| PostgreSQL＋Drizzle | 元数据关系、权限、条件更新使用 SQL；页面内容用 JSONB。Drizzle 提供类型化访问与事务，数据库约束仍须明确实现 |
| S3 兼容存储 | 存源文件、图片、音视频、字体及构建产物；开发期可提供本地目录适配器 |
| BullMQ＋Redis | 承担持久排队、重试及任务调度；任务权威状态仍存 PostgreSQL，队列不承载讲义文档 |
| REST＋SSE | REST 保存与发起操作，SSE 通知任务/版本变化；首期不需要为自动保存引入 WebSocket |
| 共享 contracts 包 | 从应用维护的 JSON Schema/TypeBox 定义导出 TS 类型、API schema 和 Python 可读取的契约 |

截至调研日，Node 官方将 24 列为 LTS；实施时锁定受支持的补丁版本和依赖锁文件。[Node 发布表](https://nodejs.org/en/about/previous-releases)。Fastify 官方支持 schema 校验、类型提供器与插件封装。[校验](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)、[类型提供器](https://fastify.dev/docs/latest/Reference/Type-Providers/)、[封装](https://fastify.dev/docs/latest/Reference/Encapsulation/)。

如果团队已经统一 NestJS，可采用 NestJS＋FastifyAdapter，下面的领域与存储设计不变；现阶段没有证据需要额外引入 Nest 的组织方式。[Nest 官方适配说明](https://docs.nestjs.com/techniques/performance)。Drizzle 事务能力可用于提交原子性，具体锁策略属于本方案的业务实现。[Drizzle Transactions](https://orm.drizzle.team/docs/transactions)。

**2．部署单元与模块边界**

```text
浏览器编辑器 ── REST / SSE ── TS API
                                │
                         PostgreSQL（权威数据）
                                │ outbox 投递
                            BullMQ / Redis
                                │
                           TS 任务 Worker
                         /               \
              隔离 Python 生成执行器    隔离浏览器验证/导出

源文件、媒体与构建产物 → 私有对象存储 → 独立内容域播放器
```

建议领域模块：`identity`（用户/会话）、`projects`（成员与权限）、`documents`（页面/对象命令）、`revisions`（保存/恢复）、`assets`（上传/资源引用）、`components`（组件版本/schema）、`jobs`（生成/验证/导出）、`releases`（发布/分享）。模块通过服务接口组合，HTTP 层不直接横跨多个仓储随意修改数据。

API 只做鉴权、校验、短事务和任务受理。浏览器截图、解包、文档编译、AI 生成不在 API 请求进程中执行。`document-core` 提供无 DOM 的命令应用、结构校验和迁移函数，浏览器与服务端使用同一实现；真正的渲染及布局测量留给浏览器 Renderer。

**3．文档与数据库模型**

采用“整套讲义版本清单＋不可变页面版本”。首期以一套讲义为提交和并发控制单位；一次保存只新增改动页面的数据，未改页面复用旧页面版本。这样既能原子排序/换主题，又避免每次复制所有页面正文。暂不把每个文本 span 拆成数据库行，也不依赖回放全部历史操作来打开工程。

| 表/实体 | 关键数据及约束 |
|---|---|
| users / sessions | 外部身份映射、会话到期；不把会话凭据放进内容工程 |
| projects / project_members | 项目与 owner/editor/viewer；成员唯一键 `(project_id,user_id)` |
| decks | 项目归属、`head_revision_id`、单调增长 `head_version`、软删除状态 |
| deck_revisions | 不可变整套清单：页面顺序及版本映射、主题/数据/组件/源码引用、父版本、作者、formatVersion；`(deck_id,version)` 唯一 |
| page_versions | 不可变页面 JSONB、稳定 pageId、schemaVersion、内容 hash；组合归属约束避免跨讲义引用 |
| mutations | `(deck_id,actor_id,mutation_id)` 唯一、请求 hash、结果 revision；用于重试去重 |
| assets / upload_sessions | 项目归属、服务器生成的对象 key、hash、大小、媒体类型、状态；未完成上传不能被文档引用 |
| revision_assets | 版本的完整资源引用集合，包含模块依赖；供权限检查、打包及垃圾回收使用 |
| component_versions | 组件类型/固定版本、受支持配置 schema、运行文件引用、迁移器版本 |
| jobs / job_attempts | jobId、固定输入 revision、任务类型、状态、租约/attempt、超时、输出候选、费用记录 |
| candidates | AI/迁移候选的基础版本、目标对象、变更集、验证报告与过期时间；不自动成为 head |
| releases / share_links | 固定 revision、构建文件清单、发布状态；分享 token 的 hash、有效期及撤销状态 |
| outbox / job_events | 与业务事务共同写入的待投递事件；任务进度有持久递增序号，供断线重放 |

`version` 表示用户保存次数；`schemaVersion/formatVersion` 表示数据格式，二者不能混用。首期 PostgreSQL 保存完整版本清单，页面正文 JSONB，较大源码和媒体用不可变资源引用。

创建讲义时写入空的 version 0 清单，生成候选也通过同一提交协议变为正式内容。读取旧格式时使用版本化迁移器产生编辑副本，保存成为新版本；不原地覆写历史。无法识别的未来格式应拒绝编辑或仅提供兼容预览，不静默丢弃未知字段。JSON 契约必须同时在 TS 与 Python 侧验证同一组正反例，避免两端 schema 方言解释不同。

页面 JSON 包含节点树、富文本、布局、公式源串、数据绑定、组件配置、步骤、讲稿、源码引用及兼容页绑定。所有字段有类型与大小限制；节点不得成环，id 必须唯一，步骤和连接线不能悬空。组件包版本与依赖 hash 固定，避免升级运行库后旧讲义悄悄改变。

自定义组件的 schema 不直接注册进 API 路由编译器。AI/用户提供的编辑描述先经过受限字段校验与版本登记，复杂验证在隔离 Worker 处理。Fastify 明确将路由 schema 视作应用代码，其编译器不适合直接接收不受信任的 schema。[Fastify 校验边界](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)。

**4．保存协议：版本条件提交＋幂等重试**

浏览器先在本地应用命令，拖拽结束合成一次修改，输入停止后合并提交，待提交内容先写入 IndexedDB。建议初始防抖 500–1000 ms，最终按体验实测调整；大文件通过资源接口上传，不内嵌到保存请求。

示意接口（类型名与地址为方案草案）：

```http
POST /v1/decks/{deckId}/commits
Content-Type: application/json

{
  "baseVersion": 42,
  "mutationId": "b8c4f30d-54e0-4bf9-a3df-1a69b3558994",
  "commands": [
    {
      "type": "node.setText",
      "pageId": "p_7",
      "nodeId": "title_1",
      "text": "模型之间为什么需要差异？"
    },
    {
      "type": "component.setConfig",
      "pageId": "p_7",
      "nodeId": "experiment_1",
      "changes": {"defaultModelCount": 25}
    }
  ]
}
```

成功返回 `revisionId`、`version:43`、`mutationId` 和服务端规范化后的变更页；UI 收到对应提交的确认后才显示“已保存”。富文本另用 `node.setRichText`；完整命令族还需覆盖增删复制节点/页面、移动分组、重排页面、布局属性、主题、讲稿、步骤及数据引用。属性命令只接受类型白名单，不能允许任意 JSON 路径改写权限、版本或服务端字段。

服务端事务顺序：

1. 校验登录、项目/讲义权限、请求结构和大小；事务内确认写权限，权限撤销与保存通过一致的锁顺序序列化。
2. 锁定 deck 行，检查 mutation 是否已经提交。同 id 同请求返回既有结果，同 id 不同请求返回 `409 IDEMPOTENCY_KEY_REUSED`。幂等记录查询必须先于基础版本冲突判断，确保“已保存但响应丢失”的重试成功。
3. 比较 `baseVersion`。不等则返回 `409 REVISION_CONFLICT` 与当前版本；首期不自动覆盖、不盲目重放到新文档。浏览器保留本地修改并提供差异合并/另存副本。
4. 读取该版本，应用整批命令，验证对象图、组件配置、资源所属与 ready 状态。一次命令失败则整批不提交。
5. 同事务新增改动页版本、整套版本清单、资源引用、mutation 结果和 outbox，再更新 deck head，最后提交。外部模型调用和文件上传不在锁内执行。

数据库锁/条件更新用于消除“两个请求都先读到旧版本”的竞态；不能仅在应用层先查再写。相关事务语义以 PostgreSQL 文档为依据，具体实现需并发集成测试证明。[PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)。

每个客户端同一 deck 只允许一个提交在途；保存期间的新输入进入下一批，旧响应不能清空新草稿。重试复用同一 mutationId 与请求体；刷新后恢复缓存，先查询/重试未确认提交再继续。离线明确显示“已保存在本机”，本地缓存不等于服务器备份。

未提交操作在本地撤销；已提交操作的撤销/恢复历史版本都产生新版本，不删除历史、不倒退版本号。在其他标签页已修改的情况下，撤销同样经过版本冲突处理。首期幂等记录至少保留到讲义及其可恢复历史被清理，避免离线旧请求失去去重依据。

**5．API 清单与权限**

以下均以 `/v1` 为前缀。项目是首期权限边界；同项目不再默认假设隐藏讲义之间存在额外私有隔离，若需要再增加 deck ACL。

| 方法与路径 | 职责 |
|---|---|
| `GET /me` | 当前登录身份与项目能力；首期接入 OIDC，使用 HttpOnly 服务端会话 |
| `POST /projects`、`GET /projects` | 创建/列出有权访问的项目 |
| `PUT/DELETE /projects/:id/members/:userId` | owner 管理成员角色 |
| `POST /projects/:id/decks`、`GET /projects/:id/decks` | 创建/列出讲义 |
| `GET /decks/:id` | head 版本、页面索引及能力摘要 |
| `GET /decks/:id/revisions/:revisionId` | 固定版本清单；页面正文按该清单版本加载 |
| `GET /decks/:id/page-versions/:pageVersionId` | 获取不可变页面；验证版本属于该讲义和授权项目 |
| `POST /decks/:id/commits` | 原子保存；上述所有页面和对象编辑走同一协议 |
| `GET /decks/:id/revisions`、`POST /decks/:id/restores` | 历史分页；恢复产生新版本，要求 baseVersion＋mutationId |
| `DELETE /decks/:id` | owner 软删除；后续保存/任务应用均检查删除状态 |
| `POST /projects/:id/uploads`、`POST /uploads/:id/complete` | 建立上传会话与完成校验；返回 assetId |
| `GET /assets/:id/download` | 权限校验后提供短时下载能力 |
| `GET /components/:type/versions/:version` | 获取有权使用的固定组件接口与资源清单 |
| `POST /projects/:id/imports` | 从已上传工程创建导入任务，不接受服务器任意路径 |
| `POST /decks/:id/generations`、`POST /decks/:id/ai-edits` | 发起整套生成或选区修改，返回 202＋jobId |
| `GET /jobs/:id`、`GET /jobs/:id/events`、`POST /jobs/:id/cancel` | 状态、SSE 进度与取消请求 |
| `GET /candidates/:id`、`POST /candidates/:id/apply` | 查看候选差异/验证；用基础版本和 mutationId 应用 |
| `POST /decks/:id/exports` | 指定 revision 与格式，创建工程/HTML/PPTX 导出任务 |
| `POST /decks/:id/releases` | 为固定 revision 构建发布版本；构建完成才可分享 |
| `POST /releases/:id/share-links`、`DELETE /share-links/:id` | owner 创建/撤销发布版分享 |

成员 viewer 可读项目讲义，editor 可编辑、生成与导出，owner 另可管理成员、删除和发布分享。公开分享访问者只获得指定 release 的播放器内容，不获得工程源码下载、草稿、其他历史或任务日志的 API 权限。前端运行所需 JS/数据对访问者可见，因此该模式不提供保密考试答案保证。

所有资产、候选、job、revision 查询都验证所属项目，不能因拿到 UUID 就绕过权限。浏览器会话写请求做 CSRF/Origin 校验；Worker 使用单独服务身份，只能领取授权任务，不模拟用户 cookie。

统一错误码：未登录 401、无权操作 403（需要隐藏资源存在性时统一 404）、版本/幂等冲突 409、结构错误 400、领域约束错误 422、请求过大 413、配额超限 429。错误体包含稳定 code、requestId 和可定位字段，不包含源码/密钥或内部堆栈。上传大小、文档/命令数量、模型任务与存储额度均作为服务端可配置限制。

**6．资源管理与发布一致性**

上传流程：申请会话 → 上传暂存 key → complete 时校验大小/hash/类型 → 形成不可变 ready asset → 提交文档引用 assetId。客户端不决定最终对象 key；替换图片创建新资源，旧版本仍引用原图。

若使用预签名 PUT，其 URL 到期前可能重复上传同一 key；因此暂存对象必须在完成时复制到客户端无写权限的最终 key，或固定已校验的对象版本，避免校验后被覆盖。S3 官方说明预签名 URL 可重复使用、同 key 上传会覆盖现有对象。[S3 预签名 URL](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)。兼容存储必须实测对应语义。

媒体与源码分类型处理；HTML/SVG/JS 不作为带编辑器 cookie 的普通资源直接执行。内容播放器使用独立站点域、受限 iframe 和经过身份握手的编辑桥接。组件执行环境没有数据库/对象存储管理密钥。需要 Pyodide/WebGL 的页面按能力配置运行环境，并验证键盘、模块路径、跨域资源与 Worker 加载。

数据库与对象存储无跨系统事务：先形成已校验不可变资产，再用 SQL 提交引用；失败留下的孤立文件由延迟 GC 清理。历史版本、候选、运行中任务和 releases 都是资源保留根；有活跃引用/pin 的资源不能清除。发布构建先上传完整文件清单并验证，再事务标记 ready；分享只能指向 ready release。

撤销分享后内容网关不再签发访问能力；已发出的短时资源 URL 可能在到期前继续有效，缓存中已下载的内容无法撤回。若产品要求撤销后立即阻止后续网络读取，则使用每次请求校验的内容网关和适当缓存策略，不能依赖长时公开 CDN URL。

导出绑定固定 revision、组件版本、运行库、字体和 seed，不跟随保存中的 head。工程包另存至新项目时进行 page/node/asset 引用映射，重新计算 hash，移除成员、会话、密钥及旧分享 token。导入解包限制文件数/总量/路径，拒绝越界路径与不受信任 symlink。当前内部 run 的受控依赖 symlink 由导入器按清单物化，不能把任意解包 symlink 当依赖。

**7．后台任务与 Python 接入**

任务业务状态建议为 `queued → running → succeeded | failed | cancelled`；有取消请求时进入 `cancelling`，租约和进程确认终止后才标记 cancelled。AI job 的 succeeded 只表示候选产出且通过要求的检查，不表示已经改写当前讲义。

创建任务时在同一 PostgreSQL 事务中写 `jobs＋outbox`，dispatcher 将 jobId 投递 BullMQ。避免“数据库已提交但队列没收到”造成永久丢单。dispatcher 可以重复投递，Worker 领取时检查 job 状态与租约，最终提交必须匹配当前 attempt/fencing token；过期执行器不得提交产物。

Redis 队列只是执行通知，任务输入、尝试记录、结果和进度事件保存在 PostgreSQL/对象存储。Redis 丢失后，协调器只对没有有效租约的待执行任务重新投递；租约过期先核对执行器句柄，避免活进程被无谓重启。进程仍活且可接管则恢复观察；无法接管时隔离/终止后重新尝试。BullMQ 官方建议任务本身具备幂等性，并提供失败重试机制。[幂等任务](https://docs.bullmq.io/patterns/idempotent-jobs)、[失败重试](https://docs.bullmq.io/guide/retrying-failing-jobs)。

区分三类重试：网络/基础设施故障可按上限退避；格式/交互检查失败进入有限修复尝试；权限失效、用户取消或输入不合法不重试。即使数据库效果可去重，模型请求在“服务端执行但响应丢失”时仍可能重复计费，应记录 provider requestId、attempt 和实际费用，不承诺外部调用 exactly-once。

本轮核对现有实现得到三个接入约束：

- [core/llm.py](core/llm.py) 的 ROOT 来自模块位置，planner/builder 默认写 `ROOT/runs/<label>`，所以只修改子进程 cwd 不能改变输出根。首期在隔离执行器中挂载专用 runs 工作卷；后续再加显式输出根参数。
- [core/builder.py](core/builder.py) 会拒绝已有 `builder-manifest.json` 或目标页面/lesson；`--only` 只选择待生成页，不能成为覆盖编辑接口。每次生成尝试使用独立 attempt label 和空输出目录。
- builder 保存逐页结果和审计，缺页也可能进入汇总阶段。任务成功必须检查预期页集合、`builder-results.json`、manifest、依赖及本次编辑契约校验，不能仅看进程 exit code 或文件存在。

新增 `GenerationRunner` 适配器：TS Worker 输出版本化 `input.json`，在隔离容器中以固定命令/参数数组启动 Python；Python 用 JSONL 输出事件，最终写 `output-manifest.json` 和产物。适配层解析原有 planner/builder 结果，不把普通 stdout 猜成百分比。后端允许的模型 profile、并发和输出路径由服务端配置，客户端不能传任意 shell 命令或工具路径。

**AI 局部编辑另建 edit runner**：下载固定 revision → 建立目标页/组件副本 → 传入稳定对象映射、编辑绑定和指令 → 修改源文件/配置 → 校验完整性及教学行为 → 导入为 candidate。通过复用底层模型与检查工具接入，不绕过 builder 的“新生成”保护。候选应用时再次验证当前权限及 head/baseVersion；版本已变化时返回冲突，保留候选供比较，不能覆盖老师的新改动。

生成执行器可持受限模型凭据；运行生成网页的截图/测试容器应另行启动且不持模型或业务密钥。API/Worker 控制进程不直接执行生成内容，也不向内容容器暴露宿主控制 socket。并发上限由全局、项目、模型三层配置，不能沿用 builder 默认 100 作为服务上线配额。

**8．进度、多人编辑与恢复**

SSE 推送阶段、当前页、检查结果、候选就绪和 head 变化；事件携带持久序号，客户端使用 Last-Event-ID 重连补发。事件过期时先获取 job 当前状态，再开启新流。数据库事件是补发依据，不只依赖进程内广播或 Redis Pub/Sub。用户可见事件经过脱敏，不直出完整 prompt、环境配置或其他用户数据。

首期支持多人访问及冲突保护，**不宣称多人实时协同编辑**。多个标签页/成员同时保存时，一次成功，其他请求冲突；可选显示“其他人正在编辑”，但提示不代替事务约束。整套级锁在大规模协作时会产生较多冲突，先测量冲突率再决定页级版本拆分。

后续若引入 Yjs：将富文本与页面对象映射为可合并共享类型，定义权限、持久增量/快照及跨页操作规则；数据库发布版本从一个明确的协作快照产生。不能把现有整份 JSON 塞进一个字符串就获得细粒度协作，也不能让 REST 保存与 Yjs 同时成为同一字段的权威写入入口。[Yjs Shared Types](https://docs.yjs.dev/getting-started/working-with-shared-types)。

备份同时覆盖 PostgreSQL 与对象存储；恢复演练需能打开某个历史版本并加载全部引用。副本/只读预览可以容忍短暂延迟，保存成功后编辑器重开 head 应走保证读到已提交版本的路径。

**9．建议目录与开发交付**

以下为拟新增目录，保留当前 `core/`、`skills/`、`vendor/`：

```text
apps/api/                 Fastify 路由、会话、领域模块组装
apps/worker/              outbox 投递、任务领取、调度与回收
packages/contracts/      schema、TS 类型、OpenAPI、Python JSON 契约
packages/document-core/  命令、对象图、版本迁移与资源引用收集
packages/db/             Drizzle schema、SQL migration、仓储
packages/storage/        本地目录与 S3 适配器
packages/generation/     Python runner 的 TS 适配、候选导入
packages/rendering/      共享渲染入口、编辑桥接、导出适配
infra/editor/            本地启动编排、部署与恢复说明
```

采用 pnpm workspace，contracts 不依赖数据库和浏览器，API/Worker 都依赖领域包；Python 读取导出的 JSON 契约。数据库迁移文件纳入版本控制，CI 执行类型检查、契约兼容、领域测试及真实 PostgreSQL 集成测试；不得仅用内存仓储验证锁和回滚。

开发期可单机启动 API、Worker、PostgreSQL、Redis，资源先用本地适配器；上线用持久对象存储与独立内容域，API 与 Worker 分别配置连接池、并发与资源限额。缓存/队列故障不应让已有讲义无法保存：已受理任务显示排队等待，文档保存继续依赖 PostgreSQL 和已就绪资产。

重点观测保存延迟/错误、版本冲突率、outbox 最老事件、排队时长、活跃租约、每任务模型费用、产物检查失败、资源增长和孤立文件。日志统一关联 projectId/deckId/revisionId/jobId/attemptId/requestId。建议原型压测目标：32 页工程、20 个独立讲义并发编辑、单批不超过 100 KB 时，服务端保存 p95 < 300 ms；该数值是待验证目标，需报告硬件、数据库延迟与页复杂度。

**10．实施顺序与后端验收**

按一名熟悉 TS 的后端工程师、可获得现有 Python 维护者支持估算后端主线约 **5–8 工程周**；前端可并行。原方案两人 8–12 周整套交付应调整为 **约 9–13 周，原型后重估**，已经包含这条后端主线，不能简单相加。首期不含所有旧页型的专用场景编辑器、实时协同和 PPTX 双向同步。

| 里程碑 | 工作量估计 | 必须交付的证据 |
|---|---|---|
| M1：保存闭环 | 1–2 周 | contracts、最小页面模型、DB、会话/成员检查、读取/提交/恢复；两个请求竞争同版本与丢响应重试测试 |
| M2：工程完整性 | 1–2 周 | 资源上传/固定引用、页面顺序/复制、组件与源码引用、打包导入；换环境重开真实文字/SVG/Canvas/代码页 |
| M3：任务与 AI 编辑 | 2–3 周 | outbox、Worker、Python 适配、edit runner、SSE、候选应用；重启/重复投递/取消/过期候选不覆盖 head |
| M4：发布和运维 | 1 周 | 固定版本 HTML/工程导出、权限分享、备份恢复、负载证据；PPTX 若需要另加适配验证 |

首个可审阅切片选择现有一页参数实验：TS 导入页面及绑定 → 前端改标题和默认模型数 → 原子保存 → 关闭重开 → 滑块仍正常计算 → 回到上一版本。该切片同时穿过文档模型、后端保存与实际交互，可在 M1 启动、M2 完成。

后端验收矩阵：

| 场景 | 判定标准 |
|---|---|
| 两客户端从 version 42 保存 | 恰好一个变为 43；另一个收到冲突，数据未被覆盖 |
| 保存成功但响应丢失后重试 | 返回原 revision，不新增版本；同 mutationId 换内容被拒绝 |
| 数据库提交中途异常 | 页面、版本、引用、mutation、outbox 全部回滚 |
| 正在保存时继续输入并刷新 | 已确认批次不重复，新输入仍可恢复，UI 不误报全已保存 |
| 变更对象图或组件参数 | 循环分组、悬空连接、越界参数、未知字段均被拒绝且不部分写入 |
| 换图/改源码后恢复旧版本 | 原图/源码仍可访问；未完成、跨项目或已过期暂存资源无法引用 |
| 重复投递、Redis 重启、Worker 崩溃 | 任务可重新协调，过期 attempt 无法提交，不自动改写 head |
| AI 运行期间老师保存 | 候选保留且应用返回冲突；局部修改必须通过与原页面等范围的行为检查 |
| 取消任务与完成竞争 | 事务决定唯一终态；cancelled 后不再接受产物应用 |
| 猜测资产、历史、候选或 job id | 无权限者无法读取、修改或接收 SSE；撤销权限后再次应用失败 |
| 预签名上传被重复使用 | 不能改变任何已被 revision 引用的最终资产 |
| 发布构建时 head 继续变化 | release 始终来自请求指定的 revision，文件清单完整后才 ready |
| GC 和备份恢复 | 历史/发布/候选/任务引用不丢失；恢复环境能播放和再编辑 |
| 原生工程导入导出 | 页面、步骤、数据、lesson 和运行依赖完整；新项目引用映射正确 |

本次方案交付的完成范围是明确上述架构与实施契约；这些里程碑和验收是后续实现要求，尚无服务运行或测试通过的声明。

**11．开源优先：直接复用哪些实现**

2026-09-08 补充核对官方仓库、许可和文档。上一版将后端领域拆清楚了，但没有充分区分“需要这些能力”和“要自己实现这些能力”。本项目应优先组合现成实现。本轮进一步完成源码研究及 GrapesJS 有限探针，详见第 12 节；不据此承诺节省比例或新的交付工期。

| 项目 | 可直接复用/二次开发的能力 | Notale 仍需补充 | 定位 |
|---|---|---|---|
| Payload | TS 后端、认证、访问控制、上传、管理界面、版本/草稿；PostgreSQL 适配 | 成员规则、讲义结构、原子提交/幂等、固定发布清单、AI 候选流程 | **优先验证的通用业务后端底座** |
| Lumi H5P Node.js Library | H5P 编辑器/播放器服务、内容/库存储接口、Express REST 示例、HTML 导出包 | 任意现有 HTML/Canvas 页需转为 H5P 内容类型；不是通用 PPT 自由排版模型 | **最贴近互动课件后端的实现参考；采用 H5P 时可直接集成** |
| PPTist | Vue 3＋TS，页面、选区、图层、文本/图形/图表、撤销、演示与 PPTX 导入导出 | TS 业务后端、互动节点、当前页面到其模型的转换 | **PPT 式操作优先时的编辑器底座候选** |
| GrapesJS 开源核心 | HTML/CSS 组件模型、编辑工具、页面、工程 JSON 存取 | 讲义 UI、业务后端、Deck/Canvas 脚本适配、保存协议 | **保留当前网页布局优先时的编辑器底座候选** |

Payload 的官方仓库提供完整 TS 后端与管理端，核心为 MIT；已有版本/草稿、上传和 Postgres 支持，适合免去基础 CRUD 与后台页面开发。[仓库与许可](https://github.com/payloadcms/payload)、[版本](https://payloadcms.com/docs/versions/overview)、[上传](https://payloadcms.com/docs/upload/overview)、[Postgres](https://payloadcms.com/docs/database/postgres)。这里不把其管理界面当作讲义画布，也不把它的内置 autosave 当作外部编辑器已接好的自动保存。

采用 Payload 时，以其应用/自定义端点承载业务 API；首期不要再叠一套独立 Fastify 管理同一批实体。用户、项目、成员和资源复用 collections；项目角色规则仍须配置。讲义内部版本记录通过专用提交服务维护，只开放受控写入口，禁止通用更新/恢复 API 绕过 head_version 与幂等约束。

Payload 的版本功能按文档保存，不会自动冻结所有关联页面/资源，也不直接提供本方案的整套讲义条件提交。因此通用内容可复用内置版本；讲义权威历史仍采用第 3–4 节的固定清单语义，避免两个版本系统同时拥有 head。定制事务需验证数据库适配器与唯一约束可实现要求；使用 Local API 时显式传递用户、`overrideAccess:false` 和事务 req，不依赖默认行为。其 Local API 默认跳过访问控制，跨操作共享事务也需要正确传递上下文。[Local API](https://payloadcms.com/docs/local-api/overview)、[事务](https://payloadcms.com/docs/database/transactions)。

Lumi 的具体阅读入口为 `packages/h5p-server`、`packages/h5p-express`、`packages/h5p-rest-example-server`、`packages/h5p-html-exporter`。它提供 TS/Node 互动内容服务和可替换存储实现，示例可用于理解编辑/播放/资源的 API 边界；不能把已有 Mongo/S3 适配器说成已具备我们的 PostgreSQL 版本模型。[仓库](https://github.com/Lumieducation/H5P-Nodejs-library)、[包与 API 文档](https://lumieducation.github.io/H5P-Nodejs-library/)。

许可应按具体项目/包区分：Payload 核心 MIT；GrapesJS 核心 BSD-3-Clause；PPTist AGPL-3.0；Lumi 仓库 GPL-3.0，`@lumieducation/h5p-server` 包声明 GPL-3.0-or-later。它们都是实际可研究的实现，许可不等于技术不可用；直接纳入产品前需与实际发布方式匹配。商业 Studio SDK、其他插件及 H5P 内容类型不能自动沿用核心许可。[GrapesJS 核心许可](https://github.com/GrapesJS/grapesjs/blob/dev/packages/core/LICENSE)、[PPTist 许可](https://github.com/pipipi-pikachu/PPTist/blob/master/LICENSE)、[Lumi 许可](https://github.com/Lumieducation/H5P-Nodejs-library/blob/master/LICENSE)。

调整后的分工：

- 直接复用：身份/后台/上传基础、现成编辑器的选择与历史机制、存储驱动和任务队列。
- 参考并适配：H5P 的内容类型、编辑字段、运行时与导出组织方式；PPTist 的页面及对象组织；GrapesJS 的工程保存。被选为底座的编辑器内部模型应有单一所有权，Notale 通过版本化适配器封装，避免维护两套彼此漂移的节点树。
- 自己实现：Notale 的内容绑定与互动适配、整套版本清单及提交保护、Python/AI 修改候选、运行验证与兼容性报告。

下一轮原型限定为两个决策：Payload 能否支持讲义原子提交；PPTist/GrapesJS 哪一个接入实际互动页的代价更小。后端用同版本竞争保存、响应丢失重试、资源旧版恢复验证；前端用原 HTML/SVG 页与 page-07 Canvas 实验验证布局、点选改字、参数修改、保存重开、互动及撤销。两种编辑器使用同一份验收清单，不能通过仅嵌入整页 iframe 就判定完成可编辑化。

建议先投入 3–5 个工作日完成这些针对性验证，再锁定开源组合和修订排期。原 9–13 周属于自建备选估算，不作为复用路线的承诺工期。只有开源底座在这些实际约束上出现明确障碍时，才退回相应自建模块。

**12．克隆源码后的修订与已验证范围**

四个仓库已保存在 `experiments/editor-open-source-20260908/repos/`，另建立 Payload v3.88.0 稳定版 worktree。固定提交及源码入口见 [研究报告](experiments/editor-open-source-20260908/README.md) 和 [版本清单](experiments/editor-open-source-20260908/repositories.json)。以下结论优先于此前没有区分版本的能力描述。

- **Payload 作为通用业务底座，讲义提交仍用专用服务。** 稳定版 Local API 默认跳过访问控制；autosave 可更新最近版本；Drizzle 的部分更新路径先查 ID 再按 ID 更新。必须显式配置权限、共享事务，并实现带版本条件的原子 SQL 或行锁，不能用一般 `where` 条件替代已验证的并发控制。
- **队列选型保留验证门槛。** 本次 main 为 4.0 canary，已有任务租约/token/心跳；稳定版 3.88.0 没有同一套机制，任务适配器存在先查后更新的领取路径。内置 Jobs 可用于单 worker 原型评估，多 worker/崩溃恢复未验证前保留 BullMQ/Redis 候选；Notale 的 attempt、幂等和候选提交保护始终需要。
- **前端先验证 GrapesJS。** 从克隆源码构建的 Chromium 探针确认：真实 page-07 导入后保留 Canvas 标签，却删掉两个 script；解析结果的 HTML/CSS 可经工程 JSON 往返。合成互动组件通过参数修改、撤销和新实例重载运行；没有完成真实 Canvas 实验迁移或视觉验收。工程必须保存组件 schema/插件版本，运行时先注册插件再加载。
- **PPTist 保留为另一条产品路线。** 九类固定元素和编辑/演示/缩略图/导出入口都需要扩展互动类型；IndexedDB 快照只承担本地撤销。其 HTML 布局迁移成本仍需实际对照，不同时 fork 两套编辑器进入开发。
- **H5P 用作内容协议参考和可选题型插件。** 作者参数、库和学习者状态的分离可借鉴；保存时清理旧资源的行为需要版本化适配，默认宽松权限必须替换。现有任意网页不能直接获得 H5P 字段级编辑能力。

下一步优先完成一个真实 page-07 的 GrapesJS 互动适配，以及一个 Payload/PostgreSQL 原子提交切片，再决定底座与排期。当前交付仍是研究、设计和探针；没有完整服务集成、数据库并发测试或上游测试套件通过的声明。
