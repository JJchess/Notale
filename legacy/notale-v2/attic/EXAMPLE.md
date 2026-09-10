# context schema 完整实例 —— 火箭与轨道,90 分钟

由 `core/example.py` 生成。内容是真写的,不是占位符 —— 占位符看不出 schema 哪里不够用。

---

## 1. 领域状态:Deck

- segment 4 个,合计 90 分钟
- **页数 11 —— 派生量**。schema 里没有任何字段能设定它,`Deck.total` 就是 `len(pages)`,只读
- term 9 个
- 真实计算的页 10 / 11,唯一一页 `none` 写了理由

每页一行:

| 页 | 段 | 作用 | 计算 | establishes | assumes | 库 |
|---|---|---|---|---|---|---|
| `page-01` | s1 | hook | iterative | g v | — | — |
| `page-02` | s1 | build | simulation | orbit v_circ | v | — |
| `page-03` | s1 | build | closed_form | dv | v_circ | d3.min.js |
| `page-04` | s2 | build | closed_form | mass_ratio isp | dv | — |
| `page-05` | s2 | practice | search | — | dv mass_ratio isp | matter.min.js gsap.min.js |
| `page-06` | s2 | consolidate | none | — | isp mass_ratio | — |
| `page-07` | s3 | build | simulation | — | orbit | three.min.js globe.gl.min.js |
| `page-08` | s3 | build | iterative | kepler | orbit | d3.min.js |
| `page-09` | s3 | practice | simulation | hohmann | orbit dv kepler | three.min.js |
| `page-10` | s3 | build | iterative | — | orbit g | d3.min.js |
| `page-11` | s4 | consolidate | closed_form | — | dv hohmann orbit | d3.min.js |

一页的完整长相(`page-09`):

```json
{
  "id": "page-09",
  "segment": "s3",
  "role": "practice",
  "takeaway": "换轨道靠的不是推得更用力,是在正确的时刻推。",
  "beats": [
    "你在低轨,想去高轨",
    "点火时刻选错,得到的是一条歪掉的椭圆",
    "两次切向点火,一次抬远地点一次圆化",
    "省下来的 Δv 就是省下来的燃料"
  ],
  "interaction": "操控一艘低轨飞船,自己选点火时刻和推力大小;点早点晚都会得到错误的椭圆,Δv 预算条实时扣减,可以无限重来;成功后叠出最省的那条给你对照",
  "rejected": [
    {
      "form": "给出霍曼转移的两次 Δv 数值让读者验证",
      "why": "验证不产生「时机」这个直觉,而时机是这一页唯一想给的东西"
    },
    {
      "form": "自动演示一次完美转移",
      "why": "看别人做对,学不到为什么别的时刻是错的"
    }
  ],
  "computation": {
    "what": "二体轨道的实时数值积分,脉冲点火后重新求解轨道根数",
    "method": "simulation",
    "lib": "assets/lib/three.min.js",
    "frame_budget_ms": 8.0
  },
  "budget": {
    "body_chars": 380,
    "label_chars": 240,
    "controls": 4
  },
  "libs": [
    "assets/lib/three.min.js"
  ],
  "establishes": [
    "hohmann"
  ],
  "assumes": [
    "orbit",
    "dv",
    "kepler"
  ],
  "avoid": [
    "三维地球(第 7 页已经用过,这里用轨道平面的正视图)"
  ]
}
```

## 2. term 图:隔离条件下唯一的连贯性来源

subagent 之间互相看不见,所以「第 9 页要沿用第 2 页的记号」不能靠去读第 2 页。
改成:第 2 页 `establishes`,第 9 页 `assumes`,harness 把定义原样塞进第 9 页的 view。

```
g            page-01  ──▶  page-10
v            page-01  ──▶  page-02
轨道           page-02  ──▶  page-07, page-08, page-09, page-10, page-11
v_圆          page-02  ──▶  page-03
Δv           page-03  ──▶  page-04, page-05, page-09, page-11
质量比 R        page-04  ──▶  page-05, page-06
比冲 Isp       page-04  ──▶  page-05, page-06
面积速度守恒       page-08  ──▶  page-09
霍曼转移         page-09  ──▶  page-11
```

这张图在规划期静态校验,三种错在任何 token 花出去之前就报出来:
悬空引用、前向引用(assume 了更靠后的页才引入的记号)、两页重复 establish 同一个记号。
最后一种正是跨页不一致的源头,而且没有任何人会读到对方去发现它。

## 3. 规划调用

