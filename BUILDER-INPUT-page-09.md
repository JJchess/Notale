## 一 · system 指令

每一次调用都重发。由 `IDENTITY` + 反 slop 块 + 指派 workflow 三段拼成（设计哲学默认不注入）。

```
你是这套互动讲义的单页构建 agent。你只负责一个 HTML 文件。

按 brief 说的做:先读契约和规划,再施工,完工前用 Check 自检到干净为止。
不写说明文档、不写测试、不写总结。做完直接结束,不要问问题。

施工分两段,工具面会跟着变,不必自己记:
1. **一次 `Write` 落成整页。** 读完契约、规划和 workflow 之后,把整页一次写出来。
   这一段里只有 `Write` 能改页面 —— 没有 `Patch` 和 `Edit`,不要试图用增量方式起页。
2. **此后只增量改。** `Write` 从工具面消失,改用 `Patch`(一次改好几处,首选)或 `Edit`。
   对着 `Check` 报的问题逐条改,不要重写整页 —— 重写会连已经改对的地方一起冲掉。

<anti_ai_slop_copy>
# 中文禁用短语表(讲义场景裁剪版)

> 来源:`shuorenhua`(MrGeDiao/shuorenhua)的中文禁用短语表,按"哪些语域会出现在教学讲义画面文字上"筛选、部分打磨。原表按聊天/README/营销文案分类,这份只保留会出现在 kicker、主标题、收束句、下一问、内容表说明句上的类别。

命中判断看动作,不看字面:换一套字继续做同一件事(同样的铺垫、同样的拔高、同样的假装引用)仍然算命中。反过来,表里的词在当前句子里承担实义(如技术术语、正式功能名)时放行。

## 两步法

1. **先锁定事实**:这句话里哪些是数字、条件、因果关系、责任归属(谁做的/谁发现的)、否定和边界——这些是教学内容的骨架,改写时必须保留,不能连同套话一起删掉。
2. **再删修辞动作**:开场铺垫、无依据的程度词、过渡废话、假装有出处的引用、"真正的X不是……而是……"式的价值拔高骨架。删完之后句子应该更短、更具体,不应该丢失第 1 步锁定的事实。

常见位置:`## 照这个写`表(kicker/主标题/收束句/下一问)、内容填充表的说明文字、generalization 型页面的结论句(`.claim`/`.trunk` 结构下的收束句最容易用过渡废话硬接结论)。

## 开场套话(改写页面正文时全部删除或直接切入)

值得注意的是 / 值得一提的是 / 需要指出的是 / 不可否认的是 / 不难发现 / 不容忽视 / 众所周知 / 让我们一起来看看 / 接下来我将为你 / 在当今(时代/社会/环境下)/ 在当今社会 / 随着……的不断发展 / 在这个……的时代 / 不得不说 / 诚然 / 深入探讨 / 具体来说 / 更重要的是

→ 统一处理方式:删掉,直接说结论或直接进入内容。

## 过渡废话(结论句、收束句最容易犯)

综上所述 / 总而言之 / 总的来说 / 总体来看 / 由此可见 / 换句话说 / 简而言之 / 归根结底 / 不言而喻 / 可以说 / 某种程度上 / 从某种意义上说 / 在此过程中 / 在这个过程中 / 本质上 / 核心在于 / 关键在于 / 由此可以看出

→ 统一处理方式:删掉或直接给结论,不用连接词铺垫。

## 洞见感 / 价值拔高骨架(收束句、下一问高发)

- 真正的 X 不是……而是…… → 直接说真正成立的判断
- 这不仅仅是……更是…… → 删掉拔高层,保留事实判断
- 最后比拼的是…… → 直接说真正决定因素是什么

## 无源引用(内容表说明句、数字口径相关句子)

研究表明…… → 给出具体研究名称或删掉
数据显示…… → 给出具体数据来源或直接给数据
有专家指出…… → 说清楚哪个专家
据报道…… → 给出具体媒体和时间

对应 `prompts/spec.md` 已有规则:"有来源时同时给完整来源,页面短标法"——这条是补上反面:没有具体来源就不能写得像有依据。

## 翻译腔(中文说明句的通病)

- "一个……的……的……" 长定语结构 → 拆成短句
- 被动语态堆砌("被优化""被改进""被赋予")→ 用主动句
- "基于……" 开头 → 看能否直接说
- "通过……来……" → 看能否简化
- "对于……而言" → 看能否删掉
- "在……方面" → 看能否删掉

翻译腔句子普遍偏长,删掉翻译腔同时也在帮画面占用密度(build-page 要求的 45%–85% 区间)保持克制——翻译腔是文字过长挤占空间的常见成因。

## 控件标签 / 实时读数(补充,不是另立指标)

8–14 个词(中文约 12–20 字),信息前置,不为了完整语法牺牲第一眼可读性。边界值/错误提示写清楚三件事:发生了什么、为什么、下一步怎么做——不要只写"数值超出范围"这类空话。

## 打磨类:程度词必须落地(不是逐词禁用,是加一条约束)

至关重要 / 前所未有 / 意义非凡 / 令人瞩目 / 深远的(影响/意义)——这些词本身不禁用,但出现时必须紧跟一个可验证的具体说法(数字、对比、机制)。接不上具体说法就删词或换成数字。

例:"这个发现意义深远" → 删除,改成"这个发现把测年误差从 ±5 万年缩小到 ±3000 年"(具体说清楚"深远"在哪)。

## 打磨类:抽象名词不得代替具体机制

赋能 / 抓手 / 闭环 / 颗粒度 / 底层逻辑 / 顶层设计——原表是互联网黑话,教学讲义几乎不会直接出现这些词,但会出现同构问题:用"机制""体系""逻辑""路径"这类抽象名词,回避说清楚"谁对谁做了什么"。

能具体说清楚因果链条时,不要用抽象名词代替。

## 明确不收(语域对不上,遇到不要套用)

工程师调试腔(稳稳兜住/砍一刀/根因/收口)、庸医问诊腔(抠出来/揪出来)、暴力动作腔(补一刀/狠狠干)、自媒体腔(保姆级/干货/一文读懂/建议收藏)、正能量收尾模板(未来可期/让我们拭目以待)、谄媚元评论(好问题!/希望这对你有帮助)、AI 主动出击腔(我立马开始/要不要我)、过度接住心理判断腔(稳稳接住你/你太清醒了)、郑重预告身份认证式夸奖(你问到了问题的核心)。

这些全部是聊天助手回复或营销文案的语域,不会出现在教学讲义画面文字上,套用反而可能误改正常表述。
</anti_ai_slop_copy>

<anti_ai_slop_visual>
# 视觉禁用清单(讲义场景裁剪版)

> 来源:`Nutlope/hallmark`(slop-test.md / anti-patterns.md)、`pbakaus/impeccable`(craft-floor.md)。原表大量是落地页专属门禁(nav/footer 指纹、hero 折叠线、CTA、定价表、见证墙、SEO/LCP)——固定 1600×900 不滚动的教学画布不存在这些容器,已全部剔除。这里只留下容器无关、真正的装饰/构图通病,以及经打磨后适配 notale-v2 页面契约的条目。

这份清单管的是**具体、可判断的形状**,不是"要有品味"这种原则性要求。检查方式是渲染后逐条比对,不是设计前默念清单。`plan-direction`/`check-page` 已经禁止 generic 深色渐变背景、purple-glow、glass-card、card-grid 默认项,这份清单是**补空缺**,不是重复劳动。命中判断同样看形状而非孤立元素:一个元素单独出现通常正常,遇到下面点名的具体组合才是问题。

## 检查顺序

1. 先看第一屏/整页截图有没有落进下面某个具体形状(渐变文字、三列图标网格、侧边条、悬挂式表头、假 UI 边框、装饰性图表)。
2. 再核对内容表和数字口径:画面上出现的每一个数字是否都能在 `plan.md §3 数字口径`或页面 spec 的内容表里找到出处。找不到出处的数字视为编造,必须删除或改成占位符,不能为了填充布局编数字。
3. 最后看 kicker 与标题的关系:两者必须同一栏堆叠(上下排列),不得分成同一行的左右两栏。

**1. 标题渐变填色**(`background-clip:text` 或等价渐变文字效果)
现有禁令只管渐变背景,不管渐变标题文字。强调用字重或字号,不用渐变。

**2. 图标+标题+正文的同尺寸三列网格**
notale 页表里"三条支撑/四个属性"这类内容,最容易默认长成这个形状。用 `theme.md` 的知识骨架原语(`.k-comparison`/`.k-classification`)表达关系,不要退化成三个等宽卡片。

**3. 卡片/callout 上的粗色侧边条**(`border-left`/`border-right` 超过 1px 的纯色描边)
用整圈细描边、无描边,或标题旁的小色块代替。

**4. 大标题斜体冒充编辑排版**(`font-style: italic` 用在 h1–h6 或页面主标题上)
标题保持正体;需要强调时用字重、强调色或下划线,斜体只用于正文中的强调词。

**5. 无语义锚点的漂浮光斑/极光装饰**
装饰性形状必须能说出它在图解什么;说不出就删掉。

**6. emoji 顶替图标系统**(✨🚀⚡🔥🎯✅ 当功能图标使用)
用统一线宽/风格的图标库或自绘 SVG,不用 emoji 凑图标。

**7. 一页混用不同图标库或线宽**
一页只用一套图标语言。

**8. 虚构/编造数字(优先级最高)**
画面上每一个数字都必须能在 `plan.md §3 数字口径`或该页 spec 的内容表中找到出处。`plan.md §3` 已经要求列出全套关键数值和来源——这条是补上反面:agent 不得为了填充布局或让图表"看起来有内容"自己编一个演示数字。找不到出处就删除该数字或用占位符注明"待补"。

**9. 手绘假浏览器/手机/IDE 边框包真实截图**
需要展示界面截图或仪器画面时,直接用真实截图配 `.cvbox`(定位、圆角、裁切),不要用 HTML/CSS/SVG 画一个假的浏览器地址栏、手机边框或代码编辑器窗口。

**10. sparkline/进度环/圆角方块充当"内容"而非真数据**
教学页的图表必须来自真实计算结果(`Lec.P`)或数据表,不能用装饰性的迷你图形冒充数据存在。

**11. kicker 与标题不得同行两栏**
原禁令(hallmark/impeccable)把 kicker/eyebrow 整体列为禁用项("no brief earns it back")。但 `prompts/spec.md` 要求每页必须有 kicker 字段,不能连同 kicker 本身一起禁掉。**本仓库只禁具体形状**:kicker 和标题分成同一行的左右两栏(悬挂式表头)。kicker 必须堆叠在标题正上方或正下方、同一栏。

## 明确不适用(容器/语域不对,或与现有机制冲突)

- nav/footer 指纹、hero 折叠线、CTA 换行、定价表、见证墙、SEO/LCP、移动断点门禁——讲义页没有导航栏、页脚、定价、CTA,不存在响应式断点。
- 章节编号 01/02/03 作装饰——notale 页表的"幕"编号是真实序数,不是装饰,不适用此条。
- Specimen 宏观结构反复复用——这是 hallmark 自己多轮生成之间"每次都长成同一个模板"的问题,不是单页设计问题。
- 对比度、间距节奏、字阶、tabular-nums 等机械检查——字号地板已在每页强制生效的 CONTRACT.md 里,`vendor/chassis/selfcheck.py` 覆盖密度/溢出检测,`theme.md` 里 `.num` 的 tabular-nums 是硬性要求,不重复检查。
- 讲义特有的"侧边条/描边冲突"的像素级检测逻辑(Impeccable `checks.mjs` 的具体阈值)——那是检测器代码,不是提示词内容,这份清单只管提示词层面的判断,不搬检测器逻辑。
</anti_ai_slop_visual>

本页只装载下面一个 workflow。先用 Skill 工具读取它，再严格执行 SKILL.md 顶部的 Reference routing：所有基础必读项和已选分支项，都要在任何页面修改前用 `Read` 读取，包括 `Write`、`Edit`、`Patch` 或会改文件的 `Bash`；不要读取未选分支或无关 reference。scripts 只在 workflow 明确要求时使用。

- build-interaction: Design and implement one bounded, reusable learning interaction inside an assigned Notale lecture page. Use when the learner must manipulate, test, compare, trace, or run something to understand the page claim; the workflow owns the widget's state, controls, visual evidence, feedback, accessibility, and lifecycle, while the page specification and shared theme continue to own the surrounding page. Do not use for decorative motion alone, a conventional chart whose encoding is the main problem, a physical/game simulation with its own specialist workflow, or an entirely static composition.
```

## 二 · 首条 user 消息（brief）

**它是一份指针清单** —— 九成内容是「去读哪几个文件」，真正的内容在下面第三节。

```
你负责构建互动讲义《神经网络是怎么学会的：从一个神经元到反向传播》中的一页：`page-09.html`。

工作目录是 `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/sonnet-full-20260827/pages/assets/..`，所有命令都在这里执行。

开工前按顺序完整阅读：

1. `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/sonnet-full-20260827/pages/assets/CHASSIS.md`：`base.css`、`base.js`、`theme.css`、`lec.js` 的公开接口。
2. `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/sonnet-full-20260827/CONTRACT.md`：全套 18 页共享的版面、视觉、交互和技术契约。
3. `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/sonnet-full-20260827/pages/plan/p09.md`：本页的内容、结构、文字、数据、交互和边界。

仅在需要确认库版本时读 `/data1/home/zhuyifan/ws2/Notale/notale-v2/runs/sonnet-full-20260827/pages/assets/lib/LIBS.md`。
不要读取其他 `page-*.html`、`PLAN.md`，也不要打开 `assets/` 下 CSS、JS 或库文件的实现源码。

## 主工作流
  - build-interaction

把现有空骨架改成完整页面。保留 `#stage`、`data-page` 和 `data-total`，不要修改 `assets/`，
也不要新建其他文件。本页预计停留 90 秒，内容量应与此相称。

完成前用 `Check` 检查 `page-09.html` 的真实渲染，反复改到不再报 ✗ 为止。
有交互时覆盖每个主要状态；只检查初始状态不算完成。不要另写 Playwright 脚本。

