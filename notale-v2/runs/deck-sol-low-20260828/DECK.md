页数: 20
=== IMAGES ===
本套无需图池
=== CSS ===
```css
/* ==== INTERFACE ====
   token    --bg #E8EEF1            冷灰蓝实验记录底色｜全套舞台背景
   token    --paper #F8FAFA         仪器读数表面｜仅用于 panel 与作答区
   token    --text #17262D          主文字与关键结构线
   token    --muted #526770         次级说明、静态标签与非活动结构
   token    --line #A8B8BE          分隔线、坐标轴与容器边界
   token    --model #145C74         当前模型算出的值｜预测、前向箭头、模型曲线
   token    --target #A53F2B        目标与误差信号｜真实答案、损失、反向箭头
   token    --attention #D88416     当前要观察或操作的位置｜活动控件、游标、焦点读数
   token    --sample #486B35        训练样本｜输入点、样本标签
   token    --focus #B36A08         键盘焦点｜仅焦点轮廓
   token    --fs-h1 42px            页标题
   token    --fs-h2 26px            区块标题
   token    --fs-lead 22px          导语或强调正文
   token    --fs-body 19px          正文
   token    --fs-sec 17px           次级成句说明
   token    --fs-label 15px         控件、图例、图注与提示
   token    --fs-tick 13px          仅纯数字刻度
   版心     1488×844                #stage 已含 28px 56px padding
   版式     .focus                  单一核心图形，上下标题与结论
   版式     .split                  左侧解释、右侧可视化
   版式     .workbench              上方标题，中部实验区，下方控制与读数
   版式     .compare                同基线左右对照
   版式     .sequence               横向过程与底部结论
   版式     .board                  大型板书区配侧边注释
   骨架     .k-process              用阶段、贯穿轴与箭头显示方向
   骨架     .k-comparison           用同行、同尺度、同基线呈现差异
   骨架     .k-classification       用嵌套、包含与缩进显示归属
   骨架     .k-generalization       重主张挂接多个支撑证据
   组件     .panel                  读数与控件容器
   组件     .panel.q                无填色但保留同样内边距的容器
   组件     .big/.num/.unit         投影可读的数值与单位
   组件     .hint/.btn/.btns/.ctl   操作提示、按钮组与范围控件
   组件     .tag/.legend/.sw        概念标签、图例与线面样例
   组件     .cvbox                  Canvas、SVG 或图表的定位裁切容器
   组件     .quiz/.opt/.fb          作答、选中态与独立反馈
   组件     .lead/.small/.note      导语、次级文字与就近注释
   组件     .backdrop               整页氛围媒体及角落来源说明
   ==== /INTERFACE ==== */

:root {
  --pad-x: 56px;
  --pad-y: 28px;
  --bg: #E8EEF1;
  --paper: #F8FAFA;
  --text: #17262D;
  --muted: #526770;
  --line: #A8B8BE;
  --model: #145C74;
  --target: #A53F2B;
  --attention: #D88416;
  --sample: #486B35;
  --focus: #B36A08;
  --font-sans: "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  --font-display: "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
  --font-num: "IBM Plex Mono", "Cascadia Mono", "SFMono-Regular", Consolas, monospace;
  --fs-h1: 42px;
  --fs-h2: 26px;
  --fs-lead: 22px;
  --fs-body: 19px;
  --fs-sec: 17px;
  --fs-label: 15px;
  --fs-tick: 13px;
}

#stage {
  display: flex;
  flex-direction: column;
  padding: var(--pad-y) var(--pad-x);
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
}

h1, h2, h3, p { margin: 0; }
h1 {
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  line-height: 1.16;
  font-weight: 800;
  letter-spacing: -.02em;
}
h2 {
  font-size: var(--fs-h2);
  line-height: 1.25;
  font-weight: 750;
}
p, li {
  font-size: var(--fs-body);
  line-height: 1.48;
}
button, input { font: inherit; }

.kicker {
  color: var(--model);
  font-size: var(--fs-label);
  line-height: 1.3;
  font-weight: 800;
  letter-spacing: .11em;
  text-transform: uppercase;
  margin-bottom: 7px;
}
.title-stack {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
}
.lead {
  font-size: var(--fs-lead);
  line-height: 1.42;
  font-weight: 650;
}
.small {
  color: var(--muted);
  font-size: var(--fs-sec);
  line-height: 1.42;
}
.note {
  color: var(--muted);
  font-size: var(--fs-label);
  line-height: 1.4;
}
strong { font-weight: 800; }
.model-text { color: var(--model); }
.target-text { color: var(--target); }
.sample-text { color: var(--sample); }
.attention-text { color: #A96008; }

.focus {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 22px;
}
.focus > .main {
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
}
.split {
  display: grid;
  grid-template-columns: minmax(0, .86fr) minmax(0, 1.34fr);
  gap: 38px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}
.split.rev { grid-template-columns: minmax(0, 1.34fr) minmax(0, .86fr); }
.workbench {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 18px;
  flex: 1;
  min-height: 0;
}
.compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 34px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}
.sequence {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 22px;
  flex: 1;
  min-height: 0;
}
.board {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 30px;
  flex: 1;
  min-height: 0;
}

.panel {
  background: var(--paper);
  border: 2px solid var(--line);
  border-radius: 8px;
  padding: 20px 22px;
  box-shadow: 0 3px 0 rgba(46, 72, 82, .12);
}
.panel.q {
  background: transparent;
  box-shadow: none;
}
.panel.selected {
  border-color: var(--attention);
  outline: 3px solid rgba(216, 132, 22, .2);
}

.k-process {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 34px;
}
.k-process .axis {
  position: absolute;
  left: 4%;
  right: 4%;
  top: 50%;
  height: 3px;
  background: var(--line);
  transform: translateY(-50%);
  z-index: 0;
}
.k-process .step {
  position: relative;
  z-index: 1;
  flex: 1;
  min-width: 0;
  border: 2px solid var(--line);
  border-radius: 8px;
  padding: 18px;
  background: var(--bg);
}
.k-process .arw {
  position: relative;
  align-self: center;
  flex: 0 0 32px;
  height: 3px;
  background: var(--model);
}
.k-process .arw::after {
  content: "";
  position: absolute;
  right: -1px;
  top: -7px;
  border-left: 12px solid var(--model);
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
}
.k-process.reverse .arw {
  background: var(--target);
  transform: rotate(180deg);
}
.k-process.reverse .arw::after { border-left-color: var(--target); }

.k-comparison {
  display: grid;
  grid-template-columns: minmax(150px, .7fr) 1fr 1fr;
  align-content: start;
  border-top: 2px solid var(--text);
}
.k-comparison .dim,
.k-comparison .hdr,
.k-comparison .rowline,
.k-comparison .diff {
  min-width: 0;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
  font-size: var(--fs-sec);
  line-height: 1.4;
}
.k-comparison .hdr { font-weight: 800; }
.k-comparison .dim { color: var(--muted); font-weight: 700; }
.k-comparison .diff { font-weight: 750; }

.k-classification {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.k-classification .lv {
  border-left: 4px solid var(--line);
  padding-left: 18px;
}
.k-classification .lv .lv {
  margin: 12px 0 0 22px;
}
.k-classification .box {
  border: 2px solid var(--line);
  border-radius: 8px;
  padding: 15px 17px;
}
.k-classification .bt {
  color: var(--muted);
  font-size: var(--fs-label);
  font-weight: 800;
  margin-bottom: 6px;
}

.k-generalization {
  display: grid;
  grid-template-columns: minmax(280px, .8fr) 4px minmax(0, 1.3fr);
  gap: 24px;
  align-items: stretch;
}
.k-generalization .claim {
  align-self: center;
  font-size: var(--fs-h2);
  line-height: 1.35;
  font-weight: 850;
}
.k-generalization .trunk {
  background: var(--model);
  border-radius: 2px;
}
.k-generalization .supports {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 15px;
}
.k-generalization .support {
  position: relative;
  border-bottom: 2px solid var(--line);
  padding: 10px 12px 12px 20px;
  font-size: var(--fs-sec);
  line-height: 1.42;
}
.k-generalization .support::before {
  content: "";
  position: absolute;
  left: -24px;
  top: 50%;
  width: 24px;
  border-top: 2px solid var(--model);
}

.big {
  font-family: var(--font-num);
  font-size: 52px;
  line-height: 1;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
.big.sm { font-size: 38px; }
.big.lg { font-size: 72px; }
.num {
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
.unit {
  margin-left: 5px;
  color: var(--muted);
  font-size: var(--fs-label);
  font-weight: 700;
}

.hint {
  color: var(--muted);
  font-size: var(--fs-label);
  line-height: 1.4;
}
.btns {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.btn {
  min-height: 44px;
  padding: 9px 17px;
  border: 2px solid var(--text);
  border-radius: 6px;
  background: var(--paper);
  color: var(--text);
  font-size: var(--fs-label);
  font-weight: 800;
  cursor: pointer;
}
.btn:hover { border-color: var(--attention); }
.btn[aria-pressed="true"], .btn.selected {
  border-color: var(--attention);
  background: #FFF1D8;
  color: #714000;
}
.btn:disabled {
  opacity: .45;
  cursor: not-allowed;
}
.btn:focus-visible, .opt:focus-visible, input[type=range]:focus-visible {
  outline: 4px solid var(--focus);
  outline-offset: 3px;
}
.ctl {
  display: grid;
  grid-template-columns: 170px minmax(180px, 1fr) 100px;
  gap: 14px;
  align-items: center;
  font-size: var(--fs-label);
  font-weight: 750;
}
input[type=range] {
  width: 100%;
  height: 30px;
  accent-color: var(--attention);
  cursor: pointer;
}

.tag {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 4px 10px;
  border: 1px solid currentColor;
  border-radius: 4px;
  color: var(--muted);
  font-size: var(--fs-label);
  line-height: 1.2;
  font-weight: 800;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
}
.legend > .li {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: var(--fs-label);
  line-height: 1.3;
}
.sw {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  border: 2px solid var(--text);
  border-radius: 3px;
  background: var(--paper);
}
.sw.line {
  height: 0;
  border: 0;
  border-top: 4px solid var(--model);
  border-radius: 0;
}
.sw.model { background: var(--model); border-color: var(--model); }
.sw.target { background: var(--target); border-color: var(--target); }
.sw.sample { background: var(--sample); border-color: var(--sample); }
.sw.attention { background: var(--attention); border-color: var(--attention); }

.cvbox {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 2px solid var(--line);
  border-radius: 8px;
}
.cvbox > canvas,
.cvbox > svg,
.cvbox > .chart {
  display: block;
  width: 100%;
  height: 100%;
}

.quiz {
  display: grid;
  gap: 12px;
}
.opt {
  width: 100%;
  min-height: 52px;
  padding: 12px 16px;
  border: 2px solid var(--line);
  border-radius: 7px;
  background: var(--paper);
  color: var(--text);
  text-align: left;
  font-size: var(--fs-sec);
  line-height: 1.4;
  font-weight: 700;
  cursor: pointer;
}
.opt:hover { border-color: var(--attention); }
.opt[aria-checked="true"], .opt.selected {
  border-color: var(--attention);
  background: #FFF1D8;
}
.opt.correct { border-style: double; border-width: 4px; }
.opt.incorrect { text-decoration: line-through; text-decoration-thickness: 2px; }
.fb {
  min-height: 46px;
  padding: 11px 14px;
  border-top: 2px solid var(--line);
  font-size: var(--fs-sec);
  line-height: 1.42;
  font-weight: 700;
}

.backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: .18;
  pointer-events: none;
}
.backdrop-note {
  position: absolute;
  right: 24px;
  bottom: 18px;
  z-index: 2;
  color: var(--muted);
  font-size: var(--fs-label);
}

.rule-axis {
  position: relative;
  height: 3px;
  background: var(--text);
}
.rule-axis::after {
  content: "";
  position: absolute;
  right: -1px;
  top: -7px;
  border-left: 12px solid var(--text);
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
  }
}

svg .bar, svg .step, svg .cell, svg .box, svg .arw { width:auto; height:auto; }
```
=== PAGES ===
# page-01
用单焦点版式建立全课问题：“神经网络不是被写进答案，而是一次次把猜测改得更好。”中央是一条像实验记录仪的闭环路径，依次标出“输入 → 猜测 → 对照答案 → 调参数 → 再猜”，前向路径用模型色、答案与误差用目标色、训练样本用样本色，右下只放今天要追踪的三个对象：“一个神经元、一个误差、一次反向调整”。开场让全班举手选择“学习最像记住答案、寻找规律、还是随机试运气”，教师点击对应按钮只显示选择人数，不判对错，随后突出“寻找能让误差变小的参数”；本页不出现公式、网络层数或反向传播细节，它们分别从第 3、12、15 页开始。

