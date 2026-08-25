# Builder Convergence 2×2

这是一个与 `notale-v2` 生产路径隔离的筛选实验。它只读复用 `notale-v2` 的模型传输层、工具实现、
`net-s1` 输入、旧 skills 和新 workflows；任务沙箱、trace、页面和报告全部写在本目录的 `.runs/`。

## 四个实验组

| arm | Skill 条件 | 工具条件 |
|---|---|---|
| `legacy-builder` | workflow 在 catalog 中的旧 source skills | Read/Write/Edit/Patch/Check/Look/Bash/Skill |
| `workflow-builder` | 重组后的一个 workflow | Builder 工具 |
| `legacy-lab` | 旧 source skills | Read/Write/Edit/Bash/Skill/Render |
| `workflow-lab` | 新 workflow | Lab 工具 |

四组使用同一个自由 Agent 循环。Prompt 要求模型自行读 Skill，runner 不强制、不补催、不因漏读判失败。

## 运行

```bash
cd experiments/builder-convergence-2x2
python3 runner.py validate
python3 -m unittest -v test_runner.py
python3 runner.py run --run-id terra-medium-screen-01 --jobs 4 \
  --model AWS-GPT-5.6-Terra --effort medium
python3 runner.py serve --run-id terra-medium-screen-01 --host 0.0.0.0 --port 4176
```

`run` 按页调度：同一页的四个 arm 同时跑，四个都结束后再跑下一页。Agent 停止后才统一做一次外部
Check；报告不回灌，所以不会改变收敛次数。`report.html` 显示真实 arm 与指标，`review.html` 隐去 arm 名用于盲评。
