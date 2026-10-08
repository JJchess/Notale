# Notale

**从一个主题，到一份可交互的讲义。**

[![CI](https://github.com/THU-AICosmos/Notale/actions/workflows/ci.yml/badge.svg)](https://github.com/THU-AICosmos/Notale/actions/workflows/ci.yml)
[![版本](https://img.shields.io/badge/version-0.1.0-6246C8?style=flat-square)](CHANGELOG.md)
[![Node.js](https://img.shields.io/badge/Node.js-20.19%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](notale-editor/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](notale-editor/tsconfig.json)
[![Apache License 2.0](https://img.shields.io/badge/license-Apache%202.0-2EA44F?style=flat-square)](LICENSE)

[English](README.md) · **简体中文**

[本地启动](#本地启动) · [使用流程](#从第一次提问到课堂讲授) · [项目架构](#项目架构) · [参与贡献](#开发与贡献)

Notale 帮助教师和教育内容创作者，把主题与教学材料变成互动讲义。用 AI 生成初稿，通过对话修改内容，在可视化编辑器中精修，再配合讲者备注和观众窗口完成讲授。

讲义页面在浏览器中运行。受支持的控件、图表、模拟和代码活动，让学习者能够改变输入、观察结果、探索规律。你可以同时设计讲什么，以及按怎样的顺序讲。

![Notale 可视化编辑器：左侧页面缩略图、中央讲义封面与右侧样式面板](notale-editor-frontend/docs/release/screenshots/editor.png)

*编辑工作区：编排页面、调整画布内容，为讲授做好准备。*

## 可以做什么

- **从 AI 初稿开始。** 输入主题，按需附上参考材料、PPTX 模板或风格图片。在 Viewer 中查看生成进度，并在同一段对话中提出修改。
- **管理你的讲义。** 搜索服务端历史，重命名、归档或恢复讲义。Viewer 保留输入草稿和已上传附件引用，支持中英文界面；新内容输出时，也可以安心阅读之前的回复。
- **精修每一页。** 编辑文字、图片、形状、SVG、连线、表格和图表，调整图层，或使用内置的页面模板与图示。
- **设计讲授顺序。** 编排页面和页内步骤，加入动画与讲者备注，再通过预览排练。
- **现场讲解与互动。** 使用讲者视图、计时器、批注，以及同一浏览器中同步的观众窗口。受支持的页面交互在演示时仍可使用。
- **保存和带走作品。** 使用修订历史与本地草稿恢复，导入、导出 `.notale` 工程，或导出可独立打开的 HTML 演示。

自定义脚本和 Canvas 内容需要相应适配器才能进行可视化编辑。用于教学前，请检查生成内容与交互；当前可编辑范围见[集成覆盖说明](notale-editor-frontend/docs/INTEGRATION-COVERAGE.md)。

## 从第一次提问到课堂讲授

可以这样描述你希望学习者参与的活动：

> 制作一份介绍梯度下降的讲义。让学习者调节学习率，先预测结果，再比较收敛与越过最优点的情况。安排几个停下来讨论的节点。

| 步骤 | 接下来做什么 |
| --- | --- |
| **1. 生成初稿** | 在 Viewer 中提交主题和材料，查看进度，检查生成完成的页面。 |
| **2. 对话修改** | 要求换一种解释或调整互动活动。完成的修改会形成新版本，之前的结果仍然保留。 |
| **3. 编辑精修** | 将选中的版本打开到单独运行的编辑器，调整受支持的元素、页面顺序、步骤与备注。再次打开该版本会回到同一文档，保留已经保存的手工修改。 |
| **4. 讲授或交付** | 配合讲者工具与观众窗口演示，或导出工程、HTML 演示。 |

生成器、Viewer 和编辑器是独立应用。你也可以直接进入编辑器，手工创作一份讲义。

在 Viewer 中按 **Cmd/Ctrl+K** 查找讲义。预览与对话支持调整分栏、专注预览和全屏；主动选中旧版本后，新结果不会改变当前选择。窄屏下通过“讲义／对话”标签切换。切换界面语言不会改变你要求生成的讲义语言。

## 本地启动

需要 **Node.js 20.19+** 和 **npm**。编辑器还需要 **PostgreSQL 16**，可通过项目提供的 Docker Compose 配置启动。AI 生成需要模型密钥，对话修改需要 Docker 沙箱。

选择下方任一路径前，先在仓库根目录安装并构建共享格式包：

```bash
npm ci --prefix notale-format
npm run build --prefix notale-format
```

### 路径 A：体验编辑器

手工编辑和演示无需模型密钥。从仓库根目录执行：

```bash
cd notale-editor
npm ci
docker compose up -d --wait
npm run build

cd ../notale-editor-frontend
npm ci
npm run build
npm run start:local
```

打开 **http://localhost:4312**。`Ctrl+C` 会停止应用服务，数据库及其数据仍会保留。若已有 PostgreSQL，设置 `DATABASE_URL` 后跳过 Compose 命令。端口和配置详见[本地部署说明](notale-editor-frontend/docs/LOCAL-DEPLOYMENT.md)。

### 路径 B：用 AI 生成讲义

把仓库根目录的 [`.env.example`](.env.example) 复制为 `.env.local`，填写所选模型配置需要的密钥。默认配置使用 `GEMINI_API_KEY`，图片生成还需要 `PARATERA_API_KEY`。生成器和编辑器共用这份被 Git 忽略的本地文件；已设置的 shell 环境变量优先。

**终端一：生成器**，从仓库根目录执行：

```bash
cd notale-ts
npm ci
npm run build
npx playwright install chromium
npm run dev -- serve --sessions .local/sessions
```

Chromium 用于页面视觉检查。若 Linux 主机缺少浏览器系统依赖，将安装命令替换为 `npx playwright install --with-deps chromium`，这可能需要管理员权限。

**终端二：Viewer**，同样从仓库根目录执行：

```bash
cd notale-viewer
npm ci
npm run dev
```

打开 **http://localhost:3000**。Viewer 默认连接 `http://127.0.0.1:4321` 上的生成器。`--sessions` 用于启用首页所需的对话接口。只有同时运行编辑器时，才需要 PostgreSQL。

要通过对话修改已生成讲义，请先完成 [AI 代理沙箱配置](notale-ts/sandbox/README.md)。要使用“在编辑器中打开”，还需启动路径 A。模型配置和命令行用法见[生成器指南](notale-ts/README.md)，服务连接设置见 [Viewer 指南](notale-viewer/README.md)。

开发时可用 `serve --starter` 提供无需模型调用的固定生成样例数据。它不提供免密钥的 AI 对话体验。

> [!IMPORTANT]
> 以上步骤启动的是本地开发环境，编辑器使用固定的开发身份。对外部署需要接入身份认证与权限控制、设置私有预览签名密钥，并为讲义内容使用独立来源。向其他用户开放前，请按照[集成指南](notale-editor/docs/INTEGRATION.md)完成配置。

## 项目架构

| 项目 | 职责 |
| --- | --- |
| [`notale-ts/`](notale-ts/) | 讲义生成、对话修改、命令行、HTTP/SSE 服务与产物资源 |
| [`notale-viewer/`](notale-viewer/) | 讲义库、可靠的主题与附件输入、生成进度、对话、预览和编辑器入口 |
| [`notale-editor-frontend/`](notale-editor-frontend/) | 基于 Next.js 与 React 的编辑和讲授工作区 |
| [`notale-editor/`](notale-editor/) | TypeScript 文档模型、HTTP API、修订存储与原生页面运行时 |
| [`notale-format/`](notale-format/) | 共享的工程归档与页面运行时格式契约 |

生成器输出在浏览器中运行的讲义页面与 `.notale` 归档。Viewer 展示生成过程，并将选中的结果导入编辑器。编辑器前端使用固定版本的 `@notale/editor` 包，通过 HTTP 与后端通信。PostgreSQL 保存编辑器文档和资源，讲义内容由独立来源提供。

## 开发与贡献

从上表找到负责相应功能的项目，按其说明配置开发环境并验证改动。若修改编辑器后端的共享契约，请先在 `notale-editor-frontend/` 中执行 `npm run contract:update`，再重新构建前端。修改文档时，请保持两份 README 同步。

提交问题时，请提供复现步骤、预期与实际表现，以及去除私人内容的最小示例。较大的改动建议先通过 issue 描述预期的用户流程，再提交 pull request。

| 继续了解 | 文档入口 |
| --- | --- |
| 生成和修改讲义 | [生成器](notale-ts/README.md) · [Viewer](notale-viewer/README.md) |
| 开发编辑器 | [前端指南](notale-editor-frontend/README.md) · [架构说明](notale-editor-frontend/docs/EDITOR-ARCHITECTURE.md) |
| 准备课堂演示 | [讲授指南](notale-editor-frontend/docs/PRESENTATION.md) · [原创模板](notale-editor-frontend/templates/original/README.md) |
| 集成或部署 Notale | [集成指南](notale-editor/docs/INTEGRATION.md) · [集成覆盖说明](notale-editor-frontend/docs/INTEGRATION-COVERAGE.md) |

### 项目状态与许可证

Notale 当前版本为 **0.1.0**，正在准备公开发布。主仓库为 [THU-AICosmos/Notale](https://github.com/THU-AICosmos/Notale)，[JJchess/Notale](https://github.com/JJchess/Notale) 为同步镜像。两者均保持 private，待维护者审阅并明确授权后再公开。

Notale 自有源码采用 [MIT 许可证](LICENSE)。随项目分发的第三方资源保留各自的许可证与声明，详见[资源审计说明](notale-ts/RESOURCE-AUDIT.md)。源码分发范围包括上述五个项目及根目录文档。