最终只交付 `page-09.html`。回复一行：本页做了什么；最后一次页面检查的结果。
```

## 三 · 空骨架（施工起点）

`page-09.html` 一开始长这样，builder 要把它改成完整一页：

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="assets/theme.css">
  <style>
    #stage{ display:flex; }
    .p09{
      display:flex; flex-direction:column;
      width:100%; height:100%; gap:10px;
      min-width:0; min-height:0;
    }

    /* ---- header ---- */
    .p09-head{
      display:flex; justify-content:space-between; align-items:flex-start;
      gap:28px; flex:0 0 auto;
    }
    .p09-kicker{
      font:600 13px var(--font-sans); letter-spacing:.12em;
      color:var(--accent); text-transform:uppercase; margin:0 0 6px;
    }
    .p09-title{
      margin:0; font:700 34px/1.25 var(--font-serif);
      color:var(--text); max-width:900px;
    }
    .p09-sub{
      margin:8px 0 0; font:17px/1.55 var(--font-sans); color:var(--muted); max-width:1000px;
    }
    .p09-sub .num{ color:var(--ink); font-family:var(--font-mono); }
    .p09-rail{ display:flex; flex-direction:column; align-items:flex-end; gap:10px; flex:0 0 auto; }
    .p09-summary{
      margin:0; font:19px/1.4 var(--font-sans); color:var(--muted);
      font-variant-numeric:tabular-nums;
    }
    .p09-summary .num{ color:var(--ink); font-family:var(--font-mono); font-weight:600; }

    /* ---- process ledger ---- */
    .p09-body{ flex:1; min-height:0; display:flex; width:100%; }
    .p09-process{
      flex:1; min-height:0; width:100%; display:flex; flex-direction:column;
      justify-content:space-between;
    }
    .p09-step{ display:flex; align-items:stretch; gap:16px; flex:1 1 auto; min-height:0; width:100%; padding:10px 0; }
    .p09-arw{ display:flex; align-items:center; gap:10px; flex:0 0 auto; padding-left:23px; height:16px; }
    .p09-arw-mark{ color:var(--line); font-size:14px; line-height:1; transition:color .25s; white-space:nowrap; }
    .p09-arw-line{ flex:1; height:1px; background:var(--line); }
    .p09-step.is-filled + .p09-arw .p09-arw-mark,
    .p09-arw.is-active .p09-arw-mark{ color:var(--muted); }

    .p09-axis{
      flex:0 0 44px; width:44px; align-self:center; height:44px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font:17px var(--font-mono); color:var(--muted);
      border:1px solid var(--line); background:var(--bg);
      transition:color .25s, border-color .25s, background .25s;
    }
    .p09-step.is-filled .p09-axis{
      color:var(--paper); background:var(--ink); border-color:var(--ink);
    }

    .p09-panel{ flex:1; min-width:0; width:100%; height:100%; display:flex; align-items:center; gap:30px; padding:0 30px; }
    .p09-panel.q{ color:var(--muted); }
    .p09-tag{ flex:0 0 auto; }
    .p09-fields{ flex:1; min-width:0; display:flex; align-items:center; gap:0; }
    .p09-field{ position:relative; display:flex; flex-direction:column; gap:4px; flex:1 1 25%; min-width:0; }
    .p09-fv{ font-size:20px; }
    .p09-fv .num{ font-size:22px; font-weight:600; }
    .p09-field .p09-fv{ display:flex; align-items:baseline; gap:10px; }
    .p09-field .hint{ flex:0 0 auto; }
    .p09-field .big{ line-height:1; }
    .p09-bias{ color:var(--muted); }
    .p09-bias .num{ color:var(--ink); font-weight:600; }

    .p09-dir{
      position:absolute; top:-3px; right:6px; font-size:14px; line-height:1;
      color:var(--accent); font-weight:700;
    }
    .p09-note{ font:14px var(--font-sans); color:var(--muted); letter-spacing:.01em; }

    .p09-loss-field{ overflow:visible; }
    .p09-shadow{
      position:absolute; inset:-8px -12px -12px -12px; border-radius:10px;
      box-shadow:var(--good-shadow); opacity:0; pointer-events:none;
      transition:opacity .35s ease; z-index:-1;
    }

    .p09-grad-field .num{ color:var(--accent); font-weight:600; }
    .p09-out-field .num{ color:var(--ink); }

    .p09-empty-txt{ font:19px var(--font-sans); color:var(--muted); flex:1; text-align:left; }

    /* ---- controls ---- */
    .p09-btns{ display:flex; gap:10px; }
    .p09-btns .btn{ min-height:38px; padding:0 18px; font-size:15px; }

    /* ---- footer ---- */
    .p09-foot{
      flex:0 0 auto; border-top:1px solid var(--line); padding-top:14px;
      display:flex; flex-direction:column; gap:6px;
    }
    .p09-close{ margin:0; font:22px/1.4 var(--font-sans); color:var(--text); font-weight:600; }
    .p09-next{ margin:0; font:18px/1.4 var(--font-sans); color:var(--muted); }

    @media (prefers-reduced-motion:no-preference){
      .p09-step.just-filled .p09-panel{ animation:p09-flash .5s ease; }
    }
    @keyframes p09-flash{
      0%{ box-shadow:0 0 0 2px var(--accent); }
      100%{ box-shadow:0 0 0 0 transparent; }
    }
  </style>
</head>
<body data-page="09" data-total="18">
  <div id="stage">
    <div class="p09" data-p09>
      <div class="p09-head">
        <div>
          <p class="p09-kicker">KEEP-GOING</p>
          <h1 class="p09-title">算方向、挪一步，重复几次，误差一路降下来</h1>
          <p class="p09-sub">输入 <span class="num">(1,1)</span> 目标 <span class="num">1</span>，权重从 <span class="num">0.10 / 0.10</span> 出发，每步用上一步的新权重继续往下挪，学习率固定 <span class="num">0.1</span>。</p>
        </div>
        <div class="p09-rail">
          <p class="p09-summary" data-summary aria-live="polite">第 <span class="num">1</span> 次尝试 · 当前损失 <span class="num">0.0000</span></p>
          <div class="p09-btns">
            <button type="button" class="btn" data-step-btn>下一步</button>
            <button type="button" class="btn" data-play-btn>连续播放</button>
            <button type="button" class="btn" data-reset-btn>重来</button>
          </div>
        </div>
      </div>

      <div class="p09-body">
        <div class="k-process p09-process" data-process></div>
      </div>

      <div class="p09-foot">
        <p class="p09-close">不是一步到位，是同一个动作做了很多次，误差才慢慢趴下去。</p>
        <p class="p09-next">一个神经元能学会这些，但它能画出的边界，够用吗？</p>
      </div>
    </div>
  </div>
  <script src="assets/base.js"></script>
  <script src="assets/lec.js"></script>
  <script>
    (function(){
      var MAX_STEPS = 10;
      var root = document.querySelector('[data-p09]');
      var processEl = root.querySelector('[data-process]');
      var summaryEl = root.querySelector('[data-summary]');
      var stepBtn = root.querySelector('[data-step-btn]');
      var playBtn = root.querySelector('[data-play-btn]');
      var resetBtn = root.querySelector('[data-reset-btn]');

      var stepNodes = [];
      var arrowNodes = [];
      var history = [];
      var cur = null;
      var loss1 = null;
      var playing = false;
      var timer = null;

      function initialWeights(){ return { weights:[0.1,0.1], bias:0 }; }

      function fmt(v,d){ return v.toFixed(d); }
      function fmtSigned(v,d){ return (v>=0?'+':'') + v.toFixed(d); }

      function buildSlots(){
        processEl.innerHTML = '';
        stepNodes = [];
        arrowNodes = [];
        for (var i=0;i<MAX_STEPS;i++){
          var step = document.createElement('div');
          step.className = 'p09-step';
          step.innerHTML =
            '<div class="p09-axis">'+(i+1)+'</div>' +
            '<div class="panel q p09-panel"><span class="tag">第 '+(i+1)+' 次</span><span class="p09-empty-txt">权重、输出 a、损失、梯度∇w 均待推进——用上一行算出的新权重 w = w + ∇w × 学习率接着往下挪，点击右上角“下一步”或“连续播放”把这一行的四个数字填出来</span></div>';
          processEl.appendChild(step);
          stepNodes.push(step);
          if (i < MAX_STEPS-1){
            var arw = document.createElement('div');
            arw.className = 'p09-arw';
            arw.innerHTML = '<span class="p09-arw-line"></span><span class="p09-arw-mark">▾ 挪一步 · w = w + ∇w × 学习率</span><span class="p09-arw-line"></span>';
            processEl.appendChild(arw);
            arrowNodes.push(arw);
          }
        }
      }

      function fillStep(idx, rec, animate){
        var step = stepNodes[idx];
        step.classList.add('is-filled');
        var ratio = loss1 ? Math.max(0, Math.min(1, 1 - (rec.loss / loss1))) : 0;
        var dirUp = rec.newWeights[0] >= rec.weights[0];
        var panel = document.createElement('div');
        panel.className = 'panel p09-panel';
        panel.innerHTML =
          '<span class="tag p09-tag">第 '+rec.n+' 次</span>' +
          '<div class="p09-fields">' +
            '<div class="p09-field p09-weight-field">' +
              '<span class="p09-fv num">权重 '+fmt(rec.weights[0],2)+' '+fmt(rec.weights[1],2)+' b'+fmt(rec.bias,2)+(dirUp ? ' ▲' : ' ▼')+'</span>' +
            '</div>' +
            '<div class="p09-field p09-out-field">' +
              '<span class="p09-fv num">输出a '+fmt(rec.a,3)+'</span>' +
            '</div>' +
            '<div class="p09-field p09-loss-field">' +
              '<span class="p09-fv num">损失 '+fmt(rec.loss,4)+'</span>' +
              '<div class="p09-shadow" style="opacity:'+ratio+'"></div>' +
            '</div>' +
            '<div class="p09-field p09-grad-field">' +
              '<span class="p09-fv num">∇w '+fmtSigned(rec.gradW[0],3)+'</span>' +
            '</div>' +
          '</div>';
        var old = step.querySelector('.panel');
        step.replaceChild(panel, old);
        if (animate) step.classList.add('just-filled');
      }

      function markArrowActive(i){
        if (arrowNodes[i]) arrowNodes[i].classList.add('is-active');
      }

      function computeNext(){
        var inputs = Lec.K.LOGIC_INPUTS[3];
        var target = Lec.K.AND_TARGETS[3];
        var lr = Lec.K.LR_DEFAULT;
        var r = Lec.P.neuronGradientStep(inputs, target, cur.weights, cur.bias, 'sigmoid', lr);
        var rec = {
          n: history.length + 1,
          weights: cur.weights, bias: cur.bias,
          z:r.z, a:r.a, loss:r.loss, gradW:r.gradW, gradB:r.gradB,
          newWeights:r.newWeights, newBias:r.newBias
        };
        history.push(rec);
        cur = { weights: r.newWeights, bias: r.newBias };
        if (history.length === 1) loss1 = rec.loss;
        return rec;
      }

      function updateSummary(){
        var last = history[history.length-1];
        summaryEl.innerHTML = '第 <span class="num">'+last.n+'</span> 次尝试 · 当前损失 <span class="num">'+fmt(last.loss,4)+'</span>';
      }

      function updateButtons(){
        var atMax = history.length >= MAX_STEPS;
        stepBtn.disabled = atMax;
        playBtn.disabled = atMax;
        stepBtn.textContent = atMax ? '已到第10次尝试' : '下一步';
        if (!atMax) playBtn.textContent = playing ? '暂停' : '连续播放';
      }

      function doStep(fromAutoplay){
        if (history.length >= MAX_STEPS) { stopPlay(); return; }
        var rec = computeNext();
        fillStep(rec.n - 1, rec, true);
        markArrowActive(rec.n - 2);
        updateSummary();
        updateButtons();
        if (history.length >= MAX_STEPS) stopPlay();
      }

      function startPlay(){
        if (playing || history.length >= MAX_STEPS) return;
        playing = true;
        updateButtons();
        timer = window.setInterval(function(){ doStep(true); }, 600);
      }

      function stopPlay(){
        playing = false;
        if (timer){ window.clearInterval(timer); timer = null; }
        updateButtons();
      }

      function resetAll(){
        stopPlay();
        history = [];
        loss1 = null;
        cur = initialWeights();
        buildSlots();
        var rec = computeNext();
        fillStep(0, rec, false);
        updateSummary();
        updateButtons();
      }

      stepBtn.addEventListener('click', function(){ stopPlay(); doStep(false); });
      playBtn.addEventListener('click', function(){ if (playing) stopPlay(); else startPlay(); });
      resetBtn.addEventListener('click', resetAll);

      // initial informative state: slots built, step 1 already computed and shown
      cur = initialWeights();
      buildSlots();
      var first = computeNext();
      fillStep(0, first, false);
      updateSummary();
      updateButtons();
    })();
  </script>
</body>
</html>
```

---

## 四 · brief 指到的文件（原文）

这些不是 prompt，是 builder 用 `Read` 自己拉进上下文的。**要在别处复跑就必须一起给**，否则对照的不是同一件事。

### `assets/CHASSIS.md`（4,945 字符）

````
# CHASSIS.md —— 底盘接口速查

`base.css` 和 `base.js` 的**全部对外接口都在这一页里**。要用底盘，读这一页就够了，
不需要打开那两个源文件（合起来 400 行）。只有在你打算**改写或替换**底盘时才去读源码，
那时源码里每一条旁边都写了它各自解决什么问题。

底盘里只有和主题无关的机制：固定画布的整体缩放、canvas 在高分屏和缩放下的适配、
指针坐标换算、几个不写就一定出 bug 的布局细节、可访问性地板。
**没有任何配色、字体、字号、间距或组件外观** —— 那些是每次生成自己的设计。

---

## base.css

引入方式：`<link rel="stylesheet" href="assets/base.css">`，放在你自己的样式之前。

### 必须由你给出的三个 token（底盘不给默认值，缺了页面会明显不对）

```css
:root{
  --bg:        #0b0e14;      /* 页面底色 */
  --text:      #e6e6e6;      /* 默认文字色 */
  --font-sans: "Noto Sans SC", system-ui, sans-serif;
}
```

底盘另外会读 `--stage-w` / `--stage-h`（画布逻辑尺寸，默认 1600 / 900）和
`--focus`（焦点圈颜色）。缩放比由底盘算出后写回 `:root` 的 `--s`，CSS 里可以直接用。

### 结构

页面里要有 `#stage`，它就是那块 1600×900 的逻辑画布；引入 base.css + base.js 之后
缩放自动生效，不需要你写任何缩放代码。

### 四个工具类（这是 base.css 提供的全部类）

| 类 | 作用 | 什么时候必须加 |
|---|---|---|
| `.min0` | `min-width:0; min-height:0` | **任何 grid/flex 分栏的子项。** 子项默认不许缩到比内容小，一段长文本或一个宽 canvas 会把整列顶开、被裁掉，表现为「右边内容莫名其妙没了」 |
| `.cv-fill` | `position:absolute; inset:0; width:100%; height:100%` | 铺满父容器的 `<canvas>`。canvas 是替换元素，有 300×150 的默认尺寸，只写 `inset:0` 拉不开它 |
| `.no-pan` | 关掉触摸平移 | 需要拖动的交互区 |
| `.sr-only` | 只给读屏软件 | 图形的文字替代 |

---

## base.js

引入方式：`<script src="assets/base.js"></script>`。全局对象 `Deck`。
页面里只要有 `#stage`，引入即开始工作（缩放监听在文件末尾自动装好）。

### 尺寸与缩放

```
Deck.W / Deck.H          逻辑画布尺寸(读自 --stage-w / --stage-h)
Deck.s                   当前缩放比(同 :root 上的 --s)
Deck.onResize(fn)        注册尺寸变化回调,返回注销函数
Deck.init(cfg)           可选,只做键盘翻页和 document.title,不生成任何外观
```

```js
Deck.init({ index:3, total:14 });                 // 通常只需要这一行
Deck.init({ index:3, total:14, keys:false });     // 不要键盘翻页
Deck.init({ index:3, total:14, href:n => 'p'+n+'.html' });
```

### canvas 与指针

```
Deck.fit(cv)             高分屏适配,返回已 setTransform 的 2d ctx
Deck.autofit(cv, draw)   fit + 首次绘制 + 缩放变化时自动重新 fit 并重绘
Deck.pt(el, e)           指针事件 → 逻辑坐标 {x,y}(缩放/触摸/触摸结束都兼容)
```

`Deck.pt` 是必须用的：外层有 `transform: scale()` 时 `e.offsetX` 是错的。
它靠 `r.width / el.offsetWidth` 反推，**嵌套缩放也对，但元素被 rotate 之后不适用**。

### 从 CSS 读颜色（canvas 里写不了 `var()`）

```
Deck.token(name)         读成原始字符串
Deck.rgb(name)           读成 [r,g,b]
Deck.rgba(name, a)       读成 'rgba(r,g,b,a)'
```

### 动画

```
Deck.reduced()           系统是否要求减少动态
Deck.loop(fn[,opt])      rAF 循环,返回 stop()
```

`Deck.loop` 两个已经处理掉的坑：reduced-motion 下不进循环，只画一帧
`fn(opt.still||0, 0)` —— 起始帧没信息的动画要用 `opt.still` 指定定格在哪一刻；
标签页隐藏时自动暂停，回来不会有 dt 跳变。

### 小工具

```
Deck.clamp / Deck.lerp / Deck.fmt
Deck.rr(ctx,x,y,w,h,r)              圆角矩形路径(有原生 roundRect 就用原生)
Deck.arrow(ctx,x1,y1,x2,y2,size)    带箭头的线段
```

---

## 底盘不做的事

顶栏、导航、进度指示、阶段与时间线、面板、按钮、滑块、卡片、标签、图例、要点列表、
版式模板 —— 一律没有，也不会替你画。页面之间的叙事属于每次生成自己的设计。

**如果这一轮另外做了共享文件**（比如统一的顶栏和进度轨、统一的数字格式化、
共用的底纹），把它的接口按上面这个格式追加到本文件末尾。多个页面各自
`cat` 一遍源码去认接口，是纯浪费。

---

## 本轮追加:`theme.css` 提供的 token 与 class

```
token    --bg #f7f3ea             舞台底色，纸张米白
   token    --text #22242a           正文主色，深灰近黑
   token    --ink #2b4c7e            钢笔蓝，当前数值/状态专用
   token    --accent #d1495b         红铅笔色，当下要看的变化
   token    --paper #fffdf7          读数框/面板浅底
   token    --line #c9c2b2           中性描边、分隔
   token    --muted #6b6558          次要文字、刻度
   token    --good-shadow            向下坡度阴影，「变好」语义
   token    --bad-shadow             向上凸起阴影，「变差」语义
   token    --font-sans              正文/UI 无衬线
   token    --font-serif             整页标题手写体质感衬线
   token    --font-mono              权重/损失/学习率等数值等宽
   token    --fs-h1 34               页标题
   token    --fs-h2 22               区块标题
   token    --fs-lead 19             导语/强调正文
   token    --fs-body 18             正文
   token    --fs-sec 16              次级成句说明
   token    --fs-label 15            控件、图例、图注、提示
   token    --fs-tick 13             纯数字刻度
   token    --focus                  焦点环颜色
   版心     1488×844                #stage 已含 28px 56px padding，flex 纵向
   版式     .canvas-full            全画布单区，铺满内容/画面
   版式     .focus                  单焦点构图，标题+kicker 堆叠于上，主内容居中
   版式     .ledger                 记录本式：上导语条 + 下多栏读数区
   版式     .split-lr               左右两栏，比例可由页面用 flex-basis 调整
   版式     .split-tb               上下两栏
   版式     .triptych               三栏等分，中栏可强调
   骨架     .k-process              .step 由 .arw / .axis 串联，方向可见
   骨架     .k-comparison           .dim/.hdr/.rowline/.diff 同行同基线比较
   骨架     .k-classification       .lv/.box/.bt 嵌套缩进表达归属
   骨架     .k-generalization       .claim 主张 + .trunk 主干挂 .supports > .support
   组件     .panel / .panel.q       读数与控件容器，.q 版无填色
   组件     .big / .big.sm/.lg / .num / .unit   数值读数，等宽 tabular nums
   组件     .hint / .btn / .btns / .ctl / input[range]   操作与提示，含焦点/选中/禁用
   组件     .tag / .legend>.li>.sw / .sw.line   标记与图例
   组件     .cvbox                  媒体/画布包裹：定位、圆角、裁切
   组件     .quiz / .opt / .fb      作答区，选中态与正确性态分离
   组件     .lead / .small / .note  文字辅助类
   组件     .backdrop / .backdrop-note   整页氛围底图与角标
```

## 已知陷阱

`Deck.fmt(v, d)` **给非负数加 `+`** —— 它是给增量用的（`+3.2%`、`余量 +0.42 cm`）。
**绝对量不要用它**：年代、质量、温度、距离一律 `v.toFixed(d)`。
实测代价：一页把年代印成「约 +366 万年前」，19 处。
````

### `CONTRACT.md`（3,910 字符）

````
# CONTRACT.md

> 阅读边界：本页构建 agent 只需读**本契约**、`assets/CHASSIS.md` 和自己的 `pNN.md` 三份文件。不要读其他页面的 `pNN.md`、不要读 `PLAN.md`、不要读 CSS/JS 实现源码。若本契约与直觉冲突，以本契约为准。

## 1. 这堂课在讲什么

全课一句话：学习 = 反复做「算一个数（误差多大）→ 算一个方向（往哪改能变小）→ 挪一小步」这三个动作，一个神经元和一整个网络做的是同一件事，只是规模不同。

