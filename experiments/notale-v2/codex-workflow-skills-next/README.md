# Codex Workflow Skills Lab

这个目录用原生 Codex 测试 `build-cover`、`build-page` 和 `build-interaction`。它不复用上一轮实验结果，也不修改生产 Builder。

## 输入形态

每个 arm 都从相同的 16 页 Builder 工作区开始：真实 chassis、本地依赖、冻结 theme、完整 deck map、页面骨架和目标 `pNN.md`。system 侧复用 Builder identity 与 shared preload，user 侧复用 `prompts/brief.md`。

目标规格只保留 Planner 的主题级输出，例如：

```text
# page-08 [内容页]
AdaBoosting 算法讲解。
```

类别、版式、媒介、证据结构和交互机制不在 fixture 中预先展开。

## 命令

```bash
# 静态合同、9 类矩阵和 catalog 字符预算
python3 experiments/codex-workflow-skills-next/lab.py validate

# 只物化隔离工作区，不调用模型
python3 experiments/codex-workflow-skills-next/lab.py prepare \
  --run inspect-20260831 --all --repeats 1

# cover/page/interaction 各跑一个 full arm
python3 experiments/codex-workflow-skills-next/lab.py smoke \
  --run smoke-20260831

# 只重跑一个 case 的 full arm
python3 experiments/codex-workflow-skills-next/lab.py run \
  --run interaction-smoke-20260831 \
  --case interaction-general-immunity --repeats 1 --arm full

# 两次重复的 52-run 正式矩阵
python3 experiments/codex-workflow-skills-next/lab.py run \
  --run full-20260831 --all

# 盲化预览
python3 experiments/codex-workflow-skills-next/lab.py serve \
  --run full-20260831 --port 4177
```

运行结果在 `.runs/<run-id>/`。每个 case/repeat 的非 treatment payload 必须同 hash；target、其他页面、assets、Codex trace、context 读取记录、selfcheck 和截图分别保存。

## Arms

- `baseline`：无新 workflow skill。
- `reference`：skill 路由和唯一 category reference，无 sample catalog。
- `full`：完整 skill；模型选择唯一 reference、full 主 sample 和受预算约束的辅助 sample。

`interaction/3d` 当前没有批准 sample，因此只有 baseline/reference。其余八类均为三个 arms；两次重复合计 52 次。

## Context loader

Agent 通过 PATH 中的 `workflow-context` 一次读取工作材料：

```bash
workflow-context --reference chart \
  --main solar-storage \
  --aux swarm-spectrum \
  --aux climate-zone-shift-map
```

loader 从当前安装 skill 的 `samples/catalog.json` 解析文件，输出一份 XML-wrapped bundle，并强制同类别、角色、mini、30k 辅助预算和 110k 总预算。

## Builder Check broker

原生 Codex 的 workspace sandbox 不能直接启动 Chromium。实验 Agent 因此调用：

```bash
workflow-check pages/page-14.html --shot --shot-dir .codex-shots \
  --after 'App.setState("boundary")'
```

client 只写入当前 arm 的请求队列；harness 外侧的 broker 校验目标路径后运行真实 `selfcheck.py`，再把报告送回原命令。Agent 仍不能写工作区外文件，也不能绕过 broker 直接调用 selfcheck。interaction 至少要检查一个改变后的规则相关状态。
