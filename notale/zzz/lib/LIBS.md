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
| 节点连线图、精确控制的矢量图形、数据绑定 | `<script src="assets/lib/d3.min.js"></script>` | `d3` |
| 成千上万个元素同时运动 | `<script src="assets/lib/pixi.min.js"></script>` | `PIXI` |
| 分步动画、依次出现、路径描绘、形变 | `<script src="assets/lib/anime.min.js"></script>` | `anime` |
| 多个动画按一条时间线精确编排 | `<script src="assets/lib/gsap.min.js"></script>` | `gsap` |
| 动画进度绑定到滚动位置 | gsap 之后再引 `<script src="assets/lib/ScrollTrigger.min.js"></script>` | `ScrollTrigger` |
| 播放矢量动画文件 | `<script src="assets/lib/lottie.min.js"></script>` | `lottie` |
| 伪三维插画 | `<script src="assets/lib/zdog.min.js"></script>` | `Zdog` |
| 元素跟随指针倾斜 | `<script src="assets/lib/vanilla-tilt.min.js"></script>` | `VanillaTilt` |
| 进入视野时淡入 | `<script src="assets/lib/aos.js"></script>` | `AOS` |
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
