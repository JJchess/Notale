# 本机完整启动

要求 Node.js >=20.19、npm、PostgreSQL 16；也可以用 Docker Compose 启动仓库提供的本机数据库。前后端保持同级目录。

从仓库根目录执行一次安装与构建：

```sh
cd notale-editor
docker compose up -d --wait
npm ci
npm run build
cd ../notale-editor-frontend
npm ci
npm run build
npm run start:local
```

打开 http://localhost:4312。页面内容由独立的 http://notale-content.localhost:4312 提供；该域名须解析到本机，远程转发时只需转发4312。Ctrl+C 停止本次启动的前后端，数据库保留运行及数据。数据库资产与讲义保存在 PostgreSQL；本机签名密钥保存在后端 `.local/preview-secret`。

默认端口：前端4312、API4310、内容4311。已有监听不会被终止。可通过 PORT、EDITOR_PORT、EDITOR_CONTENT_PORT 配置三个不同端口；NEXT_DIST_DIR 必须与前端构建一致。自备 PostgreSQL 时通过 DATABASE_URL 设置连接，并省略 docker compose 命令；不要提交真实连接凭据。

修改后端共享协议后，在前端执行 `npm run contract:update`，再重新构建前端；此命令同步归档与锁文件，不重启服务。

## 适用边界

本入口只监听本机，后端使用明确的本机开发身份。它不提供多用户认证，不能直接暴露为公共服务。接入主系统时依照后端 docs/INTEGRATION.md 使用主系统 context/authorize、私有签名密钥和独立内容域名；不另建账号系统。公开部署需由宿主提供认证与授权；本机启动器不替代这些集成职责。

## 安装与数据持久化验证

已在独立源码副本执行前后端 `npm ci`、标准生产构建和完整启动，确认健康检查、原创模板目录及图示资源正常；关闭应用后，三个监听端口均释放。

另以全新 PostgreSQL 16 容器和空数据卷验证了首次迁移、创建讲义、`sync/v2` 保存、应用重启、重开后的完整快照一致与预览。测试容器和卷已清理，现有讲义未作为写入样本。

该验证环境的 Docker 默认地址池已耗尽，独立测试临时使用 `network_mode: bridge` 和备用宿主端口；默认 Compose 的网络创建未在该环境成功验证。这是宿主网络资源限制，不能用反复重启应用解决。可使用已有 PostgreSQL 并设置 `DATABASE_URL`，或者为本次 Compose 配置可用网络。

## 升级与导出

停止本次应用进程后再更新源码、安装锁定依赖并构建；统一启动器不会终止未知监听进程。保留 PostgreSQL 数据卷以及后端 `.local/preview-secret`。修改前后端共享契约时先在前端执行 `npm run contract:update`，再构建前端。

工程导出包含讲义、清单、资产和独立运行时通知。通知文件会避开用户已有文件名；导入依据工程清单恢复用户资产，通知文件不改变讲义所有权。讲稿本机草稿会在停笔后自动提交，冲突需在对应页面明确选择；放映与导出还有完整文档提交边界。

## Native format upgrade — 2026-09-14

4312 now serves `.next-editor-notale-v1-final`; the API/content processes use `notale-editor/.local/notale-format-v2` on 4394/4395. The previous backend remains on 4396/4397 for rollback. The authoritative PID/build mapping is `.local/presentation-release.json`.

New isolated preview documents: `1f4d1553-2c35-45f3-862f-0382b322789d` (种子的旅行), `ba6a3573-4a2d-4d2b-bbd9-b394f655002d` (线性回归 · 代码工作台). Imported test copies do not replace the original reference documents.

Validation: focused native archive tests; PostgreSQL export/import round trip; isolated packed-package consumer; harness archive contract; production frontend/backend builds. Browser checks confirmed edit-mode step visibility, incremental theme updates, real Python execution, independently copied workbenches with original iframe identity retained, relocated static export playback, and loading a CJK glyph from the published fallback font. Native sample imports took approximately 1.5 and 1.7 seconds locally. No model generation was rerun.
