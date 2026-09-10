# Dijkstra 最短路径 Demo

这是 code-runtime template v2 的原生 SVG 课程实例。学习者编辑自然 Python 邻接表、优先队列和松弛逻辑；`trace.py` 把实际执行状态转换成节点、带权边、队列、候选算式与前驱关系，右侧严格沙箱直接绘制点—环—细边的最短路径星图。

右侧不再使用通用 graph renderer，也没有顶部课程卡片和底部源码证据条。队首、当前松弛和进度是画布内的轻量读数；青色、琥珀色和紫色分别表示系统状态、当前操作与最终最短路径树，并配合虚线、环形和文字状态。

## 运行

从仓库根目录执行：

```bash
python3 -m http.server 4175
```

访问 <http://127.0.0.1:4175/demos/dijkstra-runtime/>。

## 模板外代码量

以下不含固定工作台、Worker、iframe 桥、vendor、浏览器检查、manifest 和 README：

| 文件 | 总行数 | 非空行 |
|---|---:|---:|
| `lesson/lesson.js` | 76 | 71 |
| `lesson/dijkstra.py` | 38 | 29 |
| `lesson/trace.py` | 231 | 204 |
| `lesson/tests.py` | 60 | 56 |
| `lesson/view/index.html` | 25 | 21 |
| `lesson/view/style.css` | 291 | 244 |
| `lesson/view/render.js` | 201 | 185 |
| 合计 | **922** | **810** |

其中算法、课程配置、trace 和 tests 为 **405 行 / 360 非空行**；右侧原生视图为 **517 行 / 450 非空行**。原生视图代码更多地表达课程本身的构图，但 Agent 只需普通 HTML/CSS/JS 和一个 `renderNotaleView(packet)` 函数，不需要学习 render-kit 生命周期或组件接口。

## 原生视图契约

`lesson/view/index.html`、`style.css`、`render.js` 是仅有的右侧作者文件。固定宿主发送 `step`、`previousStep`、`playback` 和 `environment.reducedMotion`；render.js 同步更新带稳定 ID 的 SVG 节点与边。iframe 使用精确的 `sandbox="allow-scripts"`，不具有同源权限，且 CSP 与桥层都禁止网络调用。

## 自检

```bash
python3 demos/dijkstra-runtime/check.py --shot-dir /tmp/dijkstra-runtime-shots
```

检查覆盖真实松弛写入、稳定节点身份、最终五条最短路径树边、六个已确定节点、语法错误、超时恢复、严格 iframe、禁网、错误回传、Reset、Output 伸缩、固定画幅和 reduced motion；截图包含 initial、active、final 三种状态。

