# 两页长尾：解耦修复与验证

## 实施范围

- 固定 Python 工作台包含本地 NumPy；Worker 初始化完成加载后才 ready。
- 使用现有 Pyodide 锁文件，不添加课程依赖配置、自动 import 扫描或运行时 pip 安装。
- NumPy wheel：2.4.6，SHA-256 `32959d4137cec8143d75016d029281df3d2e80a232896ed903c2b59e1c44ee9f`。
- 本地包来源：Pyodide v314.0.6 官方发行 CDN；加载方式依据 [Pyodide 包加载说明](https://pyodide.org/en/stable/usage/loading-packages.html)。包地址固定为本地资源，不回退到外部 CDN。
- 资源准备检查 NumPy 实体文件；运行时初始化失败不伪造 starter.py 行号。
- trace 初始化、before_execution、capture、finalize、tests 的错误保留实际文件、行号及异常链；复用现有错误结构和 UI。
- Builder 只替换原有验收句：数据与公式修订需要计算或数学依据，不以预想图形为准。不加门禁、不改 Director。
- 代码页 reference 仅同步平台环境边界，遵循 skill-creator 的窄范围、单一说明来源原则。

## 确定性验证

- `python -m unittest core.test_code_runtime -q`：最终状态 8/8，通过，30.168 秒。
- `python -m unittest core.test_prompts -q`：17/17，通过。
- build-code skill 校验通过。
- 冷 Worker、同 Worker 再执行、重建 Worker：源码、trace、tests 均可使用 NumPy。
- 原有超时与帧数保护测试仍通过。
- `python experiments/four-topics-20260909/replay_code_tail.py`：历史失败快照原样重放，不修改旧 run，不调用模型。
- 模拟 wheel 404：ready=false，kind=initialization，source=null。

## 历史课程错误，不冒充平台修复成功

原始 run：`neural-check-trim-0909-193805-neural`，page-11。

- 首次 NumPy 失败快照现可加载 NumPy，继而准确报 `lesson/trace.py:101` 的 `KeyError: 'W2'`：捕获函数只检查 X、W1，随后读取尚未初始化的 W2。
- 首次 `__name__` 失败快照准确报 `lesson/trace.py:104`：梯度检查遍历整个全局命名空间，对 `numeric['__name__']` 求值。不是宿主缺少 __name__。
- 这两处是历史课程自身的错误；没有更改课程去让回放变绿，也没有删掉数值测试。

## 第12页诊断复跑

运行：`nn-page12-evidence-0909-203108`。原 brief、主题，Gemini 3.8 Flash low；只启动该页 Builder，无 Planner/Director、人工修页、补催或换模型。

这是当前配置的单次诊断，不是严格单变量实验：相对于历史 49 轮运行，200 字符上限也已恢复。因此不能把轮数变化全部归因于修订依据提示。

结果：21 轮，Builder 进程墙钟 160.7 秒，自然结束；历史为 49 轮、271.9 秒。原页面未变，配置与模型输入相关文件哈希无漂移。工具调用为 11 Read、1 Write、5 Check、4 Patch、2 Bash。

- 首次 Write 与最终产物的 `generateDataset` 函数完全一致；四次 Patch 涉及文字、布局及删掉 DOM 后残留的 classList 访问，没有重写双月公式。
- 最终 Check 无 JS 错误、越界或裁切；可见文字 169 字。此结果不是完整内容语义验收。
- 仍超过 11 轮目标：后段为持续的“侵入页眉页脚带 3 处”提示多次增加 padding，还尝试读取不存在的检查器路径及被拒绝的跨范围搜索。最后该提示仍存在，不能宣称已消除所有长尾。
- 本轮未追加调整该提示、放宽工具边界或人工修复产物。