# page-02
用左右对照让读者相信“训练”和“使用”是两件不同的事：左侧标题“训练：答案在场”，画出输入“学习 3 h”、模型预测“及格概率 0.62”、真实标签“及格 1”、误差提示“猜低了”；右侧标题“使用：答案不在场”，只保留输入“学习 4 h”与预测“及格概率 0.78”，并用同行比较列出“是否有正确答案：有／没有”“是否改参数：会／不会”“目的：学参数／给预测”。这些数值明确标注为教学示例而非真实教育统计，不暗示因果关系；页面静态呈现，不讨论数据偏差或概率校准，它们超出本课范围。

# page-03
用工作台展示一个神经元如何完成一次猜测，标题为“一个神经元：先加权，再过一道门”，中央画输入“学习时间 x = 3 h”进入乘法器“权重 w = 0.8”，再与“偏置 b = −1.0”相加，实时显示 \(z=wx+b=3\times0.8-1.0=1.4\)，最后经过 sigmoid 得到 \(\hat y=\sigma(z)=1/(1+e^{-1.4})=0.802\)。公式用 KaTeX，基准字号至少 24 px，并同时引用 `assets/lib/katex.min.css` 与 `assets/lib/katex.min.js`；页面下方滑块允许把 x 从 0 到 6 h 调整，步长 0.1 h，z 与 \(\hat y\) 随动，复位回 3 h，明确标注“教学模型，不是现实中的及格预测器”。本页只解释前向计算，不解释 w 和 b 从哪里来，第 8 页再回答。