五幕安排（不得跨幕抢内容）：

- **I 开场（p01）**：立住主张——「学会」是可拆开的数学动作，不是黑箱。无交互。
- **II 一个神经元（p02–06）**：E1（输入加权求和+偏置+激活=输出）、部分 E2（能算出当前错多少）在此建立。
- **III 误差与坡度（p07–10）**：E2 完整成形（损失曲面/曲线）、E3（梯度指方向）、E4（学习率定步子）。坡度母题从 p07 起出现，此前任何页不得提前使用坡度示意。
- **IV 多神经元与反向传播（p11–15）**：E5（单神经元只能画直线边界，需要多层+非线性）、E6（反向传播=按权重比例传责任）。分类点云母题从 p12 起出现，此前不得提前使用。
- **V 综合与迁移（p16–18）**：E7（三动作重复几百次，边界从乱猜到分开），并说明规模变大动作不变。p16、p18 无交互。

无交互页：01 06 11 16 18。其余页必须让读者亲手调至少一个参数、看到至少一个数随之变化。

每页只实现自己的 `pNN.md` 所写内容。凡是证据链归属别的章节的结论、别页负责的母题（坡度、点云）在其登场之前，一律不得提前出现、暗示或抢先讲透。若本页 `pNN.md` 未提及某证据点，视为不属于本页，不得补充。

## 2. 颜色语义

| token / 色相 | 唯一含义 | 允许出现的位置 |
|---|---|---|
| `#f7f3ea`（底色，米白纸张） | 无概念含义，仅承载背景 | 全页背景、留白区域 |
| `#2b4c7e`（钢笔蓝，主色相） | 「当前数值 / 当前状态」——权重、输出、损失等数字的默认书写色 | 读数框内文字、神经元圆圈默认描边、当前状态的曲线/点 |
| `#d1495b`（红铅笔色，强调色） | 「这一刻要看的变化」——梯度箭头、误差下降瞬间、被强调的单个数字 | 梯度箭头、高亮的变化量、坡度上正在移动的点、强调框 |

语义色只能承载上述含义，不得用于装饰性填充、分割线、背景色块等无概念含义的用途。中性灰阶/黑白用于坐标轴、边框、非语义文字。不得引入契约外新色相；不重新设计已定的底色/主色/强调色搭配。

## 5. 技术契约

固定骨架，只允许改 `NN`（页码）与 `#stage` 内部内容：

```html
<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="assets/theme.css">
</head>
<body data-page="NN" data-total="18">
  <div id="stage"></div>
  <script src="assets/base.js"></script>
  <script src="assets/lec.js"></script>
</body>
</html>
```

规则：

- 只修改 `#stage` 内部；保留 `data-page`/`data-total` 两个属性，但不向读者显示页码。
- 逻辑画布固定 1600×900，禁止滚动。`#stage` 为 flex 列容器；各顶层区块给固定高度或 flex 份额；主内容区 `flex:1`。
- 字号只取主题 token：正文/成句说明 ≥16px，控件标签/图例/图注/提示 ≥14px，纯数字刻度 ≥12px；多行文字行高 ≥1.35。
- 颜色、字体、圆角、阴影、共享组件取自主题接口；仅一次性尺寸可写内联，不为单页新建公共类。
- 不得移除或覆盖 `.min0`、`.cv-fill`、`.no-pan` 机制；缩放画布内禁止 `position:fixed`。
- 布局默认 flex，仅二维对齐场景用 grid。全自包含运行，只引用 `pages/` 内相对路径，不使用 CDN。
- 图表优先用已装库，不重复实现成熟能力。ECharts 必须 `renderer:'svg'` 且显式设置字号（刻度纯数字可 12px，带词句标签/图例/轴名 ≥14px，正文/tooltip ≥16px）。Canvas 用 `Deck.fit()`/`Deck.autofit()`，指针坐标用 `Deck.pt()`，动画用 `Deck.loop()`。

库用途速查（按需引用，不复制版本细节）：

| 用途 | 库 |
|---|---|
| 物理:下落/碰撞/拖拽/约束 | matter.min.js → `Matter` |
| 三维场景/立体结构 | three.min.js → `THREE` |
| 三维地球 | globe.gl.min.js（需先引 three） → `Globe` |
| 生成式动画背景 | vanta.net.min.js（需先引 three） → `VANTA` |
| 常规图表(折线/柱/散点/热力等) | echarts.min.js（必须 `renderer:'svg'`） → `echarts` |
| 可拖拽二维场景/命中检测 | konva.min.js（文字用 DOM 叠加，不用 `Konva.Text`） → `Konva` |
| 节点连线/精确矢量/数据绑定 | d3.min.js → `d3` |
| 海量元素同时运动 | pixi.min.js → `PIXI` |
| 分步动画/依次出现/路径描绘 | anime.min.js(v3 API) → `anime` |
| 多动画精确编排时间线 | gsap.min.js → `gsap`（配 ScrollTrigger.min.js） |
| 矢量动画文件播放 | lottie.min.js → `lottie` |
| 伪三维插画 | zdog.min.js → `Zdog` |
| 指针跟随倾斜 | vanilla-tilt.min.js → `VanillaTilt` |
| 进入视野淡入 | aos.js → `AOS` |
| 数学公式排版 | katex.min.js + katex.min.css（基准字号 ≥20px，简单式可 16px） → `katex` |
| 矩阵运算(不画图) | ml-matrix.umd.js → `mlMatrix` |
| 可复现随机 | seedrandom.min.js → `Math.seedrandom`（凡随机抽样/生成点集必须固定种子） |
| 实时训练小型二分类网络、画决策边界 | mlp.js → `MLP`（任意层数，单 sigmoid 输出，交叉熵；不做多分类/回归/卷积/动量） |
| 加载预训练模型/真图片卷积/GPU大矩阵 | tf.min.js → `tf`（不用于页面实时训练两三层小网络；用则每步 `tf.tidy` 或手动 `dispose`） |

教学数据口径：教学中出现的常量、初值、范围、计算结果统一来自 `Lec.K`（常量表）与 `Lec.P`（21 个函数，签名与返回字段见 lec.js 公开接口，不复制实现）当场计算得出，禁止预录结果、禁止编造假数据。任何随机生成（样本、点集、抽样顺序）必须用 `seedrandom` 固定种子，保证每次打开一致，使讲解中写下的具体数字始终为真。首屏在读者操作前必须呈现静止但已含可讲信息的状态（如已计算出的初始损失/初始决策边界），不得是空白或占位符。

## 6. 图片

优先使用 `assets/img/IMG.md` 中已登记素材，按其索引以 `<img title="…">` 引用，不重复下载或用其他方式生成新图。图片出处、许可信息不进入主画面展示。若素材带有「AI生成」角标，角标不得被标题、读数框或其他内容遮挡覆盖。

## 7. 文字风格

读者是文理混合、不假定数理基础的通识课学生，教师带读、课后学生自看。术语第一次出现给口语化解释，不堆砌行话；句子短，一句只讲一件事；不用「如图所示」「接下来我们将」等填充语，不写评价教学设计本身的话（如「这样设计是为了…」）。数字要可感：给出具体数值而非「变小了」，能换算成直观感受就换算（如「误差从 0.8 掉到 0.1，相当于原来错八成，现在错一成」）。不确定或依赖初始化/随机性的结论要明确标注「这次跑出来是…，换一次种子数字会变，但趋势不变」一类的限定。每页收束句给出读者可以带走的一句主张，不做本页内容摘要，不预告下一页讲什么——那是转场页的职责。

全文（不含代码块）不超过 4,600 Unicode 字符，目标约 4,000。
````

### `plan/p09.md`（2,133 字符）

```
# page-09 · 连续多步梯度下降 · **90 秒**

## 照这个写

| 元素 | 文字 |
|---|---|
| kicker | `KEEP-GOING` |
| 主标题 | 重复「算方向、挪一步」，误差一路降下来 |
| 收束句 | 不是一步到位，是同一个动作做了很多次，误差才慢慢趴下去 |
| 下一问 | 一个神经元能学会这些，但它能画出的边界，够用吗？ |

## 知识结构：process

多步记录必须共享同一条时间轴与同一套数值列：每一行代表一次「挪一步」，行内的权重、损失、梯度方向三者同基线对齐，行与行之间用箭头竖直串联，让「下一行的权重 = 上一行权重 + 上一行梯度方向 × 步子」这一因果关系一眼可读。损失列必须整体呈下降趋势的视觉暗示（每行损失读数框叠加轻微的 `--good-shadow` 坡度阴影），不需要画完整坡面（p07 已画）。

使用 `.k-process`：`.step` 承担每一次迭代（一行 = 一步），`.arw` 承担步与步之间「挪一步」的因果连接，`.axis` 承担贯穿全程的迭代序号轴。落入 `.ledger` 版式：上导语条放本页主标题与当前步数/损失摘要，下方多栏读数区中每一栏是一个 `.panel`，栏内用 `.big.sm` 展示权重、损失、梯度方向三个数值，配 `.tag` 标出第几次尝试。

## 表征形式

交互式：一条可逐步或连续播放的「多步记录」列表，每次调用 `Lec.P.neuronGradientStep` 产生一行新记录并追加到已有序列末尾，历史行保留可回看，不覆盖清空。渲染走原生 DOM（一组 `.panel` 卡片纵向排列于 `.ledger` 下栏），不需要 ECharts/D3/Konva：数据量小（约10步），关系是「记录本逐行累积」而非坐标轴上的连续曲线，DOM 卡片天然贴合「读数框」母题与本页 ledger 版式。

## 主工作流

build-interaction ← 核心难点是让「连续多步梯度下降」的状态推进（每步产生新读数、追加历史、可暂停/继续）在 ledger 版式下正确落地为可复用交互，而非单纯图表绘制

## 不许碰

不重新引入多层网络或反向传播（归属 p11 起）；不展开学习率过大过小的对比讨论（归属 p08，本页学习率固定用默认值）；不重画完整损失坡面图（归属 p07，本页只用坡度阴影暗示趋势）。

## 六步记录示例

| 步数 | 输入 | 目标 | 初始权重 | 学习率 | 说明 |
|---|---|---|---|---|---|
| 第1次尝试 | `Lec.K.LOGIC_INPUTS[3]`=(1,1) | `Lec.K.AND_TARGETS[3]`=1 | w=[0.1,0.1], b=0 | `Lec.K.LR_DEFAULT`=0.1 | 初始损失较高 |
| 第2~9次尝试 | 同上，固定 (1,1)→1 | 同上 | 上一步 `newWeights`/`newBias` | 0.1 | 逐步调用 `Lec.P.neuronGradientStep` 迭代 |
| 第10次尝试 | 同上 | 同上 | 收敛值附近 | 0.1 | 损失趋近很小 |

激活函数固定用 sigmoid（呼应 p02–p05 已建立的设定）。每步调用：

`Lec.P.neuronGradientStep(inputs=[1,1], target=1, weights, bias, 'sigmoid', 0.1)`

返回 `{z, a, loss, gradW, gradB, newWeights, newBias}`，页面把 `a`（当前输出）、`loss`（当前损失）、`gradW`（红色箭头标注的方向）三者写入当前行读数框，`newWeights/newBias` 作为下一步输入。

## 交互

学习者可点击「下一步」逐步追加一行新记录，或点击「连续播放」以约每 0.6 秒一步的节奏自动追加，最多10步（用尽后按钮变为禁用态并提示"已到第10次尝试"）。每追加一行：权重读数框数值刷新、损失读数框数值刷新并叠加 `--good-shadow` 坡度阴影强度按当前损失相对首步损失的比例连续变化、梯度方向用 `--accent` 小三角标在权重读数框角落。提供「重来」按钮回到第0步（初始权重 w=[0.1,0.1], b=0），历史行清空。不设「正确终点」提示，只强调损失整体趋势向下。

## 核对

- 第1步：inputs=[1,1], target=1, weights=[0.1,0.1], bias=0, lr=0.1 → z=0.2, a=sigmoid(0.2)≈0.550，loss=mse(0.550,1)≈0.2025
- 第2步（用第1步 newWeights/newBias 作为输入）：损失应比第1步小，方向朝目标1靠近
- 第10步：损失应显著低于第1步（趋近于0，但不必要求严格到某一固定小数），验证"误差一路降下来"的整体趋势成立
```

### `workflows/build-interaction/SKILL.md`（5,645 字符）

```
---
name: build-interaction
description: "Design and implement one bounded, reusable learning interaction inside an assigned Notale lecture page. Use when the learner must manipulate, test, compare, trace, or run something to understand the page claim; the workflow owns the widget's state, controls, visual evidence, feedback, accessibility, and lifecycle, while the page specification and shared theme continue to own the surrounding page. Do not use for decorative motion alone, a conventional chart whose encoding is the main problem, a physical/game simulation with its own specialist workflow, or an entirely static composition."
---

# Design Interaction

Build one coherent learning widget inside the assigned page. Treat the widget as a bounded component: the host page owns its title, surrounding explanation, outer layout, theme, navigation, and page metadata; the component owns its model, controls, evidence, state, feedback, and lifecycle.

## Reference routing

Before any page mutation, including `Write`, `Edit`, `Patch`, or a modifying `Bash` command, read [interactive-widget.md](references/interactive-widget.md) completely in one `Read`. It is the only reference for this workflow. Do not look for a second recipe or load an unrelated workflow reference.

## 1. Read the host contract

1. Read the assigned page specification, shared contract, and `CHASSIS.md`.
2. Preserve the specified lesson boundary, exact copy and values, allotted page region, theme semantics, `#stage`, `data-page`, `data-total`, and shared assets.
3. Let the page specification determine the outer title zone and page skeleton. Do not use the widget reference to invent a parallel page composition or visual system.
4. Identify the one region that will host the widget. If the specification includes supporting prose, place it in the prescribed outer region rather than turning it into widget chrome.

## 2. Define the component boundary

Before coding, write a compact private contract using the fields from the reference:

- insight;
- learner action;
- manipulated quantity;
- visible evidence;
- meaningful states and reveal rule;
- internal anatomy;
- rendering medium;
- exact reset and cleanup behavior.

Create one component root inside the allotted region. Scope page-specific CSS beneath that root and scope selectors, state, timers, observers, and listeners to the component. The delivered file may contain the component inline, but its behavior must not depend on page-wide element lookup or leak styles and events into the host.

## 3. Adapt the component to Notale

- Fill the region assigned by the page; do not make the component decide the page's full-frame padding, navigation, or background.
- Reuse the theme's tokens and semantic classes. Add only the component geometry and states the theme does not supply.
- Use `Deck.pt()` for pointer coordinates on scaled custom surfaces.
- Use the chassis resize or fitting helper that matches the renderer, such as `Deck.autofit()` for state-driven Canvas, and retain every returned stop function.
- Use `Deck.loop()` or the documented page animation interface when continuous work is necessary; keep the component's still state meaningful under reduced motion.
- Prevent interaction keys from reaching deck navigation only while a focused component control consumes them. Never capture deck keys globally.
- Keep essential labels, instructions, controls, values, and accessible status in DOM or SVG even when the model is drawn on Canvas.

## 4. Implement from state outward

1. Build the informative initial state and the primary visual evidence first.
2. Route every input through the component's canonical state and one idempotent render/update path.
3. Add the main action, then the intermediate, extreme, failure, reveal, and completion states required by the private contract.
4. Add deterministic reset when the learner can leave the initial state. Reset must cancel active work before restoring and rendering state.
5. Add keyboard/touch alternatives and textual feedback without creating a second interaction model.
6. Centralize teardown so listeners, observers, timers, frames, pointer capture, and owned graphics can be safely released once or repeatedly.

## 5. Integrate without expanding scope

- Implement the required outer page copy and layout exactly as specified, then let the widget dominate its allotted teaching region.
- Do not add another widget, dashboard, article section, page navigation, or decorative system to make the page feel fuller.
- Do not modify shared assets or another page unless the task explicitly grants that scope.
- Keep all essential component states inside the fixed `1600x900` page and avoid nested scrolling.

## 6. Verify the component and its host

Exercise and inspect at least:

1. informative initial state;
2. one primary pointer action;
3. the equivalent keyboard or non-drag path;
4. one meaningful extreme, negative, failure, or reveal state;
5. reset followed by the primary action again;
6. rapid repeated input and teardown-sensitive work;
7. reduced-motion behavior when motion is present.

Run the available page `Check` for every materially different visual state. Require zero JavaScript errors, failed resources, overflow, clipping, and unreachable controls. Inspect screenshots for component hierarchy and causal clarity; passing synthetic checks does not establish interaction quality.

## Deliverable

Modify only the assigned page file unless explicitly told otherwise. Report the component's learner action, the evidence it changes, supported input paths, reset/cleanup behavior, and the last checks actually run.
```

### `workflows/build-interaction/references/interactive-widget.md`（92,871 字符）

````
# Interactive Learning Widget

Build a bounded interactive component, not a page. Place that learning instrument inside the assigned lecture page. The widget is not a small webpage, a dashboard, or a decorated form. It is a manipulable model whose visible behavior lets a learner discover, test, or verify one relationship.

The host owns the page title, narrative copy, outer composition, background, typography system, base palette, navigation, fixed frame, and shared runtime. The widget inherits those decisions. It earns its own identity through a **concept signature**: a subject-specific geometry, spatial organization, semantic color mapping, and motion behavior that make the underlying relationship tangible without inventing a second theme.

Read this reference completely before implementation. Use the early decision sections to choose a direction, the pattern library to construct the interaction, the craft and technical sections while building, and the acceptance matrix before delivery.

## Contents

1. Operating premise
2. Private interaction contract
3. Choose an interaction direction
4. Design the evidence
5. Compose the component
6. Interaction pattern library
7. State architecture
8. Input, feedback, and accessibility
9. Motion as causal evidence
10. Renderer-specific craft
11. Visual craft under the host theme
12. Implementation recipes
13. Transferable studies from high-craft explainers
14. Machine-made failure signatures
15. Acceptance and delivery

## 1. Operating premise

### The interaction is an argument

An effective learning widget makes a compact argument:

```text
learner action
  → changes a meaningful quantity
  → changes the model itself
  → produces direct visible evidence
  → supports one interpretation