view:prefix 1139 字符 + body 274 字符

### 3.1 prefix(全套共享,逐字节相同)

```
QUERY: 火箭与轨道 —— 怎么把东西送上太空,并让它待在那儿
这套讲义要撑起 90 分钟的一堂课,读者是学过一点力学、没接触过轨道的高中生。

## 画布
逻辑尺寸 1600 × 900,所有页完全一致,铺满显示、不出现滚动条。
铺满时会被整体缩放,1366 宽的屏上系数约 0.85。字号下限:刻度类不小于 12px,标签图注类不小于 14px,正文不小于 16px,折行文本行高不小于 1.35 倍。
装不下就说装不下,不许压字号、压行高、压间距。

## 视觉(全套共用,不要另起一套)
配色:void #05070A、steel #C9D4E2、burn #FF5E1A、plasma #35E0D8、rule #1B2634
标题字体 Chakra Petch;正文字体 IBM Plex Sans;等宽 IBM Plex Mono
字阶:h1 56px、h2 34px、body 18px、label 15px、tick 13px
间距阶梯:4、8、12、20、32、56
这套讲义的标志性元素:右下角那根 Δv 预算条:从第 3 页起每页都在,花掉多少就少一截,最后一页把它摞完

## 底盘
`assets/base.css` 和 `assets/base.js` 里只有与主题无关的机制:固定画布缩放、canvas 在高分屏下的适配、指针坐标换算、可访问性基线。没有任何配色字体字号。用不用、改不改,自己判断。

## 可用的库(已就位,不需要下载或检查)
- 三维场景、可旋转的立体结构 → `assets/lib/three.min.js` (`THREE`, r160) ⚠ outputColorSpace 时代,不是 outputEncoding
- 三维地球、球面上的点和弧线 → `assets/lib/globe.gl.min.js` (`Globe`, 2.32.0),要在 assets/lib/three.min.js 之后引
- 拖拽、堆叠、碰撞、约束 → `assets/lib/matter.min.js` (`Matter`, 0.20.0)
- 精确控制的矢量图形、坐标轴、数据绑定 → `assets/lib/d3.min.js` (`d3`, 7.9.0)
- 多个动画按一条时间线精确编排 → `assets/lib/gsap.min.js` (`gsap`, 3.12.5)
按上面写的版本写代码,不要去文件里查版本 —— 压缩构建里查不到。

## 已装好的运行时(不需要检查)
node v20.20.2、python3 3.12 + numpy 2.5.1、浏览器 playwright + chromium
```

### 3.2 body

```
先把整套讲义的结构规划出来。

- 分成若干 segment,每个 segment 写清它要让读者获得什么、占多少分钟。
- 每个 segment 拆成若干页。**不要先定页数**:内容装不下就拆,
  页数是拆出来的结果,不是先设的数。
- 每一页要写明:读者带走的那一句、内容拍子、读者具体动手做什么并看到什么变化、
  这一页背后真正在跑的算法是什么、以及你考虑过并否决了哪些其它形式和各自的理由。
- 页与页之间会共享一些记号和约定。把它们登记成 term,写清由哪一页引入、
  哪些页沿用。构建时各页互相看不见,这张表是唯一的对齐手段。
```

### 3.3 删减后的 wire 请求

```json
{
  "model": "claude-opus-5",
  "system": [
    {
      "text": "<36 字符>",
      "cache_control": {
        "type": "ephemeral"
      }
    },
    {
      "text": "<1139 字符>",
      "cache_control": {
        "type": "ephemeral"
      }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "<274 字符>"
        }
      ]
    }
  ],
  "tools": [
    {
      "name": "submit_plan",
      "description": "交出整套讲义的规划。term 图要整体校验,所以一次交完。",
      "input_schema": "<见下>"
    }
  ],
  "max_tokens": 64000,
  "thinking": {
    "type": "adaptive"
  },
  "output_config": {
    "effort": "high"
  },
  "stream": true
}
```

`submit_plan.input_schema` 由 `PlanSubmission.model_json_schema()` 直接得到,6562 字节,顶层:

```json
{
  "type": "object",
  "required": [
    "terms",
    "segments"
  ],
  "properties": {
    "terms": "…",
    "segments": "…"
  },
  "$defs": [
    "Computation",
    "PagePlan",
    "Rejected",
    "Segment",
    "Term",
    "TextBudget"
  ]
}
```