# page-04
用大型坐标板让读者形成权重的直觉，标题“权重决定输入有多大影响”。横轴是学习时间 x（0–6 h），纵轴先画神经元加权和 z（−3 到 5），固定 b = −1.0，显示三条可切换而非同时堆叠的直线：w = −0.8、0、0.8；学生点击三个按钮观察线的方向与陡峭程度，并补全句子“w 为正时，x 增大，z 会___”，点击“揭示”显示“增大”。用 SVG 或 D3 绘制轴线与可访问 DOM 标签，标签不小于 15 px；本页不经过 sigmoid，也不讨论误差，避免把“线的斜率”和“预测概率”混为一谈。

# page-05
用单一可拖动的门槛图解释偏置，标题“偏置决定门槛向哪里移”。中央是横轴 x（0–6 h）与 sigmoid 曲线，固定 w = 1.2，提供 b 从 −4.0 到 1.0、步长 0.1 的滑块；页面持续标出 \(\hat y=0.5\) 对应的位置 \(x=-b/w\)，初始 b = −2.4 时门槛为 x = 2.0 h，调整 b 后竖直门槛线左右移动。下方一句结论为“权重改变倾斜程度，偏置平移判断门槛”，复位恢复 b = −2.4；本页不把 0.5 说成普遍正确的分类阈值，只把它作为本教学例子的观察线，也不进入多输入情形。

