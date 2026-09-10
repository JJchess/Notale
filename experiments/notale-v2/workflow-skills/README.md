# Workflow Skills Lab

这是 `notale-v2` 的隔离式 skill 重组实验。它把原有 49 个零散 frontend skills 收敛为 12 个可执行 workflow；旧 skills、现有 prompts 与 vendor 均不在这里原地改写。

## 结构

- `catalog.yaml`：旧 skill 到新 workflow 的映射，以及明确不导入的项目。
- `workflows/*/SKILL.md`：短入口、判断条件、顺序化步骤与交付契约。
- `workflows/*/references/`：仅在 workflow 路由到对应分支时读取的实现细节。
- `evals/cases.yaml`：每个 workflow 两例，覆盖 typical 与 boundary。
- `lab.py`：以实验 case 作为输入，直接复用生产 `core.builder.build_one` 循环，并负责事后浏览器 smoke、结果组装与人工预览。

12 个 workflow 分属素材、设计、交互、表现、学习与审查六层：

```text
素材      collect-visual-references  generate-illustration
设计      set-visual-direction       compose-page        shape-typography
交互      design-interaction         design-motion
表现      visualize-data             simulate-2d         build-3d-scene
学习      build-learning-game
审查      review-page
```

## 验证与运行

默认路由为 `AWS-GPT-5.6-Terra`，推理档位为 `medium`。

```bash
python3 lab.py validate
python3 -m unittest -v test_lab.py
python3 lab.py run --all --model AWS-GPT-5.6-Terra --effort medium --jobs 4
```

需要对照其他 workflow 快照时，通过 `--workflows <root>` 指定；Agent 的历史回放、工具集、图片淘汰、
坏 JSON 回灌、步数/时间上限与 `no_tool_use` 终止条件仍全部来自生产 Builder。

每个案例提示要求先加载指定 Skill，并至少用 `Check` 检查一次。交互案例还必须暴露：

```js
window.__skillLab = { snapshot, act, reset }
```

Builder Agent 结束后，runner 会只读验证主要动作确实改变状态，且 reset 后的序列化状态与初始状态严格相等。
这次 smoke 只记录验收结果，不把报告回灌模型或重启循环；因此 lab 与生产 Builder 不再拥有两种收敛语义。

## 组装与人工确认

只有 `ok=true` 且 skill hash 仍为当前值的结果可以进入最终 run：

```bash
python3 lab.py assemble \
  --from-run <baseline> --from-run <repair> \
  --run-id <final>
python3 lab.py serve --run <final> --host 0.0.0.0 --port 4176
```

机器 smoke 只拦运行失败，不替代审美判断。预览页同时显示截图和可操作 iframe；每一例都需人工选择 `accept` 或 `revise`。skill 内容变化后，旧确认会因 hash 不一致自动失效。
