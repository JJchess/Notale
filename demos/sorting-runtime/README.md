# Python 排序运行时 Demo

这是 code-runtime template v2 的原生视图实例。左侧三个 Monaco 标签分别执行冒泡、选择和插入排序；Pyodide Worker 从当前 model 运行代码，`trace.py` 产生真实语义帧，右侧严格沙箱中的原生 DOM 将同一批帧绘成窄谱线、活动下标与已固定区间。

右侧没有课程标题卡、全局指标栏或源码证据条。青色表示当前系统状态，琥珀色表示正在读写的位置，紫色表示已经固定或证明的区间；颜色同时配有圆环、三角标记、括号和文本。

## 运行

从仓库根目录执行：

```bash
python3 -m http.server 4175
```

访问 <http://127.0.0.1:4175/demos/sorting-runtime/>。

页面使用最大 `1600×900` 的居中固定画幅。只有左侧 Output 可以纵向拖动、键盘调整或双击复位；右侧尺寸不会被拖拽改变。demo 通过相对软链接复用仓库内的 Monaco、Pyodide、Codicons 和 chassis。

## 模板外代码量

以下是课程作者需要负责的代码，不含固定工作台、Worker、iframe 桥、vendor、浏览器检查、manifest 和 README：

| 文件 | 总行数 | 非空行 |
|---|---:|---:|
| `lesson/lesson.js` | 103 | 99 |
| 三个排序 `.py` | 52 | 40 |
| `lesson/trace.py` | 161 | 138 |
| `lesson/tests.py` | 73 | 66 |
| `lesson/view/index.html` | 19 | 17 |
| `lesson/view/style.css` | 277 | 241 |
| `lesson/view/render.js` | 141 | 128 |
| 合计 | **826** | **729** |

其中右侧原生视图三文件为 **437 行 / 386 非空行**。它不依赖模板组件 API，只定义 `window.renderNotaleView(packet)`。

## 生成来源

```bash
python3 notale-v2/experiments/workflow-skills-next/build-interaction/scripts/generate_template.py \
  --output /data1/home/zhuyifan/ws2/Notale/demos/sorting-runtime \
  --title "Python 排序运行时" \
  --slug sorting-runtime \
  --runtime python \
  --flat-output \
  --vendor-mode symlink
```

当前目录已经手工扩展为三入口课程。生成器 schema v2 不接受旧的 `--visualizer` 参数，也不会原地升级 schema v1。

## 自检

```bash
python3 demos/sorting-runtime/check.py --shot-dir /tmp/sorting-runtime-shots
```

检查覆盖三个入口、语法错误、无限循环超时与 Worker 恢复、严格 iframe 权限、禁网、视图错误回传、DOM 身份稳定、Reset、Output 拖拽与键盘调整、固定画幅、缩放和 reduced motion；截图包含 initial、active、final 三种状态。