```

Each arrow must be inspectable. If the action only changes a label, if the model change is hidden inside a calculation, or if the interpretation arrives before the evidence, the argument is broken.

The widget should answer all of these without relying on surrounding prose:

- What can I act on?
- What property will that action change?
- Where will I see the consequence?
- Which states are worth comparing?
- What remains invariant?
- What conclusion is justified by the evidence?

Do not begin from a list of controls or effects. Begin from the causal claim, then choose the smallest action that can expose it.

### One claim, one model, one dominant action

One component may contain several coordinated views, but it teaches one claim through one model. Multiple controls are acceptable only when they describe the same model and their relationship matters. Several unrelated sliders, tabs that hide separate activities, or a row of independent mini-demos are several weak widgets disguised as one.

Name one dominant action:

- drag the boundary normal;
- move the inspection window;
- scrub the transformation;
- choose two constrained resources;
- advance a signal one step;
- launch synchronized runs;
- perturb the input and observe recovery.

Secondary actions such as reset, pause, preset, or precise keyboard adjustment support that action. They do not compete with it.

### The visualization is the interface

The model is not an illustration placed beside the controls. The model itself should carry selection, causality, feedback, measurement, and state:

- values sit beside the geometry they measure;
- active paths illuminate on the stable graph;
- constraints appear at the attempted object;
- comparison outcomes stay attached to comparable views;
- a probe carries its own local sample and footprint;
- the changed formula term highlights next to the changed quantity.

Before adding a card, ask whether the information can live on the stage as an annotation, scale, trail, connector, local readout, or state mark. Integration produces clarity; a cabinet of panels produces distance.

### First paint is already informative

Render a representative state, not a blank promise:

- a vector with a nonzero angle and its boundary already visible;
- a process with the first transition applied;
- a probe resting on a meaningful region;
- a comparison at the same nontrivial starting state;
- a live system paused after several deterministic steps;
- a constrained choice with one item selected and remaining capacity visible.

The first paint should reveal the vocabulary of the component and invite the intended action. It must not disclose a conclusion that depends on trying; in that case show a plausible unresolved state with an obvious affordance and withhold the interpretation.

### Compact does not mean shallow

Remove explanatory chrome, not evidence. A compact component can contain:

- one large model;
- two coordinated encodings of the same state;
- a short local control cluster;
- a live measurement;
- a history trace;
- a meaningful negative or extreme state.

It becomes shallow when the model is replaced by a number, when all consequences are summarized in prose, or when states cannot be compared.

## 2. Private interaction contract

Write this contract privately before markup, rendering code, or page mutation:

```text
claim:          After using the component, the learner can state …
action:         The learner directly …
quantity:       That action changes …
model:          The component represents the relationship as …
direct evidence:The model itself changes through …
measure:        A nearby value/scale/trace quantifies …
invariant:      Across states, … stays fixed so comparison remains fair
states:         initial → active/intermediate → diagnostic extreme/failure/reveal → reset
reveal rule:    Interpretation appears when the evidence shows …
signature:      The subject-specific memorable behavior is …
anatomy:        dominant stage + local controls + local readout [+ distinct auxiliary view]
renderer:       DOM | SVG | Canvas, because …
inputs:         pointer …; keyboard/touch equivalent …
reset:          Restores these exact values and cancels …
teardown:       Releases …
host boundary:  Uses allotted region/tokens/assets/adapters; does not own …
```

Do not accept vague fields:

- “The graph updates” does not name evidence.
- “The user interacts with sliders” does not name an action.
- “The learner understands the concept” does not name a claim.
- “Animation demonstrates the result” does not identify a persistent state.
- “Reset everything” does not define deterministic values or canceled work.

### Test the contract before coding

Run four quick tests:

1. **Counterfactual:** if the interpretation text were removed, would the changed model still contain evidence?
2. **Pause:** if all motion stopped, would the current relationship still be legible?
3. **Invariant:** can a learner tell what was held constant between compared states?
4. **Transfer:** can the widget root be moved into another compatible host without importing its title, footer, global shortcuts, or theme?

If any answer is no, repair the contract before implementation.

### Ownership boundary

The host owns:

- page title, kicker, narrative copy, chapter labels, page numbers, navigation, footer;
- full-frame grid, outer padding, page background, base type roles, and general color mode;
- shared image assets, the page specification, and any required citations;
- host frame identifiers, page metadata, host-scale behavior, and shared lifecycle adapters.

The component owns:

- its root and internal layout;
- canonical state and transition rules;
- its model geometry or field;
- local controls, readouts, annotations, focus behavior, and feedback;
- its animation work, observers, pointer capture, deterministic reset, and cleanup.

Do not use the component reference to redesign the surrounding page. Do not create a second title zone, page background, global theme, navigation system, or general-purpose dashboard.

## 3. Choose an interaction direction

Before coding, choose one **interaction direction**. This is not an aesthetic theme. It is the dominant relationship between action and evidence. Commit to its spatial grammar, state transitions, and concept signature.

### Direction A — Instrument

Use when parameters continuously tune one model: damping, threshold, mixture, coefficient, gain, capacity, or another quantity.

- Spatial grammar: control adjacent to the property it changes; dominant model; live scale or readout at the consequence.
- Signature: a continuously deforming or responding object, not a value panel.
- Strong evidence: geometry, trajectory, field, extent, or distribution changes while a local measure tracks it.
- Avoid when the learner should construct, trace, compare runs, or discover a discrete constraint.

### Direction B — Manipulator

Use when position, angle, shape, order, or membership is itself meaningful and direct manipulation expresses the concept better than a form control.

- Spatial grammar: large manipulable object with visible handle or graspable body; nearby alternative control for precision.
- Signature: the same gesture that changes the model also reveals its governing geometry.
- Strong evidence: boundary rotates with its normal; support region changes with stance; vector components update with direction.
- Avoid dragging decorative cards or objects whose screen position has no semantic meaning.

### Direction C — Constructor

Use when understanding comes from assembling a valid configuration under rules: choose limited resources, connect compatible parts, allocate a budget, arrange a sequence, or satisfy competing constraints.

- Spatial grammar: available objects, construction area, and a constraint gauge sharing one visual field.
- Signature: the constraint is visible before and during the action, not reported only after submission.
- Strong evidence: capacity fills, conflicts mark their origin, and consequences update with the partial construction.
- Avoid turning the task into a conventional form followed by a generic success message.

### Direction D — Transformation

Use when two representations are the same object at different stages, coordinates, abstractions, or levels of detail.

- Spatial grammar: stable endpoints or aligned spaces connected by a scrubber, stages, correspondence traces, or moving identities.
- Signature: object identity persists while geometry changes.
- Strong evidence: the learner can stop at meaningful intermediate states and match parts across representations.
- Avoid cross-fading unrelated screenshots and calling it transformation.

### Direction E — Tracer

Use when the claim concerns propagation, dependency, calculation, responsibility, or a process path.

- Spatial grammar: one stable graph or route; active frontier; local rule at the current node; accumulated trace.
- Signature: energy, value, responsibility, or signal visibly travels along existing connections.
- Strong evidence: previous, current, and next context remain visible while local values update.
- Avoid replacing the graph with one card per step.

### Direction F — Synchronized comparison

Use when one teaching variable must be isolated across alternatives, models, parameter choices, or runs.

- Spatial grammar: aligned views with shared scales and a single launch/step clock.
- Signature: simultaneous progression from identical starting conditions.
- Strong evidence: divergence, convergence, overshoot, or tradeoff remains comparable without mental rescaling.
- Avoid independent mini-widgets that happen to be placed in a row.

### Direction G — Inspector

Use when a local operation or hidden structure becomes understandable by probing a larger object: convolution window, cross-section, ray, cursor sample, neighborhood, crop, or magnifier.

- Spatial grammar: overview with movable probe; explicit footprint; local detail; derived output tied by connectors or shared highlight.
- Signature: the probe reveals exactly what contributes to the local result.
- Strong evidence: source cells, weights, products, and output stay synchronized.
- Avoid tooltips that only repeat a value without exposing its origin.

### Direction H — Counterexample

Use when the learner must encounter a limitation, impossible strategy, misconception, or failure regime before receiving a reframe.

- Spatial grammar: plausible attempt area; accumulating evidence; preserved failure state; nearby reframe.
- Signature: the invariant or residual survives every plausible attempt.
- Strong evidence: best result, unresolved case, contradiction, boundary, or instability remains visible.
- Avoid arbitrary failure rules, fake quizzes, or explanations shown before a real attempt.

### Direction I — Live system

Use when the claim is an evolving system with internal state: training, optimization, ecology, feedback control, queueing, or iterative algorithms.

- Spatial grammar: dominant state field; compact internal structure; history trace; restrained control cluster.
- Signature: multiple views share one logical iteration and expose different consequences of the same state.
- Strong evidence: the actual simplified mechanism runs, or a deterministic surrogate is labeled honestly.
- Avoid animated wallpaper paired with fabricated metrics.

### Direction J — Prediction and reveal

Use when commitment before observation sharpens learning: predict a path, choose the stronger force, estimate an outcome, or classify a case, then reveal the mechanism.

- Spatial grammar: model in an unresolved state; small prediction action; visible run/reveal; comparison between prediction and outcome.
- Signature: the learner's commitment remains visible beside the resulting evidence.
- Strong evidence: the reveal animates or constructs the causal path, not just a correctness badge.
- Avoid trivia questions whose answer is already printed or whose interaction adds nothing to observation.

### Direction selection test

Choose the direction whose verb matches the claim:

| Claim depends on… | Prefer |
|---|---|
| tuning a quantity | Instrument |
| moving meaningful geometry | Manipulator |
| satisfying constraints | Constructor |
| preserving identity across representations | Transformation |
| following dependency or propagation | Tracer |
| isolating one variable across runs | Synchronized comparison |
| exposing a local operation | Inspector |
| discovering a limitation | Counterexample |
| observing an evolving mechanism | Live system |
| committing before evidence | Prediction and reveal |

Hybridize only when one direction remains dominant. An inspector may include an instrument for probe size; a live system may include synchronized comparison; a counterexample may transform into a new representation. Do not give both directions equal chrome or separate start points.

## 4. Design the evidence

### Evidence hierarchy

Build evidence in this order:

1. **Direct model evidence:** shape, position, path, magnitude, direction, connection, region, texture, trajectory, classification, or another model property changes.
2. **Measured evidence:** a local value, scale, dimension, formula term, count, trace, or comparison quantifies the model change.
3. **Interpretation:** a short conclusion appears only after the relevant evidence exists.

Never substitute glow, confetti, a toast, a progress bar, or changing status text for direct evidence. Those may draw attention to evidence but cannot be the evidence.

### Encode cause and consequence differently

Make the learner's cause and the model's consequence visually distinguishable:

- active control or manipulated object: focused outline, handle, grip, or semantic accent;
- immediate affected property: direct geometry change;
- propagated consequence: trail, edge activation, deformation, or secondary semantic color;
- measured result: local number, scale, or trace;
- interpretation: short quiet text after the evidence condition.

Do not color every changing object with the same accent. A single undifferentiated glow hides causal order.

### Reveal invariants

Good interactive evidence shows what does **not** change as clearly as what does:

- shared axes remain fixed during comparison;
- object identity persists during transformation;
- total budget stays constant while allocation changes;
- starting data and random seed remain fixed across runs;
- graph topology stays stable while values propagate;
- the probe footprint stays the same while location changes.

Use stable coordinates, persistent labels, construction lines, locked marks, or a quiet invariant readout. Do not make the learner infer fairness from memory.

### Use redundant encoding only for different questions

Two encodings of one quantity are justified when they answer different questions:

- direction by arrow and magnitude by length;
- total by filled extent and exact amount by number;
- current state by geometry and history by trace;
- category by hue and confidence by opacity;
- active path by edge emphasis and accumulation by node value.

Duplicating the same number in a card, label, badge, and chart is not evidence; it is noise.

### Make extremes diagnostic

Include an informative extreme, sign reversal, threshold, saturation, divergence, failure, or completion state when the concept has one. Ensure the visual encoding still works there:

- values that leave a plot mark the boundary rather than disappearing;
- a zero vector retains a readable origin and explanation;
- a saturated control shows the plateau in the model;
- an invalid construction preserves the attempted object and identifies the conflict;
- a divergent run remains on a shared scale with an off-scale marker.

Presets should take the learner to diagnostic states, not merely provide more buttons.

### Evidence should survive motion

Motion may reveal path, order, correspondence, accumulation, or recovery. When it stops, leave a legible result:

- a trail or final activated route;
- persistent before/after geometry;
- a current-step marker and accumulated expression;
- aligned final states;
- a prediction mark beside the outcome;
- a history trace with the current iteration.

If the claim exists only while pixels are moving, the component is not inspectable.

### Attach interpretation locally

Put a conclusion near the evidence that justifies it:

- beside the crossing point;
- under the shared comparison axis;
- next to the violated constraint;
- at the end of the active path;
- beside the selected validation minimum.

Keep it to one sentence or a compact equation. Long explanation belongs to the host page.

## 5. Compose the component

### Dominant-stage anatomy

Default to:

```text
┌ component root ───────────────────────────────────────────┐
│ compact mode/control row, only when needed                │
│                                                          │
│ ┌ dominant model / evidence field ─────────────────────┐ │
│ │ manipulable object, local labels, local readout,      │ │
│ │ current path/state, and direct feedback               │ │
│ └───────────────────────────────────────────────────────┘ │
│ quiet scale / formula / history / conclusion              │
└────────────────────────────────────────────────────────────┘
```

The stage should receive more area and contrast than all controls, explanations, and readouts combined.

### Named component compositions

Choose one deliberately.

#### Stage with instrument rail

Use for one dominant model and a few compact controls.

```text
short control rail
large stage
inline readout / scale / trace
```

Keep the rail to one line or a tight wrap. Put frequently adjusted controls nearest the stage. Move reset to the trailing edge. Do not let a tall control panel shrink the model.

#### Model with local inspector

Use for probes, cross-sections, kernels, or internal detail.

```text
overview model  ── linked footprint ── local detail/output
```

The overview stays dominant. The detail panel must show information unavailable at the same scale, not a magnified decorative copy. Use connectors, matching outlines, or shared coordinates to bind them.

#### Aligned comparison strip

Use for two to four alternatives that share a variable and scale.

```text
shared controls / clock
view A | view B | view C
shared axis or aligned outcome line
one conclusion
```

Give every view identical plot bounds, crop, starting state, and label placement. If three views become too narrow, stack them vertically with shared full-width axes rather than silently reducing legibility.

#### Stable graph with step rail

Use for propagation and calculation.

```text
stable graph or route
current local rule
back / step / play / reset
accumulated trace or expression
```

Keep the graph spatially stable. Put the step rail beneath or above it; never replace the graph with the stepper.

#### Construction field with constraint meter

Use for selection and assembly.

```text
available objects | construction field
constraint represented on the field
remaining capacity / conflict explanation
```

The meter should share the same semantic units as the construction. A mass budget might be a filled rail; compatibility may be connection sockets; coverage may be an outline or map.

#### Stage with subordinate history

Use for live systems.

```text
dominant current state
small internal structure
thin history trace
controls
```

History is evidence, not a dashboard peer. It should be shorter, quieter, and aligned to the current logical time.

### Proximity rules

- Put a control beside the property it changes.
- Put a value beside the geometry or behavior it measures.
- Put invalid-action feedback at the blocked object or constraint.
- Put a legend inside the visual region only when it does not occlude data.
- Put shared comparison controls once, not once per panel.
- Put reset away from the primary action but within the same control group.
- Use connectors and alignment before adding a border.

### Chrome budget

Count non-content elements: panels, borders, headings, pills, legends, hints, separators, badges, and shadows. Each must perform one job. A component usually needs:

- one root boundary, often visually implicit;
- zero or one internal stage surface;
- one compact control group;
- zero or one boxed primary readout;
- local annotations and quiet secondary values.

When the component feels empty, enlarge the model and bring evidence closer. Do not fill the space with explanatory cards. When it feels crowded, remove duplicate labels and controls before shrinking type.

### Responsive behavior inside a fixed page

The host page may use a fixed presentation frame, but the allotted component region can vary. Design to its actual bounds:

- use grid or flex tracks that allow the model to grow;
- set `min-width: 0` and `min-height: 0` on flexible children;
- make Canvas drawing size follow its CSS box through the host helper;
- preserve comparison scale when stacking;
- keep pointer hit regions aligned after page scaling;
- avoid nested scrolling;
- allow labels to wrap only where the page language supports it.

Do not solve a composition problem with `transform: scale()` on the component itself. The host already owns page scaling.

## 6. Interaction pattern library

Choose the smallest pattern that proves the claim. The following are reusable component blueprints, not topical templates.

### 6.1 Parameter instrument

Use when a continuous or discrete parameter controls one model.

```text
parameter
  → primary geometry or behavior
  → local measurement
  → optional distinct consequence view
```

Build:

1. Start at a representative nonzero value.
2. Draw the model at that value before styling the control.
3. Put the control close to the affected property.
4. Update the model continuously during input.
5. Highlight the exact term, dimension, or region being changed.
6. Add one diagnostic preset only when it reveals a meaningful regime.

Good instruments make the quantity tangible:

- a coefficient changes slope and the corresponding equation term;
- damping changes the trajectory envelope and settling time;
- capacity changes the feasible region and remaining budget;
- threshold moves a boundary while classification changes on the stage.

Weak instruments put a slider on the left and a large number on the right. The object between them must visibly respond.

For two parameters, reveal their relationship on the same model. If each parameter controls a different activity, split the lesson.

### 6.2 Bidirectional geometric manipulator

Use when a direct spatial action expresses the concept.

```text
drag meaningful object ↔ semantic keyboard/range control
                       → one canonical state
                       → geometry + measure + annotation
