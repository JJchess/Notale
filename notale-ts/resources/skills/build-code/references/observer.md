# 代码页作者接口

## 一条规则

数据接口只存在于 starter.py 各函数的返回值里。observe.py 只声明看哪些函数，render.js 只消费它们：不猜局部变量名，不匹配源码行，不重算算法。想让一步的内部可见，就把那一步写成一个返回字典或明确值的小函数——这是自然的教学代码，也是唯一的观察点。

## 三份文件

- `starter.py`：算法与一个可运行例子。每个值得看的步骤是一个返回字典的函数；不调用任何追踪或渲染 API。
- `observe.py`：只有一行 `STAGES = {函数名: 阶段}`。
- `view/render.js`：`window.renderNotaleView(packet)`，把一帧画成一张图。

宿主负责编辑器、Python/NumPy、执行、轨迹、播放／暂停／步进／重置、主题和视图沙箱。HTML、布局、字体、颜色不归课程写。

## 观察：STAGES

```python
STAGES = {"forward": "forward", "backward": "backward", "update_one": "update", "train": "done"}
```

表里的函数每返回一次出一帧：返回的字典合并到上一帧上（后到的字段覆盖先到的），再标上 `stage`；返回的不是字典就记为 `value`。所以每帧都是「到此为止的课程状态」。NumPy 值自动转成列表，非有限数明确编码。画面要的量缺了，就让对应函数把它返回出来。超过宿主容量时宿主均匀抽样并用 `⚠` 提示，不要为过闸删轮次或删字段。

## 视图：renderNotaleView(packet)

同步函数；`packet.state` 是当前帧，`packet.history` 是到当前为止的全部帧（画轨迹、曲线用它），另有 `previousState`、`playback`、`environment`。不重新计算算法、不硬编码答案：画面需要的每个数值都来自帧，缺了就改 starter 让它返回。入口先按 `stage` 校验必需字段的形状，缺失或不符就抛出含字段、预期、实际的错误（如 `state.W1 应为 2 维数组，实际形状 [6]`），不要用空数组或零把图画出来。

用原生 SVG/DOM 更新宿主已有的 `#code-title`、`#code-controls`、`#code-status`、`#code-plot`、`#code-caption`。颜色只用 `var(--code-bg|ink|muted|accent|secondary|line)`。`patchSvg(container, markup, {animate})` 更新已挂载 SVG；`NotaleMotion.tween(ms, draw)` 做过渡，宿主管理取消，不自建计时器。镜头与几何由课程决定，对象位置、颜色、尺度含义一致，标签简短，小误差用科学记数。无网络、无 import、无 eval。

## 检查与结束

Write／Patch 成功后宿主自动运行课程，把执行、抽样渲染与重置的结果附在返回里；`⚠` 行是容量提示，不是失败。运行通过不等于语义正确：按任务核对过程顺序与数值。没有具体违约就结束。
