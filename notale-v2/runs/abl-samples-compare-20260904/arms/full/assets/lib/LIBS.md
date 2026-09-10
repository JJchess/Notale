# 已预置的库

这些文件**已经在这里了**,不需要下载、不需要复制、不需要检查。
页面里直接写 `<script src="assets/lib/xxx.js"></script>`,相对 `pages/` 即可。
全部是 UMD 构建,已验证在 `file://` 下直接打开可用,不需要静态服务器。

`pages/` 下目前只有 `assets/`,页面和你自己的资源由你新建。

这份文件的原本在 `zzz/lib/LIBS.md`,和 `mlp.js` 一起是自家维护的;其余是第三方构建,
照原样放进来的。

## 按「要做的事」查

引法:`<script src="assets/lib/<文件>"></script>`;`.css` 用 `<link rel="stylesheet">`。
第二列写了「X 之后」的,必须排在 X 的 script 之后。

| 要做的事 | 文件 | 全局对象 |
|---|---|---|
| 物体下落、碰撞、摆动、堆叠、拖拽、约束 | `matter.min.js` | `Matter` |
| 三维场景、可旋转的立体结构、光照材质 | `three.min.js` | `THREE` |
| 三维地球、球面上的点/弧线/区块 | three 之后 · `globe.gl.min.js` | `Globe` |
| 生成式动画背景 | three 之后 · `vanta.net.min.js` | `VANTA` |
| 坐标轴 + 刻度 + 图例的常规图表(折线、柱、散点、面积、饼、热力) | `echarts.min.js` | `echarts` |
| 可拖拽、可命中检测的二维场景(形状、分组、变换、层) | `konva.min.js` | `Konva` |
| 节点连线图、精确控制的矢量图形、数据绑定 | `d3.min.js` | `d3` |
| 成千上万个元素同时运动 | `pixi.min.js` | `PIXI` |
| 分步动画、依次出现、路径描绘、形变 | `anime.min.js` | `anime` |
| 多个动画按一条时间线精确编排 | `gsap.min.js` | `gsap` |
| 动画进度绑定到滚动位置 | gsap 之后 · `ScrollTrigger.min.js` | `ScrollTrigger` |
| 播放矢量动画文件 | `lottie.min.js` | `lottie` |
| 伪三维插画 | `zdog.min.js` | `Zdog` |
| 元素跟随指针倾斜 | `vanilla-tilt.min.js` | `VanillaTilt` |
| 进入视野时淡入 | `aos.js` | `AOS` |
| 数学公式排版 | `katex.min.css + katex.min.js` | `katex` |
| 矩阵乘法、行列式、求逆、特征分解 | `ml-matrix.umd.js` | `mlMatrix` |
| 可复现的随机(同种子同序列) | `seedrandom.min.js` | `Math.seedrandom` |
| 在页面上实时训练一个小神经网络、画决策边界 | `mlp.js` | `MLP` |
| 加载预训练模型、在真图片上跑卷积、需要 GPU 的大矩阵 | `tf.min.js` | `tf` |

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