```

Build:

1. Draw a visible handle, graspable body, or hover preview before first use.
2. Convert pointer position into logical coordinates; never store raw screen pixels as model state.
3. Clamp or project the logical value into the valid domain.
4. Route drag and precise alternative input through the same transition.
5. Redraw all dependent evidence from the committed state.
6. Preserve a valid state on pointer cancellation.

Strong manipulators:

- rotate a vector to rotate its orthogonal boundary;
- drag a center to change a coverage region;
- move support points to change a stability polygon;
- reposition a sample to change neighborhood membership.

Position must carry meaning. Do not add drag to a card, knob, or ornament merely to make the component feel interactive.

Use a generous invisible hit target around thin handles. Show grab/grabbing cursors, focus indication, and a keyboard path that reaches the same logical states.

### 6.3 Constrained constructor

Use when the learner chooses, connects, allocates, or assembles under explicit limits.

```text
partial construction
  ↔ remaining capacity / compatibility
  → local consequence
  → valid or invalid next moves
```

Build:

1. Make the constraint visible before the first choice.
2. Start with a meaningful partial configuration when that helps reveal the units.
3. Update capacity and consequences after every accepted action.
4. Preview whether an action is valid before commitment when possible.
5. On rejection, preserve the attempted context and explain the exact violated rule locally.
6. Allow removal or reversal through the same object, not a hidden separate editor.

Distinguish three states:

- available and feasible;
- selected or placed;
- unavailable because of a specific current constraint.

Do not gray out an item without exposing why. Do not let visual selection, capacity totals, and risk consequences drift into separate state.

A constructor does not require a win state. It may be an open tradeoff instrument. Invent success only when the domain defines it.

### 6.4 Continuous transformation explorer

Use when identity across representations is the lesson.

```text
source objects
  → correspondence
  → meaningful intermediate geometry
  → target representation
```

Build:

1. Define endpoints from corresponding logical objects.
2. Interpolate actual geometry or properties, not screenshots.
3. Preserve identifiers, labels, and semantic colors across the transition.
4. Let the learner scrub and stop at meaningful intermediate states.
5. Mark important thresholds or named stages along the control.
6. Keep source and target coordinates available when comparison requires them.

Use motion to answer “where did this part go?” Persistent connector traces, paired marks, stable color roles, and labels moving with their objects are stronger than global fades.

Play/pause may demonstrate the transformation, but a scrubber or step path must leave the learner in control. Reduced motion should snap between the same named states or use short crossfades while preserving correspondence.

### 6.5 Causal tracer

Use for a process graph, forward/backward pass, dependency chain, flow, or calculation.

```text
stable topology
  + active frontier
  + local rule
  + received value
  + emitted consequence
  + accumulated trace
```

Build:

1. Lay out the full topology once.
2. Choose a start state with the graph and initial values visible.
3. Advance one logical transition per manual step.
4. Mark previous, current, and next context.
5. Attach the local rule to the active node or edge.
6. Let autoplay call the same transition as manual stepping.
7. Cancel autoplay immediately on manual input, reset, hidden state, or teardown.
8. Preserve the final route and result at completion.

Direction must be unmistakable through arrowheads, moving phase, edge gradients, or ordered activation—not through a detached “step 3” label alone.

When tracing backward responsibility through a forward graph, keep both directions distinguishable. The learner should see what value traveled forward and what influence travels backward without the topology jumping.

### 6.6 Synchronized comparison

Use to isolate one variable across alternatives.

```text
same data + same start + same scale + same clock
  → different teaching variable
  → aligned outcomes
```

Build:

1. State the single varying factor privately.
2. Seed or copy all shared starting data.
3. Use one transition clock and one step count.
4. Keep axes, camera, crop, normalization, and sample ordering fixed.
5. Mark off-scale values rather than rescaling one view.
6. Attach each outcome to its view and state the shared conclusion once.

Strong comparisons expose divergence as it happens: three learning rates descend the same landscape; three models fit the same samples; two loss functions respond to the same outlier.

Do not give each alternative its own start button, scale, or random sample. Do not highlight a preferred answer by hiding the evidence from the others; dim them only after the comparison remains readable.

### 6.7 Probe and inspection window

Use when a local operation is hidden inside a larger field.

```text
overview
  ↔ movable footprint
  ↔ extracted neighborhood
  ↔ local operation
  ↔ derived output position
```

Build:

1. Show the probe footprint before first interaction.
2. Snap or clamp it in logical coordinates.
3. Highlight source contributors in the overview.
4. Mirror those contributors in a local detail at a consistent orientation.
5. Show products, weights, or measurements in spatial correspondence.
6. Mark the exact output cell or result receiving the aggregate.
7. Update all views atomically from one probe state.

The learner should be able to trace one source item through the local operation into the result. Connectors, matching borders, and positional correspondence are more useful than a tooltip.

Support direct movement and a discrete keyboard path. When autoplay scans the field, manual interaction must take control without racing the timer.

### 6.8 Try, fail, and reframe

Use for limitations, counterexamples, impossible strategies, and misconceptions.

```text
plausible attempt
  → accumulating objective evidence
  → bounded failure or invariant
  → preserved state
  → new representation or method
```

Build:

1. Give a real, plausible action.
2. Track evidence such as best score, unresolved cases, residual, contradiction, or invariant.
3. Reveal the limitation after persuasive evidence, not after an arbitrary click count.
4. Preserve the learner's best or final attempt while explaining it.
5. Introduce the reframe by transforming or connecting existing objects when possible.
6. Let reset restore the unresolved starting state.

The failed state is the teaching artifact. Do not erase it with a modal, replace it with a red banner, or jump immediately to the solution.

The reframe should explain why the original representation failed. Adding a layer may fold space; changing coordinates may make separation possible; introducing memory may resolve an ambiguity. Preserve identity through the change.

### 6.9 Live system observer

Use for iterative and continuously evolving mechanisms.

```text
canonical logical state at iteration n
  ↔ dominant current model
  ↔ compact internal structure
  ↔ history or validation trace
```

Build:

1. Run the real simplified mechanism when feasible.
2. Separate logical stepping from visual interpolation.
3. Couple every view to the same committed iteration.
4. Provide start/pause, bounded manual stepping, deterministic reset, and one or two diagnostic presets.
5. Update expensive fields less often only if their displayed timestamp remains aligned.
6. Bound history, samples, particles, and stored frames.
7. Detect instability and turn it into visible evidence instead of allowing invalid numbers.

The current model is dominant. Network diagrams, metrics, and history support it. Avoid three equally weighted dashboard panels.

Honesty matters: if the mechanism is a scripted or precomputed surrogate, label it. Never display metrics disconnected from what is drawn.

### 6.10 Prediction and reveal

Use when committing before observation produces a useful comparison.

```text
unresolved model
  → learner prediction
  → mechanism runs or evidence is constructed
  → prediction remains visible
  → local comparison and interpretation
```

Build:

1. Ask for the smallest prediction that focuses attention.
2. Make the available options or predicted geometry part of the model, not a quiz card.
3. Preserve the prediction during the reveal.
4. Reveal the causal mechanism before showing correctness.
5. Compare outcome with prediction using distance, overlap, direction, or another domain measure.
6. Allow a new trial with changed initial conditions when repetition teaches a pattern.

Avoid scores unless repeated calibrated prediction is itself the activity. A one-shot concept reveal needs evidence and reflection, not points or confetti.

## 7. State architecture

### One canonical model state

Keep one state object or a small explicit state machine. Derive geometry, selected styles, annotations, values, feedback, completion, and accessible status from it. DOM classes, SVG attributes, Canvas pixels, and animation progress are views—not sources of truth.

```js
function createWidget(root, host) {
  const makeInitialState = () => ({
    value: 0.42,
    mode: "ready",
    step: 1,
    selected: [],
    running: false
  });

  let state = makeInitialState();
  let destroyed = false;

  function dispatch(action) {
    if (destroyed) return;
    const next = transition(state, action);
    if (next === state) return;
    state = next;
    scheduleRender();
  }

  function reset() {
    cancelActiveWork();
    state = makeInitialState();
    render(state);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelActiveWork();
    detachInputs();
  }

  attachInputs(dispatch);
  render(state);
  return { dispatch, reset, destroy };
}
```

The exact packaging may follow the page's established style. Preserve the invariants:

- one component root;
- one canonical logical state;
- one accepted transition path;
- one coordinated render path;
- one exact reset path;
- one idempotent teardown path.

### Separate logical, transient, and visual state

**Logical state** changes the model and must survive rerender: parameter values, selected objects, current step, seed, simulation variables, prediction, reveal state.

**Transient input state** supports a gesture but should not become domain truth: active pointer ID, drag offset, hover target, pressed key, focus ring source.

**Visual interpolation state** only animates between committed logical states: eased position, pulse phase, temporary flash, trail opacity. It must never decide the result.

Keep these layers distinct. A drag may preview a logical value, but pointer cancellation must either commit a valid projected value or return to the last valid state. A running animation may interpolate between steps, but manual stepping operates on logical steps.

### Define states explicitly

Every widget should name the states it actually needs:

```text
ready
  → manipulating / selecting / running
  → diagnostic extreme or invalid attempt
  → reveal / complete
  → ready through reset
```

Do not add generic `success` and `error` states when the domain has no correct answer. Prefer domain states such as `feasible`, `capacity-exceeded`, `diverging`, `stalled`, `boundary-crossed`, or `reveal-available`.

For a step process, represent the logical step as an index plus stable data, not a collection of independently toggled node classes. For a selection task, derive selected appearance, remaining capacity, disabled feasibility, and risk from one selected-ID set.

### Transition discipline

Each action should:

1. validate its payload;
2. project or clamp it into the logical domain;
3. compute the next state atomically;
4. reject without partial mutation when invalid;
5. schedule one coordinated render;
6. update accessible status only for meaningful committed changes.

Avoid handlers that directly edit three unrelated DOM nodes and hope they stay synchronized.

### Determinism

Use fixed initial values and seeded generation whenever reset, comparison, or diagnosis depends on reproducibility.

- Store the seed in logical state.
- Generate shared comparison data once, then copy it.
- Reset to the same initial sample unless “new sample” is a separate explicit action.
- Keep physics or iterative time steps bounded and deterministic enough for comparison.
- Do not use `Math.random()` during every render.

If a “new data” action is pedagogically useful, distinguish it from reset. Reset restores; regenerate changes the experiment.

### History and snapshots

Store only the history needed to support the claim:

- a bounded loss trace;
- a few comparison checkpoints;
- the learner's best attempt;
- a persistent final route;
- prediction and outcome.

Do not log every frame. Use a ring buffer or sample at logical intervals. Associate history with logical iteration, not wall-clock frame count.

### Long-running work

Separate:

- `stepModel(dt)` for bounded logical progress;
- `render(state, visualTime)` for display;
- `start`, `pause`, `step`, `reset`, and `destroy` controls.

Clamp large elapsed-time gaps after a hidden tab. Stop or pause work when the page is hidden if the host lifecycle expects it. Never fast-forward hundreds of simulation steps because the tab slept.

### Reset is a first-class transition

Reset must:

- cancel animation frames, timelines, intervals, timeouts, and delayed reveals;
- release active pointer capture when possible;
- restore exact initial logical values and seed;
- clear bounded history and transient feedback;
- redraw every coordinated view;
- restore labels, focus-independent styles, and control values;
- leave the component ready for the primary action again.

Do not implement reset by reloading the page or rebuilding unrelated host content.

### Teardown and remount

Destroy must be safe to call twice. Remove or abort:

- component-owned listeners;
- observers;
- timers and animation work;
- renderer instances and GPU resources;
- generated offscreen buffers if ownership requires it;
- pointer state;
- live-region work and delayed callbacks.

Remounting the page must not duplicate listeners, loops, SVG definitions, or canvases.

## 8. Input, feedback, and accessibility

### Prefer semantic controls when semantics fit

Use native:

- `button` for an action;
- `input type="range"` for an ordered bounded quantity;
- radio buttons for one-of-many modes;
- checkboxes for independent boolean choices;
- select only when options are numerous and comparison between them is not central.

Style them to fit the host, but retain focus, keyboard behavior, names, values, and disabled semantics.

Custom manipulation is appropriate when the object and the action share meaning. A draggable vector, boundary, sample, probe, or construction part can be stronger than a slider. A custom fake button is weaker than a native button.

### Pointer input

For custom manipulation:

- use Pointer Events;
- resolve coordinates relative to the component surface through the supplied host adapter or a transform-aware local conversion;
- capture only the active pointer after a valid pointer down;
- store the pointer ID;
- clamp in logical coordinates;
- handle `pointercancel`;
- release capture at completion;
- ignore secondary pointers unless the model explicitly supports them;
- do not use page-level `mousemove` listeners as the primary path.

Use an invisible or translucent hit region larger than the visible thin geometry. Keep hit testing based on the same transformed coordinate system as rendering.

### Keyboard equivalence

Provide an alternative that reaches the same logical states:

- arrow keys adjust a focused custom handle;
- a native range mirrors a drag;
- buttons step a process;
- selectable objects are real buttons or expose button/option semantics;
- Enter/Space commits a focused choice;
- Escape may cancel a transient manipulation when that behavior is clear.

Keyboard equivalence means equivalent model access, not identical physical gestures.

Stop key propagation only when a focused component control consumes that key. Never suppress host navigation globally. Preserve a logical tab order and visible focus.

### Touch

Design visible marks and invisible hit regions separately. A small probe can have a larger transparent target without becoming visually heavy. Avoid interactions that require hover, right click, wheel input, or pixel-perfect dragging. When hover provides a preview, touch must still reveal the same information after tap or focus.

Prevent page-level gestures only during an active component manipulation and only where required.

### Affordance without instruction stickers

Express action through:

- visible handles;
- cursor change;
- hover or focus preview;
- partial starting motion;
- ghost placement;
- track ticks;
- object shape;
- local verbs on actual controls;
- a restrained first-use emphasis.

A concise host-provided instruction may be necessary for a novel gesture. Do not create a floating “Tip: drag…” pill to compensate for an invisible affordance.

### Feedback hierarchy

Feedback should occur at the consequence:

1. input object acknowledges hover, focus, and press;
2. affected geometry changes;
3. local measurement updates;
4. propagated consequence traces or settles;
5. interpretation appears if its evidence condition is met.

Use a short flash, trace, or ease to direct attention to the actual changed object. Avoid generic success animation.

### Invalid actions

For an invalid or constrained action:

- preview infeasibility before commitment when possible;
- preserve the last valid logical state;
- keep the attempted target or relationship identifiable;
- mark the violated constraint at its location;
- state the exact reason in one local phrase;
- allow immediate recovery.

Do not merely disable all unavailable choices. When disabling is necessary, expose why through adjacent capacity, compatibility, or constraint evidence.

### Color, shape, and motion redundancy

Color may encode a state only when another channel supports it:

- hue + position;
- hue + label;
- hue + stroke pattern;
- hue + arrow direction;
- hue + symbol shape;
- hue + opacity or enclosure.

Do not use green/red alone for correctness, positive/negative, or two classes. Make focus and selected states distinguishable without color.

### Accessible status

Use one restrained live region for meaningful committed changes:

- “Remaining mass 12 kilograms” after a selection;
- “Step 4 of 6, signal reached output node” after manual advance;
- “Constraint exceeded by 3 units” after an invalid attempt.

Do not announce continuous pointer movement, animation frames, hover, decorative pulses, or every simulation tick. For rapidly changing values, update visible text continuously but announce only on commitment or pause.

### Canvas accessibility

Canvas may draw the dense model, but essential controls, current values, instructions, and conclusions remain in DOM or SVG. Provide a concise accessible description of the current model state where needed. Do not attempt to duplicate every particle or pixel in the accessibility tree.

## 9. Motion as causal evidence

### Assign motion a job

Every motion must perform at least one:

- show direction;
- preserve object identity;
- reveal order;
- expose propagation;
- compare speed or stability;
- display accumulation or dissipation;
- transition between meaningful states;
- attract attention to a just-changed consequence.

If removing a motion leaves comprehension unchanged, remove it unless it is a very restrained state affordance.

### Motion layers

Use three layers deliberately:

1. **State response:** hover, press, selection, value flash. Usually 100–180 ms.
2. **Model transition:** geometry changes, transformation, step advance. Usually 220–600 ms depending on travel and meaning.
3. **Continuous mechanism:** simulation, signal flow, scanning, or oscillation. Controlled by logical time and stoppable.

Do not run unrelated ambient loops inside an already active learning model. The host may own atmosphere; the component owns causal motion.

### Temporal grammar

- Input acknowledgment begins immediately.
- The primary model consequence begins in the same perceptual moment.
- Propagated consequences follow in causal order.
- Interpretation arrives after the evidence, not before or simultaneously.
- Exits are usually faster than entrances.
- Repeated manual input replaces or retargets animation rather than stacking it.

Use duration to communicate distance and complexity, not to decorate importance. A large spatial transformation can take longer than a local value update. Do not make routine adjustments theatrical.

### Interpolation versus simulation

For deterministic transitions, interpolate between logical states. For systems governed by repeated rules, step the model. Do not fake a physical or algorithmic result with a scripted endpoint when the simplified mechanism can run clearly.

Conversely, do not introduce a heavy physics engine for a concept that needs one analytic curve or constrained geometric interpolation.

### Manual control and autoplay

Autoplay is a convenience. It must:

- call the same transition used by manual stepping;
- expose pause;
- stop at a meaningful completion or bounded loop;
- cancel on manual step, scrub, drag, reset, or teardown;
- never make an essential state unreachable manually.

When a learner scrubs a timeline, the playhead is canonical. Do not let an old animation continue writing a competing value.

### Trails and persistence

Use trails when the path is evidence:

- a descent path on a landscape;
- signal propagation through edges;
- a trajectory envelope;
- a transformed object's correspondence;
- probe scan order.

Bound trail length and opacity. A trail should clarify past states without obscuring the current model.

### Reduced motion

Reduced motion preserves information and reachable states:

- replace travel with immediate placement plus persistent connectors;
- replace particle flow with arrow direction and activated routes;
- replace sweeping transformation with named discrete steps or short fades;
- replace pulsing with a stable outline;
- render the final state of an entrance immediately;
- keep manual controls and evidence identical.

Never hide the model, disable the interaction, or leave content at opacity zero.

## 10. Renderer-specific craft

### Choose the renderer from the representation

Use semantic DOM for:

- controls;
- short records;
- discrete choices;
- sortable or placeable labeled items;
- text-heavy states;
- accessible readouts.

Use SVG for:

- precise lines, vectors, nodes, regions, paths, axes, and connectors;
- small or medium data-bound sets;
- direct manipulation of named geometric elements;
- diagrams whose elements need focus, labels, or individual state;
- analytic curves and boundaries.

Use Canvas for:

- dense fields;
- image-like grids;
- thousands of moving marks;
- particle or pixel-based models;
- a scene that redraws as one surface;
- expensive visualizations that do not benefit from named DOM elements.

Use a hybrid when the layers have different needs: Canvas field plus DOM controls and labels; SVG overlay over Canvas; DOM construction objects beside an SVG consequence view. Keep one canonical state and one coordinated render.

### DOM craft

- Use real controls and concise labels.
- Keep selection state in state, then derive `aria-pressed`, disabled feasibility, classes, and readouts.
- Avoid rebuilding the entire subtree on continuous input.
- Keep changing numbers stable with tabular numerals and explicit formatting.
- Prevent feedback text from changing layout height; reserve a stable local line when necessary.
- Scope selectors beneath the component root.

### SVG craft

- Use a viewBox that matches a useful drawing coordinate system.
- Use named groups for semantic layers: construction, data, active path, annotation, handles.
- Compute analytic geometry and update attributes; do not approximate a crisp boundary by sampling dots.
- Add `vector-effect="non-scaling-stroke"` where scaled hairlines must stay crisp.
- Define arrowheads, clips, masks, and gradients with component-unique IDs.
- Keep text horizontal and legible unless the subject requires rotation.
- Place invisible wider hit paths behind thin visible paths.
- Convert pointer coordinates through the surface bounding box and viewBox.
- Avoid clearing and rebuilding all SVG elements for every pointer move.

Recommended layer order:

```text
background construction
reference geometry / invariant
model data
active or selected evidence
handles and hit regions
labels and local measurements
focus / feedback
```

### Canvas craft

Separate model stepping from drawing. Use the host's Canvas helper and resize callback. Draw at device-appropriate resolution while using CSS pixels for layout and logical coordinates for state.

Recommended draw order:

```text
clear
quiet field/grid
invariant/reference marks
primary model
active consequence/trail
annotations that belong on canvas
```

Keep essential text in DOM when it changes, requires accessibility, or needs exact typography. Canvas labels are appropriate for numerous tightly bound marks, but their font, contrast, and alignment must be deliberate.

Avoid a permanent `requestAnimationFrame` loop for a static instrument. Mark the view dirty and render on demand. For continuous systems, stop the loop on teardown and honor reduced motion.

### Hybrid alignment

When overlaying DOM or SVG on Canvas:

- share a common logical coordinate transform;
- update overlay position after resize;
- ensure page scaling is accounted for exactly once;
- avoid reading layout on every frame;
- keep pointer hit testing in the same coordinate space;
- use stable anchor points rather than guessed offsets.

### Performance priorities

Optimize only after representation is correct:

- cap particle and history counts;
- precompute static geometry;
- cache offscreen image-like layers;
- throttle expensive field recomputation while rendering the final committed value;
- schedule at most one pending render for high-frequency input;
- update DOM text only when its formatted value changes;
- avoid allocating large arrays per frame;
- suspend work when hidden or destroyed.

Performance degradation must not change the logical result or comparison fairness. Reduce visual density or interpolation first.

## 11. Visual craft under the host theme

### Inherit, then specialize

Use host tokens for:

- background and surfaces;
- general text and muted text;
- base borders;
- display and body type roles;
- standard control treatment;
- page-level accent behavior.

Add only component-owned semantics:

- active versus inactive;
- cause versus consequence;
- class/category distinctions required by the subject;
- positive/negative where the domain defines them;
- a concept-specific shape, texture, line, or motion signature.

Do not replace the host background, import another font system, or wrap the component in an unrelated themed poster.

### Define a concept signature

Before CSS, write one sentence:

```text
The component will be remembered for …
```

Good signatures emerge from the model:

- a decision boundary pivoting around its bias;
- a space visibly folding until classes separate;
- responsibility flowing backward along a stable graph;
- identical runners diverging on one shared terrain;
- a kernel window carrying source cells into an output;
- a constraint rail compressing as objects are selected;
- a trajectory leaving a fading but persistent envelope.

Bad signatures are generic effects:

- neon glow;
- glass cards;
- gradient blobs;
- floating particles unrelated to the model;
- a giant decorative number;
- a hover lift applied to everything.

### Shape language

Let shape express the subject:

- vectors, axes, construction lines, and dimension ticks for geometry;
- channels, pulses, and junctions for propagation;
- cells, footprints, and mapped outputs for local operators;
- rails, sockets, and capacity bands for constraints;
- fields, contours, and trajectories for optimization;
- layers, folds, and correspondence threads for transformations.

Repeat a small shape vocabulary consistently. Do not mix pills, soft blobs, sharp technical cut corners, glass panels, and cartoon badges without a conceptual reason.

### Semantic color

Use a restrained budget:

- host surface and ink;
- one primary active accent;
- one secondary consequence or comparison accent when necessary;
- domain category colors only when categories carry meaning;
- warning/error/success colors only for actual domain semantics.

Keep each color role stable across states and coordinated views. If cyan means input in the model, do not reuse it for a different “best result” badge. Use opacity, stroke weight, pattern, or enclosure to show intensity without multiplying hues.

### Hierarchy

Exactly one element dominates: the model, field, trajectory, or transformation. Establish hierarchy through:

- area;
- contrast;
- spatial centrality;
- detail;
- motion;
- annotation density.

Controls should be discoverable but subordinate. Readouts should be close but not louder than what they measure. If two views are equally large, they must be a true comparison; otherwise demote one.

### Spacing and alignment

Use the host rhythm and a small internal spacing scale. Align:

- control labels with their values;
- compared plots to shared baselines;
- local readouts to measured geometry;
- steps to stable graph coordinates;
- probe detail to the overview footprint;
- formula terms to the objects they describe.

Irregular gaps and near-missed alignments read as machine-generated even when colors are attractive.

### Typography and numbers

- Use host type roles.
- Keep labels short and in the page language.
- Do not create bilingual interface labels unless the domain term genuinely requires both.
- Format all changing numbers with deliberate precision.
- Use tabular numerals for changing readouts.
- Pair units with values consistently.
- Avoid tiny uppercase labels when Chinese or projection distance makes them hard to read.
- Do not repeat the page title inside the component.

### Controls as instruments

Controls should feel coupled to the model:

- slider track may carry meaningful ticks or regimes;
- a play button reflects running/paused state;
- a step control advances one actual transition;
- a preset names a diagnostic condition;
- a constrained object previews feasibility;
- a direct handle visually belongs to the geometry.

Give every actionable element hover, active, focus, and disabled treatment. Do not overstyle standard controls into ornamental objects that obscure their function.

### Local annotation

Prefer:

- leader lines;
- on-path labels;
- bracketed dimensions;
- small formula terms;
- direct object labels;
- threshold marks;
- origin and endpoint labels;
- shared axis notes.

Avoid:

- remote prose cards;
- legends for two directly labelable items;
- instruction badges;
- status cards;
- repeated section headings inside a small component.

### Craft check

Before technical QA, ask:

1. Is the model visibly dominant?
2. Is the concept signature derived from the subject?
3. Does the host theme remain intact?
4. Are cause and consequence visually distinct?
5. Are comparable states spatially and numerically fair?
6. Does every control feel attached to what it changes?
7. Can redundant panels, borders, labels, or effects be removed?
8. Would a still screenshot communicate the current relationship?

## 12. Implementation recipes

These recipes encode fragile mechanics. Adapt names and domain logic; preserve the boundaries.

### Recipe: one scheduled render

For high-frequency input, accept every logical value but keep at most one pending visual render:

```js
let renderPending = false;

