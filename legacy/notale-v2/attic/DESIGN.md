# context schema 的设计取舍

## 定义

context = harness 独占的一份 typed state(`Deck`)+ 一组投影函数(`views.py`)。

模型任何一次调用都拿不到 `Deck`,只拿到一个 view。所有产出都必须是 schema 里
某个类的实例,验证不过就重来,不做自由文本解析。

```
Deck  ──plan_view──▶  规划调用  ──▶ Segment[] / Term[]  ──merge──▶ Deck
Deck  ──build_view─▶  单页构建  ──▶ HTML               ──gate──▶ PageVerdict
Deck  ──repair_view▶  单页修复  ──▶ HTML               ──gate──▶ PageVerdict
```

## 六个决定

**1. 隔离做成结构性的,不做成指令。**
「不许读别的页」写在指令里靠模型自觉,实测里它做不到 —— 加了检测器才发现真有跨页读取。
现在 `build_view(deck, pid)` 的返回值里根本没有别页的东西,不是过滤掉的,是没被取。

**2. 跨页连贯靠 term 图,不靠互相读。**
页 A `establishes` 一个 term,页 B `assumes` 它,harness 把完整定义原样塞进 B 的 view。
于是连贯性变成规划期可静态校验的一张图:悬空引用、前向引用、两页重复定义同一个记号,
三种都在任何 token 花出去之前报错。跨页不一致这个缺陷类因此不需要事后检查。

**3. 视觉决策提到规划层冻结。**
每个 subagent 在独立上下文里重新做一遍配色和字阶的决策,必然发散。`StylePack` 一次定死、
原样进每个 view 的 prefix,这个缺陷类整体消失。

**4. 页数是派生量,schema 里没有入口。**
任何地方都不接受「一共几页」作为输入。有这个入口,模型就会先定页数再往里填内容。
`Deck.total` 是 `len(pages)`,只读。

**5. prefix 逐字节相同,且不含页数。**
实测 14 份 brief 逐字写出来花掉 4:04 墙钟(82 字符/秒),其中绝大部分内容是重复的。
prefix 里绝不能出现页数或页序 —— 拆一次页如果会改动每份 brief 的前缀,缓存和已发出的
任务就全废了。`data-total` 由 harness 写骨架文件时盖章。

**6. 密度做成规划期预算,不做成事后 QA。**
「一页塞太多」在渲染层不可见:模型会预先缩字号把它藏起来,溢出检查照样全绿
(实测 0 个裁切元素,字号中位数 12.5px)。所以 `TextBudget` 在内容分配那一刻就限住,
`FontFloor` 是硬约束。两者共用同一套按文本形态判定的 tier 分类器 —— 不接受页面
自己声明属于哪一级,声明会被绕。

## 刻意不放进去的东西

- **`RenderReport` 不带 verdict。** 一旦无头渲染自带结论,字号地板就从硬约束偷偷变成
  「渲染脚本认为可以」,判定标准散到两个地方去。它只报告。
- **`Computation.method` 允许 `none`,但要写理由。** 纯讲解页是合法的;不写理由的
  `none` 会退化成给预录动画开的后门。
## 传输层和记录层:从 Claude Code 删减,不重新发明

领域层(`schema.py`)不可能从 Claude Code 的 schema 删减出来 —— Claude Code 是刻意
任务无关的,它对「一堂课几页」「第 3 页引入了什么记号」零认知,领域内容在它那里
100% 是 `text` block 里的散文。但**传输和记录这两层应该整个照抄再删**:

- `wire.py` ← 抓包里的请求体。顶层 10 个字段留 7 个,四种 content block 一个不删。
  最值钱的是 **`system[]` 的 cache_control 断点位置** —— Claude Code 已经把「稳定
  前缀 / 可变部分」的边界画好了,那正是 `View.prefix` / `View.body`。
- `trace.py` ← transcript 行。35 个字段留 9 个,**字段名逐字照抄**。

字段名照抄的理由不是省事,是 `lab/timing.py` 和 `lab/audit.py` 一行不改就能审计
我们自己的 harness,并且能把 harness 的运行和 Claude Code 实验轮摆在一起对比。

两者是两份记录,不是一份的两种写法:wire 里**没有任何时间戳**,transcript 里
**没有完整请求体**。先前把它们拍成一个扁平的 `Call`,结果两边都记不全。

领域层挂在 `tool_use` 这个槽位上:`PlanSubmission.model_json_schema()` 就是
`ToolDef.input_schema`,模型填的 `input` 就是实例,验证不过就重来。
所以不是并列两套,是叠的。

## 还没定的

- 规划分不分级(先定大结构再展开到页),以及分级时中间那层要不要进 schema。
- `PageVerdict` 判定 block 之后的重试策略:改重试次数上限,还是改单页时间预算。
- 骨架文件、闸门脚本这些「harness 提供的工具」要不要也进 `Invariant`,
  还是留在文件系统里由约定寻址。
