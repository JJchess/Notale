# 用 Docker 启动 Notale

[English](DOCKER.md) · [返回 README](../README.zh-CN.md)

启动完整的个人工作台：描述主题、上传参考资料、实时查看讲义生成，再进入可视化编辑器继续修改。Docker 一并提供应用、PostgreSQL 和 AI 编辑使用的沙箱。

## 配置一次，一条命令启动

安装 Docker Engine 与 Compose v2，或使用启用 Linux 容器的 Docker Desktop。以下命令使用兼容 Bash 的终端。宿主机无需另装 Node.js、PostgreSQL、Chromium 或 LibreOffice。

获取代码，创建本地配置：

```bash
git clone https://github.com/THU-AICosmos/Notale.git
cd Notale
cp .env.example .env.local
```

编辑 `.env.local`，为默认配置填写两把密钥：

```dotenv
GEMINI_API_KEY=你的Google-Gemini密钥
PARATERA_API_KEY=你的并行云密钥
```

在 [Google AI Studio](https://aistudio.google.com/apikey) 创建 Gemini 密钥；并行云密钥在[并行科技 MaaS 控制台](https://ai.paratera.com/#/lms/model)申请。可参考 [Google 密钥指南](https://ai.google.dev/gemini-api/docs/api-key)和[并行科技 API 申请说明](https://www.paratera.com/news_des/122.html)。

| 密钥 | 默认配置中的用途 |
| --- | --- |
| `GEMINI_API_KEY` | 理解需求与文件、课程规划、视觉风格选择、普通页面生成和对话修改。 |
| `PARATERA_API_KEY` | 代码页生成和插图生成。 |

账号需具备 [`notale-ts/resources/config.yaml`](../notale-ts/resources/config.yaml) 中所用模型的访问权限与额度；填写密钥不代表账号已开通相应模型。模型调用费用由服务商收取。`.env.local` 已被 Git 忽略，请自行保管。

在仓库根目录执行：

```bash
docker compose --env-file .env.local up -d --build --wait
```

首次启动需要下载、构建应用和沙箱镜像，其中包含浏览器与文档转换依赖，请预留下载时间和磁盘空间。后续启动会复用镜像和数据。初始化完成、服务健康检查通过后，命令才会报告成功。[Compose 如何等待依赖就绪](https://docs.docker.com/compose/how-tos/startup-order/)。

打开 **[localhost:3000](http://localhost:3000)** 创建讲义。也可以直接打开 **[可视化编辑器](http://localhost:4312)**；Viewer 中的编辑入口会在这里打开选中的讲义版本。

启动成功代表服务就绪；第一次真实生成还会检验服务商的模型权限、额度与当前可用性。

## 一并启动了什么

| 服务 | 职责 |
| --- | --- |
| `viewer` | 创作工作台、对话、生成过程实时预览和编辑器入口。 |
| `generator` | 生成、修改、文件处理与会话历史。 |
| `editor-web` | 可视化编辑器；提供编辑界面并代理独立来源的讲义内容。 |
| `editor` | 编辑器 API、文档保存、资产与内容服务。 |
| `postgres` | PostgreSQL 16，保存编辑器文档和资产。 |
| `sandbox-engine` | 专用 Docker 引擎，运行可销毁的 AI 执行沙箱。 |
| `init` | 准备数据目录、沙箱镜像、网络和出口代理，成功后退出。 |

四个应用服务共用构建镜像，以非 root 用户运行。镜像包含 Node.js 22、Chromium、LibreOffice、FFmpeg、Poppler 和字体。内部 API 与 PostgreSQL 不映射宿主端口。

宿主只开放 `127.0.0.1:3000` 与 `127.0.0.1:4312`。讲义内容使用独立的浏览器来源 `http://notale-content.localhost:4312`，应保持它与编辑器来源分离。

这是**没有公网账号认证的个人单用户部署**。沙箱引擎采用 Docker-in-Docker，需要 `privileged: true`；应用共享的是该独立引擎的 Unix socket，没有挂载宿主 Docker socket。特权容器仍需可信的宿主和管理员。多人托管需接入宿主认证与授权，详见[编辑器集成协议](../notale-editor/docs/INTEGRATION.md)。

### 修改端口与远程访问

默认端口被占用时，在 `.env.local` 中选择空闲端口：

```dotenv
NOTALE_VIEWER_PORT=3001
NOTALE_EDITOR_PORT=4313
```

重新执行启动命令，访问新端口即可。编辑器入口与内容来源会自动使用 `NOTALE_EDITOR_PORT`，容器内部 API 地址保持一致。

如果安装在私人服务器上，保留回环监听，在自己的电脑上转发端口：

```bash
ssh -N -L 3000:127.0.0.1:3000 -L 4312:127.0.0.1:4312 user@server
```

随后在电脑浏览器打开相同的本地地址。改过端口时转发对应端口。运行浏览器的电脑需将 `notale-content.localhost` 解析到回环地址；如果本机 DNS 软件阻止了该解析，可为此名称添加本地 hosts 记录。

## 日常操作

在仓库根目录使用同一份 `.env.local`：

```bash
# 查看服务健康状态和初始化结果。
docker compose --env-file .env.local ps -a

# 持续查看应用与初始化日志；Ctrl+C 只停止跟随日志。
docker compose --env-file .env.local logs -f --tail=100 generator editor viewer editor-web init

# 停止服务，移除容器与网络，保留已有数据。
docker compose --env-file .env.local down

# 使用已有镜像和数据重新启动。
docker compose --env-file .env.local up -d --wait
```

修改密钥或端口后也应执行 `up -d --wait`，让 Compose 重建受影响的容器；单独执行 `restart` 不会应用新的环境变量。

### 更新版本

等待生成和编辑任务完成，先[备份](#备份与恢复)，再在没有未提交改动的工作区执行：

```bash
docker compose --env-file .env.local down
git pull --ff-only
docker compose --env-file .env.local up -d --build --wait
```

最后一条命令按当前源码重新构建应用并准备沙箱。数据库、讲义和编辑状态保存在命名卷中。保持同一个 Compose 项目名：默认为 `notale`，`-p` 或 `COMPOSE_PROJECT_NAME` 会选中另一组项目数据卷。[Compose 项目名规则](https://docs.docker.com/compose/how-tos/environment-variables/envvars/#compose_project_name)。

### 数据保存在哪里

| Compose 数据卷 | 内容 | 是否需要备份 |
| --- | --- | --- |
| `postgres` | 编辑器数据库：文档、保存的版本和资产。 | 需要。 |
| `data` | 生成结果、会话与输入文件；编辑器本地状态、预览签名密钥与 AI 工作区；Viewer 到编辑器的文档关联。 | 需要，与数据库成对备份。 |
| `sandbox-engine` | 沙箱镜像与构建缓存。 | 无需备份，初始化可重新生成。 |
| `sandbox-socket` | 内部 Docker socket。 | 无需备份。 |

普通 `down` 保留命名卷。**`docker compose --env-file .env.local down --volumes` 会删除本次安装的数据，包括讲义和数据库**，只在明确需要清空重装时使用。[Docker 数据卷删除规则](https://docs.docker.com/reference/cli/docker/compose/down/)。

## 备份与恢复

### 成对备份

先完成正在进行的任务。以下命令暂停应用写入、保持 PostgreSQL 运行，并将两份必要备份放在仓库之外。在同一个终端执行，每一步成功后再继续。

```bash
NOTALE_BACKUP="$(pwd)/../notale-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$NOTALE_BACKUP"
docker compose --env-file .env.local stop viewer editor-web generator editor
docker compose --env-file .env.local exec -T postgres pg_dump -U notale_editor -d notale_editor -Fc > "$NOTALE_BACKUP/editor.dump"
docker compose --env-file .env.local run --rm --no-deps -T --entrypoint tar init -C /data -czf - . > "$NOTALE_BACKUP/notale-data.tgz"
git rev-parse HEAD > "$NOTALE_BACKUP/source-commit.txt"
docker compose --env-file .env.local up -d --wait
```

备份中包含私人讲义和编辑器签名密钥，应妥善保存；`.env.local` 另外保存到安全位置。数据库与文件归档缺一不可，单独恢复其中一份可能丢失文档关联或签名状态。

### 恢复到新项目

首次恢复时使用 `source-commit.txt` 记录的源码版本及配套配置。选择一个新的 Compose 项目，保留原数据卷供回退。下面假定原默认项目正在运行，先停止它以释放浏览器端口。

```bash
docker compose --env-file .env.local down
NOTALE_BACKUP=/absolute/path/to/notale-backup
NOTALE_RESTORE_PROJECT="notale-restored-$(date +%Y%m%d-%H%M%S)"
docker compose -p "$NOTALE_RESTORE_PROJECT" --env-file .env.local up -d --wait postgres
docker compose -p "$NOTALE_RESTORE_PROJECT" --env-file .env.local exec -T postgres pg_restore -U notale_editor -d notale_editor --no-owner --exit-on-error < "$NOTALE_BACKUP/editor.dump"
docker compose -p "$NOTALE_RESTORE_PROJECT" --env-file .env.local run --rm --no-deps -T --entrypoint tar init -C /data -xzf - < "$NOTALE_BACKUP/notale-data.tgz"
docker compose -p "$NOTALE_RESTORE_PROJECT" --env-file .env.local up -d --build --wait
```

检查历史会话，进入编辑器确认讲义内容已恢复。确认后，把 `NOTALE_RESTORE_PROJECT` 的实际值写入 `.env.local` 的 `COMPOSE_PROJECT_NAME`，以后不带 `-p` 的日常命令便会操作恢复后的项目。确认恢复结果前保留原数据卷。

## 常见问题

| 情况 | 如何处理 |
| --- | --- |
| 启动前提示缺少密钥 | 在 `.env.local` 填写两把必要密钥，命令保留 `--env-file .env.local`。终端环境变量优先，移除过期覆盖值。 |
| 提示 `address already in use` | 用 `NOTALE_VIEWER_PORT`、`NOTALE_EDITOR_PORT` 选择空闲端口，保留已有服务。 |
| 提示 `all predefined address pools have been fully subnetted` | Docker 宿主的默认网络地址池已耗尽。核对现有 Docker 网络及宿主/VPN 路由后，在本地 `compose.override.yaml` 的 `networks.default.ipam.config` 中为本项目指定确认无冲突的子网。后续命令继续使用此配置，不删除其他服务的网络。 |
| 首次构建在下载包或镜像时失败 | 根据失败步骤检查容器镜像仓库、软件包仓库的网络访问与磁盘空间，解决原因后重试。 |
| `init` 失败，或应用一直没有启动 | 执行 `docker compose --env-file .env.local logs --tail=200 init sandbox-engine`，检查是否支持特权容器及具体初始化错误。 |
| 编辑器能打开，讲义内容空白 | 检查 `notale-content.localhost` 的回环解析和对应端口转发，查看 `editor` / `editor-web` 日志。 |
| 服务健康但生成失败 | 查看 `generator` 日志及服务商的模型权限、额度和响应。健康检查不调用模型，也不检验生成质量。 |
| AI 编辑无法开始 | 查看 `init`、`sandbox-engine` 和对应后端的日志，后端与独立引擎需能访问同一个 `/data` 工作区。 |
| 重启后数据似乎消失 | 检查 `-p` 或 `COMPOSE_PROJECT_NAME` 是否改变；新项目会使用新数据卷，先切回原项目再判断是否需要恢复。 |

本部署以 Linux/amd64 为目标。Docker Desktop 和 WSL2 需启用 Linux 容器并支持特权沙箱引擎，本次交付尚未验证这两类环境；ARM 支持不作保证。具体版本实际完成的检查以发布记录为准。