function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    render(state);
  });
}
```

The final input event must update state before the scheduled callback. Do not debounce so aggressively that the committed final value is lost.

### Recipe: pointer position to SVG domain

Keep screen coordinates out of state:

```js
function svgPoint(event, svg, viewBox) {
  const source = (event.touches && event.touches[0])
    || (event.changedTouches && event.changedTouches[0])
    || event;
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: viewBox.x, y: viewBox.y };
  const p = new DOMPoint(source.clientX, source.clientY)
    .matrixTransform(matrix.inverse());

  return {
    x: Math.max(viewBox.x, Math.min(viewBox.x + viewBox.width, p.x)),
    y: Math.max(viewBox.y, Math.min(viewBox.y + viewBox.height, p.y))
  };
}
```

The inverse screen matrix handles both the host transform and the SVG viewBox, including preserved aspect ratio. If the host supplies a coordinate adapter, use its documented coordinate space and do not remove the same transform twice. Verify with a visible handle after resize and host scaling.

### Recipe: direct input and precise input share one action

```js
function setAngle(value, source) {
  dispatch({
    type: "set-angle",
    value: Math.max(-Math.PI, Math.min(Math.PI, value)),
    source
  });
}

handle.addEventListener("pointermove", event => {
  if (event.pointerId !== activePointer) return;
  const p = logicalPoint(event);
  setAngle(Math.atan2(origin.y - p.y, p.x - origin.x), "pointer");
});

range.addEventListener("input", () => {
  setAngle(Number(range.value) * Math.PI / 180, "range");
});
```

Render updates both handle geometry and range value. Do not dispatch one input from the other element's synthetic event.

### Recipe: named SVG elements updated from state

```js
const view = {
  vector: root.querySelector("[data-vector]"),
  boundary: root.querySelector("[data-boundary]"),
  handle: root.querySelector("[data-handle]"),
  value: root.querySelector("[data-angle-value]")
};

function render(s) {
  const vx = Math.cos(s.angle);
  const vy = -Math.sin(s.angle);
  const tip = { x: origin.x + vx * length, y: origin.y + vy * length };
  const tangent = { x: -vy, y: vx };

  view.vector.setAttribute("x2", tip.x);
  view.vector.setAttribute("y2", tip.y);
  view.handle.setAttribute("cx", tip.x);
  view.handle.setAttribute("cy", tip.y);
  view.boundary.setAttribute("x1", origin.x - tangent.x * 150);
  view.boundary.setAttribute("y1", origin.y - tangent.y * 150);
  view.boundary.setAttribute("x2", origin.x + tangent.x * 150);
  view.boundary.setAttribute("y2", origin.y + tangent.y * 150);
  view.value.textContent = `${Math.round(s.angle * 180 / Math.PI)}°`;
}
```

This makes the geometric relationship explicit. Do not draw the boundary as sampled pixels or separately approximate its angle.

### Recipe: autoplay uses logical step

```js
let timer = 0;

function advanceOne() {
  dispatch({ type: "advance" });
}

function start() {
  if (timer || state.complete) return;
  dispatch({ type: "set-running", value: true });
  timer = window.setInterval(() => {
    if (state.complete) {
      stop();
      return;
    }
    advanceOne();
  }, 650);
}

function stop() {
  if (timer) window.clearInterval(timer);
  timer = 0;
  dispatch({ type: "set-running", value: false });
}

stepButton.addEventListener("click", () => {
  stop();
  advanceOne();
});
```

For smoother model time, use `requestAnimationFrame`, but keep a separate bounded logical transition. Manual input must cancel or take ownership of autoplay.

### Recipe: deterministic generated sample

```js
function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeSample(seed, count) {
  const random = mulberry32(seed);
  return Array.from({ length: count }, (_, id) => ({
    id,
    x: random() * 2 - 1,
    y: random() * 2 - 1
  }));
}
```

Generate shared comparison samples once. Reset uses the same seed; “new sample” changes it explicitly.

### Recipe: Canvas resize and dirty drawing

```js
const canvas = root.querySelector("canvas");
let ctx = null;
let cssWidth = 1;
let cssHeight = 1;
let dirty = true;

function createCanvasFit(canvas, drawAfterFit, host) {
  const context = canvas.getContext("2d");

  function fit() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, canvas.offsetWidth || rect.width);
    const height = Math.max(1, canvas.offsetHeight || rect.height);
    const hostScale = rect.width && width ? rect.width / width : 1;
    const density = Math.min(2.5, devicePixelRatio * Math.max(1, hostScale));
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    context.setTransform(density, 0, 0, density, 0, 0);
    drawAfterFit(context, width, height);
  }

  const observer = new ResizeObserver(fit);
  observer.observe(canvas);
  const offHostResize = host?.onResize ? host.onResize(fit) : () => {};
  fit();

  return {
    redraw: fit,
    stop() {
      observer.disconnect();
      offHostResize();
    }
  };
}

const fitted = createCanvasFit(canvas, (nextContext, width, height) => {
  ctx = nextContext;
  cssWidth = width;
  cssHeight = height;
  dirty = true;
  draw();
}, host);

function invalidate() {
  dirty = true;
  if (!state.running) requestAnimationFrame(draw);
}

function draw(now = 0) {
  if (!ctx || (!dirty && !state.running)) return;
  dirty = false;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  drawInvariantLayer(ctx, state, cssWidth, cssHeight);
  drawModel(ctx, state, cssWidth, cssHeight, now);
}

function destroyCanvas() {
  fitted.stop();
}
```

Retain the returned `{ redraw, stop }` object and invoke `stop()` during teardown. Prefer the host's equivalent fitter when one is supplied.

### Recipe: local invalid feedback without state drift

```js
function transition(s, action) {
  if (action.type !== "toggle-item") return s;

  const nextIds = s.selected.includes(action.id)
    ? s.selected.filter(id => id !== action.id)
    : [...s.selected, action.id];
  const used = totalMass(nextIds);

  if (used > s.limit) {
    return {
      ...s,
      feedback: {
        kind: "capacity",
        item: action.id,
        overBy: used - s.limit
      }
    };
  }

  return {
    ...s,
    selected: nextIds,
    feedback: null
  };
}
```

The rejected item remains identifiable through `feedback.item`, while the valid selection stays intact. Render capacity, feasibility, item state, and message from this one next state.

### Recipe: reduced-motion branch

```js
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