# page-06
用分类骨架回答“为什么还要 sigmoid”，标题“把任意实数压到 0 与 1 之间”。外层框是“加权和 z：可从负无穷到正无穷”，内层结果框是“输出 \(\hat y\)：0 到 1”，右侧给出五个可核算的对应值：z = −4 → 0.018，z = −1 → 0.269，z = 0 → 0.500，z = 1 → 0.731，z = 4 → 0.982；点击任一 z 标签，曲线上的活动点移动并显示“越接近两端，曲线越平”。公式 \(\sigma(z)=1/(1+e^{-z})\) 用 KaTeX 24 px，所有数值说明为四舍五入到 3 位小数；本页不把 sigmoid 说成所有网络唯一的激活函数，第 13 页才介绍隐藏层还能使用其他激活函数。

# page-07
用同基线对照让读者相信“预测只有与目标比较后，才知道该往哪里改”，标题“误差告诉我们：猜得有多不好”。设置两个样本：样本 A 的真实标签 y = 1、预测 \(\hat y=0.80\)，二元交叉熵 \(L=-[y\ln\hat y+(1-y)\ln(1-\hat y)]=0.223\)；样本 B 的 y = 1、预测 \(\hat y=0.20\)，损失为 1.609。两个水平损失条使用同一 0–1.8 标尺，模型预测与目标标签颜色严格分离，脚注明“自然对数；数值四舍五入到 3 位小数”。先让学生投票哪次猜测应受更大调整，再揭示损失条；本页不推导交叉熵为何采用对数，也不把“损失”与“准确率”混为一谈，第 17 页再并列观察二者。

