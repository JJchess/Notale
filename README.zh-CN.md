# Notale

**制作可交互的讲义，并在同一份作品中完成讲授。**

[![CI](https://github.com/JJchess/Notale/actions/workflows/ci.yml/badge.svg)](https://github.com/JJchess/Notale/actions/workflows/ci.yml)
[![Package version](https://img.shields.io/badge/packages-0.1.0-6246C8?style=flat-square)](notale-editor/package.json)
[![Node.js](https://img.shields.io/badge/Node.js-20.19%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)](notale-editor/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](notale-editor/tsconfig.json)
[![MIT license](https://img.shields.io/badge/license-MIT-2EA44F?style=flat-square)](LICENSE)

[English](README.md) · 简体中文

![Notale 编辑器中的互动讲义页面与样式面板](notale-editor-frontend/docs/release/screenshots/editor.png)

Notale 是制作和讲授互动课程的开源工具集。TypeScript 生成器制作网页原生讲义，Viewer 展示生成进度和结果，编辑器用于修改、保存和放映。受支持的图表、控件、媒体和仿真可以保持互动，不必被压成静态截图。

## 可以做什么

- **制作页面：**编辑文字、图片、形状、SVG、连接线、表格和图表；管理图层，使用原创整页模板与图示。
- **编排讲授：**组织页面和页内步骤，设置动画提示与演讲者备注，在编辑器内预览。
- **互动放映：**使用演讲者视图、计时、标注，以及同一浏览器中的同步观众窗口。
- **恢复与迁移：**保留版本历史和本机草稿恢复；导入导出 Notale 工程，并导出可独立运行的 HTML 演示。
- **生成初稿：**用 TypeScript 后端规划并制作讲义页面，再通过独立 Viewer 查看进度与结果。

## 本地启动

需要 Node.js **20.19+**、npm 和 PostgreSQL 16；也可以用 Docker Compose 启动仓库提供的本机数据库。从仓库根目录执行：

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

打开 **http://localhost:4312**。按 `Ctrl+C` 停止应用服务，数据库和数据会保留。使用现有 PostgreSQL 时设置 `DATABASE_URL`，并跳过 Compose 命令。端口、升级和部署细节见[本地部署说明](notale-editor-frontend/docs/LOCAL-DEPLOYMENT.md)。

无需模型密钥即可体验生成流程；在两个终端分别启动后端和 Viewer：

```bash
cd notale-ts && npm ci && npm run build && npm run dev -- serve --starter
cd notale-viewer && npm ci && npm run dev
```

真实生成和编辑器里的 Istar 需要模型密钥：把仓库根目录的 `.env.example` 复制为 `.env.local` 并填写，notale-ts 与 notale-editor 都只读这一份（已在 shell 里设置的变量优先）。详见[生成器说明](notale-ts/README.md)。编辑器与生成器也可以分别运行。

## 项目结构

| 目录 | 职责 |
| --- | --- |
| [`notale-editor-frontend/`](notale-editor-frontend/) | Next.js 与 React 编辑器、放映工作区、浏览器检查 |
| [`notale-editor/`](notale-editor/) | TypeScript 文档模型、HTTP API、版本存储和原生讲义运行时 |
| [`notale-format/`](notale-format/) | 原生工程文件与页面运行时的共享格式契约 |
| [`notale-ts/`](notale-ts/) | TypeScript 讲义生成、CLI、HTTP/SSE 服务及发布资源 |
| [`notale-viewer/`](notale-viewer/) | 生成进度、预览与讲义下载 |

前端使用锁定版本的 `@notale/editor` 包，通过 HTTP 与后端通信。PostgreSQL 保存讲义与资源；讲义内容由独立来源提供。修改后端共享契约后，先在 `notale-editor-frontend/` 执行 `npm run contract:update`，再构建前端。

> [!IMPORTANT]
> 本机启动器使用固定的开发身份，只监听本机。公开部署需要接入宿主系统的身份与授权、设置私有预览签名密钥，并使用独立的讲义内容来源。参见[集成指南](notale-editor/docs/INTEGRATION.md)。

Notale 目前处于 **0.1.0** 阶段。自定义脚本或 Canvas 内容需要对应适配器才能进行可视化编辑；任意效果不会自动变为属性控件。已接通能力与尚待完善的范围见[集成覆盖说明](notale-editor-frontend/docs/INTEGRATION-COVERAGE.md)。

**继续了解：**[前端开发](notale-editor-frontend/README.md) · [架构](notale-editor-frontend/docs/EDITOR-ARCHITECTURE.md) · [放映](notale-editor-frontend/docs/PRESENTATION.md) · [原创模板](notale-editor-frontend/templates/original/README.md)

Notale 自有源码采用 [MIT 许可](LICENSE)；随附第三方资源保留各自声明。公开源码范围为上表五个项目及根文档。