模型不写自由文本,只填 `tool_use.input`;填出来的东西就是 `PlanSubmission` 实例,验证不过就重来。**领域层不是从 Claude Code 的 schema 删减来的,但它挂在 tool_use 这个槽位上。**

## 4. 单页构建调用(`page-09`)

prefix 1139 字符,和规划调用的 prefix **逐字节相同**(`一致`)。
prefix 里不含页数、不含页 id —— 拆一次页如果会改动它,缓存和已派发的任务就全废。

### 4.1 body(这一页拿到的全部内容)

```
## 你负责 `page-09`,只写这一个文件

这一页的作用:practice
读者带走的那一句:换轨道靠的不是推得更用力,是在正确的时刻推。

内容拍子:
- 你在低轨,想去高轨
- 点火时刻选错,得到的是一条歪掉的椭圆
- 两次切向点火,一次抬远地点一次圆化
- 省下来的 Δv 就是省下来的燃料

读者动手做什么:操控一艘低轨飞船,自己选点火时刻和推力大小;点早点晚都会得到错误的椭圆,Δv 预算条实时扣减,可以无限重来;成功后叠出最省的那条给你对照

背后真正在跑的:二体轨道的实时数值积分,脉冲点火后重新求解轨道根数(simulation,用 `assets/lib/three.min.js`)。每帧预算 8ms。这是真算,不是预录动画。

已经否决过的形式,不要再回到这些上面:
- 给出霍曼转移的两次 Δv 数值让读者验证 —— 验证不产生「时机」这个直觉,而时机是这一页唯一想给的东西
- 自动演示一次完美转移 —— 看别人做对,学不到为什么别的时刻是错的

相邻页已经用过的形式,这一页换一种:三维地球(第 7 页已经用过,这里用轨道平面的正视图)

文本上限:正文 380 字,标签图注合计 240 字,可操作控件不超过 4 个。超了说明这一页内容多了,回报给协调方拆页,不要自己压字号塞进去。

## 前面的页已经建立、这一页直接沿用的记号(逐字照用,不要另起写法)
- **轨道**(concept):物体只受引力时走出的闭合路径;这堂课只谈二体,忽略月球和太阳
- **Δv**(notation,单位 m/s):速度增量。火箭的能力和任务的代价都折算成它,这堂课所有的账都用它记
- **面积速度守恒**(concept):连接物体与地心的线段,在相等时间里扫过相等面积

## 这一页负责第一次引入下面这些,后面的页会沿用,写法要立住
- **霍曼转移**(concept):两次切向点火在两个圆轨道之间转移,是最省 Δv 的两脉冲方案

这一页要用的库:`assets/lib/three.min.js`

骨架文件已经建好,`data-page` / `data-total` 已经盖过章,不要改动它们。别的页正被并发写着,不要去读任何 `page-*.html`。
```

### 4.2 隔离是结构性的

```
别的页 id / takeaway 出现在 view 里的:无
总页数 11 出现在 prefix 里:否
assume 的 3 个 term 定义已解析进 body:True
```

不是过滤掉的,是 `build_view(deck, pid)` 根本没有取别页的那条路径。
上一轮那句「不许读别的页面」写在指令里靠模型自觉 —— 实测加了检测器才发现真有跨页读取。

## 5. 闸门与修复

```json
{
  "page": "page-09",
  "findings": [
    {
      "gate": "font-floor",
      "severity": "block",
      "where": "page-09.html:142 .burn-readout",
      "what": "11px,刻度类地板是 12px",
      "fix_hint": "改 13px;字阶里 tick 就是 13"
    },
    {
      "gate": "mechanism",
      "severity": "block",
      "where": "page-09.html 全文",
      "what": "没有 prefers-reduced-motion 分支,轨道动画无法停",
      "fix_hint": "base.js 的 Deck.loop 已经处理了,直接用它替掉自建的 requestAnimationFrame"
    },
    {
      "gate": "dead-code",
      "severity": "warn",
      "where": "page-09.html:301",
      "what": "hohmannPreview() 定义了没被调用",
      "fix_hint": null
    }
  ],
  "render": {
    "js_errors": [],
    "failed_resources": [],
    "escaped": [],
    "clipped": [
      ".hint-row 被 overflow:hidden 裁掉 8px"
    ],
    "font_min": 11.0,
    "font_median": 15.0,
    "shot": "shots/page-09.png"
  },
  "attempt": 1
}
```

`blocked = True`(有 block 级 finding)。注意 `RenderReport` 里**没有 verdict 字段** —— 一旦无头渲染自带结论,字号地板就从硬约束偷偷变成「渲染脚本认为可以」,判定标准散到两个地方去。它只报告。