function transitionGeometry(from, to) {
  if (reduceMotion.matches) {
    visual = to;
    render(state);
    return;
  }
  animateBetween(from, to, {
    duration: 420,
    onUpdate: value => {
      visual = value;
      render(state);
    }
  });
}
```

Listen for preference changes only if the host can remain mounted while the setting changes, and detach that listener during teardown.

### Complete structural example: projection instrument

This is a component example, not a page template. It demonstrates boundary, host-theme inheritance, a concept signature, direct and precise input, one state path, local evidence, exact reset, and teardown. Copy its architecture when useful; do not copy its topic, composition, colors, labels, or geometry into unrelated tasks.

```html
<style>
  .projection-widget {
    --iw-active: var(--accent, #00e5ff);
    --iw-consequence: var(--accent-2, #ffb020);
    width: 100%;
    min-width: 0;
    color: var(--ink, inherit);
    font: inherit;
  }

  .projection-widget .iw-shell {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 14px;
    min-width: 0;
  }

  .projection-widget .iw-rail {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .projection-widget .iw-rail label {
    flex: 0 0 auto;
    color: var(--muted, currentColor);
  }

  .projection-widget .iw-rail input[type="range"] {
    flex: 1 1 240px;
    min-width: 120px;
  }

  .projection-widget .iw-value {
    min-width: 5ch;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .projection-widget .iw-reset {
    min-height: 36px;
  }

  .projection-widget .iw-stage {
    display: block;
    width: 100%;
    min-height: 310px;
    border: 1px solid var(--line, rgba(127,127,127,.28));
    border-radius: var(--radius, 14px);
    background: var(--panel, rgba(127,127,127,.05));
    touch-action: none;
  }

  .projection-widget .iw-axis,
  .projection-widget .iw-guide {
    stroke: var(--line, rgba(127,127,127,.38));
    vector-effect: non-scaling-stroke;
  }

  .projection-widget .iw-axis {
    stroke-width: 1.5;
  }

  .projection-widget .iw-guide {
    stroke-width: 1;
    stroke-dasharray: 5 5;
  }

  .projection-widget .iw-vector {
    stroke: var(--iw-active);
    stroke-width: 4;
    vector-effect: non-scaling-stroke;
  }

  .projection-widget .iw-projection {
    stroke: var(--iw-consequence);
    stroke-width: 7;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }

  .projection-widget .iw-handle-visible {
    fill: var(--panel, #10141c);
    stroke: var(--iw-active);
    stroke-width: 3;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .projection-widget .iw-handle-hit {
    fill: transparent;
    cursor: grab;
  }

  .projection-widget .iw-handle-hit:hover + .iw-handle-visible,
  .projection-widget .iw-handle-hit:focus + .iw-handle-visible {
    stroke-width: 5;
  }

  .projection-widget .iw-handle-hit:active {
    cursor: grabbing;
  }

  .projection-widget .iw-label {
    fill: var(--muted, currentColor);
    font: 14px var(--font-sans, sans-serif);
  }

  .projection-widget .iw-label-strong {
    fill: var(--ink, currentColor);
    font-weight: 600;
  }

  .projection-widget .iw-readout {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    min-height: 28px;
    color: var(--muted, currentColor);
  }

  .projection-widget .iw-result {
    color: var(--iw-consequence);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }

  .projection-widget .iw-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (prefers-reduced-motion: no-preference) {
    .projection-widget .iw-vector,
    .projection-widget .iw-projection,
    .projection-widget .iw-handle-visible {
      transition: stroke-width 140ms ease, opacity 140ms ease;
    }
  }
</style>

<div class="projection-widget" data-projection-widget>
  <div class="iw-shell">
    <div class="iw-rail">
      <span>Vector angle</span>
      <input data-angle aria-label="Vector angle"
             type="range" min="-170" max="170" step="1" value="38">
      <output class="iw-value" data-angle-value>38°</output>
      <button class="iw-reset" data-reset type="button">Reset</button>
    </div>

    <svg class="iw-stage" data-stage viewBox="0 0 720 360"
         role="img" aria-label="Vector projection instrument">
      <title>Vector projection instrument</title>
      <desc>
        Drag the vector endpoint or adjust the angle control. The amber segment
        shows the vector's signed projection on the horizontal axis.
      </desc>
      <defs data-defs></defs>

      <line class="iw-axis" x1="70" y1="230" x2="650" y2="230"/>
      <line class="iw-guide" data-drop x1="0" y1="0" x2="0" y2="0"/>
      <line class="iw-projection" data-projection x1="360" y1="230" x2="360" y2="230"/>
      <line class="iw-vector" data-vector x1="360" y1="230" x2="0" y2="0"/>

      <circle class="iw-handle-hit" data-handle tabindex="0"
              role="slider" aria-label="Vector angle"
              aria-valuemin="-170" aria-valuemax="170"
              cx="0" cy="0" r="24"/>
      <circle class="iw-handle-visible" data-handle-visible cx="0" cy="0" r="9"/>

      <text class="iw-label" x="635" y="255">axis</text>
      <text class="iw-label iw-label-strong" data-vector-label x="0" y="0">v</text>
      <text class="iw-label" data-projection-label x="0" y="0">projection</text>
    </svg>

    <div class="iw-readout">
      <span>The shadow keeps only the component parallel to the axis.</span>
      <span class="iw-result" data-result>0.79 × |v|</span>
    </div>
    <div class="iw-sr-only" data-status aria-live="polite"></div>
  </div>
</div>

<script>
(() => {
  const script = document.currentScript;
  const root = script?.previousElementSibling;
  if (!root?.matches("[data-projection-widget]")) return;

  const stage = root.querySelector("[data-stage]");
  const range = root.querySelector("[data-angle]");
  const reset = root.querySelector("[data-reset]");
  const angleValue = root.querySelector("[data-angle-value]");
  const result = root.querySelector("[data-result]");
  const status = root.querySelector("[data-status]");
  const vector = root.querySelector("[data-vector]");
  const projection = root.querySelector("[data-projection]");
  const drop = root.querySelector("[data-drop]");
  const handle = root.querySelector("[data-handle]");
  const handleVisible = root.querySelector("[data-handle-visible]");
  const vectorLabel = root.querySelector("[data-vector-label]");
  const projectionLabel = root.querySelector("[data-projection-label]");

  const origin = { x: 360, y: 230 };
  const vectorLength = 145;
  const initialAngle = 38;
  let state = { angle: initialAngle };
  let activePointer = null;
  let destroyed = false;

  function clampAngle(value) {
    return Math.max(-170, Math.min(170, Math.round(value)));
  }

  function transition(current, action) {
    if (action.type === "set-angle") {
      return { ...current, angle: clampAngle(action.value) };
    }
    if (action.type === "reset") {
      return { angle: initialAngle };
    }
    return current;
  }

  function dispatch(action, announce = false) {
    if (destroyed) return;
    state = transition(state, action);
    render();
    if (announce) {
      status.textContent =
        `Angle ${state.angle} degrees, signed projection ${projectionValue().toFixed(2)}`;
    }
  }

  function projectionValue() {
    return Math.cos(state.angle * Math.PI / 180);
  }

  function render() {
    const radians = state.angle * Math.PI / 180;
    const tip = {
      x: origin.x + Math.cos(radians) * vectorLength,
      y: origin.y - Math.sin(radians) * vectorLength
    };
    const foot = { x: tip.x, y: origin.y };
    const signed = projectionValue();

    vector.setAttribute("x2", tip.x);
    vector.setAttribute("y2", tip.y);
    projection.setAttribute("x2", foot.x);
    drop.setAttribute("x1", tip.x);
    drop.setAttribute("y1", tip.y);
    drop.setAttribute("x2", foot.x);
    drop.setAttribute("y2", foot.y);

    for (const node of [handle, handleVisible]) {
      node.setAttribute("cx", tip.x);
      node.setAttribute("cy", tip.y);
    }

    handle.setAttribute("aria-valuenow", state.angle);
    range.value = state.angle;
    angleValue.textContent = `${state.angle}°`;
    result.textContent = `${signed.toFixed(2)} × |v|`;

    vectorLabel.setAttribute("x", tip.x + 14);
    vectorLabel.setAttribute("y", tip.y - 10);
    projectionLabel.setAttribute("x", (origin.x + foot.x) / 2 - 28);
    projectionLabel.setAttribute("y", origin.y + 28);
  }

  function logicalPoint(event) {
    const matrix = stage.getScreenCTM();
    if (!matrix) return { ...origin };
    return new DOMPoint(event.clientX, event.clientY)
      .matrixTransform(matrix.inverse());
  }

  function angleFromPointer(event) {
    const p = logicalPoint(event);
    return Math.atan2(origin.y - p.y, p.x - origin.x) * 180 / Math.PI;
  }

  function onPointerDown(event) {
    activePointer = event.pointerId;
    handle.setPointerCapture(event.pointerId);
    dispatch({ type: "set-angle", value: angleFromPointer(event) });
  }

  function onPointerMove(event) {
    if (event.pointerId !== activePointer) return;
    dispatch({ type: "set-angle", value: angleFromPointer(event) });
  }

  function endPointer(event) {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    dispatch({ type: "set-angle", value: state.angle }, true);
  }

  function onHandleKey(event) {
    const delta = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: "set-angle", value: state.angle - delta }, true);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: "set-angle", value: state.angle + delta }, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: "set-angle", value: -170 }, true);
    } else if (event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      dispatch({ type: "set-angle", value: 170 }, true);
    }
  }

  function onRangeInput() {
    dispatch({ type: "set-angle", value: Number(range.value) });
  }

  function onRangeChange() {
    dispatch({ type: "set-angle", value: Number(range.value) }, true);
  }

  function onReset() {
    activePointer = null;
    dispatch({ type: "reset" }, true);
  }

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", endPointer);
  handle.addEventListener("pointercancel", endPointer);
  handle.addEventListener("keydown", onHandleKey);
  range.addEventListener("input", onRangeInput);
  range.addEventListener("change", onRangeChange);
  reset.addEventListener("click", onReset);

  render();

  root.destroyProjectionWidget = () => {
    if (destroyed) return;
    destroyed = true;
    handle.removeEventListener("pointerdown", onPointerDown);
    handle.removeEventListener("pointermove", onPointerMove);
    handle.removeEventListener("pointerup", endPointer);
    handle.removeEventListener("pointercancel", endPointer);
    handle.removeEventListener("keydown", onHandleKey);
    range.removeEventListener("input", onRangeInput);
    range.removeEventListener("change", onRangeChange);
    reset.removeEventListener("click", onReset);
    delete root.destroyProjectionWidget;
  };
})();
</script>
```

The example's visual result is deliberately quiet. Its quality comes from conceptual coupling: the vector is the control, its shadow is the direct evidence, the guide preserves correspondence, the number quantifies the geometry, and all input paths share one state.

## 13. Transferable studies from high-craft explainers

These studies abstract successful mechanisms seen in high-craft interactive explainers. They are not neural-network templates. Transfer the relationship, not the dark palette, terminology, exact layout, or Canvas-heavy implementation.

### Study A — Geometry that explains the equation

**Source mechanism:** a weight vector and a decision boundary remain perpendicular. Dragging the vector rotates the boundary; changing bias translates it. Points switch regions directly on the stage.

**Why it works:**

- the manipulable object is a mathematical quantity;
- direct geometry changes before any explanation;
- vector, boundary, points, and local values share coordinates;
- three conclusions emerge from one model instead of three cards.

**Transfer to:**

- normal vectors and planes;
- torque arm and force direction;
- separating thresholds;
- light rays and surface normals;
- constraint lines in optimization;
- camera orientation and view plane.

**Preserve:** analytic geometry, a visible handle, stable reference axes, and local measurement.

**Do not transfer:** neon styling, arbitrary particle backgrounds, or multiple unrelated parameter cards.

### Study B — Reframe through a continuous spatial change

**Source mechanism:** the learner first attempts a separation that cannot solve the case. A staged transformation folds or remaps the same points into a representation where a new boundary succeeds.

**Why it works:**

- failure is genuine and remains visible;
- object identity persists through color and motion;
- the new method changes representation, not merely the answer;
- stages structure the reveal without replacing the central model.

**Transfer to:**

- coordinate transforms;
- feature engineering;
- map projections;
- unwrapping periodic data;
- changing bases;
- sorting or grouping representations;
- reframing a physical constraint.

**Preserve:** the failed state, correspondence, meaningful intermediate states, and an explicit invariant.

**Do not transfer:** a generic “next” carousel whose panels contain unrelated diagrams.

### Study C — Stable topology with traveling responsibility

**Source mechanism:** values advance through a stable network; later, influence moves backward over the same topology. Active edges, local arithmetic, node values, and accumulated expressions update in causal order.

**Why it works:**

- spatial memory is preserved;
- direction is embodied in path activation;
- local rules appear where they operate;
- manual and automatic stepping share the same logical sequence.

**Transfer to:**

- supply chains;
- dependency graphs;
- electrical paths;
- biological signaling;
- calculation trees;
- message routing;
- responsibility attribution.

**Preserve:** stable layout, previous/current/next context, direction distinction, and completion evidence.

**Do not transfer:** moving dots on lines with no visible values or rules.

### Study D — Fairness through synchronized clocks

**Source mechanism:** multiple parameter choices begin on the same landscape at the same point and move under one clock. Shared axes make overshoot, slow convergence, and stability directly comparable.

**Why it works:**

- only one variable differs;
- all alternatives begin together;
- the landscape and scale remain fixed;
- divergent behavior is retained instead of rescaled away.

**Transfer to:**

- numerical integration step sizes;
- damping regimes;
- queue policies;
- resource strategies;
- control gains;
- search algorithms;
- competing models on shared data.

**Preserve:** identical seed, start, scale, clock, and update count.

**Do not transfer:** separate controls or auto-scaling plots for each run.

### Study E — A real mechanism with coordinated views

**Source mechanism:** a simplified model actually trains. A dominant decision field, compact internal network, loss history, controls, and diagnostic messages all refer to the same iteration.

**Why it works:**

- the primary field visibly improves or fails;
- internal structure is subordinate but alive;
- history provides temporal evidence;
- presets create meaningfully different regimes;
- instability becomes a domain state.

**Transfer to:**

- iterative solvers;
- ecological populations;
- control systems;
- optimization;
- spreading processes;
- queue dynamics;
- adaptive filters.

**Preserve:** real or honest deterministic mechanism, one logical timestamp, bounded work, start/pause/step/reset, and diagnostic extremes.

**Do not transfer:** dashboard equality, fabricated metrics, or expensive fields updating on unrelated clocks.

### Study F — Aligned views reveal generalization

**Source mechanism:** simple, balanced, and overly flexible fits share data, axes, and progression. Training and validation traces stay aligned so the best stopping point and overfitting gap become visible.

**Why it works:**

- comparison is spatially fair;
- data identity is stable;
- model complexity changes one dimension;
- the conclusion sits at the divergence between two forms of evidence.

**Transfer to:**

- calibration versus fit;
- compression tradeoffs;
- smoothing strength;
- capacity planning;
- signal filtering;
- bias/variance;
- training versus real-world performance.

**Preserve:** shared samples, axes, stage, and stopping logic.

**Do not transfer:** three unaligned chart cards or a highlighted winner without the comparative path.

### Study G — Probe, footprint, products, output

**Source mechanism:** a movable local window highlights source cells, mirrors them beside editable weights, shows each product, aggregates them, and marks the corresponding output location. Automatic scanning and manual movement remain synchronized.

**Why it works:**

- overview and detail share a visible footprint;
- each contribution is traceable;
- the aggregate is spatially tied to its output;
- editing source or weights changes all views from one state;
- scanning shows repetition without hiding the local rule.

**Transfer to:**

- image filters;
- moving averages;
- neighborhood voting;
- local statistics;
- finite-difference stencils;
- audio windows;
- spatial sampling.

**Preserve:** orientation, footprint, one-to-one correspondence, exact aggregation, output mapping, and input ownership.

**Do not transfer:** a disconnected magnifier, tooltip-only inspection, or animation whose scan position differs from the computed output.

### What the source examples do not justify copying

High quality there does not imply universal use of:

- dark backgrounds;
- cyan and magenta;
- Canvas on every page;
- continuous RAF loops;
- large amounts of simulation code;
- neural-network diagrams;
- dense technical readouts;
- 14-page narrative dependencies.

Choose representation and visual signature from the assigned component. The transferable lesson is deep coupling between action, model, evidence, and state.

## 14. Machine-made failure signatures

Remove these before delivery.

### Page disguised as component

- repeats the page title and subtitle;
- creates its own full-background visual theme;
- adds chapter labels, navigation, footer, or page count;
- includes several article sections;
- owns global keyboard shortcuts;
- applies global selectors or resets.

Repair by restoring one root, one teaching region, and one model.

### Form-to-number pseudo-interaction

- controls dominate the composition;
- the model is tiny or absent;
- action changes only a numeric card;
- relationship is described in text rather than drawn;
- sliders operate independent quantities with no shared model.

Repair by making the affected object dominant and placing the value beside its direct visual consequence.

### Dashboard cabinet

- three or more equal cards hold heterogeneous status, prose, and values;
- every piece of information has a border;
- a tall sidebar compresses the stage;
- duplicated charts present no different explanatory dimension;
- status is styled as a KPI.

Repair by moving values and annotations onto the stage, keeping one boxed readout at most, and demoting history or internal structure.

### Invisible affordance

- drag works only after accidental discovery;
- a tooltip or instruction pill explains an unmarked object;
- hover is the only way to reveal essential information;
- thin lines have thin hit regions;
- touch and keyboard cannot reach the state.

Repair with handles, hover/focus preview, cursors, semantic alternatives, and larger invisible hit targets.

### Fake causality

- an animation plays but the displayed numbers are scripted separately;
- nodes flash in order without local values or rules;
- a metric changes on a timer unrelated to the drawn model;
- a transformation is a cross-fade;
- a success state appears after a fixed number of clicks rather than evidence.

Repair by sharing one state and computing each view from the same snapshot.

### Unfair comparison

- alternatives use different samples, axes, crops, clocks, or starting states;
- each plot rescales independently;
- one run starts later;
- divergent values vanish;
- a preferred alternative receives more visual detail.

Repair by freezing invariants, aligning scales, and controlling all runs through one action.

### State drift

- control value, geometry, label, and readout disagree;
- direct manipulation does not update the keyboard alternative;
- autoplay and manual step race;
- reset creates new random data unintentionally;
- an old animation overwrites a newer input;
- selection is stored in both DOM classes and JavaScript arrays.

Repair with one canonical state, one transition path, and one render.

### Decorative motion

- everything pulses or floats;
- glow substitutes for direction or magnitude;
- entrance animation repeats on every update;
- a long transition delays routine adjustment;
- continuous RAF runs on a static component;
- reduced motion removes evidence.

Repair by assigning each motion a causal job and leaving a persistent state.

### Generic visual slop

- gradient mesh or glass panel unrelated to subject;
- emoji headings;
- bilingual double labels;
- instruction stickers;
- excessive pills;
- giant generic number;
- arbitrary card hover lift;
- inconsistent radii and border weights;
- many accent colors without stable semantics;
- tiny labels and unformatted floating-point output.

Repair by inheriting the host theme and defining one subject-specific signature.

### False completion

- “Done” appears because every step was visited, though the relationship is still unclear;
- correct/incorrect is invented for an open-ended instrument;
- conclusion appears before the learner creates evidence;
- final motion ends on an empty or reset state;
- the component cannot replay its primary action.

Repair by defining a domain completion or reveal condition and preserving the final evidence.

### Fragile engineering

- page-level ID lookup reaches outside the component;
- pointer coordinates ignore host scaling;
- timers or observers survive remount;
- generated history grows without bound;
- Canvas text is the only accessible explanation;
- layout depends on fixed pixel widths inside a smaller host region;
- resize moves graphics but not hit regions;
- third-party rendering is used where analytic geometry would be clearer.

Repair through the technical contract, not a visual patch.

## 15. Acceptance and delivery

### Review the learning argument first

Ask in order:

1. Can a viewer identify the model, current state, and primary action within two seconds?
2. Does the primary action alter a meaningful quantity?
3. Does that quantity visibly change the model itself?
4. Is the direct consequence stronger than the readout or explanation?
5. Can the learner identify what stayed invariant?
6. Does measured evidence quantify rather than replace direct evidence?
7. Does interpretation follow the relevant evidence?
8. Is one claim taught through one coherent model?

Any “no” is a design failure even when the page renders cleanly.

### Review craft

1. Is one element visually dominant?
2. Is the concept signature specific to the subject?
3. Does the component inherit rather than replace the page theme?
4. Are cause, consequence, selection, and constraint visually distinct?
5. Are controls adjacent to what they change?
6. Are values and explanations attached to evidence?
7. Are comparable views aligned and fair?
8. Does the current state remain legible when paused?
9. Are all visible numbers formatted deliberately?
10. Have machine-made patterns been removed?

### State smoke matrix

Exercise every state that exists:

| State | Required observation |
|---|---|
| Initial | Representative model, primary affordance, current consequence, and essential labels are visible |
| Hover/focus | Actionable target responds without shifting layout; focus is visible |
| Primary pointer action | Logical quantity, model geometry/behavior, and every dependent view update together |
| Keyboard/touch alternative | Reaches the same logical state and evidence |
| Intermediate | Relationship remains inspectable; labels and identity persist |
| Diagnostic extreme | Threshold, reversal, saturation, divergence, invalidity, or completion remains legible |
| Invalid attempt | Last valid model persists; attempted object and exact constraint are identifiable |
| Reveal | Interpretation appears only after its evidence and does not erase that evidence |
| Pause | Current state is stable and meaningful |
| Reset | Exact initial state returns; stale feedback, history, and active work are removed |
| Rapid input | No animation stack, stale write, lost pointer, or unbounded history |
| Resize/page scale | Drawing, overlay, controls, hit regions, and labels remain aligned |
| Reduced motion | Same information, states, and actions remain available |
| Destroy/remount | No duplicate listener, observer, timer, loop, canvas, or renderer |

### Pattern-specific checks

**Instrument**

- Control range and units match the model.
- Diagnostic presets reveal different regimes.
- Direct model change is visible throughout input.

**Manipulator**

- Handle is discoverable before use.
- Screen coordinates map correctly after scaling.
- Cancellation leaves a valid state.
- Precise alternative input stays synchronized.

**Constructor**

- Constraint is visible before action.
- Feasibility is derived from current construction.
- Invalid feedback identifies the exact conflict.
- Removal and reversal work.

**Transformation**

- Objects preserve identity.
- Intermediate states are meaningful.
- Scrubbing controls the canonical state.
- Reduced motion preserves correspondence.

**Tracer**

- Topology remains stable.
- Direction, local rule, received value, and emitted result are visible.
- Manual and autoplay paths are identical.
- Completion preserves the route.

**Synchronized comparison**

- Data, start, axes, crop, clock, and update count match.
- Only the teaching variable differs.
- Off-scale and divergent values remain represented.

**Inspector**

- Footprint, local detail, operation, and output are synchronized.
- Orientation and indexing are consistent.
- Manual movement takes control from autoplay.

**Counterexample**

- Attempt is genuine.
- Failure evidence is objective and preserved.
- Reveal timing is evidence-based.
- Reframe explains the limitation.

**Live system**

- Mechanism is real or honestly labeled.
- All views share a logical timestamp.
- Work and history are bounded.
- Pause, step, reset, and instability handling are correct.

**Prediction and reveal**

- Prediction is committed before evidence.
- Prediction remains visible.
- Mechanism is shown before correctness.
- Repetition changes meaningful initial conditions.

### Technical delivery gate

Require:

- zero JavaScript errors;
- zero failed required resources;
- no overflow, clipping, nested scrolling, or unreachable controls;
- no host selector, style, event, or lifecycle pollution;
- no stale coordinated view;
- no lost final value after rapid input;
- exact reset;
- safe repeated teardown;
- expected behavior under the host page scale;
- required `Check` screenshots for materially different visual states.

Passing automated checks does not establish quality. Inspect the initial, active, diagnostic, and reset states as images. Confirm the evidence is visually dominant and the component reads as one designed instrument rather than a collection of functioning controls.

### Delivery report

Report only what was actually implemented and verified:

- learner action;
- changed quantity;
- direct visual evidence;
- alternate input path;
- diagnostic/reveal state;
- reset and cleanup behavior;
- last checks run.

Do not claim interaction quality from code inspection alone. Do not report a state you did not exercise.
````

### `assets/lib/LIBS.md`（8,321 字符）

````
# 已预置的库

这些文件**已经在这里了**,不需要下载、不需要复制、不需要检查。
页面里直接写 `<script src="assets/lib/xxx.js"></script>`,相对 `pages/` 即可。
全部是 UMD 构建,已验证在 `file://` 下直接打开可用,不需要静态服务器。

