# 双屏互动运行时契约

本文对应 `notale-editor/src/browser/presentation-runtime.ts` 与前端 `src/presentation/controller.ts` 当前实现。部署版本以 `.local/presentation-release.json` 为准。讲义编辑数据与放映会话状态分离：课堂互动不应写回讲义工程。

## 状态来源与更新

| 内容 | 当前同步方式 | 边界 |
| --- | --- | --- |
| 原生表单 | value / checked，接收端派发 input / change | 不读取文件与密码输入 |
| HTML / SVG | 带 data-notale-id 的作者节点属性；无子元素节点的文字 | 不复制整块 HTML，不替换运行时子树 |
| ECharts | getOption / setOption 和图例、缩放、选中、finished 事件 | 函数不参与 JSON 状态传输 |
| 互动组件 | 当前组件状态名称 | 接收端选择对应已有状态 |
| 自定义场景 | checkpoint 或 PresentationAdapter | 仅参数值不证明 Canvas 随机状态完整可恢复 |
| 音视频 | 时间、暂停、倍速、音量及声音意图 | 声音归属与媒体静音意图分离；不复制演讲者强制静音 |

DOM 属性白名单：class、style、hidden、aria-pressed、aria-expanded、d、points、fill、stroke、transform、cx、cy、r、x、y、width、height。作者父容器也同步这些属性，但只在叶子上同步文字。Canvas、媒体、iframe 和图表引擎实例保持专门的状态边界。

互动事件、作者属性/文字/节点变化及图表/场景订阅通过现有80ms窗口合并。暂停媒体仅采样时间变化不生成增量；播放中的时间校正仍保留。加入窗口、刷新和完整捕获不省略状态。不得将这些机制描述为像素级远程桌面或任意第三方脚本同步。

完整快照使用 `full: true` 替换当前页各状态字典；增量补丁只合并给定项。捕获发现字典项移除时提升为完整快照，接收端同时移除已不存在的场景/图表失败重试项。这不是 DOM 子树删除协议。

## 自定义场景接入

在内容运行时注册 `window.__NOTALE_PRESENTATION_ADAPTERS__[sceneId]`：

```ts
interface PresentationAdapter {
  capture(): unknown;
  apply(value: any): void;
  subscribe?(changed: () => void): () => void;
  pause?(): void;
}
```

capture 返回可 JSON 序列化的数据，包含恢复画面所需的随机结果和模拟状态；不要只传触发按钮或重新运行随机算法。apply 应可重复执行同一状态，不触发讲义保存。subscribe 返回解除监听函数。pause 服务于下一页预览，避免后台模拟继续推进。

注册表在配置/捕获时按实际实例协调：新实例接入、被替换或删除的实例释放，图表与场景使用独立订阅命名空间。纯粹延后赋值注册表且没有任何可观察活动，不保证立即发现；没有全局轮询。

## 失败与反馈

- capture 失败形成能力提示。subscribe / 清理失败隔离到该来源，继续其余捕获与释放；后续正常捕获清除相应监听提示。
- scene / chart 的 apply 失败不会跳过后续对象和媒体。失败来源成功应用后才清除状态，不能因无关补丁到达就宣称恢复。
- 运行时发送 `presentation-apply-status`。观众窗口通过会话总线转发 `apply-status`；演讲者只接受当前讲义、版本、会话、任期、页面和已知观众的报告。每个观众独立记录序号，单个观众恢复不能清除其他观众的故障。
- 观众通过现有两秒心跳补报当前页状态，避免首次报告先于观众注册而丢失。错误在演讲者界面显示，不覆盖投影画面；关闭同一故障提示后，无关状态更新不会再次打开它。恢复后再次失败可重新提示，退出或超时移除观众报告。
- 接收端保留每个失败来源的最新应用动作，现有完整状态心跳触发 `presentation-retry`，仅重试失败项；无需新的轮询计时器，也不重放整个页面。成功或完整快照移除来源后清除该项。
- 图表订阅记录已尝试的事件注册，注册失败时尝试逐项解除；正常释放也不会因某一次 off 抛错而跳过其余事件。释放是幂等的，但不能保证第三方错误的 off 实现确实移除了监听。

当前不是全部扩展钩子的通用异常沙箱：任意 apply/pause 内部副作用、异步 Promise 拒绝、第三方解除监听自身失效等仍须单独评估。原生静音按钮在强制静音控制窗口中的完整意图表达也未在本轮解决。

## 证据

`tests/presentation-attributes.spec.ts` 覆盖双窗口作者属性/父容器同步、子节点身份保留、图表订阅实例更换、监听失败恢复、场景应用失败后的继续更新与演讲者反馈，以及首次报告丢失后的补报、关闭提示、延迟接收端就绪重试和完整快照删除失败来源。图表实例生命周期部分使用可计数的替身，不能代替真实 ECharts 交互。

`tests/presentation-workspace.spec.ts` 覆盖真实 ECharts、组件/模拟结果、步骤、激光笔、画笔、音视频、观众刷新与讲义未改写。原生鼠标操作前明确激活演讲者窗口，先核对本地激光点，再检查观众端。

后端 `tests/presentation-scene-state.test.ts` 覆盖 Canvas 状态能力判断、暂停媒体差异比较及图表部分注册失败/释放失败下的逐项清理与幂等性。定向通过不能扩大为任意讲义或多显示器环境全面验收。具体发布记录见 `.local/editor-ninehour-progress.md` Batch142–157。