修复调用复用同一个 prefix,body 只在末尾追加这一页自己的结论:

```
## 这一页没过闸,下面每条都要修掉

- [font-floor] page-09.html:142 .burn-readout:11px,刻度类地板是 12px
  怎么改:改 13px;字阶里 tick 就是 13
- [mechanism] page-09.html 全文:没有 prefers-reduced-motion 分支,轨道动画无法停
  怎么改:base.js 的 Deck.loop 已经处理了,直接用它替掉自建的 requestAnimationFrame
- [dead-code] page-09.html:301:hohmannPreview() 定义了没被调用

只改这些,别顺手重做其它部分。
```

prefix 仍然逐字节相同(`True`),所以返工不重新付前缀的钱。
给的是定位到行的确定性结论,不是「再检查一下」—— 实测返工吃掉 12:08,大头是模型拿到模糊反馈后自己重新找问题。

## 6. 记录层:从 Claude Code 的 transcript 删减

nn-03 的 346 行里出现过 35 个字段,留 9 个。**字段名逐字照抄**,
`lab/timing.py` 和 `lab/audit.py` 一行不改就能审计我们自己的 harness。

```json
[
  {
    "uuid": "a1",
    "sessionId": "7e7a7a6a-57c8-488e-ac7b-6339d5182610",
    "isSidechain": false,
    "timestamp": "2026-08-15T02:10:00.000Z",
    "type": "assistant",
    "requestId": "req_A",
    "message": {
      "role": "assistant",
      "content": [
        {
          "type": "thinking"
        }
      ],
      "usage": {
        "input_tokens": 18402,
        "output_tokens": 2
      }
    }
  },
  {
    "uuid": "a2",
    "parentUuid": "a1",
    "sessionId": "7e7a7a6a-57c8-488e-ac7b-6339d5182610",
    "isSidechain": false,
    "timestamp": "2026-08-15T02:10:41.300Z",
    "type": "assistant",
    "requestId": "req_A",
    "message": {
      "role": "assistant",
      "content": [
        {
          "type": "tool_use",
          "name": "Agent",
          "id": "tu_09"
        }
      ],
      "usage": {
        "input_tokens": 18402,
        "output_tokens": 3117,
        "cache_read_input_tokens": 17960
      }
    }
  }
]
```

三条合并规则写成了代码,因为这三个坑都踩过:

```
按 requestId 分组 → 2 次响应,而不是 6 行
  (按行数判断并行度会得出「其实是串行的」这种错误结论)
  req_A: 3 行,取首行 usage = 2 tok,正确值 = 5904 tok,cache_read = 17960
  req_B: 2 行,取首行 usage = 2 tok,正确值 = 41220 tok,cache_read = 9600
  (只有一组里最后一行的 usage 是完整的,前面带占位值 output_tokens:2)

派发 2026-08-15T02:10:41.300Z   ← 父 agent 写完这个 tool_use block 的时刻
完成 2026-08-15T02:24:47.900Z   ← 只能从 isSidechain 的行取
  (父 agent 那条 tool_result 的时间戳也是派发语义 —— 02:11:22.9,
   拿它当完成时刻会算出 0:00,真实耗时是 13:26)

同一条消息里的两个 Agent 派发时刻:02:10:41.3 与 02:11:22.8,差 41.5 秒
  (block 是边流式输出边派发的,不是同时起跑;实测 14 个 brief 拉开 6:24)
```

## 7. wire 请求删了什么

| Claude Code 顶层字段 | 我们 | 理由 |
|---|---|---|
| model / messages / system / tools / max_tokens / stream | 留 | API 面 |
| thinking | 留 | `{type: adaptive}` |
| output_config | 留 | `effort` 按调用类型给:规划 high,构建 medium |
| metadata | ✂ | device_id + account_uuid,CLI 的计费归属 |
| context_management | ✂ | `clear_thinking` 是给长对话省 token 的;构建调用一次性,留着只会掩盖真实 token 曲线 |
| system[0] billing header | ✂ | `x-anthropic-billing-header: cc_version=…` |

四种 content block(`text` / `thinking`+signature / `tool_use` / `tool_result`)一个不删。

`system` 保留成 list 而不是压成一个字符串,唯一目的是保住 **cache 断点的位置**:
Claude Code 把断点打在稳定前缀之后,可变部分留在断点之后 —— 这就是 View 的 prefix / body 划分,
边界不用我们自己试。
