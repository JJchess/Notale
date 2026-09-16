# notale-bench

论文线《HTML is all you need》的评测资产。只在 `nv2-paper` 分支上，不进产品线。

**主张**：同一个锁定模型（gemini-3.8-flash / low）套上这套 harness，在单页 artifact 与多页讲义两类场景上都优于裸模型，每个组件的贡献可消融分离。

## 目录

| | |
|---|---|
| `docs/` | 选型、评分机制、学生模拟器调研、升级方案 |
| `runners/` | 跑榜脚本与台账 |

外部 benchmark 仓库与数据（约 4 GB）不在这里，留在 `~/ws2/Notale/benchmark/`，脚本按绝对路径引用。它是 gitignored 的，不随 worktree 复制。

## 两条工作线

| 工作树 | 分支 | 用途 |
|---|---|---|
| `~/ws2/Notale` | `nv2-dev` | 产品线 |
| `~/ws2/Notale-bench` | `nv2-paper` | 论文线 |

`runners/where.sh` 打印两边的分支与上游；`.git/hooks/pre-push` 把目录和分支绑死，跨分支推送会被拒。dev 合了新东西就跑 `runners/sync.sh` rebase。

## 榜

| 形态 | 榜 | 状态 |
|---|---|---|
| 单页 | ArtifactsBench，1,825 题九类（含 Education/Learning 166 题） | 待接线 |
| 多页 | PresentBench education 子集、SlidesGen course_preparation | 已跑过一题 67.1，需改走 TS 线 |

裸模型基线 InteractScience 已跑完，见 `runners/RESULTS.md`，不再投入。

## 已知的两处纠正

- `runners/presentbench_case.sh` 目前指向旧的 Python 线，材料走 `--materials`。TS 线已有更完整的资料通道（`notale-ts/src/core/sources.ts`：PDF、DOCX、按页摘录、源页裁图、防注入），改用 `notale build --query … --file …`。
- `docs/PLAN-benchmarks.md` 里"跑榜脚本在 benchmark/notale"的路径已变成这里。