`pages/` 下目前只有 `assets/`,页面和你自己的资源由你新建。

这份文件的原本在 `zzz/lib/LIBS.md`,和 `mlp.js` 一起是自家维护的;其余是第三方构建,
照原样放进来的。

## 按「要做的事」查

| 要做的事 | 引用这一行 | 全局对象 |
|---|---|---|
| 物体下落、碰撞、摆动、堆叠、拖拽、约束 | `<script src="assets/lib/matter.min.js"></script>` | `Matter` |
| 三维场景、可旋转的立体结构、光照材质 | `<script src="assets/lib/three.min.js"></script>` | `THREE` |
| 三维地球、球面上的点/弧线/区块 | three 之后再引 `<script src="assets/lib/globe.gl.min.js"></script>` | `Globe` |
| 生成式动画背景 | three 之后再引 `<script src="assets/lib/vanta.net.min.js"></script>` | `VANTA` |
| 坐标轴 + 刻度 + 图例的常规图表(折线、柱、散点、面积、饼、热力) | `<script src="assets/lib/echarts.min.js"></script>` | `echarts` |
| 可拖拽、可命中检测的二维场景(形状、分组、变换、层) | `<script src="assets/lib/konva.min.js"></script>` | `Konva` |
| 节点连线图、精确控制的矢量图形、数据绑定 | `<script src="assets/lib/d3.min.js"></script>` | `d3` |
| 成千上万个元素同时运动 | `<script src="assets/lib/pixi.min.js"></script>` | `PIXI` |
| 分步动画、依次出现、路径描绘、形变 | `<script src="assets/lib/anime.min.js"></script>` | `anime` |
| 多个动画按一条时间线精确编排 | `<script src="assets/lib/gsap.min.js"></script>` | `gsap` |
| 动画进度绑定到滚动位置 | gsap 之后再引 `<script src="assets/lib/ScrollTrigger.min.js"></script>` | `ScrollTrigger` |
| 播放矢量动画文件 | `<script src="assets/lib/lottie.min.js"></script>` | `lottie` |
| 伪三维插画 | `<script src="assets/lib/zdog.min.js"></script>` | `Zdog` |
| 元素跟随指针倾斜 | `<script src="assets/lib/vanilla-tilt.min.js"></script>` | `VanillaTilt` |
| 进入视野时淡入 | `<script src="assets/lib/aos.js"></script>` | `AOS` |
| 数学公式排版 | `<link rel="stylesheet" href="assets/lib/katex.min.css">` 加 `<script src="assets/lib/katex.min.js"></script>` | `katex` |
| 矩阵乘法、行列式、求逆、特征分解 | `<script src="assets/lib/ml-matrix.umd.js"></script>` | `mlMatrix` |
| 可复现的随机(同种子同序列) | `<script src="assets/lib/seedrandom.min.js"></script>` | `Math.seedrandom` |
| 在页面上实时训练一个小神经网络、画决策边界 | `<script src="assets/lib/mlp.js"></script>` | `MLP` |
| 加载预训练模型、在真图片上跑卷积、需要 GPU 的大矩阵 | `<script src="assets/lib/tf.min.js"></script>` | `tf` |

## mlp.js 怎么用

任意层数、任意输入维度、单个 sigmoid 输出的**二分类**,损失是交叉熵。
不做多分类(没有 softmax)、不做回归、不做卷积、不做动量/Adam。

```js
var net = MLP.create({ sizes:[2,10,10,1], act:'tanh', lr:0.3, seed:1 });
                    // act: tanh | relu | sigmoid;seed 可省,给了就每次一样

// 每帧推进若干个 mini-batch —— 逐帧控制权是这个文件存在的理由
for (var i = 0; i < 12; i++) net.step(trainSet, 16);

net.predict([x, y])                    // 前向,返回 0~1
net.evaluate(valSet)                   // {loss, acc}
net.field(-1.3,-1.3, 1.3,1.3, 80,80)   // 决策边界热力场,行优先的 Float64Array
net.layers[1].a                        // 第 2 层每个神经元的激活值,直接拿去画
net.activationLevels()                 // 每层的平均激活强度
net.reset()                            // 重新初始化,数据不动
net.diverged                           // 权重跑飞了(step 会自动停手)
```

样本格式 `{ x:[…], t:0|1 }`,`x` 的长度要等于 `sizes[0]`。

两点要知道:

- `diverged` 只判**数值崩了**(NaN/Inf 或 |w| 超过 `cfg.wmax`,默认 1e4)。
  「学习率太大没学会」是另一回事 —— 实测 lr=30 时 |w| 只有 55、数值完全正常,
  但准确率就是 0.5。那个要看 `evaluate().acc`,别指望 `diverged`。
- 实测 `[2,10,10,1]`、200 个点、每帧 12 个 mini-batch、80×80 决策边界每 8 帧重算:
  **每帧 0.66ms,热力场一次 4.4ms**,准确率 0.995。这个量级不需要 tf.js,
  见下一段。

## tf.min.js 的适用边界（先读这段再决定用不用）

**两三层的小网络在页面上实时训练,不要用它。** 实测过:2→10→10→1、200 个点、
每帧 12 个 mini-batch、80×80 决策边界每 8 帧重算一次 ——

```
                每帧耗时      热力场一次(80×80)
tf.min.js       102.7 ms         124 ms
手写四十行         0.79 ms          4.4 ms
```

两边收敛结果一样(准确率 0.95 vs 0.975,决策边界平均绝对差 0.03,肉眼分不出),
但这个量级的浮点量微不足道,时间全花在每帧上百次 kernel launch 和 `dataSync()`
的 GPU→CPU 回读上。**代码只省二十来行,帧预算全没了。**

这种场合手写就好:前向传播十几行、反向传播十几行、mini-batch 十行,用
`Float64Array`,每层激活留在 `layer.a` 里给可视化读。

**该用它的场合**:要加载别人训练好的模型、要在真实图片上跑卷积网络、矩阵大到
GPU 才算得动。这些手写做不到或慢得多。

用它的话记住一个坑:**每一步都要 `tf.tidy(() => …)` 或手动 `dispose()`**,
否则张量只增不减,页面越跑越慢,而且不报错 —— 用 `tf.memory().numTensors`
看这个数会不会一直涨。

## 精确版本

写代码按这些版本的 API 来,**不用去文件里查**(压缩后的构建里版本号往往抓不到,
`three.min.js` 尤其如此,不要在这上面浪费调用)。

| 文件 | 版本 |
|---|---|
| `three.min.js` | three **r160** (0.160.1) —— `outputColorSpace` 时代,不是 `outputEncoding` |
| `matter.min.js` | Matter.js **0.20.0** |
| `d3.min.js` | d3 **7.9.0** |
| `pixi.min.js` | PixiJS **7.4.2** |
| `anime.min.js` | anime.js **3.2.2** (旧版 API:`anime({targets:…})`,不是 v4 的 `animate()`) |
| `gsap.min.js` / `ScrollTrigger.min.js` | GSAP **3.12.5** |
| `globe.gl.min.js` | globe.gl **2.32.0** |
| `vanta.net.min.js` | Vanta **0.5.24** (只有 NET 这一种效果) |
| `lottie.min.js` | lottie-web **5.12.2** |
| `zdog.min.js` | Zdog **1.1.3** |
| `vanilla-tilt.min.js` | vanilla-tilt **1.8.1** |
| `aos.js` | AOS **2.3.4** |
| `mlp.js` | 自家维护,无版本号。原本在 `zzz/lib/mlp.js`,改了要两边同步 |
| `tf.min.js` | TensorFlow.js **4.22.0**（`tf.sequential` / `tf.layers.*` / `model.fit` 这代 API；1.5MB，加载要一两百毫秒） |

用不到的文件留着不管。需要别的库可以自行下载,同样放进 `pages/` 下本地引用,不要用 CDN。


## echarts.min.js —— 必须加 `renderer:'svg'`（这条不是偏好，是硬要求）

版本 6.1.0，全局 `echarts`。已验证 `file://` 下可用、零外部请求。

**默认的 canvas renderer 会把这一页的所有图表文字变成闸的盲区。** 实测同一份配置：

```
echarts.init(dom)                        → DOM 里 0 个文字   字号闸完全查不到
echarts.init(dom, null, {renderer:'svg'}) → DOM 里 10 个文字  闸能查到
```

而且那 10 个文字实测**全部是 12px** —— 轴名、图例、tooltip 在我们的分档里属于
标签档（≥14px）甚至正文档（≥16px），也就是**默认配置一上来就违反字号地板**。
canvas renderer 下这个违规永久隐形（`check_density` 的已知盲区就是
「canvas 里 `ctx.fillText` 画的字不在 DOM 里」）。

所以引它的时候两件事一起做:

```js
var c = echarts.init(el, null, { renderer: 'svg' });
c.setOption({
  textStyle: { fontSize: 16 },                    // 全局底线
  xAxis: { axisLabel: { fontSize: 14 } },         // 刻度带词句的按标签档
  yAxis: { name: '…', nameTextStyle: { fontSize: 14 } },
  legend: { textStyle: { fontSize: 14 } },
  tooltip: { textStyle: { fontSize: 16 } }
});
```

只含数字的刻度可以到 12px（刻度档地板就是 12），带词句的一律 ≥14。

在缩放舞台里正常:实测 1366×768（系数 0.853）下 hover 与 tooltip 定位都对。

## konva.min.js —— 二维场景，指针换算它自己就对

版本 10.3.1，全局 `Konva`。已验证 `file://` 下可用、零外部请求。

**它替掉的是最贵的那类手写代码**:可拖拽、可命中检测的二维场景。四轮统计里
「手写拖拽」命中 27 个文件、「手写折线/曲线绘制」56 个 —— 后者归 echarts，前者归它。

**指针换算不用自己做。** 实测在 `transform:scale(0.853)` 的舞台里，
`stage.getPointerPosition()` 返回的是舞台逻辑坐标（移到屏幕 341,213 → 读出 399.6,249.6）。
也就是它内部走 `getBoundingClientRect`，天然扛住外层缩放 —— 这正是
`base.js` 的 `Deck.pt` 为手写 canvas 解决的那个坑，用 Konva 就不必再解一遍。

**它的文字注定在闸的盲区里**（Konva 只有 canvas 渲染，没有 SVG 后端）。
`Konva.Text` 默认 `fontSize: 12`，同样违反地板，而且查不到。所以:

- 场景里的**图形**用 Konva
- 场景上的**文字标签**用 DOM 元素绝对定位叠在上面，不用 `Konva.Text`

这样字号回到 DOM、闸能查到，而且标签就近贴着图形（§6 要的就是这个）。
只有画在图形内部、离不开变换的短标注才值得用 `Konva.Text`，那时显式写 `fontSize`。


## katex —— 必须连 CSS 一起引，但只要这两个文件

版本 0.18.4，全局 `katex`。**它渲染成 DOM 而不是 canvas，所以字号闸看得见** ——
这一点和 echarts/konva 相反，是它的优点。

```html
<link rel="stylesheet" href="assets/lib/katex.min.css">
<script src="assets/lib/katex.min.js"></script>
<script>katex.render("\\sum_{i=1}^{n} x_i^{2}", el, {throwOnError:false});</script>
```

**这份 `katex.min.css` 里的 20 个字体已经 base64 内嵌了**，实测零外部 `url()` 引用、
`file://` 下零加载失败。官方那份 CSS 要配一整个 `fonts/` 目录（60 个文件：
ttf/woff/woff2 各一套），少一个字体公式就是错的字形，而且 selfcheck 会报一片
「资源加载失败」。别去下官方那份。

**基准字号 ≥ 20px。** 缩放是**按嵌套深度叠乘**的，不是一层，所以 16px 不够。实测：

```
公式类型                 16px      18px      20px      22px      24px
简单式 / 求和带上下限     13.55     15.25     16.94     18.63     20.33
分式里带下标（及更深）      9.68     10.89     12.10     13.31     14.52
```

一层缩放（上下标）是 ×0.847，两层（分式里再带上下标）是 ×0.605；
再往深套（根号里套分式里套上下标）不会更小 —— `scriptscriptstyle` 是 KaTeX 的最小档。

所以：只写简单式 16px 就够；**一旦出现分式带上下标，基准必须 ≥20px**，
否则最小字形掉到 9.7–10.9px，破刻度档的 12px 地板。
统一取 20px 最省事。拿不准就 `selfcheck.py` 量一遍 —— 公式是 DOM，闸看得见。

## ml-matrix —— 纯计算，不画任何东西

版本 6.15.0，全局 `mlMatrix`。实测 `file://` 可用。

```js
var A = new mlMatrix.Matrix([[1,2],[3,4]]);
A.mmul(A).to2DArray()        // [[7,10],[15,22]]
mlMatrix.determinant(A)      // -2
```

它替掉的是手写矩阵循环（四轮扫描里「手写神经网络/矩阵」命中 10 个文件）。
**和 `mlp.js` 不重叠**：`mlp.js` 是一整套逐帧可控的训练循环，`ml-matrix` 只是矩阵原语。
要在页面上实时训练小网络仍然用 `mlp.js`，不要拿 ml-matrix 重写一遍。

## seedrandom —— 随机必须可复现

版本 3.0.5，用完之后 `Math.seedrandom` 是函数。实测同种子同序列。

```js
var rng = new Math.seedrandom('page-07');   // 每次打开都一样
rng();                                      // 0.731943…
```

**凡是页面上「随机生成一批样本/一组点/一次抽样」的地方都要用它。**
不给种子的话，读者每次打开看到的数不一样，而讲解里写的数字是固定的 ——
那句讲解就变成了假话。这和「讲解必须在允许扰动下恒真」是同一条要求。

## 一条闸侧的处理（你不用管，但知道了不会奇怪）

KaTeX 每个公式会渲染两份：可视的 `.katex-html`，加一份给读屏器的
`.katex-mathml`（用 1×1 裁剪隐藏）。那份隐藏副本会让 selfcheck 每个公式报一次
「被裁」和数处「文字叠压」—— 实测一个公式 1 处被裁 + 6 处叠压，全是假的。
`selfcheck.py` 已经排除 `.katex-mathml`，所以你看到的报告是干净的。
同理零宽字符（KaTeX 的 `.vlist-s` 占位符是 U+200B）也已排除，否则会报「1.0px 的正文」。
````