# page-08
用一维地形实验让读者亲手看到参数如何学，标题“学习，就是沿着损失较小的方向改参数”。固定单个样本 x = 2、y = 1、b = −1，横轴权重 w 从 −2 到 3，纵轴交叉熵损失 L 从 0 到 5，绘制真实计算曲线 \(L(w)=-\ln[\sigma(2w-1)]\)；学生拖动代表 w 的活动游标，面板实时显示 w、预测 \(\hat y\) 与 L，初始 w = −0.5 时 \(\hat y=0.119\)、L = 2.127，按“走一小步”依据当前梯度执行 \(w\leftarrow w-0.2\,dL/dw\)，每次保留路径脚印，按“复位”回到 −0.5。曲线可用 D3 7.9.0 绘制并直接引用 `assets/lib/d3.min.js`；本页只建立“沿坡下行”的直觉，不要求学生手算导数，第 10 页再解释梯度符号。

# page-09
用过程骨架拆开一次训练循环，标题“模型不是一步学会，而是重复四件事”。四个阶段必须由清晰箭头贯穿：“前向计算 \(\hat y\) → 计算损失 L → 求每个参数的影响 → 更新 w、b”，下方以同一个样本 x = 2、y = 1 和初始 w = 0、b = 0 演示第一轮：\(\hat y=0.500\)，L = 0.693，交叉熵配 sigmoid 时 \(dL/dw=(\hat y-y)x=-1.000\)、\(dL/db=\hat y-y=-0.500\)，学习率 \(\eta=0.1\)，更新后 w = 0.100、b = 0.050。点击“下一阶段”逐项显现，第四步后允许“重播”；本页不展开链式法则，只完整交代循环的输入输出，第 15 页才追踪多层网络中的反向路径。

# page-10
用方向选择题澄清梯度的意义，标题“梯度说的是：参数增一点，损失怎么变”。中央只放一条局部斜坡和活动点，显示当前位置 w = 0.0、\(dL/dw=-1.0\)，让学生选择“w 应增加”“w 应减小”“w 不变”；提交后再显示更新式 \(w_{\text{new}}=w-\eta\,dL/dw\)，取 \(\eta=0.1\) 得 \(w_{\text{new}}=0.1\)，反馈文字解释“负梯度表示 w 增加会让损失下降，所以减去负数就是增加”。作答选中态使用注意色，正确性通过双线边框和文字反馈表达，不预先用红绿暗示；本页不介绍偏导记号的严格定义，也不要求微积分证明。

# page-11
用左右实验对照解释学习率，标题“步子太小走得慢，太大可能来回跳”。两侧使用同一简化损失 \(L(w)=(w-2)^2\)、同一起点 w = −2 和同一 0–10 步时间轴：左侧学习率 \(\eta=0.1\)，更新 \(w\leftarrow w-\eta\,2(w-2)\)，前 5 个位置为 −2.000、−1.200、−0.560、−0.048、0.362；右侧 \(\eta=1.1\)，前 5 个位置为 −2.000、6.800、−3.760、8.912、−6.294，显示越跳越远。学生按“同步走一步”推进两边轨迹并观察当前 L，复位回第 0 步；明确说明这是为展示步长而选的抛物线，不是上一页神经元的真实损失，本页也不介绍 Adam、动量等优化器。

