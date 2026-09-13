# 放映与演讲者视图

从编辑器的放映菜单选择当前页、从头开始或演讲者视图。独立入口 `/present?document=<id>&speaker=1`；旧 `/show.html` 保留查询参数重定向。

演讲者工作区包含当前互动页、下一步预览、备注、独立计时器及可调整分栏。观众窗口没有编辑界面；同设备通过 BroadcastChannel 同步页内步骤、黑屏、标注、缩放及互动状态。控制权沿用 Web Locks，消息使用 term/sequence 排序，刷新从本地会话检查点恢复。放映绑定文档版本，不向编辑文档保存互动状态。

Reveal.js 5.2.1 负责页面引擎，Drauu 负责会话标注。iframe 保持原始页面尺寸，在外层统一适配缩放。下一步预览只读、静音；离开页面及结束放映时暂停媒体。计时暂停与自动推进暂停相互独立。

## 互动适配

运行时支持表单控件、组件状态、ECharts、媒体及已有场景适配器。随机模拟同步计算后的结果，观众端不重新采样。自定义 HTML/Canvas 可注册 `window.__NOTALE_PRESENTATION_ADAPTERS__[id]`：

```ts
{ capture: () => state, apply: state => restore(state),
  subscribe: changed => unsubscribe, pause: () => stop() }
```

`capture` 返回可结构化复制的状态；`apply` 不应重新生成随机结果；`subscribe`、`pause` 可选。没有适配器的任意脚本内部状态无法保证同步，演讲者界面会提示检测到的能力缺口。窗口同步限定同一浏览器同源，不提供跨设备远程控制或自动选择外接显示器。

## 定向验证

`tests/presentation-workspace.spec.ts` 使用隔离三页样本覆盖步骤、黑屏、图表/滑块、随机场景、媒体输出、标注与观众刷新恢复，并验证原文档不变。后端协议测试检查消息排序和运行时合并。发布保留旧构建用于回退，不要求每次 UI 修改运行全套讲义回归。
