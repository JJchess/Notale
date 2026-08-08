# Notale

Notale 按 `methodology/` 的 harness architecture 与 pipeline schema 生成 Reveal.js
HTML-native 讲义。每页保持完整 HTML 产物，通过 sandbox iframe 嵌入 Reveal 外壳；
页面 CSS、脚本和 ID 相互隔离。

## 目录

- `agents/`：Agent worker 与 OpenHarness 运行适配层。
- `cli/`：统一命令行入口。
- `core/`：artifact schema、状态、时长模型与确定性工作流。
- `docker/`：可运行的隔离环境；不承担逐 agent 的容器调度。
- `roles/`：Prompt、角色职责与工具/skill 权限声明。
- `skills/`：可注入 Agent 的能力说明。
- `tools/`：Agent 可调用工具及其测试替身。
- `utils/`：LLM 客户端、解析等公共基础设施。
- `web/`：Reveal.js 组装、包内离线 runtime 与预览服务。
- `tests/`：全离线测试。

## 安装与运行

```bash
cd /data1/home/zhuyifan/ws2/Notale
notale/.venv/bin/python -m pip install -e ./notale

notale/.venv/bin/python -m notale generate \
  --topic "60 分钟《数据结构》讲义，大二，要代码演示和课堂练习"
notale/.venv/bin/python -m notale generate --topic "..." --yes
notale/.venv/bin/python -m notale generate --topic "..." --resume notale/runs/<run-id>
```

产物写入 `notale/runs/<date>-<id>/`，包括阶段 artifacts、`deck.html`、
`slides/*.html`、离线 Reveal runtime 与质量报告。

CLI 自动读取包根目录的 `.env.local`，无需 `source`：

```bash
cp notale/.env.example notale/.env.local
# 编辑 notale/.env.local，填入 SILICONFLOW_API_KEY
```

优先级为：进程环境变量 > `.env.local` > `.env`。

## 预览

```bash
notale/.venv/bin/python -m notale serve --host 0.0.0.0 --port 3002
```

服务器使用 3002 端口。本地转发后访问本机 3001：

```bash
ssh -L 3001:localhost:3002 zhuyifan@188.239.60.251
```

## 测试与 Docker

```bash
notale/.venv/bin/python -m pytest notale/tests -q
docker compose -f notale/docker/compose.yaml build
docker compose -f notale/docker/compose.yaml up preview
```

OpenHarness 的具体集成边界与已知限制见 `docs/openharness-spike.md`。