# page-12
用概括骨架完成从单神经元到网络的过渡，标题“一个神经元画一条边界，多个神经元可以拼出弯曲边界”。主张区写“层的作用不是神秘化计算，而是把许多简单变换接起来”，三个支撑分别是“每个连接仍只有权重”“每个神经元仍做加权和与激活”“输出仍与目标比较产生损失”。中央网络只画 2 个输入、4 个隐藏神经元、1 个输出，输入标签为“特征 \(x_1,x_2\)”，输出为“类别 1 的概率”，连接方向明确从左到右；点击某个隐藏神经元只高亮它的入边和出边，避免一次看所有连线。本页不声称“神经元像真实脑细胞”，也不训练网络，第 13 页解释隐藏层，第 16 页才实时训练。

# page-13
用可操作的二维画布解释隐藏神经元像“特征探测器”，标题“隐藏层先把输入改写成更有用的表示”。左侧平面含 8 个固定点：类别 0 为 (−0.8,−0.8)、(−0.8,0.8)、(0.8,−0.8)、(0.8,0.8)，类别 1 为 (−0.25,−0.25)、(−0.25,0.25)、(0.25,−0.25)、(0.25,0.25)；右侧显示四个隐藏神经元各自的一条直线边界，围出中央区域，点击神经元 H1–H4 时只显示该神经元的高激活半平面，并在 DOM 标签中写“这一单元对边界某一侧响应更强”。图形交互用 Konva 10.3.1，引用 `assets/lib/konva.min.js`，画面文字必须以绝对定位 DOM 叠加而非 `Konva.Text`；本页只讲“组合简单边界”的概念，不给出手工权重，也不把隐藏单元解释成固定的人类概念。

# page-14
用横向前向过程展示一个两层网络如何产生预测，标题“前向传播：数值从输入流向输出”。采用 2→3→1 网络，给定输入 \(x_1=0.6,x_2=-0.4\)，三个隐藏单元的加权和固定为 0.8、−0.3、0.1，使用 tanh 后激活约为 0.664、−0.291、0.100；输出层加权和为 1.2，sigmoid 输出 \(\hat y=0.769\)。点击“推进”依次点亮输入、加权和、隐藏激活、输出，节点旁就近显示实际数值，底部结论“前向传播只回答：按当前参数会猜什么”；数字为教学演示中预先规定的中间量，不宣称来自训练数据。本页不计算损失梯度，反向方向留给下一页。

# page-15
用与上一页方向相反但几何对应的过程图解释反向传播，标题“反向传播：把最终误差逐层分摊回去”。保留同一个 2→3→1 网络轮廓，目标 y = 1、预测 \(\hat y=0.769\)，输出层的误差信号先写为 \(\hat y-y=-0.231\)，随后沿目标色箭头从输出向隐藏层、再向更早连接传播；点击“退一层”时，只出现当前层连接旁的三个词“上游误差 × 本地斜率 × 输入”，并在侧栏显示链式法则的最小形式 \(\partial L/\partial w=(\partial L/\partial a)(\partial a/\partial z)(\partial z/\partial w)\)。公式用 KaTeX 24 px，动画只是依次显现，关闭动画时仍完整可读；本页不要求算出所有具体梯度，也不把反向传播等同于参数更新，更新仍是第 9 页第四步。

