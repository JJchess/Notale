# 代码页作者接口

## 一条规则

数据接口只存在于 starter.py 各函数的参数与返回值里。observe.py、tests.py、render.js 只消费它们：不猜局部变量名，不匹配源码行，不重算算法。想让一步的内部可见，就把那一步写成一个返回字典或明确值的小函数——这是自然的教学代码，也是唯一的观察点。

## 四份文件

- `starter.py`：算法与一个可运行例子。每个值得看的步骤是一个函数；不调用任何追踪或渲染 API，不为可视化积累数据。
- `observe.py`：`observe(context)`，本质是「函数名 → 阶段」的映射，把参数或返回值整理成一帧。
- `tests.py`：`run_tests(namespace)`，只验数学性质。
- `view/render.js`：`window.renderNotaleView(packet)`，把一帧画成一张图。

宿主负责编辑器、Python/NumPy、执行、测试、轨迹、播放／暂停／步进／重置、主题和视图沙箱。HTML、布局、字体、颜色不归课程写。

## 观察：observe(context)

`context.event` 只有 `call`、`return`、`exception`。`call` 时 `context.locals` 是函数参数；`return` 时 `context.return_value` 是返回值，`context.locals` 是函数结束时的局部变量；`exception` 指向抛错处，不是成功。另有 `context.function`、`context.globals`（只读映射，用 `.get()`）和 `context.source`。

返回一个 JSON 安全字典生成一帧，返回 `None` 跳过。NumPy 用 `.tolist()`，非有限数明确编码。每帧独立可画：带 `stage`、当前对象和解释它所需的输入。累积序列（如 history）可在 observe 里持有并放进帧；超过宿主容量时宿主均匀抽样并在检查结果里用 `⚠` 提示，不要为过闸删轮次或删字段。

```python
STAGES = {"forward": "forward", "loss": "loss", "backward": "backward",
          "update_one": "update", "train": "done"}

def observe(context):
    if context.event != "return" or context.function not in STAGES:
        return None
    value = context.return_value          # 接口就在这里，别处不猜
    return {"stage": STAGES[context.function], **frame_from(value, context.locals)}
```

## 测试：run_tests(namespace)

返回 `[{name, passed, expected, observed, message}]`，`expected/observed` JSON 安全。只验数学性质：独立参照实现、中心差分、恒等式、收敛趋势、少量边界用例；断言随可编辑输入变化。不要为了拿结果形状去调用训练或搜索主函数再读它的返回结构——形状归渲染器校验。测试失败修算法，不删测试、不放宽容差。

## 视图：renderNotaleView(packet)

同步函数；`packet.state` 是当前帧，另有 `previousState`、`playback`、`environment`。不重新计算算法、不硬编码答案：画面需要的每个数值都来自帧，缺了就改 starter 让它返回。入口先按 `stage` 校验必需字段的形状，缺失或不符就抛出含字段、预期、实际的错误（如 `state.W1 应为 2 维数组，实际形状 [6]`），不要用空数组或零把图画出来。

用原生 SVG/DOM 更新宿主已有的 `#code-title`、`#code-controls`、`#code-status`、`#code-plot`、`#code-caption`。颜色只用 `var(--code-bg|ink|muted|accent|secondary|line)`。`patchSvg(container, markup, {animate})` 更新已挂载 SVG；`NotaleMotion.tween(ms, draw)` 做过渡，宿主管理取消，不自建计时器。镜头与几何由课程决定，对象位置、颜色、尺度含义一致，标签简短，小误差用科学记数。无网络、无 import、无 eval。

## 检查与结束

Write／Patch 成功后宿主自动运行课程，把执行、测试、抽样渲染与重置的结果附在返回里；`⚠` 行是容量提示，不是失败。运行通过不等于语义正确：按任务核对过程顺序与数值。没有具体违约就结束。

其余样例按需 `Read observer-samples/<neural-network|bfs|insertion-sort>/<starter.py|observe.py|tests.py|view/render.js>`。
