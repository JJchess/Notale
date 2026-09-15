# 代码页作者接口

## 职责

固定宿主负责 Monaco、Python/Pyodide、标准库与 NumPy、执行和测试、轨迹采集、代码高亮、播放／暂停／步进／重置、主题映射和视图沙箱。不要重写这些设施或引入依赖。

课程必须让学习者修改当前源码并观察真实执行结果。保持学习代码自然，注释解释算法意图，不让学生维护可视化协议。四个必需文件共同构成课程：

- `starter.py`：算法与简短可运行例子，不调用 emit、渲染或追踪 API，不为可视化额外积累历史数据。
- `observe.py`：观察当前代码执行，产生独立可解释的状态。
- `tests.py`：验证当前输入与算法正确性，不测试固定工作台。
- `view/render.js`：将观察状态画成清晰的图形。

HTML、公共布局、字体和主题由宿主提供；课程图形的几何与线条直接在 render.js 中通过 SVG 属性或 DOM 样式表达，颜色与字体引用宿主主题，不另写 CSS 文件。

## 观察：observe(context)

`context` 有 `function`、`event`、`locals`、`globals`、`return_value`、`source`。`source` 是含 `file`、`line`、`text` 的字典，给出执行位置及对应源码行；没有 `context.line` 别名。`locals/globals` 是只读映射而不是 dict；用 `.get()`、成员检查或索引，不用 `isinstance(..., dict)` 判断可读性。

`event` 为 `line`、`return` 或 `exception`。line 的 source 指向刚执行的位置，locals 是此时的实际值，不代表整个复合语句已经结束；return 提供返回位置和返回值；exception 指向抛错位置，不应解释为成功更新。按任务需要观察比较、交换、更新或回溯，不必每行生成帧，也不要只留下结果。

例如当前算法交换行是 `arr[i], arr[j] = arr[j], arr[i]`，观察器可结合源码和前后快照定位，不能写死行号。以下片段放在观察器中，prev 在函数外初始化为 None：

```python
if context.function == "partition" and "arr" in context.locals:
    arr = list(context.locals["arr"])
    before, prev = prev, arr
    if context.event == "line" and context.source["text"].strip() == "arr[i], arr[j] = arr[j], arr[i]":
        return {"before": before, "after": arr,
                "swapped": [context.locals["i"], context.locals["j"]]}
```

实际 observe 中声明 `global prev`；递归或交错函数的快照要按当前子问题区分。源码行用于定位当前实现，不是通用算法标签；多行语句仍需核对实际变量变化。

返回小型 JSON 安全状态字典，或返回 None 跳过当前事件。NumPy 数组用 `.tolist()`，无穷和缺失值明确编码。测试在轨迹采集后执行，不产生课程帧。

状态必须来自同一次真实计算。变量存在不代表值已更新；等待有关赋值完成，避免新输入配旧结果。需要时在观察器中保留已完成值或上一个快照，但不要重新调用算法来填状态，不以零代替尚未产生的值。

每帧应能独立渲染，包含所需输入、当前对象与结果。对比变化时保留真正的前值和后值；对象身份与位置分开，重复值不能共用身份。只读取当前函数实际拥有的变量，不把其他函数的局部变量当成仍可用。完成态取真实最终结果，并保留图形解释所需上下文。

## 测试：run_tests(namespace)

返回列表，每项含 `name, passed, expected, observed, message`。namespace 是当前源码执行后的命名空间。expected/observed 同样须 JSON 安全：字典键必须是字符串，Counter 或数字键映射可显式转成键值对列表。

使用独立参照、数学性质或可验证结果，不能让被测函数自证。当前运行的断言应随可编辑输入变化；可另加少量固定边界用例。数值计算验证真实数值与合理误差，不能只检查“执行了”。测试失败保留证据，修正算法或数学前提，不删测试、放宽容差来隐藏缺陷。

## 视图：window.renderNotaleView(packet)

同步函数，packet 提供 `state`、`previousState`、`playback`、`environment`。用原生 SVG/DOM 将 state 映射成一张重点明确的图，不重新计算算法、不硬编码答案。

宿主已有 `#code-title`、`#code-controls`、`#code-status`、`#code-plot`、`#code-caption`，更新现有元素即可；空的控件／状态／图注区域会收起。

主题 CSS 变量：`--code-bg`、`--code-ink`、`--code-muted`、`--code-accent`、`--code-secondary`、`--code-line`。CSS/SVG 用 `var(--code-accent)` 这样的完整引用，不再包一层 var。无需生成调色板、字体映射或公共布局。

`patchSvg(container, markup, {animate:true})` 更新已挂载 SVG 的属性、文本与节点。animate 可选，默认 false，支持 stroke/width/opacity/dashes 过渡；稳定 ID 跟随对象身份。

`NotaleMotion.tween(durationMs, draw)` 调用 draw(progress)，进度为 0–1。宿主管理取消；暂停、跳步、重置会取消动画，静态帧调用 draw(1)。时长应落在播放间隔内。`NotaleMotion.animate(element, keyframes)` 也由宿主管理时序。不要自己维护 RAF、计时器或连续循环。

镜头与几何由课程决定：数值范围变化后仍要看清过程，保留必要的全局定位；对象位置、颜色与尺度应有一致含义。中文标签简短，文本留在视图内，小误差用科学记数。避免卡片墙、仪表盘和步骤 tabs。可绘制解析参考曲线，但不能用它替代实际数值迭代。

不支持外部网络、模块导入、额外库或 eval。渲染问题通过当前课程文件解决，不修改宿主。

## 检查与结束

Write／Patch 后 Check 当前文件。Check 返回执行错误、课程测试与渲染／重置结果；按错误定位当前课程文件，不读取宿主内部文件。初始上下文的 limits 是实际运行预算，观察状态应在预算内保留真实过程和必要语义。运行通过不是语义验收：仍需按 query 核对过程顺序、对象身份与实际数值。

最终文件已检查且没有具体违约时结束，不写额外说明、报告或旁路测试文件。