# page-16
用实时实验让学生看到网络从“乱猜”到形成边界，标题“现在，让一个小网络真的学”。生成固定 XOR 数据：四个中心 (−0.7,−0.7) 与 (0.7,0.7) 属于类别 0，(−0.7,0.7) 与 (0.7,−0.7) 属于类别 1；每个中心 50 个点，共 200 个样本，每坐标加入范围 [−0.22,0.22] 的均匀扰动，必须引用 `assets/lib/seedrandom.min.js` 并使用种子 `page-16-xor`。网络引用 `assets/lib/mlp.js`，配置 `MLP.create({sizes:[2,10,10,1],act:'tanh',lr:0.3,seed:16})`，每动画帧执行 12 次 `net.step(trainSet,16)`，每 8 帧以 `field(-1.3,-1.3,1.3,1.3,80,80)` 更新决策热力场；按钮为“开始／暂停”“单步 12 批”“重置”，实时显示已处理 mini-batch 数、训练损失和训练准确率，准确率明确标“训练集”。本页不预写最终准确率，不伪造收敛结果，页面只显示 `evaluate(trainSet)` 的现场计算值；不用 tf.js，也不讨论测试集泛化，下一页再区分训练与验证。

# page-17
用同尺度比较让读者理解“训练集表现好，不保证新数据也好”，标题“真正关心的是：没见过的样本能否预测”。使用固定种子 `page-17-split` 生成 240 个与第 16 页同规则的 XOR 扰动样本，其中前 160 个为训练集、后 80 个为验证集，网络配置 `sizes:[2,10,10,1]`、`act:'tanh'`、`lr:0.3`、`seed:17`；实时训练只调用 `net.step(trainSet,16)`，左右两栏每 10 帧分别显示 `evaluate(trainSet)` 与 `evaluate(valSet)` 的 loss、acc，标签明确为“训练集 n=160”“验证集 n=80”。学生可开始、暂停、重置，观察两边数值是否同步变化，页面不宣称一定发生过拟合，也不预录结果；本页只建立数据分工，不讲交叉验证、统计置信区间或真实任务的数据泄漏。

# page-18
用参数控制实验展示“网络结构与学习率会改变学习过程”，标题“不是网络越大、步子越大就一定越好”。画面提供三个互斥结构按钮“2→2→1”“2→6→1”“2→10→10→1”和三个学习率按钮“0.03”“0.3”“3.0”，数据固定为第 16 页同种子 XOR 200 点；每次改变结构或学习率都重新创建对应 `MLP.create`，种子固定为 18，并把训练计数清零，学生必须主动按“开始”才训练。读数只显示现场计算的 loss、acc 与 `net.diverged`；若未数值崩溃但准确率长期接近 0.5，文字提示“数值没有崩溃，也可能没学会”，绝不把 `diverged=false` 当成功。本页不组织全班穷举九种组合，也不寻找所谓最佳超参数，只要求比较两组并说出“结构、步长、随机初始化都会影响过程”。

# page-19
用四项作答完成概念检查，标题“把一次学习过程排对顺序”。左侧给可拖动的四张条目“计算预测”“与真实标签比较”“反向求各参数影响”“按学习率更新参数”，学生拖到带方向箭头的四个槽位中；拖拽使用 Konva 图形与命中检测，文字必须为 DOM 标签，另提供键盘可用的“上移／下移”按钮。提交后正确顺序显示为“输入 → 前向传播 → 损失 → 反向传播 → 更新参数”，若错误，反馈只指出第一个断裂关系，例如“没有预测，就无法计算这次预测的损失”，并允许继续修改；“重置”恢复初始固定乱序“更新、预测、反向、比较”。本页不再播放训练动画，也不重复具体数值，它检查的是因果顺序而不是记忆公式。

# page-20
用概括骨架收束全课，标题“神经网络学会的，是一组让误差变小的参数”。重主张连接四条支撑：“神经元用权重和偏置产生一次猜测”“损失把猜测与目标变成一个可比较的数”“梯度指出每个参数该往哪边改”“反向传播让多层网络也能高效得到这些梯度”，底部用一条完整闭环再次显示“前向 → 损失 → 反向 → 更新 → 再前向”。右侧给离场题：“若预测已经算出，但没有真实标签，这一步能训练吗？”按钮为“能／不能／要看情况”，选择后显示答案“在本课的监督学习设定中不能：没有标签就无法计算这里使用的监督损失”，并补一句“其他学习方式存在，但不在本课范围”。最后保留一句可带走的话：“反向传播不是答案本身；它是把误差变成参数调整方向的方法。”
=== END ===